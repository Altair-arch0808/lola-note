import { useState } from 'react'
import { Plus, Trash2, Pencil, Check } from 'lucide-react'
import { useTable } from './useTable'
import { ctxVisible, shiftAt, CTX } from './shift'
import { addDays, ymd } from './util'

// Серия дней подряд. Дни, когда привычка не «по графику» (например, домашний уход на вахте), серию не рвут;
// сегодняшний невыполненный день её тоже не рвёт — день ещё не кончился.
function streak(days, habit, shift, today) {
  let n = 0
  for (let i = 0; i < 400; i++) {
    const d = addDays(today, -i)
    const sh = shiftAt(shift, d)
    if (sh && !ctxVisible(habit.context, sh.phase)) continue
    if (days.has(ymd(d))) n++
    else if (i > 0) break
  }
  return n
}

export default function Habits({ now, shift, phase }) {
  const habits = useTable('habits')
  const logs = useTable('habit_logs')
  const [adding, setAdding] = useState(false)
  const [manage, setManage] = useState(false)
  const [f, setF] = useState({ title: '', emoji: '', kind: 'habit', context: 'any' })
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()), day = ymd(today)

  const daysOf = id => new Set(logs.rows.filter(l => l.habit_id === id).map(l => l.day))
  const visible = habits.rows.filter(h => !phase || ctxVisible(h.context, phase))
  const hidden = habits.rows.length - visible.length
  const doneCount = visible.filter(h => daysOf(h.id).has(day)).length

  const toggle = h => {
    const have = logs.rows.filter(l => l.habit_id === h.id && l.day === day)
    if (have.length) have.forEach(l => logs.remove(l.id, null))
    else logs.add({ habit_id: h.id, day }, null)
  }
  const submit = async e => {
    e.preventDefault()
    if (!f.title.trim()) return
    await habits.add({ title: f.title.trim(), emoji: f.emoji.trim() || (f.kind === 'care' ? '🧴' : '✨'), kind: f.kind, context: f.context })
    setF({ ...f, title: '', emoji: '' })
  }
  const del = h => {
    if (!confirm(`Удалить «${h.title}» вместе с отметками?`)) return
    logs.rows.filter(l => l.habit_id === h.id).forEach(l => logs.remove(l.id, null))
    habits.remove(h.id)
  }

  const groups = [['habit', 'Привычки'], ['care', 'Уходы']]
    .map(([k, label]) => [label, visible.filter(h => (h.kind || 'habit') === k)]).filter(([, l]) => l.length)

  return (
    <div className="card space-y-2">
      <div className="flex items-center gap-2">
        <b className="flex-1">Привычки и уходы {visible.length > 0 && <span className="text-sm font-normal opacity-60">{doneCount} из {visible.length}</span>}</b>
        {habits.rows.length > 0 && (
          <button className="btn-ghost !p-2" aria-label={manage ? 'Готово' : 'Изменить список'} aria-pressed={manage} onClick={() => setManage(!manage)}>
            {manage ? <Check size={16} /> : <Pencil size={16} />}
          </button>
        )}
        <button className="btn-ghost !p-2" aria-label="Добавить" aria-expanded={adding} onClick={() => setAdding(!adding)}><Plus size={18} /></button>
      </div>

      {habits.rows.length === 0 && !adding && <p className="text-sm opacity-70">Добавьте привычки и уходы — например, «Вода», «Витамины», «Крем на ночь».</p>}

      {groups.map(([label, list]) => (
        <div key={label}>
          {groups.length > 1 && <div className="text-xs opacity-60 mb-1">{label}</div>}
          <ul className="space-y-1">
            {list.map(h => {
              const days = daysOf(h.id), done = days.has(day), st = streak(days, h, shift, today)
              return (
                <li key={h.id} className="flex items-center gap-1">
                  <button onClick={() => toggle(h)} aria-pressed={done}
                          className={`flex-1 flex items-center gap-2 rounded-xl px-3 py-2 text-left transition ${done ? 'bg-mint' : 'bg-white/70 hover:bg-white'}`}>
                    <span className="text-lg leading-none">{h.emoji}</span>
                    <span className={`flex-1 ${done ? 'task-done' : ''}`}>{h.title}</span>
                    {h.context && h.context !== 'any' && <span className="text-xs" title={CTX[h.context].label}>{CTX[h.context].emoji}</span>}
                    {st > 1 && <span className="text-xs opacity-70">🔥{st}</span>}
                    <span className={`w-5 h-5 rounded-full border-2 grid place-items-center ${done ? 'border-ink bg-white' : 'border-ink/30'}`} aria-hidden>
                      {done && <Check size={12} />}
                    </span>
                  </button>
                  {manage && <button className="btn-ghost !p-2" aria-label={`Удалить ${h.title}`} onClick={() => del(h)}><Trash2 size={16} /></button>}
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {hidden > 0 && <p className="text-xs opacity-60">Скрыто по графику: {hidden}</p>}

      {adding && (
        <form onSubmit={submit} className="space-y-2 pt-2 border-t border-beige/70 anim-pop">
          <div className="flex gap-2">
            <input className="input !w-16 text-center" maxLength={2} placeholder="🙂" aria-label="Эмодзи" value={f.emoji} onChange={e => setF({ ...f, emoji: e.target.value })} />
            <input className="input" placeholder="Название" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
          </div>
          <div className="flex gap-2">
            <select className="input" aria-label="Тип" value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
              <option value="habit">Привычка</option><option value="care">Уход</option>
            </select>
            <select className="input" aria-label="Где" value={f.context} onChange={e => setF({ ...f, context: e.target.value })}>
              {Object.entries(CTX).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
            </select>
          </div>
          <button className="btn">Добавить</button>
        </form>
      )}
    </div>
  )
}
