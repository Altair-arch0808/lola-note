/* Офлайн-слой.
   • Все данные лежат в памяти и дублируются в localStorage — приложение открывается без сети.
   • Любая запись (создать / изменить / удалить) сначала применяется локально, затем попадает в очередь (outbox).
   • Очередь уходит в Supabase сама: при появлении связи, при возврате в приложение и раз в 20 секунд.
   • id создаются на устройстве (uuid), поэтому запись можно менять и удалять ещё до отправки. */
import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'

const LS = window.localStorage
const jget = (k, d) => { try { const v = LS.getItem(k); return v == null ? d : JSON.parse(v) } catch { return d } }
const jset = (k, v) => { try { LS.setItem(k, JSON.stringify(v)) } catch { /* хранилище переполнено — работаем из памяти */ } }
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 3) | 8).toString(16) }))

// Значения по умолчанию — те же, что заданы в базе (чтобы локальная строка выглядела как серверная)
const DEFAULTS = {
  tasks: { done: false, repeat: 'none', context: 'any' },
  events: { color: '#F9C6D4' },
  mind_nodes: { color: '#D9CCF5', x: 0, y: 0 },
  time_blocks: { duration_min: 60, color: '#C9EFD9', context: 'any' },
  habits: { kind: 'habit', context: 'any' }
}
const EMPTY = []

let uid = LS.getItem('lola:uid') || null
let seq = 0                       // счётчик изменений: помогает не затереть свежее устаревшим ответом сервера
let flushing = false, busy = null // busy — qid операции, которая сейчас отправляется
let outbox = jget('lola:outbox', [])
const listeners = new Set()
const tables = new Map()          // `${uid}:${table}` -> { rows, ready, at, p }
let sEntry = { uid: null, value: {} }

const saveOut = () => jset('lola:outbox', outbox)
const mine = () => outbox.filter(o => o.uid === uid)
let status = { online: navigator.onLine, pending: 0, syncing: false }
function emit() {
  const next = { online: navigator.onLine, pending: uid ? mine().length : 0, syncing: flushing }
  if (next.online !== status.online || next.pending !== status.pending || next.syncing !== status.syncing) status = next
  listeners.forEach(f => f())
}
const subscribe = f => { listeners.add(f); return () => listeners.delete(f) }

/* ---------- пользователь ---------- */
export const getUid = () => uid
export function setUid(u) {
  u = u || null
  if (u === uid) return
  uid = u
  if (u) LS.setItem('lola:uid', u); else LS.removeItem('lola:uid')
  tables.clear(); seq++
  emit()
  if (u) flush()
}
export const useUid = () => useSyncExternalStore(subscribe, () => uid)
export const getStatus = () => status
export const useSync = () => useSyncExternalStore(subscribe, () => status)

/* ---------- таблицы ---------- */
function entry(table) {
  const k = `${uid}:${table}`
  let e = tables.get(k)
  if (!e) {
    const cached = LS.getItem(`lola:c:${k}`)
    e = { rows: cached ? jget(`lola:c:${k}`, []) : [], ready: cached != null, at: 0, p: null }
    tables.set(k, e)
  }
  return e
}
function setRows(table, rows, fromServer = false) {
  const e = entry(table)
  e.rows = rows
  if (fromServer) e.ready = true
  jset(`lola:c:${uid}:${table}`, rows)
  seq++; emit()
}

function applyServer(table, server) {
  let rows = server
  for (const o of outbox) {
    if (o.uid !== uid || o.table !== table) continue
    if (o.kind === 'insert') { if (!rows.some(r => r.id === o.id)) rows = [...rows, o.values] }
    else if (o.kind === 'update') rows = rows.map(r => (r.id === o.id ? { ...r, ...o.values } : r))
    else if (o.kind === 'delete') rows = rows.filter(r => r.id !== o.id)
  }
  setRows(table, rows, true)
}

const meta = new Map() // table -> order (нужно, чтобы обновить таблицы после отправки очереди)

export function refresh(table, order = 'created_at', force = false) {
  if (!uid || !navigator.onLine) return Promise.resolve()
  meta.set(table, order)
  const e = entry(table)
  if (e.p) return e.p
  if (!force && Date.now() - e.at < 4000) return Promise.resolve()
  e.p = (async () => {
    for (let i = 0; i < 3; i++) {
      const me = uid, s0 = seq
      let res
      try { res = await supabase.from(table).select('*').eq('user_id', me).order(order) } catch { break }
      if (res.error || uid !== me) break
      if (s0 !== seq && i < 2) continue      // пока грузили, локально что-то изменилось — запросим ещё раз
      applyServer(table, res.data || []); break
    }
  })().finally(() => { e.p = null; e.at = Date.now() })
  return e.p
}

/* ---------- очередь ---------- */
function enqueue(op) {
  op.uid = uid; op.qid = uuid()
  const free = o => o.uid === uid && o.table === op.table && o.id === op.id && o.qid !== busy
  if (op.kind === 'update' || op.kind === 'upsert') {
    const prev = [...outbox].reverse().find(free)
    if (prev && (prev.kind === op.kind || (op.kind === 'update' && prev.kind === 'insert'))) {
      prev.values = { ...prev.values, ...op.values }; saveOut(); emit(); return
    }
  }
  if (op.kind === 'delete') {
    const same = outbox.filter(free)
    outbox = outbox.filter(o => !same.includes(o))
    if (same.some(o => o.kind === 'insert')) { saveOut(); emit(); return }   // на сервер ещё не попадала — просто забываем
  }
  outbox.push(op); saveOut(); emit()
}

