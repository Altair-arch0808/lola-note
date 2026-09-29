import { useState } from 'react'
import { useSettings, saveSettings } from './store'
import { shiftAt, validShift, PHASE, PRESETS, SHIFT_COLORS } from './shift'
import { countdown, ymd } from './util'

const short = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

// Карточка графика вахты: статус, обратный отсчёт до смены периода и настройка графика
export default function ShiftCard({ now }) {
  const { shift } = useSettings()
  const info = shiftAt(shift, new Date(now))
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState(null)

  const open = () => {
    setF({ work: shift?.work || 30, home: shift?.home || 30, start: shift?.start || ymd(new Date()), phase: shift?.phase || 'work' })
    setEdit(true)
  }
  const save = e => {
    e.preventDefault()
    const cfg = { work: Math.round(+f.work), home: Math.round(+f.home), start: f.start, phase: f.phase }
    if (!validShift(cfg)) return
    saveSettings({ shift: cfg }); setEdit(false)
  }
  const reset = () => { if (confirm('Убрать график вахты?')) { saveSettings({ shift: null }); setEdit(false) } }

  if (edit && f) return (
    <form onSubmit={save} className="card space-y-3">
      <b>График вахты</b>
      <div className="flex flex-wrap gap-1">
        {PRESETS.map(([w, h]) => (
          <button type="button" key={`${w}-${h}`} onClick={() => setF({ ...f, work: w, home: h })}
                  className={`rounded-full px-3 py-1 text-sm border ${+f.work === w && +f.home === h ? 'border-ink bg-white' : 'border-beige bg-white/60'}`}>
            {w} через {h}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">Вахта, дней
          <input className="input mt-1" type="number" min="1" max="365" value={f.work} onChange={e => setF({ ...f, work: e.target.value })} /></label>
        <label className="text-sm">Дома, дней
          <input className="input mt-1" type="number" min="1" max="365" value={f.home} onChange={e => setF({ ...f, home: e.target.value })} /></label>
      </div>
      <label className="text-sm block">Точка отсчёта
        <input className="input mt-1" type="date" value={f.start} onChange={e => setF({ ...f, start: e.target.value })} required /></label>
      <div className="flex gap-2" role="radiogroup" aria-label="Что начинается с этой даты">
        {['work', 'home'].map(p => (
          <button type="button" key={p} role="radio" aria-checked={f.phase === p} onClick={() => setF({ ...f, phase: p })}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm border-2 ${f.phase === p ? 'border-ink' : 'border-transparent'}`}
                  style={{ background: SHIFT_COLORS[p] }}>
            С этого дня — {p === 'work' ? 'вахта' : 'дома'}
          </button>
        ))}
      </div>
      <p className="text-xs opacity-60">Подойдёт любая дата начала вахты или отпуска, в том числе прошлая: календарь продолжит чередование сам.</p>
      <div className="flex gap-2 flex-wrap">
        <button className="btn">Сохранить</button>
        <button type="button" className="btn-ghost" onClick={() => setEdit(false)}>Отмена</button>
        {shift && <button type="button" className="btn-ghost ml-auto text-sm" onClick={reset}>Убрать график</button>}
      </div>
    </form>
  )

  if (!info) return (
    <div className="card space-y-2">
      <b>График вахты</b>
      <p className="text-sm opacity-70">Укажите график один раз (например, 30 через 30) — календарь сам покрасит вахту и дом и посчитает дни.</p>
      <button className="btn" onClick={open}>Настроить график</button>
    </div>
  )

  return (
    <div className="card space-y-2" style={{ background: SHIFT_COLORS[info.phase] }}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <div className="text-lg font-bold">{PHASE[info.phase].emoji} {PHASE[info.phase].label}</div>
          <div className="text-sm">День {info.day} из {info.len} · {short(info.from)} – {short(info.to)}</div>
        </div>
        <button className="btn-ghost !py-1 text-sm" onClick={open}>Изменить</button>
      </div>
      <div className="rounded-xl bg-white/60 p-3">
        <div className="text-xs opacity-70">{PHASE[info.phase].next}</div>
        <div className="text-xl font-bold">{countdown(info.changeOn.toISOString(), now)}</div>
        <div className="text-xs opacity-70">{info.phase === 'work' ? 'Домой' : 'На вахту'}: {short(info.changeOn)}</div>
      </div>
    </div>
  )
}
