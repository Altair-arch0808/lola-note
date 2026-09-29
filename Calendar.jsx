import { useState, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { useTable } from './useTable'
import { ymd, fmt, countdown, PASTELS, toLocalInput } from './util'
import { useSettings } from './store'
import { shiftAt, SHIFT_COLORS, PHASE } from './shift'
import ShiftCard from './Shift'

export default function Calendar() {
  const { rows, add, remove } = useTable('events', 'starts_at')
  const { shift } = useSettings()
  const [cur, setCur] = useState(new Date())
  const [now, setNow] = useState(Date.now())
  const [form, setForm] = useState({ title: '', at: toLocalInput(new Date()), color: PASTELS[0] })
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t) }, [])

  const y = cur.getFullYear(), m = cur.getMonth()
  const first = (new Date(y, m, 1).getDay() + 6) % 7
  const total = new Date(y, m + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)]
  const onDay = d => rows.filter(e => ymd(new Date(e.starts_at)) === ymd(new Date(y, m, d)))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return
    await add({ title: form.title, starts_at: new Date(form.at).toISOString(), color: form.color })
    setForm({ ...form, title: '' })
  }
  const upcoming = rows.filter(e => new Date(e.starts_at) > now)

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="card lg:col-span-2">
        <div className="flex items-center justify-between mb-3">
          <button className="btn-ghost" onClick={() => setCur(new Date(y, m - 1, 1))}>‹</button>
          <b className="text-lg capitalize">{cur.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })}</b>
          <button className="btn-ghost" onClick={() => setCur(new Date(y, m + 1, 1))}>›</button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs opacity-60 mb-1">
          {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(d => <div key={d}>{d}</div>)}
        </div>
        {shift && (
          <div className="flex gap-3 text-xs mb-2">
            {['work', 'home'].map(p => (
              <span key={p} className="inline-flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ background: SHIFT_COLORS[p] }} /> {PHASE[p].label}
              </span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />
            const date = new Date(y, m, d), sh = shiftAt(shift, date)
            const isToday = ymd(date) === ymd(new Date(now))
            return (
            <button key={i} className={`min-h-16 rounded-xl p-1 text-left hover:brightness-95 ${sh ? '' : 'bg-white/60 hover:bg-white'} ${isToday ? 'ring-2 ring-ink/50' : ''}`}
                    style={sh ? { background: `${SHIFT_COLORS[sh.phase]}b3` } : undefined}
                    aria-label={sh ? `${d}, ${PHASE[sh.phase].label}${sh.isFirst ? ', первый день' : ''}` : undefined}
                    onClick={() => setForm({ ...form, at: toLocalInput(new Date(y, m, d, 9, 0)) })}>
              <div className="text-xs flex justify-between"><span>{d}</span>{sh?.isFirst && <span aria-hidden>{PHASE[sh.phase].emoji}</span>}</div>
              {onDay(d).slice(0, 2).map(e => (
                <div key={e.id} className="truncate text-[10px] rounded px-1 mt-0.5" style={{ background: e.color }}>{e.title}</div>
              ))}
            </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-4">
        <ShiftCard now={now} />
        <form onSubmit={submit} className="card space-y-2">
          <b>Новое событие</b>
          <input className="input" placeholder="Например: поездка" value={form.title}
                 onChange={e => setForm({ ...form, title: e.target.value })} />
          <input className="input" type="datetime-local" value={form.at}
                 onChange={e => setForm({ ...form, at: e.target.value })} />
          <div className="flex gap-2">
            {PASTELS.map(c => (
              <button type="button" key={c} aria-label={c} onClick={() => setForm({ ...form, color: c })}
                      className={`w-7 h-7 rounded-full border-2 ${form.color === c ? 'border-ink' : 'border-white'}`}
                      style={{ background: c }} />
            ))}
          </div>
          <button className="btn">Добавить</button>
        </form>

        <div className="card space-y-2">
          <b>Обратный отсчёт</b>
          {upcoming.length === 0 && <p className="text-sm opacity-60">Добавьте событие — здесь появится таймер.</p>}
          {upcoming.map(e => (
            <div key={e.id} className="rounded-xl p-3 flex justify-between items-center" style={{ background: e.color }}>
              <div>
                <div className="font-semibold">{e.title}</div>
                <div className="text-xs opacity-70">{fmt(e.starts_at)}</div>
                <div className="text-sm">Осталось: {countdown(e.starts_at, now)}</div>
              </div>
              <button className="btn-ghost" aria-label="Удалить" onClick={() => remove(e.id)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
