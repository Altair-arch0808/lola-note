import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Загрузка картинки в Storage (bucket "media"), возвращает публичный URL
export async function uploadImage(file) {
  const { data: { user } } = await supabase.auth.getUser()
  const path = `${user.id}/${Date.now()}-${file.name.replace(/[^\w.]/g, '_')}`
  const { error } = await supabase.storage.from('media').upload(path, file)
  if (error) { alert('Не удалось загрузить: ' + error.message); return null }
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}