const isNetwork = (err, status) => !navigator.onLine || status === 0 || status === 401 || status >= 500
  || /fetch|network|load failed|timeout|abort/i.test(err?.message || '')

async function run(op) {
  const t = supabase.from(op.table)
  if (op.kind === 'insert') return t.insert(op.values)
  if (op.kind === 'update') return t.update(op.values).eq('id', op.id)
  if (op.kind === 'delete') return t.delete().eq('id', op.id)
  return t.upsert({ ...op.values, user_id: op.uid })
}

export async function flush() {
  if (flushing || !uid || !navigator.onLine || !mine().length) return
  flushing = true; emit()
  const failed = []
  let sent = 0
  try {
    for (;;) {
      const op = outbox.find(o => o.uid === uid)
      if (!op) break
      busy = op.qid
      let res
      try { res = await run(op) } catch (e) { res = { error: { message: String(e?.message || e) }, status: 0 } }
      busy = null
      if (res.error && isNetwork(res.error, res.status)) break            // нет связи — оставляем в очереди
      outbox = outbox.filter(o => o.qid !== op.qid); saveOut(); seq++
      if (res.error && res.error.code !== '23505') {                     // 23505 — запись уже есть на сервере, это не ошибка
        failed.push({ op, message: res.error.message })
        if (op.kind === 'insert') dropLocal(op.table, op.id)
      } else sent++
      emit()
    }
  } finally { busy = null; flushing = false; emit() }
  if (failed.length) {
    alert(`Не удалось сохранить на сервере (${failed.length}): ${failed[0].message}`)
    new Set(failed.map(f => f.op.table)).forEach(t => refresh(t, meta.get(t), true))
  } else if (sent) meta.forEach((order, t) => refresh(t, order, true))
}

function dropLocal(table, id) {
  const e = entry(table)
  if (e.rows.some(r => r.id === id)) setRows(table, e.rows.filter(r => r.id !== id))
}

/* ---------- изменение строк (используется useTable) ---------- */
export function insertRow(table, values) {
  const e = entry(table)
  const row = { created_at: new Date().toISOString(), ...(DEFAULTS[table] || {}), ...values, id: uuid(), user_id: uid }
  setRows(table, [...e.rows, row])
  enqueue({ kind: 'insert', table, id: row.id, values: row })
  flush()
  return row
}
export function patchRow(table, id, patch) {
  const e = entry(table)
  setRows(table, e.rows.map(r => (r.id === id ? { ...r, ...patch } : r)))
  enqueue({ kind: 'update', table, id, values: patch })
  flush()
}
export function deleteRow(table, id) {
  const e = entry(table)
  // потомки (ветки ментальной карты) исчезают вместе с родителем: на сервере это делает каскад
  const gone = new Set([id]), stack = [id]
  while (stack.length) {
    const p = stack.pop()
    for (const r of e.rows) if (r.parent_id === p && !gone.has(r.id)) { gone.add(r.id); stack.push(r.id) }
  }
  outbox = outbox.filter(o => !(o.uid === uid && o.table === table && o.id !== id && gone.has(o.id) && o.qid !== busy))
  setRows(table, e.rows.filter(r => !gone.has(r.id)))
  enqueue({ kind: 'delete', table, id })
  flush()
}
export const rowsOf = table => (uid ? entry(table).rows : EMPTY)
export const isReady = table => !!(uid && entry(table).ready)

export function useRows(table) {
  return useSyncExternalStore(subscribe, () => (uid ? entry(table).rows : EMPTY))
}

/* ---------- настройки (фон, обложки, график вахты) ---------- */
function settingsEntry() {
  if (sEntry.uid !== uid) sEntry = { uid, value: uid ? jget(`lola:s:${uid}`, {}) : {} }
  return sEntry
}
function setSettings(v) {
  const e = settingsEntry(); e.value = v
  if (uid) jset(`lola:s:${uid}`, v)
  seq++; emit()
}
let sAt = 0
async function refreshSettings(force = false) {
  if (!uid || !navigator.onLine) return
  if (!force && Date.now() - sAt < 4000) return      // несколько экранов подряд не должны дёргать сервер
  sAt = Date.now()
  const me = uid
  let res
  try { res = await supabase.from('settings').select('*').eq('user_id', me).maybeSingle() } catch { return }
  if (res.error || uid !== me) return
  let v = res.data ? { bg: res.data.bg, covers: res.data.covers, shift: res.data.shift } : {}
  for (const o of outbox) if (o.uid === me && o.table === 'settings') v = { ...v, ...o.values }
  setSettings(v)
}
export function saveSettings(patch) {
  if (!uid) return
  setSettings({ ...settingsEntry().value, ...patch })
  enqueue({ kind: 'upsert', table: 'settings', id: uid, values: patch })
  flush()
}
export function useSettings() {
  const u = useUid()
  const v = useSyncExternalStore(subscribe, () => settingsEntry().value)
  useEffect(() => { if (u) refreshSettings() }, [u])
  return v
}

/* ---------- сеть ---------- */
window.addEventListener('online', () => { emit(); flush(); refreshSettings(true) })
window.addEventListener('offline', emit)
document.addEventListener('visibilitychange', () => { if (!document.hidden) flush() })
setInterval(() => { if (uid && mine().length) flush() }, 20000)
setTimeout(flush, 500)
