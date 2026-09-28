import { useState } from 'react'
import { useTable } from '../lib/useTable'
import { ymd, addDays, monday, pad, fmt } from '../lib/util'

const ACTION = { created: 'создано', updated: 'изменено', completed: 'выполнено', deleted: 'удалено' }
const ENTITY = { tasks: 'задача', events: 'событие', mind_nodes: 'узел карты', time_blocks: 'блок времени' }

function buckets(mode) {
  const now = new Date(), out = []
  for (let i = 6; i >= 0; i--) {
    if (mode === 'day') { const d = addDays(now, -i); out.push({ key: ymd(d), label: `${d.getDate()}.${pad(d.getMonth() + 1)}` }) }
    if (mode === 'week') { const d = monday(addDays(now, -i * 7)); out.push({ key: ymd(d), label: `${d.getDate()}.${pad(d.getMonth() + 1)}` }) }
    if (mode === 'month') { const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push({ key: `${d.getFullYear()}-${pad(d.getMonth() + 1)}`, label: d.toLocaleString('ru-RU', { month: 'short' }) }) }
  }
  return out
}
const keyOf = (date, mode) => mode === 'day' ? ymd(date) : mode === 'week' ? ymd(monday(date))
  : `${date.getFullYear()}-${pad(date.getMonth() + 1)}`

export default function Journal() {
  const { rows: log } = useTable('activity_log')
  const { rows: tasks } = useTable('tasks')
  const [mode, setMode] = useState('day')
  const data = buckets(mode).map(b => ({
    ...b, n: tasks.filter(t => t.done && t.done_at && keyOf(new Date(t.done_at), mode) === b.key).length
  }))
  const max = Math.max(1, ...data.map(d => d.n))

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="card">
        <div className="flex items-center gap-2 mb-4"><b className="mr-auto">Выполненные задачи</b>
          {[['day', 'Дни'], ['week', 'Недели'], ['month', 'Месяцы']].map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={mode === k ? 'btn' : 'btn-ghost'}>{l}</button>))}
        </div>
        <div className="flex items-end gap-2 h-48">
          {data.map(d => (
            <div key={d.key} className="flex-1 flex flex-col items-center justify-end h-full">
              <span className="text-xs">{d.n}</span>
              <div className="w-full rounded-t-xl bg-lav" style={{ height: `${(d.n / max) * 85}%`, minHeight: 4 }} />
              <span className="text-[10px] mt-1 opacity-70">{d.label}</span>
            </div>
          ))}
        </div>
        <p className="text-sm mt-3">Всего выполнено: {tasks.filter(t => t.done).length} из {tasks.length}</p>
      </div>

      <div className="card max-h-[70vh] overflow-y-auto">
        <b>Журнал активности</b>
        {log.length === 0 && <p className="text-sm opacity-60 mt-2">Действия появятся здесь.</p>}
        <ul className="mt-2 space-y-1 text-sm">
          {[...log].reverse().map(l => (
            <li key={l.id} className="flex gap-2"><span className="opacity-60 w-28 shrink-0">{fmt(l.created_at)}</span>
              <span>{ENTITY[l.entity] || l.entity} «{l.title}» — {ACTION[l.action] || l.action}</span></li>
          ))}
        </ul>
      </div>
    </div>
  )
}
