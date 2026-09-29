/* Что и когда напоминать. Чистая функция без зависимостей: один и тот же файл используют
   • приложение (Reminders.jsx) — показывает уведомления, пока оно открыто или свёрнуто;
   • Edge Function send-reminders — шлёт push, когда приложение закрыто.
   Поэтому здесь нет импортов и нет обращений к window / localStorage. */

export const DEFAULT_NOTIFY = {
  enabled: false,
  tz: null,                                        // часовой пояс устройства, например 'Asia/Atyrau'
  tasks:   { on: true,  lead: 10 },                // за сколько минут до срока задачи
  events:  { on: true,  lead: 60 },                // до события из календаря
  blocks:  { on: true,  lead: 10 },                // до блока в расписании
  morning: { on: false, time: '08:00' },           // утренняя сводка на день
  habits:  { on: false, time: '21:00' },           // если остались неотмеченные привычки и уходы
  mood:    { on: false, time: '21:30' },           // если не отмечено настроение
  shift:   { on: true,  days: 1, time: '09:00' },  // смена периода вахты: за N дней и в сам день
  digest:  { on: true, days: 3, time: '18:00', back: true }, // дайджест перед сменой периода: что успеть до отъезда (и до возвращения, если back)
  quiet:   { on: false, from: '23:00', to: '07:00' }, // «не беспокоить»: напоминания переносятся на конец тишины
  // звук (мелодия в приложении) и вибрация для каждого вида уведомлений
  alert: {
    tasks:  { sound: 'double', vibe: 'double' },
    events: { sound: 'bell',   vibe: 'long' },
    blocks: { sound: 'soft',   vibe: 'short' },
    shift:  { sound: 'rise',   vibe: 'triple' },
    digest: { sound: 'rise',   vibe: 'pulse' },
    morning:{ sound: 'soft',   vibe: 'short' },
    habits: { sound: 'soft',   vibe: 'short' },
    mood:   { sound: 'soft',   vibe: 'none' }
  }
}

export const SOUND_LABELS = { none: 'Без мелодии', bell: 'Колокольчик', soft: 'Мягкий', double: 'Двойной', rise: 'Мелодия вверх', alarm: 'Тревожный' }
export const VIBES = {
  none:   { label: 'Без вибрации',  p: [] },
  short:  { label: 'Короткая',      p: [200] },
  double: { label: 'Двойная',       p: [150, 100, 150] },
  triple: { label: 'Тройная',       p: [120, 80, 120, 80, 120] },
  long:   { label: 'Длинная',       p: [600] },
  pulse:  { label: 'Волна',         p: [300, 100, 300, 100, 500] }
}

export function mergeNotify(n) {
  const out = { ...DEFAULT_NOTIFY, ...(n || {}) }
  for (const k of Object.keys(DEFAULT_NOTIFY)) {
    if (k !== 'alert' && DEFAULT_NOTIFY[k] && typeof DEFAULT_NOTIFY[k] === 'object') out[k] = { ...DEFAULT_NOTIFY[k], ...((n && n[k]) || {}) }
  }
  out.alert = Object.fromEntries(Object.keys(DEFAULT_NOTIFY.alert).map(c => [c, { ...DEFAULT_NOTIFY.alert[c], ...((n && n.alert && n.alert[c]) || {}) }]))
  return out
}

// Как подать уведомление вида cat: мелодия (играет приложение), рисунок вибрации, «совсем без звука»
export function alertFor(notify, cat) {
  const a = mergeNotify(notify).alert[cat] || {}
  const sound = SOUND_LABELS[a.sound] ? a.sound : 'none'
  const vibrate = (VIBES[a.vibe] || VIBES.none).p
  return { sound, vibrate, silent: sound === 'none' && vibrate.length === 0 }
}

