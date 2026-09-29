import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

// id текущего пользователя (или null, если не вошёл)
async function currentUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

// Универсальный хук: загрузка + CRUD + запись в журнал активности.
// Все данные принадлежат вошедшему пользователю: запрос фильтруется по user_id,
// а на стороне Supabase то же самое гарантирует Row Level Security (см. schema.sql).
export function useTable(table, order = 'created_at') {
  const [rows, setRows] = useState([])
  const load = useCallback(async () => {
    const uid = await currentUserId()
    if (!uid) { setRows([]); return }
    const { data } = await supabase.from(table).select('*').eq('user_id', uid).order(order)
    setRows(data || [])
  }, [table, order])
  useEffect(() => { load() }, [load])

  // action = null — записать без строки в журнале (например, автосохранение блокнота)
  const log = (action, title) => {
    if (action && table !== 'activity_log') supabase.from('activity_log').insert({ action, entity: table, title })
  }
  const add = async (values) => {
    const uid = await currentUserId()
    if (!uid) return null
    const { data, error } = await supabase.from(table).insert({ ...values, user_id: uid }).select().single()
    if (error) { alert(error.message); return null }
    setRows(r => [...r, data]); log('created', values.title); return data
  }
  const update = async (id, patch, action = 'updated') => {
    const row = rows.find(x => x.id === id)
    setRows(r => r.map(x => (x.id === id ? { ...x, ...patch } : x)))
    await supabase.from(table).update(patch).eq('id', id)
    log(action, row?.title)
  }
  const remove = async (id) => {
    const row = rows.find(x => x.id === id)
    setRows(r => r.filter(x => x.id !== id))
    await supabase.from(table).delete().eq('id', id)
    log('deleted', row?.title)
  }
  return { rows, add, update, remove, reload: load }
}
