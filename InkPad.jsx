import { useCallback, useEffect, useRef, useState } from 'react'
import { Pencil, Eraser, Undo2, Trash2, Plus, Hand, PenLine } from 'lucide-react'

/* Рукописный слой для блокнота (Apple Pencil / стилус / мышь).
   Штрихи хранятся векторно: { h, strokes: [{ c: цвет, w: толщина, pts: [[x, y, нажим], …] }] }
   в «логической» ширине LW, поэтому выглядят одинаково на любом экране. */
const LW = 800
const EMPTY = { h: 500, strokes: [] }
const COLORS = ['#2b2f4a', '#d6336c', '#1c7ed6', '#2f9e44', '#f08c00']
const WIDTHS = [1.6, 3, 6]

function drawSeg(ctx, s, i, k) {
  const a = s.pts[i - 1], b = s.pts[i]
  ctx.strokeStyle = s.c
  ctx.lineWidth = s.w * k * (0.5 + (a[2] + b[2]) / 2)
  ctx.beginPath(); ctx.moveTo(a[0] * k, a[1] * k); ctx.lineTo(b[0] * k, b[1] * k); ctx.stroke()
}
function drawStroke(ctx, s, k) {
  if (!s.pts.length) return
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (s.pts.length === 1) {
    const p = s.pts[0]
    ctx.fillStyle = s.c; ctx.beginPath(); ctx.arc(p[0] * k, p[1] * k, (s.w * k * (0.5 + p[2])) / 2, 0, Math.PI * 2); ctx.fill(); return
  }
  for (let i = 1; i < s.pts.length; i++) drawSeg(ctx, s, i, k)
}
function distSeg(px, py, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (py - a[1]) * dy) / l2)) : 0
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy))
}
const pressure = e => (e.pointerType === 'pen' ? Math.min(1, Math.max(0.05, e.pressure || 0.5)) : 0.5)

