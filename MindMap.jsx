import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Plus, Maximize2, FileText } from 'lucide-react'
import { useTable } from './useTable'
import { PASTELS, shade } from './util'
import Notebook, { hasContent } from './Notebook'

const TAU = Math.PI * 2
const ROOT_R = 50            // радиус центрального «Я»
const STEP = 205             // расстояние между кольцами уровней
const SIZE = d => (d === 1 ? { w: 176, h: 58 } : { w: 152, h: 48 })
const STARTERS = ['Здоровье', 'Работа', 'Учёба', 'Семья', 'Финансы', 'Мечты']
const clamp = z => Math.min(2.5, Math.max(0.3, z))

// Дети каждого узла (узлы без родителя — категории вокруг «Я»)
function buildKids(nodes) {
  const ids = new Set(nodes.map(n => n.id))
  const kids = new Map()
  const sorted = [...nodes].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
  for (const n of sorted) {
    const p = n.parent_id && ids.has(n.parent_id) ? n.parent_id : 'root'
    if (!kids.has(p)) kids.set(p, [])
    kids.get(p).push(n)
  }
  return kids
}

// Радиальная раскладка: каждой ветке достаётся сектор круга пропорционально числу «листьев»
function computeLayout(kids, collapsed) {
  const leaves = new Map()
  const count = id => {
    if (leaves.has(id)) return leaves.get(id)
    const ch = kids.get(id) || []
    const folded = id !== 'root' && collapsed.has(id)
    const v = folded || ch.length === 0 ? 1 : ch.reduce((s, c) => s + count(c.id), 0)
    leaves.set(id, v); return v
  }
  const rootKids = kids.get('root') || []
  const total = Math.max(1, rootKids.reduce((s, c) => s + count(c.id), 0))
  const R1 = Math.max(260, (total * 105) / TAU)

  const pos = new Map()
  const place = (n, depth, a0, a1) => {
    const a = (a0 + a1) / 2, r = R1 + (depth - 1) * STEP
    pos.set(n.id, { x: Math.cos(a) * r, y: Math.sin(a) * r, a, r, depth })
    const ch = kids.get(n.id) || []
    if (collapsed.has(n.id) || !ch.length) return
    const span = Math.min(a1 - a0, Math.PI * 1.25)      // ветка не расползается по всему кругу
    const tot = ch.reduce((s, c) => s + count(c.id), 0)
    let cur = a - span / 2
    for (const c of ch) { const w = (span * count(c.id)) / tot; place(c, depth + 1, cur, cur + w); cur += w }
  }
  if (rootKids.length) {
    const first = (TAU * count(rootKids[0].id)) / total
    let cur = -Math.PI / 2 - first / 2                    // первая категория — сверху
    for (const c of rootKids) { const w = (TAU * count(c.id)) / total; place(c, 1, cur, cur + w); cur += w }
  }

  let minX = -ROOT_R, maxX = ROOT_R, minY = -ROOT_R, maxY = ROOT_R
  pos.forEach(p => {
    const { w, h } = SIZE(p.depth)
    minX = Math.min(minX, p.x - w / 2); maxX = Math.max(maxX, p.x + w / 2)
    minY = Math.min(minY, p.y - h / 2); maxY = Math.max(maxY, p.y + h / 2)
  })
  return { pos, bounds: { minX, maxX, minY, maxY } }
}

const polar = (r, a) => [Math.cos(a) * r, Math.sin(a) * r]

