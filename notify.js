/* Уведомления: разрешение, показ, журнал «что уже показано» и подписка на push (когда приложение закрыто). */
import { supabase } from './supabase'
import { getUid } from './store'
import { playSound, buzz } from './sounds'

const LS = window.localStorage
export const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

export const deviceTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null } }
export const notifySupported = () => 'Notification' in window
export const permission = () => (notifySupported() ? Notification.permission : 'unsupported')
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true
export const pushSupported = () => !!VAPID_KEY && 'serviceWorker' in navigator && 'PushManager' in window

export async function askPermission() {
  if (!notifySupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try { return await Notification.requestPermission() } catch { return Notification.permission }
}

// Показать уведомление. Через сервис-воркер — так работает на Android и когда вкладка свёрнута;
// tag = ключ напоминания, поэтому то же напоминание из push не задвоится, а заменит это.
// al = alertFor(...): { sound, vibrate, silent }.
//  • приложение открыто → системное уведомление без звука, а мелодию и вибрацию берёт на себя приложение (чтобы не звучало дважды);
//  • приложение свёрнуто → системное уведомление со своей вибрацией (звук — системный).
export async function show({ title, body, key, tab }, al = {}) {
  const opts = { body, tag: key, icon: '/icon-192.png', lang: 'ru', data: { tab: tab || 'today' } }
  if (document.visibilityState === 'visible') { opts.silent = true; playSound(al.sound); buzz(al.vibrate) }
  else if (al.silent) opts.silent = true
  else if (al.vibrate?.length) opts.vibrate = al.vibrate     // silent и vibrate вместе браузер не принимает
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) { await reg.showNotification(title, opts); return true }
  } catch { /* пробуем без воркера */ }
  try { new Notification(title, opts); return true } catch { return false }
}

/* ---------- что уже показывали (чтобы не повторять) ---------- */
const sentKey = () => `lola:sent:${getUid()}`
export function getSent() {
  let o = {}
  try { o = JSON.parse(LS.getItem(sentKey()) || '{}') } catch { /* пусто */ }
  const old = Date.now() - 3 * 86400000
  for (const k of Object.keys(o)) if (o[k] < old) delete o[k]
  return o
}
export function markSent(keys) {
  const o = getSent(), t = Date.now()
  keys.forEach(k => { o[k] = t })
  try { LS.setItem(sentKey(), JSON.stringify(o)) } catch { /* переполнено — не критично */ }
}

/* ---------- push ---------- */
const u8 = b64 => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}
async function currentSub() {
  if (!pushSupported()) return null
  try { return await (await navigator.serviceWorker.ready).pushManager.getSubscription() } catch { return null }
}
export const pushActive = async () => !!(await currentSub())

export async function enablePush() {
  if (!pushSupported()) throw new Error('Push не поддерживается на этом устройстве')
  if ((await askPermission()) !== 'granted') throw new Error('Уведомления не разрешены в настройках браузера')
  const reg = await navigator.serviceWorker.ready
  const opts = { userVisibleOnly: true, applicationServerKey: u8(VAPID_KEY) }
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    try { sub = await reg.pushManager.subscribe(opts) } catch (e) {
      if (e?.name !== 'InvalidStateError') throw e
      await (await reg.pushManager.getSubscription())?.unsubscribe()
      sub = await reg.pushManager.subscribe(opts)
    }
  }
  const j = sub.toJSON()
  const { error } = await supabase.from('push_subscriptions')
    .upsert({ user_id: getUid(), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
  if (error) throw new Error(error.message)
}

export async function disablePush() {
  const sub = await currentSub()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

// При выходе из аккаунта: подписка принадлежит пользователю и не должна остаться на устройстве
export async function pushLogout() {
  if (!navigator.onLine) return
  try { await Promise.race([disablePush(), new Promise(r => setTimeout(r, 3000))]) } catch { /* выходим в любом случае */ }
}

// Пробный push с сервера на все устройства пользователя: показывает, на каком шаге цепочка обрывается
export async function testServerPush() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Сначала войдите в аккаунт')
  let res
  try {
    res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-reminders`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'x-test-push': '1', 'Content-Type': 'application/json' },
      body: '{}'
    })
  } catch { throw new Error('Функция send-reminders недоступна: она не задеплоена или нет связи') }
  if (res.status === 404) throw new Error('Функция send-reminders не задеплоена в Supabase')
  if (!res.ok) throw new Error('Сервер ответил ошибкой ' + res.status + ' — проверьте секреты VAPID_* в Supabase')
  return res.json()
}
