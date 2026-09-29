import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { useTable } from './useTable'
import { useSettings } from './store'
import { useNow } from './hooks'
import { shiftAt, ctxVisible, PHASE, SHIFT_COLORS, CTX } from './shift'
import { QuickCapture } from './Inbox'
import Habits from './Habits'
import { toggleTask } from './Tasks'
import { ymd, addDays, fmt, countdown } from './util'

const MOODS = [
  { v: 1, e: '😞', l: 'Плохо' }, { v: 2, e: '😕', l: 'Так себе' }, { v: 3, e: '😐', l: 'Нормально' },
  { v: 4, e: '🙂', l: 'Хорошо' }, { v: 5, e: '😄', l: 'Отлично' }
]
const hello = h => (h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер')
const short = d => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

function Mood({ now, day }) {
  const moods = useTable('moods')
  const byDay = new Map(); moods.rows.forEach(m => byDay.set(m.day, m))      // при дублях побеждает более поздняя
  const cur = byDay.get(day)
  const set = v => (cur ? moods.update(cur.id, { mood: v }, null) : moods.add({ day, mood: v }, null))
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6))
  return (
    <div className="card space-y-2">
      <b>Настроение</b>
      <div className="flex justify-between gap-1" role="group" aria-label="Настроение сегодня">
        {MOODS.map(m => (
          <button key={m.v} onClick={() => set(m.v)} aria-pressed={cur?.mood === m.v} aria-label={m.l} title={m.l}
                  className={`flex-1 text-2xl rounded-xl py-2 transition ${cur?.mood === m.v ? 'bg-lav scale-105 shadow-soft' : 'bg-white/70 hover:bg-white'}`}>{m.e}</button>
        ))}
      </div>
      <div className="flex justify-between text-center text-[11px] opacity-70" aria-label="Последние 7 дней">
        {week.map(d => {
          const m = byDay.get(ymd(d))
          return (
            <div key={+d} className="flex-1">
              <div className="text-base leading-6">{m ? MOODS[m.mood - 1].e : '·'}</div>
              {d.toLocaleDateString('ru-RU', { weekday: 'short' })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Today({ go }) {
  const now = useNow(30000)
  const nowD = new Date(now), day = ymd(nowD)
  const { shift } = useSettings()
  const sh = shiftAt(shift, nowD)
  const table = useTable('tasks')
  const events = useTable('events', 'starts_at')
  const [all, setAll] = useState(false)

  const dueDay = t => ymd(new Date(t.due_at))
  const open = table.rows.filter(t => !t.done && t.due_at && dueDay(t) <= day).sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
  const shown = open.filter(t => !sh || all || ctxVisible(t.context, sh.phase))
  const hidden = open.filter(t => sh && !ctxVisible(t.context, sh.phase)).length   // задачи для другого периода
  const doneToday = table.rows.filter(t => t.done && t.done_at && ymd(new Date(t.done_at)) === day)

  // перенести на завтра, время суток сохраняем
  const postpone = t => {
    const d = new Date(t.due_at)
    table.update(t.id, { due_at: new Date(nowD.getFullYear(), nowD.getMonth(), nowD.getDate() + 1, d.getHours(), d.getMinutes()).toISOString() })
  }
  const next = events.rows.filter(e => new Date(e.starts_at) > now).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0]

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <div className="card" style={sh ? { background: `${SHIFT_COLORS[sh.phase]}cc` } : undefined}>
          <div className="text-xl font-bold">{hello(nowD.getHours())}!</div>
          <div className="text-sm opacity-70 first-letter:uppercase">{nowD.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
          {sh ? (
            <div className="mt-2 text-sm">
              <b>{PHASE[sh.phase].emoji} {PHASE[sh.phase].label}</b> · день {sh.day} из {sh.len}
              <div>{sh.phase === 'work' ? 'До возвращения домой' : 'До отъезда на вахту'}: <b>{sh.toChange} дн</b> ({short(sh.changeOn)})</div>
            </div>
          ) : (
            <button className="mt-2 text-sm underline" onClick={() => go('calendar')}>Настроить график вахты</button>
          )}
        </div>

        <QuickCapture go={go} />

        <div className="card space-y-2">
          <div className="flex items-center gap-2">
            <b className="flex-1">Задачи на сегодня</b>
            <button className="btn-ghost !py-1 text-sm" onClick={() => go('tasks')}>Все задачи <ArrowRight size={14} /></button>
          </div>
          {shown.length === 0 && doneToday.length === 0 && <p className="text-sm opacity-70">На сегодня задач нет. Свободный день ✨</p>}
          {[...shown, ...doneToday].map(t => (
            <div key={t.id} className="flex items-center gap-3 rounded-xl bg-white/70 px-3 py-2">
              <input type="checkbox" checked={!!t.done} onChange={() => toggleTask(table, t)}
                     className="w-5 h-5 rounded-md accent-[#b9a5ee]" aria-label={`Выполнено: ${t.title}`} />
              <div className="flex-1 min-w-0">
                <div className={`break-words ${t.done ? 'task-done' : ''}`}>{t.title}</div>
                {!t.done && <div className="text-xs opacity-60">
                  {dueDay(t) < day ? <span className="text-rose-500 font-semibold">просрочено · </span> : null}{fmt(t.due_at)}
                  {t.context && t.context !== 'any' && ` · ${CTX[t.context].emoji}`}
                </div>}
              </div>
              {!t.done && <button className="btn-ghost !py-1 !px-2 text-xs" onClick={() => postpone(t)} title="Перенести на завтра">завтра</button>}
            </div>
          ))}
          {hidden > 0 && (
            <button className="text-xs underline opacity-70" onClick={() => setAll(!all)}>
              {all ? 'Скрыть задачи другого периода' : `Ещё ${hidden} — для другого периода. Показать`}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <Mood now={nowD} day={day} />
        <Habits now={nowD} shift={shift} phase={sh?.phase} />
        <div className="card space-y-2">
          <b>Ближайшее событие</b>
          {next ? (
            <div className="rounded-xl p-3" style={{ background: next.color }}>
              <div className="font-semibold">{next.title}</div>
              <div className="text-xs opacity-70">{fmt(next.starts_at)}</div>
              <div className="text-sm">Осталось: {countdown(next.starts_at, now)}</div>
            </div>
          ) : <p className="text-sm opacity-70">Событий пока нет. <button className="underline" onClick={() => go('calendar')}>Добавить</button></p>}
        </div>
      </div>
    </div>
  )
}
