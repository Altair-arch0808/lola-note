import { useEffect } from 'react'
import { useUid, useRows, refresh, insertRow, patchRow, deleteRow, rowsOf, isReady, getUid } from './store'

// Универсальный хук: чтение + запись в журнал активности.
// Данные читаются из локального кэша (работает без сети), записи уходят на сервер через очередь — см. store.js.
// Все данные принадлежат вошедшему пользователю: запрос фильтруется по user_id,
// а на стороне Supabase то же самое гарантирует Row Level Security (см. schema.sql).
export function useTable(table, order = 'created_at') {
  const u = useUid()
  const rows = useRows(table)
  useEffect(() => { if (u) refresh(table, order) }, [u, table, order])

  // action = null — записать без строки в журнале (например, автосохранение блокнота)
  const log = (action, title) => {
    if (action && table !== 'activity_log') insertRow('activity_log', { action, entity: table, title })
  }
  const add = async (values, action = 'created') => {
    if (!getUid()) return null
    const row = insertRow(table, values)
    log(action, values.title)
    return row
  }
  const update = async (id, patch, action = 'updated') => {
    const row = rowsOf(table).find(x => x.id === id)
    if (!row) return
    patchRow(table, id, patch)
    log(action, row.title)
  }
  const remove = async (id, action = 'deleted') => {
    const row = rowsOf(table).find(x => x.id === id)
    deleteRow(table, id)
    log(action, row?.title)
  }
  return { rows, add, update, remove, reload: () => refresh(table, order, true), ready: isReady(table) }
}
