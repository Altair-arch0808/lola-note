import { useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'

// Универсальный хук: загрузка + CRUD + запись в журнал активности
export function useTable(table, order = 'created_at') {
  const [rows, setRows] = useState([])
  const load = useCallback(async () => {
    const { data } = await supabase.from(table).select('*').order(order)
    setRows(data || [])
  }, [table, order])
  useEffect(() => { load() }, [load])

  const log = (action, title) => {
    if (table !== 'activity_log') supabase.from('activity_log').insert({ action, entity: table, title })
  }
  const add = async (values) => {
    const { data, error } = await supabase.from(table).insert(values).select().single()
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
