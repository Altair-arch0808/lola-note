import { useEffect, useRef } from 'react'
import { useUid, useRows, useSettings, refresh } from './store'
import { computeDue, dueNow, mergeNotify, alertFor } from './supabase/functions/_shared/reminders.js'
import { deviceTz, permission, show, getSent, markSent } from './notify'
import { playSound, buzz } from './sounds'

/* Невидимый «будильник»: пока приложение открыто или свёрнуто, раз в 20 секунд смотрит, не пора ли что-то напомнить.
   Когда приложение полностью закрыто, за это отвечает push с сервера (см. supabase/functions/send-reminders). */
export default function Reminders() {
  const uid = useUid()
  const settings = useSettings()
  const tasks = useRows('tasks'), events = useRows('events'), blocks = useRows('time_blocks')
  const habits = useRows('habits'), logs = useRows('habit_logs'), moods = useRows('moods')
  const data = useRef({})
  data.current = { notify: settings.notify, shift: settings.shift, tasks, events, blocks, habits, logs, moods }

  useEffect(() => {
    if (!uid) return
    const tick = () => {
      const d = data.current, n = mergeNotify(d.notify)
      if (!n.enabled || permission() !== 'granted') return
      const now = Date.now()
      const items = computeDue({ now, tz: n.tz || deviceTz(), ...d })
      const fresh = dueNow(items, now, getSent())
      if (!fresh.length) return
      markSent(fresh.map(i => i.key))                // сначала отмечаем — чтобы два тика подряд не показали одно и то же
      fresh.forEach(i => show(i, alertFor(d.notify, i.cat)))
    }
    // данные с других устройств подтягиваем раз в 5 минут и при возврате в приложение
    const sync = () => {
      if (document.hidden || !navigator.onLine) return
      refresh('tasks'); refresh('events', 'starts_at'); refresh('time_blocks')
      refresh('habits'); refresh('habit_logs'); refresh('moods')
    }
    const onVis = () => { sync(); tick() }
    sync(); tick()
    const a = setInterval(tick, 20000), b = setInterval(sync, 5 * 60000)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => { clearInterval(a); clearInterval(b); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis) }
  }, [uid])

  // Push пришёл, пока приложение открыто: сервис-воркер показал его без звука и просит сыграть мелодию здесь
  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!uid || !sw) return
    const onMsg = e => {
      const m = e.data
      if (m?.type !== 'lola-alert' || (m.key && getSent()[m.key])) return       // локально это уже сыграло
      if (m.key) markSent([m.key])
      playSound(m.sound); buzz(m.vibrate)
    }
    sw.addEventListener('message', onMsg)
    return () => sw.removeEventListener('message', onMsg)
  }, [uid])

  return null
}