export default function MindMap() {
  const { rows: nodes, add, update, remove, reload } = useTable('mind_nodes')
  const [view, setView] = useState({ x: 0, y: 0, z: 1 })
  const [openId, setOpenId] = useState(null)
  const [collapsed, setCollapsed] = useState(() => new Set())
  const boxRef = useRef(null), viewRef = useRef(view), fitted = useRef(false)
  viewRef.current = view

  const kids = useMemo(() => buildKids(nodes), [nodes])
  const { pos, bounds } = useMemo(() => computeLayout(kids, collapsed), [kids, collapsed])
  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes])

  // Ручные смещения узлов (dx/dy хранятся в базе) + живое смещение при перетаскивании
  const [drag, setDrag] = useState(null)   // { id, dx, dy }
  const dragRef = useRef(null)             // то же значение, но доступное в обработчиках без побочных эффектов внутри setState
  const posFinal = useMemo(() => {
    const m = new Map()
    pos.forEach((p, id) => {
      const n = byId.get(id)
      let x = p.x + (n?.dx || 0), y = p.y + (n?.dy || 0)
      if (drag && drag.id === id) { x += drag.dx; y += drag.dy }
      m.set(id, { ...p, x, y })
    })
    return m
  }, [pos, byId, drag])

  const edges = useMemo(() => {
    const out = []
    posFinal.forEach((c, id) => {
      const n = byId.get(id); if (!n) return
      const p = n.parent_id && posFinal.get(n.parent_id) ? posFinal.get(n.parent_id) : { x: 0, y: 0, r: 0, a: c.a }
      const m = (p.r + c.r) / 2
      const c1 = polar(m, p.r === 0 ? c.a : p.a), c2 = polar(m, c.a)
      out.push({ id, depth: c.depth, color: n.color,
        d: `M${p.x} ${p.y} C${c1[0]} ${c1[1]} ${c2[0]} ${c2[1]} ${c.x} ${c.y}` })
    })
    return out
  }, [posFinal, byId])

  /* ---------- масштаб и положение ---------- */
  const fit = useCallback(() => {
    const el = boxRef.current; if (!el) return
    const { width, height } = el.getBoundingClientRect()
    const w = bounds.maxX - bounds.minX, h = bounds.maxY - bounds.minY
    const z = clamp(Math.min(1.1, (width - 60) / w, (height - 60) / h))
    setView({ z, x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * z, y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * z })
  }, [bounds])
  useEffect(() => { if (!fitted.current) { fit(); if (nodes.length) fitted.current = true } }, [fit, nodes.length])

  const zoomAt = useCallback((k, px, py) => setView(v => {
    const z = clamp(v.z * k), f = z / v.z
    return { z, x: px - (px - v.x) * f, y: py - (py - v.y) * f }
  }), [])
  const zoomCenter = k => { const r = boxRef.current.getBoundingClientRect(); zoomAt(k, r.width / 2, r.height / 2) }

  useEffect(() => {   // колесо мыши: нативный обработчик, чтобы страница не прокручивалась
    const el = boxRef.current
    const h = e => { e.preventDefault(); const r = el.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.1 : 0.9, e.clientX - r.left, e.clientY - r.top) }
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [zoomAt])

  /* ---------- жесты: перетаскивание фона, щипок, тап по узлу ---------- */
  const pts = useRef(new Map()), g = useRef(null), moved = useRef(false), downNode = useRef(null)
  const onDown = e => {
    if (e.target.closest('[data-nopan]')) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* указатель уже неактивен */ }
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const v = viewRef.current
    if (pts.current.size === 1) {
      moved.current = false
      downNode.current = e.target.closest('[data-node]')?.dataset.node || null
      g.current = downNode.current
        ? { t: 'node', id: downNode.current, sx: e.clientX, sy: e.clientY }
        : { t: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y }
    } else if (pts.current.size === 2) {
      dragRef.current = null; setDrag(null)
      const [a, b] = [...pts.current.values()]
      g.current = { t: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y), z: v.z, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: v.x, vy: v.y }
      moved.current = true
    }
  }
  const onMove = e => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const s = g.current; if (!s) return
    if (s.t === 'node') {
      const z = viewRef.current.z
      const dx = (e.clientX - s.sx) / z, dy = (e.clientY - s.sy) / z
      if (Math.abs(dx) + Math.abs(dy) > 5 / z) moved.current = true
      if (moved.current) { const d = { id: s.id, dx, dy }; dragRef.current = d; setDrag(d) }
    } else if (s.t === 'pan') {
      const dx = e.clientX - s.sx, dy = e.clientY - s.sy
      if (Math.abs(dx) + Math.abs(dy) > 5) moved.current = true
      if (moved.current) setView(v => ({ ...v, x: s.vx + dx, y: s.vy + dy }))
    } else if (pts.current.size >= 2) {
      const [a, b] = [...pts.current.values()]
      const z = clamp((s.z * Math.hypot(a.x - b.x, a.y - b.y)) / s.d)
      const r = boxRef.current.getBoundingClientRect(), px = s.cx - r.left, py = s.cy - r.top
      setView({ z, x: px - ((px - s.vx) / s.z) * z, y: py - ((py - s.vy) / s.z) * z })
    }
  }
  const onUp = e => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.delete(e.pointerId)
    if (pts.current.size === 0) {
      const s = g.current
      if (s?.t === 'node' && moved.current) {
        // сохранить новое положение узла (вне setState: запись в хранилище внутри обновления состояния роняла приложение)
        const d = dragRef.current, n = byId.get(s.id)
        dragRef.current = null; setDrag(null)
        if (d && n && d.id === s.id) update(s.id, { dx: Math.round((n.dx || 0) + d.dx), dy: Math.round((n.dy || 0) + d.dy) }, null)
      } else if (!moved.current && downNode.current && e.type === 'pointerup') {
        setOpenId(downNode.current)   // тап по узлу — открыть блокнот
      }
      g.current = null; downNode.current = null
    } else if (pts.current.size === 1) {
      const [p] = [...pts.current.values()], v = viewRef.current
      g.current = { t: 'pan', sx: p.x, sy: p.y, vx: v.x, vy: v.y }; moved.current = true
    }
  }

  /* ---------- действия с узлами ---------- */
  const addNode = async (parent) => {
    const tops = (kids.get('root') || []).length
    const n = await add({
      title: parent ? 'Новый раздел' : 'Новая категория', parent_id: parent?.id ?? null,
      color: parent ? parent.color : PASTELS[tops % PASTELS.length]
    })
    if (!n) return
    setCollapsed(c => { if (!parent || !c.has(parent.id)) return c; const x = new Set(c); x.delete(parent.id); return x })
    setOpenId(n.id)
  }
  const addStarter = async (title) => {
    const tops = (kids.get('root') || []).length
    await add({ title, parent_id: null, color: PASTELS[tops % PASTELS.length] })
  }
  const descendants = (id) => (kids.get(id) || []).flatMap(c => [c, ...descendants(c.id)])
  const del = async (n) => {
    const inner = descendants(n.id).length
    if (!confirm(inner ? `Удалить «${n.title}» и всё внутри (${inner})?` : `Удалить «${n.title}»?`)) return
    setOpenId(n.parent_id && byId.has(n.parent_id) ? n.parent_id : null)
    await remove(n.id); reload()
  }
  const toggleFold = (id) => setCollapsed(c => { const x = new Set(c); x.has(id) ? x.delete(id) : x.add(id); return x })

  const open = openId ? byId.get(openId) : null
  const pathOf = (n) => { const out = []; let p = byId.get(n.parent_id), guard = 0; while (p && guard++ < 50) { out.unshift(p); p = byId.get(p.parent_id) } return out }

  return (
    <>
      <div ref={boxRef}
           className="relative h-[72vh] min-h-[420px] rounded-2xl overflow-hidden bg-white/50 shadow-soft touch-none select-none"
           style={{ backgroundImage: 'radial-gradient(rgba(120,100,140,.18) 1.2px, transparent 1.2px)',
                    backgroundSize: `${22 * view.z}px ${22 * view.z}px`, backgroundPosition: `${view.x}px ${view.y}px` }}
           onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div className="absolute left-0 top-0" style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }}>
          <svg width="1" height="1" className="absolute left-0 top-0" style={{ overflow: 'visible' }} aria-hidden>
            {edges.map(e => (
              <path key={e.id} d={e.d} fill="none" stroke={shade(e.color, -0.18)} strokeWidth={e.depth === 1 ? 3.5 : 2.2}
                    strokeLinecap="round" opacity=".85" />
            ))}
          </svg>

          {/* центр — «Я» */}
          <div className="absolute rounded-full grid place-items-center shadow-soft border-[3px] border-white"
               style={{ left: -ROOT_R, top: -ROOT_R, width: ROOT_R * 2, height: ROOT_R * 2, background: 'linear-gradient(135deg,#F9C6D4,#D9CCF5)' }}>
            <span className="font-script text-5xl leading-none text-ink">Я</span>
            <button data-nopan aria-label="Добавить категорию" title="Добавить категорию" onClick={() => addNode(null)}
                    className="absolute left-1/2 -bottom-3 -translate-x-1/2 w-7 h-7 rounded-full bg-white shadow grid place-items-center hover:bg-lav transition">
              <Plus size={16} />
            </button>
          </div>

          {nodes.filter(n => posFinal.has(n.id)).map(n => {
            const p = posFinal.get(n.id), { w, h } = SIZE(p.depth), sub = descendants(n.id).length
            return (
              <div key={n.id} data-node={n.id} role="button" tabIndex={0} aria-label={`Открыть блокнот: ${n.title}`}
                   onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenId(n.id) } }}
                   className="group absolute rounded-2xl shadow-soft cursor-grab active:cursor-grabbing hover:shadow-lg transition-shadow"
                   style={{ left: p.x - w / 2, top: p.y - h / 2, width: w, height: h, background: n.color,
                            border: `2px solid ${shade(n.color, -0.14)}` }}>
                <div className="h-full px-3 flex items-center gap-2">
                  {n.image_url && <img src={n.image_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0" />}
                  <span className={`leading-tight line-clamp-2 ${p.depth === 1 ? 'font-bold text-[15px]' : 'font-semibold text-sm'}`}>{n.title}</span>
                  {hasContent(n.body) && <FileText size={13} className="ml-auto opacity-50 shrink-0" aria-label="Есть записи" />}
                </div>
                {sub > 0 && (
                  <button data-nopan aria-label={collapsed.has(n.id) ? 'Развернуть ветку' : 'Свернуть ветку'}
                          onClick={e => { e.stopPropagation(); toggleFold(n.id) }}
                          className="absolute -top-2 -right-2 min-w-[22px] h-[22px] px-1 rounded-full bg-white shadow text-[11px] font-bold grid place-items-center hover:bg-lav transition">
                    {collapsed.has(n.id) ? `+${sub}` : '−'}
                  </button>
                )}
                <button data-nopan aria-label="Добавить раздел" title="Добавить раздел"
                        onClick={e => { e.stopPropagation(); addNode(n) }}
                        className="absolute left-1/2 -bottom-3 -translate-x-1/2 w-6 h-6 rounded-full bg-white shadow grid place-items-center
                                   opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 hover:bg-lav transition">
                  <Plus size={14} />
                </button>
              </div>
            )
          })}
        </div>

        <div className="absolute top-3 left-3 flex gap-1 card !p-1" data-nopan>
          <button className="btn-ghost" aria-label="Приблизить" onClick={() => zoomCenter(1.2)}><ZoomIn size={18} /></button>
          <button className="btn-ghost" aria-label="Отдалить" onClick={() => zoomCenter(0.8)}><ZoomOut size={18} /></button>
          <button className="btn-ghost" aria-label="Показать всё" title="Показать всё" onClick={fit}><Maximize2 size={18} /></button>
        </div>

        {nodes.length === 0 ? (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 card text-center max-w-[92%]" data-nopan>
            <p className="font-hand text-2xl leading-6 mb-2">Начни с категорий вокруг себя</p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map(s => <button key={s} className="btn-ghost !py-1 border border-beige" onClick={() => addStarter(s)}>{s}</button>)}
            </div>
          </div>
        ) : (
          <p className="absolute bottom-2 left-3 text-xs opacity-50 pointer-events-none">
            Нажми на узел — откроется блокнот · «+» под узлом добавляет раздел · тяни узел, чтобы переместить его, фон — чтобы двигать карту
          </p>
        )}
      </div>

      {open && (
        <Notebook key={open.id} node={open} path={pathOf(open)} kids={kids.get(open.id) || []}
                  onOpen={setOpenId} onClose={() => setOpenId(null)} onAdd={addNode} onDelete={() => del(open)}
                  onSave={(patch, loud) => update(open.id, patch, loud ? 'updated' : null)} />
      )}
    </>
  )
}
