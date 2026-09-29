/* Превью ссылок: по адресу страницы находим её главное фото (og:image) и заголовок.
   1) Своя Edge Function «link-preview» (supabase/functions/link-preview) — приватно, без сторонних сервисов.
   2) Если она не задеплоена — запасной вариант: бесплатный публичный API microlink.io (около 50 запросов в сутки).
   Результат кэшируется в localStorage: найденное фото — на 30 дней, «фото нет» — на сутки. */
import { supabase } from './supabase'

const KEY = 'lola:lp:'
const DAY = 864e5
const mem = new Map()
let edgeDown = false          // Edge Function недоступна (не задеплоена) — до перезагрузки не пробуем

const read = url => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY + url))
    if (v && Date.now() - v.at < (v.image ? 30 * DAY : DAY)) return v
  } catch { /* нет кэша */ }
  return null
}
const write = (url, v) => { try { localStorage.setItem(KEY + url, JSON.stringify({ ...v, at: Date.now() })) } catch { /* переполнено */ } }
const https = u => (u || '').replace(/^http:\/\//i, 'https://')   // http-картинка на https-странице не загрузится

async function viaEdge(url) {
  const { data, error } = await supabase.functions.invoke('link-preview', { body: { url } })
  if (error || !data) throw error || new Error('no data')
  return { image: https(data.image), title: data.title || '' }
}
async function viaMicrolink(url) {
  const r = await fetch('https://api.microlink.io/?url=' + encodeURIComponent(url))
  if (!r.ok) throw new Error('microlink ' + r.status)
  const j = await r.json()
  if (j.status !== 'success') throw new Error('microlink fail')
  return { image: https(j.data?.image?.url), title: j.data?.title || '' }
}

// Возвращает { image, title } или null, если сейчас нет связи / оба способа не сработали (тогда не кэшируем)
export function getPreview(url) {
  if (mem.has(url)) return mem.get(url)
  const hit = read(url)
  if (hit) return Promise.resolve(hit)
  if (!navigator.onLine) return Promise.resolve(null)
  const p = (async () => {
    let v = null
    if (!edgeDown) { try { v = await viaEdge(url) } catch { edgeDown = true } }
    if (!v) { try { v = await viaMicrolink(url) } catch { v = null } }
    if (v) write(url, v)
    return v
  })().finally(() => mem.delete(url))
  mem.set(url, p)
  return p
}
