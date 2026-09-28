import { useState } from 'react'
import { useTable } from '../lib/useTable'
import { PASTELS, ymd, parseYmd, addDays, monday, pad } from '../lib/util'

const H = 48, START = 6, END = 23
const hours = Array.from({ length: END - START }, (_, i) => START + i)
const hm = min => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`

export default function Planner() {
  const { rows, add, update, remove } = useTable('time_blocks')
  const [mode, setMode] = useState('day')
  const [date, setDate] = useState(new Date())
  const [resize, setResize] = useState(null) // { id, dur }

  const days = mode === 'day' ? [date] : Array.from({ length: 7 }, (_, i) => addDays(monday(date), i))
  const step = mode === 'day' ? 1 : mode === 'week' ? 7 : 30

  const create = async (d, e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const h = START + Math.floor((e.clientY - r.top) / H)
    const title = prompt('Название блока')
    if (title) await add({ title, day: ymd(d), start_min: h * 60, duration_min: 60,
                           color: PASTELS[Math.floor(Math.random() * PASTELS.length)] })
  }
  const drop = (e, d) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('id'); if (!id) return
    const r = e.currentTarget.getBoundingClientRect()
    const h = START + Math.max(0, Math.floor((e.clientY - r.top) / H))
    update(id, { day: ymd(d), start_min: h * 60 })
  }
  const startResize = (e, b) => {
    e.stopPropagation(); e.preventDefault()
    const y0 = e.clientY, d0 = b.duration_min
    const calc = ev => Math.max(15, Math.round((d0 + ((ev.clientY - y0) / H) * 60) / 15) * 15)
    const mv = ev => setResize({ id: b.id, dur: calc(ev) })
    const upH = ev => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upH)
      update(b.id, { duration_min: calc(ev) }); setResize(null)
    }
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', upH)
  }

  // Месяц: сетка дней с блоками
  const monthGrid = () => {
    const y = date.getFullYear(), m = date.getMonth()
    const first = (new Date(y, m, 1).getDay() + 6) % 7
    const total = new Date(y, m + 1, 0).getDate()
    const cells = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => new Date(y, m, i + 1))]
    return (
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => !d ? <div key={i} /> : (
          <button key={i} className="min-h-20 rounded-xl bg-white/60 p-1 text-left hover:bg-white"
                  onClick={() => { setDate(d); setMode('day') }}>
            <div className="text-xs">{d.getDate()}</div>
            {rows.filter(b => b.day === ymd(d)).slice(0, 3).map(b => (
              <div key={b.id} className="truncate text-[10px] rounded px-1 mt-0.5" style={{ background: b.color }}>{b.title}</div>
            ))}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {[['day', 'День'], ['week', 'Неделя'], ['month', 'Месяц']].map(([k, l]) => (
          <button key={k} onClick={() => setMode(k)} className={mode === k ? 'btn' : 'btn-ghost'}>{l}</button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button className="btn-ghost" onClick={() => setDate(addDays(date, -step))}>‹</button>
          <b className="capitalize">{date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</b>
          <button className="btn-ghost" onClick={() => setDate(addDays(date, step))}>›</button>
        </div>
      </div>

      {mode === 'month' ? monthGrid() : (
        <div className="overflow-x-auto">
          <p className="text-xs opacity-60 mb-2">Двойной клик по колонке — добавить блок. Тяните блок, чтобы переместить, нижний край — чтобы изменить длительность.</p>
          <div className="flex min-w-[600px]">
            <div className="w-12 shrink-0">
              {hours.map(h => <div key={h} style={{ height: H }} className="text-xs opacity-60 pr-1 text-right">{pad(h)}:00</div>)}
            </div>
            {days.map(d => (
              <div key={d} className="flex-1 border-l border-beige">
                {mode === 'week' && <div className="text-center text-xs -mt-5 mb-1">{d.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' })}</div>}
                <div className="relative" style={{ height: hours.length * H }}
                     onDoubleClick={e => create(d, e)} onDragOver={e => e.preventDefault()} onDrop={e => drop(e, d)}>
                  {hours.map(h => <div key={h} style={{ height: H }} className="border-t border-beige/70" />)}
                  {rows.filter(b => b.day === ymd(d)).map(b => {
                    const dur = resize?.id === b.id ? resize.dur : b.duration_min
                    return (
                      <div key={b.id} draggable onDragStart={e => e.dataTransfer.setData('id', b.id)}
                           onDoubleClick={e => { e.stopPropagation(); if (confirm(`Удалить «${b.title}»?`)) remove(b.id) }}
                           className="absolute left-1 right-1 rounded-xl px-2 py-1 text-xs shadow-soft cursor-grab overflow-hidden"
                           style={{ top: ((b.start_min - START * 60) / 60) * H, height: (dur / 60) * H - 2, background: b.color }}>
                        <b>{b.title}</b><div className="opacity-70">{hm(b.start_min)}–{hm(b.start_min + dur)}</div>
                        <div onPointerDown={e => startResize(e, b)} className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize bg-black/10" />
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