/* ---------- время в часовом поясе пользователя ---------- */
const fmts = new Map()
function parts(ms, tz) {
  let f = fmts.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    fmts.set(tz, f)
  }
  const o = {}
  for (const p of f.formatToParts(new Date(ms))) o[p.type] = p.value
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute }
}
const p2 = n => String(n).padStart(2, '0')
const dayOf = p => `${p.y}-${p2(p.m)}-${p2(p.d)}`
const split = s => s.split('-').map(Number)
const dnum = s => { const [y, m, d] = split(s); return Math.floor(Date.UTC(y, m - 1, d) / 86400000) }
const addDay = (s, n) => { const [y, m, d] = split(s); return dayOf(parts(Date.UTC(y, m - 1, d + n, 12), 'UTC')) }
const hm = s => { const [h, m] = String(s || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0) }

// разница «настенное время в поясе» − «UTC» в мс для момента ms
const offsetMs = (ms, tz) => { const p = parts(ms, tz); return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi) - Math.floor(ms / 60000) * 60000 }
// «день + минуты от полуночи по времени пояса» → момент в UTC (мс)
export function zonedMs(day, minutes, tz) {
  const [y, m, d] = split(day)
  const guess = Date.UTC(y, m - 1, d, 0, minutes)
  const once = guess - offsetMs(guess, tz)
  return guess - offsetMs(once, tz)
}
export const validTz = tz => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }

/* ---------- вахта (то же, что shiftAt в shift.js, но по строке 'YYYY-MM-DD') ---------- */
function phaseAt(cfg, day) {
  if (!(cfg && cfg.start && cfg.work > 0 && cfg.home > 0)) return null
  const first = cfg.phase === 'home' ? 'home' : 'work', other = first === 'work' ? 'home' : 'work'
  const l1 = cfg[first], cycle = l1 + cfg[other]
  const pos = (((dnum(day) - dnum(cfg.start)) % cycle) + cycle) % cycle
  return pos < l1 ? { phase: first, day: pos + 1 } : { phase: other, day: pos - l1 + 1 }
}
// метка «где» подходит к текущему периоду (как ctxVisible в shift.js)
const fits = (ctx, ph) => !ph || !ctx || ctx === 'any' || ctx === ph.phase

const MIN = 60000
const leadText = m => (m >= 1440 ? `${Math.round(m / 1440)} дн` : m >= 60 ? `${Math.round(m / 60)} ч` : `${m} мин`)
const hhmm = (ms, tz) => { const p = parts(ms, tz); return `${p2(p.h)}:${p2(p.mi)}` }
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const stamp = (ms, tz) => { const p = parts(ms, tz); return `${p.d} ${MONTHS[p.m - 1]}, ${p2(p.h)}:${p2(p.mi)}` }
const daysWord = k => `${k} ${k % 10 === 1 && k % 100 !== 11 ? 'день' : [2, 3, 4].includes(k % 10) && ![12, 13, 14].includes(k % 100) ? 'дня' : 'дней'}`
const list = (arr, k = 3) => arr.slice(0, k).join(', ') + (arr.length > k ? ` и ещё ${arr.length - k}` : '')

/* Возвращает все напоминания, которые относятся к «сегодня» и ближайшим дням:
   { key, at (когда показать, мс), grace (сколько мс после at ещё актуально), title, body, tab }.
   Вызывающий сам решает, что уже пора и что уже показано (см. dueNow). */
