// Edge Function: раз в минуту (pg_cron) проверяет напоминания и шлёт push на подписанные устройства.
// Логика «что пора напомнить» — общая с приложением: ../_shared/reminders.js
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'
import { computeDue, dueNow, mergeNotify, alertFor } from '../_shared/reminders.js'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!)

const DAY = 86400000
const iso = (ms: number) => new Date(ms).toISOString()
const dayStr = (ms: number) => iso(ms).slice(0, 10)
const q = async (p: PromiseLike<{ data: any[] | null; error: any }>) => { const { data, error } = await p; if (error) throw error; return data || [] }

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Content-Type': 'application/json' }

// Пробный push: вошедший пользователь шлёт его сам себе (кнопка «Проверить push» в приложении)
async function testPush(req: Request) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer /i, '')
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return new Response(JSON.stringify({ error: 'not signed in' }), { status: 401, headers: CORS })
  const devices = await q(db.from('push_subscriptions').select('*').eq('user_id', user.id))
  if (!devices.length) return new Response(JSON.stringify({ sent: 0, devices: 0 }), { headers: CORS })
  const payload = JSON.stringify({ title: '✨ Планер', body: 'Push работает — это пробное уведомление', tag: `test:${Date.now()}`, tab: 'today', vibrate: [200, 100, 200] })
  let sent = 0, failed = 0
  await Promise.allSettled(devices.map(async (d) => {
    try {
      await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 300, urgency: 'high' })
      sent++
    } catch (e: any) {
      failed++
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', d.id)
    }
  }))
  return new Response(JSON.stringify({ sent, failed, devices: devices.length }), { headers: CORS })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.headers.get('x-test-push')) return testPush(req)
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 })
  const now = Date.now()
  let sent = 0

  try {
    const subs = await q(db.from('push_subscriptions').select('*'))
    const byUser = new Map<string, any[]>()
    subs.forEach((s) => byUser.set(s.user_id, [...(byUser.get(s.user_id) || []), s]))

    for (const [uid, devices] of byUser) {
      const { data: st } = await db.from('settings').select('notify, shift').eq('user_id', uid).maybeSingle()
      const notify = mergeNotify(st?.notify)
      if (!notify.enabled) continue

      const [tasks, events, blocks, habits, logs, moods] = await Promise.all([
        q(db.from('tasks').select('id,title,due_at,done,context').eq('user_id', uid).eq('done', false)),   // и без срока: они нужны дайджесту
        q(db.from('events').select('id,title,starts_at').eq('user_id', uid).gte('starts_at', iso(now - DAY))),
        q(db.from('time_blocks').select('id,title,day,start_min,context').eq('user_id', uid).gte('day', dayStr(now - 2 * DAY))),
        q(db.from('habits').select('id,title,emoji,context').eq('user_id', uid)),
        q(db.from('habit_logs').select('habit_id,day').eq('user_id', uid).gte('day', dayStr(now - 2 * DAY))),
        q(db.from('moods').select('day').eq('user_id', uid).gte('day', dayStr(now - 2 * DAY)))
      ])

      const items = dueNow(computeDue({ now, tz: notify.tz || 'UTC', notify, tasks, events, blocks, habits, logs, moods, shift: st?.shift }), now)
      if (!items.length) continue

      // «Занимаем» ключи: вставка вернёт только новые, поэтому два параллельных запуска не пришлют одно и то же дважды
      const claimed = await q(db.from('push_sent').upsert(items.map((i: any) => ({ user_id: uid, key: i.key })), { onConflict: 'user_id,key', ignoreDuplicates: true }).select('key'))
      const fresh = new Set(claimed.map((c) => c.key))

      for (const it of items.filter((i: any) => fresh.has(i.key))) {
        const al = alertFor(notify, it.cat)
        const payload = JSON.stringify({ title: it.title, body: it.body, tag: it.key, tab: it.tab, sound: al.sound, vibrate: al.vibrate, silent: al.silent })
        await Promise.allSettled(devices.map(async (d) => {
          try {
            await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, payload, { TTL: 3600, urgency: 'high' })
            sent++
          } catch (e: any) {
            if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('push_subscriptions').delete().eq('id', d.id)  // устройство отписалось
            else console.error('push failed', e?.statusCode, e?.body)
          }
        }))
      }
    }
    await db.from('push_sent').delete().lt('sent_at', iso(now - 7 * DAY))   // старые отметки не нужны
  } catch (e) {
    console.error(e)
    return new Response(String((e as Error).message || e), { status: 500 })
  }
  return new Response(JSON.stringify({ sent }), { headers: { 'Content-Type': 'application/json' } })
})
