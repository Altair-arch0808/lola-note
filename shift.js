import { addDays, parseYmd } from './util'

// Цвета периодов
export const SHIFT_COLORS = { work: '#FFD9C2', home: '#C9EFD9' }
export const PHASE = {
  work: { label: 'На вахте', emoji: '🏗️', next: 'До возвращения домой' },
  home: { label: 'Дома', emoji: '🏠', next: 'До отъезда на вахту' }
}
export const PRESETS = [[30, 30], [60, 30], [45, 15], [28, 28], [15, 15], [14, 14]]

// Метки «где» для задач, планов и привычек
export const CTX = {
  any: { label: 'Везде', emoji: '📌' },
  work: { label: 'На вахте', emoji: '🏗️' },
  home: { label: 'Дома', emoji: '🏠' }
}
const CTX_ORDER = ['any', 'work', 'home']
export const nextCtx = c => CTX_ORDER[(CTX_ORDER.indexOf(c || 'any') + 1) % CTX_ORDER.length]
// filter: 'all' | 'work' | 'home'. Метка «везде» подходит к любому фильтру
export const ctxVisible = (ctx, filter) => filter === 'all' || !ctx || ctx === 'any' || ctx === filter

export const validShift = c => !!(c && c.start && c.work > 0 && c.home > 0)

// Номер дня без влияния часовых поясов и перевода часов
const dn = d => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000)

/* График хранится так: { work: 30, home: 30, start: 'YYYY-MM-DD', phase: 'work' | 'home' }
   — с даты start начинается период phase, дальше периоды чередуются по кругу (в обе стороны).
   Возвращает, какой сейчас период, какой это день, и когда он сменится. */
export function shiftAt(cfg, date) {
  if (!validShift(cfg)) return null
  const first = cfg.phase === 'home' ? 'home' : 'work'
  const other = first === 'work' ? 'home' : 'work'
  const len1 = cfg[first], len2 = cfg[other], cycle = len1 + len2
  const off = dn(date) - dn(parseYmd(cfg.start))
  const pos = ((off % cycle) + cycle) % cycle
  const inFirst = pos < len1
  const phase = inFirst ? first : other
  const len = inFirst ? len1 : len2
  const day = inFirst ? pos + 1 : pos - len1 + 1
  const toChange = len - day + 1                     // сколько суток до первого дня следующего периода
  const midnight = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return {
    phase, day, len, toChange,
    from: addDays(midnight, -(day - 1)),             // первый день периода
    to: addDays(midnight, toChange - 1),             // последний день периода
    changeOn: addDays(midnight, toChange),           // день, когда начнётся следующий период
    isFirst: day === 1
  }
}