export function computeDue({ now, tz, notify, tasks = [], events = [], blocks = [], habits = [], logs = [], moods = [], shift = null }) {
  const n = mergeNotify(notify)
  if (!n.enabled) return []
  const zone = validTz(tz) ? tz : 'UTC'
  const today = dayOf(parts(now, zone))
  const phToday = phaseAt(shift, today)
  const out = []

  const defer = at => {                         // «не беспокоить»
    const q = n.quiet
    if (!q.on) return at
    const from = hm(q.from), to = hm(q.to)
    if (from === to) return at
    const p = parts(at, zone), m = p.h * 60 + p.mi
    const inside = from < to ? (m >= from && m < to) : (m >= from || m < to)
    if (!inside) return at
    return zonedMs(from > to && m >= from ? addDay(dayOf(p), 1) : dayOf(p), to, zone)
  }
  const add = (key, cat, at, grace, title, body, tab) => out.push({ key, cat, at: defer(at), grace, title, body, tab })

  if (n.tasks.on) for (const t of tasks) {
    if (t.done || !t.due_at) continue
    const due = Date.parse(t.due_at)
    if (Number.isNaN(due)) continue
    if (!fits(t.context, phaseAt(shift, dayOf(parts(due, zone))))) continue
    const L = n.tasks.lead
    add(`task:${t.id}:${due}:${L}`, 'tasks', due - L * MIN, 30 * MIN, `📝 ${t.title}`,
      L > 0 ? `Срок в ${hhmm(due, zone)} · через ${leadText(L)}` : `Срок наступил · ${hhmm(due, zone)}`, 'tasks')
  }

  if (n.events.on) for (const e of events) {
    const start = Date.parse(e.starts_at)
    if (Number.isNaN(start)) continue
    const L = n.events.lead
    add(`event:${e.id}:${start}:${L}`, 'events', start - L * MIN, 30 * MIN, `📅 ${e.title}`,
      L > 0 ? `Начало в ${hhmm(start, zone)} · через ${leadText(L)}` : `Начинается сейчас · ${hhmm(start, zone)}`, 'calendar')
  }

  if (n.blocks.on) for (const b of blocks) {
    if (!b.day || b.start_min == null) continue
    if (!fits(b.context, phaseAt(shift, b.day))) continue
    const start = zonedMs(b.day, b.start_min, zone), L = n.blocks.lead
    add(`block:${b.id}:${b.day}:${b.start_min}:${L}`, 'blocks', start - L * MIN, 30 * MIN, `🗓️ ${b.title}`,
      L > 0 ? `Начало в ${hhmm(start, zone)} · через ${leadText(L)}` : `Начинается сейчас · ${hhmm(start, zone)}`, 'planner')
  }

  if (n.morning.on) {
    const dayEnd = zonedMs(addDay(today, 1), 0, zone)
    const open = tasks.filter(t => !t.done && t.due_at && Date.parse(t.due_at) < dayEnd && fits(t.context, phToday))
    const late = open.filter(t => Date.parse(t.due_at) < zonedMs(today, 0, zone)).length
    const ev = events.filter(e => { const s = Date.parse(e.starts_at); return s >= zonedMs(today, 0, zone) && s < dayEnd })
    const bl = blocks.filter(b => b.day === today && fits(b.context, phToday))
    if (open.length || ev.length || bl.length) {
      const sum = [
        open.length && `Задач: ${open.length}${late ? ` (просрочено ${late})` : ''}`,
        ev.length && `Событий: ${ev.length}`,
        bl.length && `В расписании: ${bl.length}`
      ].filter(Boolean).join(' · ')
      const names = [...open].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at)).map(t => t.title)
      add(`morning:${today}`, 'morning', zonedMs(today, hm(n.morning.time), zone), 3 * 60 * MIN, '☀️ План на сегодня', names.length ? `${sum}\n${list(names)}` : sum, 'today')
    }
  }

  if (n.habits.on) {
    const vis = habits.filter(h => fits(h.context, phToday))
    const done = new Set(logs.filter(l => l.day === today).map(l => l.habit_id))
    const left = vis.filter(h => !done.has(h.id))
    if (left.length) {
      add(`habits:${today}`, 'habits', zonedMs(today, hm(n.habits.time), zone), 3 * 60 * MIN, '✨ Привычки и уход',
        `Осталось отметить: ${left.length} из ${vis.length} — ${list(left.map(h => `${h.emoji || ''} ${h.title}`.trim()))}`, 'today')
    }
  }

  if (n.mood.on && !moods.some(m => m.day === today)) {
    add(`mood:${today}`, 'mood', zonedMs(today, hm(n.mood.time), zone), 3 * 60 * MIN, '🙂 Как прошёл день?', 'Отметьте настроение — это пара секунд.', 'today')
  }

  if (n.shift.on && shift) {
    for (const k of new Set([0, n.shift.days])) {
      const target = addDay(today, k), ph = phaseAt(shift, target)
      if (!ph || ph.day !== 1) continue                // интересует только первый день нового периода
      const work = ph.phase === 'work'
      const what = work ? 'отъезд на вахту' : 'возвращение домой'
      const when = k === 0 ? 'Сегодня' : k === 1 ? 'Завтра' : `Через ${k} дн`
      add(`shift:${target}:${k}`, 'shift', zonedMs(today, hm(n.shift.time), zone), 4 * 60 * MIN, work ? '🏗️ Вахта' : '🏠 Домой', `${when} — ${what}`, 'calendar')
    }
  }

  // Дайджест перед сменой периода: что успеть сделать «здесь», пока не уехали (или не вернулись)
  if (n.digest.on && shift) {
    const k = n.digest.days, target = addDay(today, k), ph = phaseAt(shift, target)
    if (ph && ph.day === 1 && (ph.phase === 'work' || n.digest.back)) {
      const leaving = ph.phase, here = leaving === 'work' ? 'home' : 'work'
      const from = zonedMs(today, 0, zone), end = zonedMs(addDay(target, 1), 0, zone)
      const dueOf = t => (t.due_at ? Date.parse(t.due_at) : null)
      const open = tasks.filter(t => !t.done)
      const todo = open.filter(t => {
        const d = dueOf(t)
        if (t.context === here) return d == null || d < end        // дела, которые можно сделать только здесь
        if (!t.context || t.context === 'any') return d != null && d < end
        return false
      }).sort((a, b) => (dueOf(a) ?? Infinity) - (dueOf(b) ?? Infinity))
      const late = todo.filter(t => dueOf(t) != null && dueOf(t) < from).length
      const there = open.filter(t => t.context === leaving && dueOf(t) != null && dueOf(t) >= end && dueOf(t) < end + 7 * 86400000).length
      const evs = events.filter(e => { const s = Date.parse(e.starts_at); return s >= from && s < end }).sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
      const bl = blocks.filter(b => b.day === target && fits(b.context, { phase: here })).sort((a, b) => a.start_min - b.start_min)
      const lines = [
        todo.length ? `Не сделано: ${todo.length}${late ? ` (просрочено ${late})` : ''} — ${list(todo.map(t => t.title))}`
                    : 'Дел, которые нужно закончить, нет ✨',
        evs.length && `События: ${list(evs.map(e => `${e.title} (${stamp(Date.parse(e.starts_at), zone)})`), 2)}`,
        bl.length && `${leaving === 'work' ? 'В день отъезда' : 'В день возвращения'}: ${list(bl.map(b => `${p2(Math.floor(b.start_min / 60))}:${p2(b.start_min % 60)} ${b.title}`), 2)}`,
        there && `${leaving === 'work' ? 'На вахте' : 'Дома'} уже запланировано: ${there}`
      ].filter(Boolean)
      add(`digest:${target}`, 'digest', zonedMs(today, hm(n.digest.time), zone), 6 * 60 * MIN,
        `${leaving === 'work' ? '🧳 До вахты' : '🏠 До возвращения домой'}: ${daysWord(k)}`, lines.join('\n'), 'tasks')
    }
  }

  return out.sort((a, b) => a.at - b.at)
}

// Что пора показать прямо сейчас (sent — объект { ключ: время показа })
export const dueNow = (items, now, sent = {}) => items.filter(i => i.at <= now && now < i.at + i.grace && !sent[i.key])
