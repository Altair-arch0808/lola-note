import { useRef, useState } from 'react'
import { ZoomIn, ZoomOut, Plus, Trash2, ImagePlus, X } from 'lucide-react'
import { useTable } from '../lib/useTable'
import { uploadImage } from '../lib/supabase'
import { PASTELS } from '../lib/util'

const W = 170, H = 56

export default function MindMap() {
  const { rows: nodes, add, update, remove, reload } = useTable('mind_nodes')
  const [view, setView] = useState({ x: 200, y: 200, z: 1 })
  const [sel, setSel] = useState(null)
  const drag = useRef(null)
  const selected = nodes.find(n => n.id === sel)

  const zoom = (k) => setView(v => ({ ...v, z: Math.min(2.5, Math.max(0.3, v.z * k)) }))

  const down = (e, node) => {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { node, sx: e.clientX, sy: e.clientY, ox: node?.x, oy: node?.y, vx: view.x, vy: view.y, moved: false }
  }
  const move = (e) => {
    const d = drag.current; if (!d) return
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.node) update0(d.node.id, { x: d.ox + dx / view.z, y: d.oy + dy / view.z })
    else setView(v => ({ ...v, x: d.vx + dx, y: d.vy + dy }))
  }
  const up = () => {
    const d = drag.current; drag.current = null
    if (!d) return
    if (d.node) {
      if (d.moved) { const n = nodes.find(x => x.id === d.node.id); update(n.id, { x: n.x, y: n.y }) }
      else setSel(d.node.id)
    }
  }
  // Локальное перемещение без записи в БД (запись — при отпускании)
  const [, force] = useState(0)
  const update0 = (id, p) => { const n = nodes.find(x => x.id === id); Object.assign(n, p); force(v => v + 1) }

  const addNode = async (parent) => {
    const siblings = nodes.filter(n => n.parent_id === (parent?.id ?? null)).length
    const n = await add({
      title: parent ? 'Новый узел' : 'Главная тема', parent_id: parent?.id ?? null,
      x: parent ? parent.x + 230 : 0, y: parent ? parent.y + siblings * 80 : 0,
      color: parent ? parent.color : PASTELS[2]
    })
    if (n) setSel(n.id)
  }
  const del = async (n) => { await remove(n.id); setSel(null); reload() }
  const img = async (n, file) => { if (file) { const u = await uploadImage(file); if (u) update(n.id, { image_url: u }) } }

  return (
    <div className="relative h-[70vh] rounded-2xl overflow-hidden bg-white/50 shadow-soft touch-none select-none"
         onPointerDown={e => down(e, null)} onPointerMove={move} onPointerUp={up}
         onWheel={e => zoom(e.deltaY < 0 ? 1.1 : 0.9)}>
      <div style={{ transform: `translate(${view.x}px,${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }}>
        <svg width="1" height="1" style={{ overflow: 'visible', position: 'absolute' }}>
          {nodes.filter(n => n.parent_id).map(n => {
            const p = nodes.find(x => x.id === n.parent_id); if (!p) return null
            return <line key={n.id} x1={p.x + W / 2} y1={p.y + H / 2} x2={n.x + W / 2} y2={n.y + H / 2}
                         stroke="#b9a5ee" strokeWidth="2" />
          })}
        </svg>
        {nodes.map(n => (
          <div key={n.id} onPointerDown={e => down(e, n)}
               className={`absolute rounded-2xl shadow-soft px-3 py-2 cursor-grab flex items-center gap-2 ${sel === n.id ? 'ring-2 ring-ink/40' : ''}`}
               style={{ left: n.x, top: n.y, width: W, height: H, background: n.color }}>
            {n.image_url && <img src={n.image_url} alt="" className="w-8 h-8 rounded-lg object-cover" />}
            <span className="font-semibold text-sm truncate">{n.title}</span>
          </div>
        ))}
      </div>

      <div className="absolute top-3 left-3 flex gap-1 card !p-1" onPointerDown={e => e.stopPropagation()}>
        <button className="btn-ghost" aria-label="Приблизить" onClick={() => zoom(1.2)}><ZoomIn size={18} /></button>
        <button className="btn-ghost" aria-label="Отдалить" onClick={() => zoom(0.8)}><ZoomOut size={18} /></button>
        {nodes.length === 0 && <button className="btn" onClick={() => addNode(null)}><Plus size={16} /> Создать первый узел</button>}
      </div>

      {selected && (
        <div className="absolute top-3 right-3 w-72 card space-y-2" onPointerDown={e => e.stopPropagation()}>
          <div className="flex justify-between"><b>Карточка</b>
            <button className="btn-ghost !p-1" aria-label="Закрыть" onClick={() => setSel(null)}><X size={16} /></button></div>
          <input className="input" value={selected.title} onChange={e => update0(selected.id, { title: e.target.value })}
                 onBlur={e => update(selected.id, { title: e.target.value })} />
          <textarea className="input h-28" placeholder="Заметки, материалы, ссылки…" value={selected.body || ''}
                    onChange={e => update0(selected.id, { body: e.target.value })}
                    onBlur={e => update(selected.id, { body: e.target.value })} />
          {selected.image_url && <img src={selected.image_url} alt="" className="rounded-xl" />}
          <div className="flex gap-2">
            {PASTELS.map(c => <button key={c} aria-label={c} onClick={() => update(selected.id, { color: c })}
              className="w-6 h-6 rounded-full border-2 border-white" style={{ background: c }} />)}
          </div>
          <div className="flex gap-1 flex-wrap">
            <button className="btn" onClick={() => addNode(selected)}><Plus size={16} /> Ветка</button>
            <label className="btn-ghost cursor-pointer"><ImagePlus size={16} />
              <input type="file" accept="image/*" hidden onChange={e => img(selected, e.target.files[0])} /></label>
            <button className="btn-ghost" aria-label="Удалить" onClick={() => del(selected)}><Trash2 size={16} /></button>
          </div>
        </div>
      )}
    </div>
  )
}
