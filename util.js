export const PASTELS = ['#F9C6D4', '#FFF3DC', '#D9CCF5', '#C9EFD9', '#FFD9C2', '#EADCC8']
export const GRADIENTS = [
  'linear-gradient(135deg,#fde2e9,#e6dcf7)',
  'linear-gradient(135deg,#fff3dc,#ffd9c2)',
  'linear-gradient(135deg,#d9f3e6,#e6dcf7)',
  'linear-gradient(135deg,#fde2e9,#fff3dc)'
]
export const pad = n => String(n).padStart(2, '0')
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
export const monday = d => addDays(d, -((d.getDay() + 6) % 7))
export const toLocalInput = d => `${ymd(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
export const fmt = s => s
  ? new Date(s).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  : ''
export function countdown(iso, now = Date.now()) {
  const m = Math.floor((new Date(iso) - now) / 60000)
  if (m <= 0) return 'уже наступило'
  return `${Math.floor(m / 1440)} дн ${Math.floor((m % 1440) / 60)} ч ${m % 60} мин`
}
