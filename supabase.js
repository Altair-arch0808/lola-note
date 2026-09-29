import { createClient } from '@supabase/supabase-js'

// На плохой связи запрос может «висеть» минутами. Ограничиваем его, чтобы очередь офлайн-записей не застревала.
// Загрузку картинок (storage) не трогаем — файлы могут грузиться долго.
const timeoutFetch = (url, opts = {}) => {
  if (String(url).includes('/storage/')) return fetch(url, opts)
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), 25000)
  if (opts.signal) opts.signal.addEventListener('abort', () => c.abort())
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t))
}

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { global: { fetch: timeoutFetch } }
)

// Загрузка картинки в Storage (bucket "media"), возвращает публичный URL
export async function uploadImage(file) {
  if (!navigator.onLine) { alert('Картинку можно загрузить, когда появится связь.'); return null }
  try {
    const { data: { session } } = await supabase.auth.getSession()
    const uid = session?.user?.id || localStorage.getItem('lola:uid')
    if (!uid) { alert('Сначала войдите в аккаунт.'); return null }
    const path = `${uid}/${Date.now()}-${file.name.replace(/[^\w.]/g, '_')}`
    const { error } = await supabase.storage.from('media').upload(path, file)
    if (error) { alert('Не удалось загрузить: ' + error.message); return null }
    return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
  } catch (e) {
    alert('Не удалось загрузить: нет связи.'); return null
  }
}