export default function InkPad({ ink, onChange }) {
  const data = ink || EMPTY
  const [open, setOpen] = useState(data.strokes.length > 0)
  const [tool, setTool] = useState('pen')
  const [mode, setMode] = useState('draw')        // draw — рисуем; scroll — палец листает страницу
  const [color, setColor] = useState(COLORS[0])
  const [wi, setWi] = useState(1)
  const [penOnly, setPenOnly] = useState(false)   // только стилус: ладонь и пальцы не оставляют следов
  const cvs = useRef(null), wrap = useRef(null)
  const live = useRef(null), activeId = useRef(null), erasing = useRef(false), scale = useRef(1)
  const dataRef = useRef(data); dataRef.current = data

  const redraw = useCallback(() => {
    const c = cvs.current, w = wrap.current; if (!c || !w) return
    const cssW = w.clientWidth; if (!cssW) return
    const k = cssW / LW, cssH = Math.round(dataRef.current.h * k), dpr = window.devicePixelRatio || 1
    if (c.width !== Math.round(cssW * dpr) || c.height !== Math.round(cssH * dpr)) {
      c.width = Math.round(cssW * dpr); c.height = Math.round(cssH * dpr); c.style.height = cssH + 'px'
    }
    scale.current = k
    const ctx = c.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cssW, cssH)
    for (const s of dataRef.current.strokes) drawStroke(ctx, s, k)
    if (live.current) drawStroke(ctx, live.current, k)
  }, [])
  useEffect(() => { redraw() }, [data, open, redraw])
  useEffect(() => {
    if (!open || !wrap.current) return
    const ro = new ResizeObserver(redraw); ro.observe(wrap.current)
    return () => ro.disconnect()
  }, [open, redraw])

  const pos = e => {
    const r = cvs.current.getBoundingClientRect(), k = scale.current
    return [(e.clientX - r.left) / k, (e.clientY - r.top) / k]
  }
  const eraseAt = (x, y) => {
    const cur = dataRef.current
    const keep = cur.strokes.filter(s => {
      const r = 12 + s.w
      if (s.pts.length === 1) return Math.hypot(s.pts[0][0] - x, s.pts[0][1] - y) > r
      for (let i = 1; i < s.pts.length; i++) if (distSeg(x, y, s.pts[i - 1], s.pts[i]) < r) return false
      return true
    })
    if (keep.length !== cur.strokes.length) { const next = { ...cur, strokes: keep }; dataRef.current = next; onChange(next) }
  }

  const onDown = e => {
    if (mode !== 'draw') return
    if (e.pointerType === 'pen' && !penOnly) setPenOnly(true)          // увидели стилус — включаем защиту от ладони
    if ((penOnly || e.pointerType === 'pen') && e.pointerType !== 'pen') return
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    try { cvs.current.setPointerCapture(e.pointerId) } catch { /* указатель уже неактивен */ }
    const [x, y] = pos(e)
    activeId.current = e.pointerId
    if (tool === 'eraser') { erasing.current = true; eraseAt(x, y); return }
    live.current = { c: color, w: WIDTHS[wi], pts: [[x, y, pressure(e)]] }
    redraw()
  }
  const onMove = e => {
    if (e.pointerId !== activeId.current) return
    if (erasing.current) { const [x, y] = pos(e); eraseAt(x, y); return }
    const s = live.current; if (!s) return
    const evs = e.nativeEvent.getCoalescedEvents?.() || []
    const list = evs.length ? evs : [e.nativeEvent]
    const ctx = cvs.current.getContext('2d'), k = scale.current
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'
    for (const ev of list) {
      const [x, y] = pos(ev)
      s.pts.push([x, y, pressure(ev)])
      drawSeg(ctx, s, s.pts.length - 1, k)
    }
  }
  const onUp = e => {
    if (e.pointerId !== activeId.current) return
    activeId.current = null
    if (erasing.current) { erasing.current = false; return }
    const s = live.current; live.current = null
    if (!s) return
    const pts = s.pts.map(p => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10, Math.round(p[2] * 100) / 100])
    const maxY = Math.max(...pts.map(p => p[1]))
    const cur = dataRef.current
    const h = maxY > cur.h - 60 ? Math.ceil(maxY + 260) : cur.h       // писали у нижнего края — лист растёт сам
    onChange({ h, strokes: [...cur.strokes, { ...s, pts }] })
  }

  const undo = () => onChange({ ...data, strokes: data.strokes.slice(0, -1) })
  const clear = () => { if (data.strokes.length && confirm('Стереть весь рукописный текст в этой заметке?')) onChange({ ...data, strokes: [] }) }
  const grow = () => onChange({ ...data, h: data.h + 400 })

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="mt-4 font-hand text-xl px-4 py-1 rounded-xl border-2 border-dashed border-ink/25 text-ink/70 hover:bg-white transition inline-flex items-center gap-2">
        <PenLine size={18} /> Писать стилусом
      </button>
    )
  }

  const tb = (active) => `!p-2 ${active ? 'btn' : 'btn-ghost'}`
  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-1 mb-2" role="toolbar" aria-label="Инструменты рисования">
        <button type="button" className={tb(mode === 'draw' && tool === 'pen')} aria-label="Ручка" title="Ручка"
                onClick={() => { setTool('pen'); setMode('draw') }}><Pencil size={17} /></button>
        <button type="button" className={tb(mode === 'draw' && tool === 'eraser')} aria-label="Ластик" title="Ластик (стирает штрих целиком)"
                onClick={() => { setTool('eraser'); setMode('draw') }}><Eraser size={17} /></button>
        <button type="button" className={tb(mode === 'scroll')} aria-label="Прокрутка" title="Режим прокрутки: палец листает страницу"
                onClick={() => setMode(mode === 'scroll' ? 'draw' : 'scroll')}><Hand size={17} /></button>
        <span className="w-px h-6 bg-ink/15 mx-1" />
        {COLORS.map(c => (
          <button key={c} type="button" aria-label={`Цвет ${c}`} onClick={() => { setColor(c); setTool('pen'); setMode('draw') }}
                  className={`w-6 h-6 rounded-full border-2 ${color === c && tool === 'pen' ? 'border-ink' : 'border-white'} shadow-sm`} style={{ background: c }} />
        ))}
        <span className="w-px h-6 bg-ink/15 mx-1" />
        {WIDTHS.map((w, i) => (
          <button key={w} type="button" aria-label={`Толщина ${i + 1}`} onClick={() => setWi(i)}
                  className={`w-8 h-8 grid place-items-center rounded-lg ${wi === i ? 'bg-white shadow' : 'hover:bg-white/60'}`}>
            <span className="rounded-full bg-ink" style={{ width: 4 + i * 4, height: 4 + i * 4 }} />
          </button>
        ))}
        <span className="w-px h-6 bg-ink/15 mx-1" />
        <button type="button" className="btn-ghost !p-2" aria-label="Отменить" title="Отменить последний штрих" onClick={undo} disabled={!data.strokes.length}><Undo2 size={17} /></button>
        <button type="button" className="btn-ghost !p-2" aria-label="Стереть всё" title="Стереть всё" onClick={clear} disabled={!data.strokes.length}><Trash2 size={17} /></button>
        <button type="button" className="btn-ghost !p-2" aria-label="Больше места" title="Добавить место снизу" onClick={grow}><Plus size={17} /></button>
        <label className="ml-auto text-xs flex items-center gap-1 opacity-80 cursor-pointer">
          <input type="checkbox" checked={penOnly} onChange={e => setPenOnly(e.target.checked)} /> только стилус
        </label>
      </div>
      <div ref={wrap} className="rounded-xl border border-ink/10 bg-white/60 overflow-hidden"
           style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 35px, #c9dcee 35px, #c9dcee 36px)' }}>
        <canvas ref={cvs} className="block w-full"
                style={{ touchAction: mode === 'draw' ? 'none' : 'auto', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none',
                         cursor: mode === 'draw' ? (tool === 'eraser' ? 'cell' : 'crosshair') : 'default' }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
                onContextMenu={e => e.preventDefault()} />
      </div>
    </div>
  )
}
