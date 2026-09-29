import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import { useSettings, saveSettings } from './store'
import { mergeNotify, alertFor, SOUND_LABELS, VIBES } from './supabase/functions/_shared/reminders.js'
import { playSound, buzz, unlockAudio } from './sounds'
import { deviceTz, notifySupported, permission, askPermission, show, isIOS, isStandalone,
         VAPID_KEY, pushSupported, pushActive, enablePush, disablePush, testServerPush } from './notify'

const LEAD_TASK = [[0, 'в момент срока'], [5, 'за 5 минут'], [10, 'за 10 минут'], [30, 'за 30 минут'], [60, 'за 1 час']]
const LEAD_EVENT = [[0, 'в момент начала'], [30, 'за 30 минут'], [60, 'за 1 час'], [180, 'за 3 часа'], [1440, 'за 1 день']]
const LEAD_BLOCK = [[0, 'в момент начала'], [5, 'за 5 минут'], [10, 'за 10 минут'], [15, 'за 15 минут'], [30, 'за 30 минут']]
const SHIFT_DAYS = [[1, 'за 1 день'], [3, 'за 3 дня'], [7, 'за неделю']]
const DIGEST_DAYS = [[1, 'за 1 день'], [2, 'за 2 дня'], [3, 'за 3 дня'], [5, 'за 5 дней'], [7, 'за неделю']]
const CATS = [['tasks', '📝 Задачи'], ['events', '📅 События'], ['blocks', '🗓️ Расписание'], ['shift', '🏗️ Смена вахты'],
              ['digest', '🧳 Дайджест'], ['morning', '☀️ Утренняя сводка'], ['habits', '✨ Привычки'], ['mood', '🙂 Настроение']]

// Строка настройки: переключатель + (когда включено) параметры
function Row({ icon, title, hint, on, onChange, disabled, children }) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <span className="text-lg leading-none">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="font-semibold block">{title}</span>
          {hint && <span className="text-xs opacity-60 block">{hint}</span>}
        </span>
        <input type="checkbox" role="switch" checked={!!on} disabled={disabled} onChange={e => onChange(e.target.checked)}
               className="w-5 h-5 rounded-md accent-[#b9a5ee]" aria-label={title} />
      </label>
      {on && children && <div className="mt-2 flex flex-wrap items-center gap-2 anim-pop">{children}</div>}
    </div>
  )
}
const Select = ({ value, onChange, options, label }) => (
  <select className="input !w-auto !py-1" aria-label={label} value={value} onChange={e => onChange(+e.target.value)}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
)
const Pick = ({ value, onChange, options, label }) => (
  <select className="input !w-auto !py-1 !px-2 text-sm" aria-label={label} value={value} onChange={e => onChange(e.target.value)}>
    {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
  </select>
)
const Time = ({ value, onChange, label }) => (
  <input type="time" className="input !w-auto !py-1" aria-label={label} value={value} onChange={e => e.target.value && onChange(e.target.value)} />
)

export default function NotifyPanel() {
  const settings = useSettings()
  const n = mergeNotify(settings.notify)
  const [perm, setPerm] = useState(permission())
  const [push, setPush] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [snd, setSnd] = useState(false)          // раскрыт ли раздел «Звук и вибрация»

  useEffect(() => { pushActive().then(setPush) }, [])

  // Сохраняем всё целиком (вместе с часовым поясом): по этим настройкам же работает и серверная часть
  const save = patch => saveSettings({ notify: { ...n, tz: deviceTz() || n.tz, ...patch } })
  const set = (k, patch) => save({ [k]: { ...n[k], ...patch } })
  useEffect(() => { if (n.enabled && deviceTz() && n.tz !== deviceTz()) save({}) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const turnOn = async () => {
    setMsg('')
    const p = await askPermission(); setPerm(p)
    if (p === 'granted') save({ enabled: true })
    else if (p === 'denied') setMsg('Уведомления запрещены для этого сайта. Разрешите их в настройках браузера или телефона и попробуйте снова.')
    else setMsg('Разрешение не получено.')
  }
  const togglePush = async on => {
    setBusy(true); setMsg('')
    try { on ? await enablePush() : await disablePush(); setPush(on); setPerm(permission()) }
    catch (e) { setMsg(e.message || 'Не получилось изменить') }
    setBusy(false)
  }
  const setAlert = (cat, patch) => save({ alert: { ...n.alert, [cat]: { ...n.alert[cat], ...patch } } })
  const preview = (cat, patch) => {       // послушать выбранное сразу, не дожидаясь напоминания
    unlockAudio()
    const a = alertFor({ alert: { [cat]: { ...n.alert[cat], ...patch } } }, cat)
    playSound(a.sound); buzz(a.vibrate)
  }
  const test = async () => {
    const ok = await show({ title: '✨ Планер', body: 'Так будут выглядеть напоминания', key: `test:${Date.now()}`, tab: 'today' }, alertFor(n, 'tasks'))
    if (!ok) setMsg('Не удалось показать уведомление на этом устройстве.')
  }

  const testPush = async () => {
    setBusy(true); setMsg('')
    try {
      const r = await testServerPush()
      if (!r.devices) setMsg('На сервере нет ни одной подписки — включите «Приходят при закрытом приложении» ещё раз.')
      else if (!r.sent) setMsg('Сервер не смог доставить push. Отключите и включите «Приходят при закрытом приложении».')
      else setMsg('Пробный push отправлен — заблокируйте экран и подождите пару секунд.')
    } catch (e) { setMsg(e.message || 'Не получилось проверить') }
    setBusy(false)
  }

  const unsupported = !notifySupported()
  const needHome = unsupported && isIOS() && !isStandalone()
  const granted = perm === 'granted'

  return (
    <div className="absolute right-2 top-full mt-2 w-96 max-w-[calc(100vw-1.5rem)] max-h-[80vh] overflow-y-auto rounded-2xl bg-white/95 shadow-soft
                    border border-beige/60 p-3 space-y-2 anim-pop" role="dialog" aria-label="Уведомления">
      <div className="font-bold text-lg">🔔 Уведомления</div>

      {needHome && <p className="text-sm rounded-xl bg-cream px-3 py-2">На iPhone уведомления работают, только если приложение добавлено на экран «Домой»: «Поделиться» → «На экран Домой». Откройте его оттуда и вернитесь сюда.</p>}
      {unsupported && !needHome && <p className="text-sm rounded-xl bg-cream px-3 py-2">Этот браузер не поддерживает уведомления.</p>}
      {perm === 'denied' && <p className="text-sm rounded-xl bg-cream px-3 py-2">Уведомления запрещены для этого сайта — разрешите их в настройках браузера или телефона.</p>}

      <Row icon="🔔" title="Включить уведомления" hint="Общий выключатель для всех устройств" on={n.enabled && granted} disabled={unsupported}
           onChange={on => (on ? turnOn() : save({ enabled: false }))} />
      {n.enabled && !granted && !unsupported && (
        <button className="btn w-full justify-center" onClick={turnOn}><BellRing size={16} /> Разрешить на этом устройстве</button>
      )}

      {n.enabled && (
        <>
          <div className="text-xs opacity-60 pt-1 px-1">О чём напоминать</div>
          <Row icon="📝" title="Задачи" hint="Когда подходит срок" on={n.tasks.on} onChange={v => set('tasks', { on: v })}>
            <Select label="Когда напомнить о задаче" value={n.tasks.lead} options={LEAD_TASK} onChange={v => set('tasks', { lead: v })} />
          </Row>
          <Row icon="📅" title="События календаря" on={n.events.on} onChange={v => set('events', { on: v })}>
            <Select label="Когда напомнить о событии" value={n.events.lead} options={LEAD_EVENT} onChange={v => set('events', { lead: v })} />
          </Row>
          <Row icon="🗓️" title="Расписание" hint="Блоки на день" on={n.blocks.on} onChange={v => set('blocks', { on: v })}>
            <Select label="Когда напомнить о блоке" value={n.blocks.lead} options={LEAD_BLOCK} onChange={v => set('blocks', { lead: v })} />
          </Row>
          <Row icon="🏗️" title="Смена вахты" hint="Отъезд и возвращение домой" on={n.shift.on} onChange={v => set('shift', { on: v })}>
            <Select label="За сколько дней предупредить" value={n.shift.days} options={SHIFT_DAYS} onChange={v => set('shift', { days: v })} />
            <span className="text-sm">и в сам день, в</span>
            <Time label="Во сколько" value={n.shift.time} onChange={v => set('shift', { time: v })} />
          </Row>
          <Row icon="🧳" title="Дайджест перед сменой" hint="Что успеть сделать дома до отъезда на вахту: дела, события, планы" on={n.digest.on} onChange={v => set('digest', { on: v })}>
            <Select label="За сколько дней прислать дайджест" value={n.digest.days} options={DIGEST_DAYS} onChange={v => set('digest', { days: v })} />
            <span className="text-sm">в</span>
            <Time label="Время дайджеста" value={n.digest.time} onChange={v => set('digest', { time: v })} />
            <label className="basis-full flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" className="w-4 h-4 accent-[#b9a5ee]" checked={!!n.digest.back} onChange={e => set('digest', { back: e.target.checked })} />
              и перед возвращением домой
            </label>
          </Row>
          <Row icon="☀️" title="Утренняя сводка" hint="Сколько задач, событий и планов на сегодня" on={n.morning.on} onChange={v => set('morning', { on: v })}>
            <Time label="Время сводки" value={n.morning.time} onChange={v => set('morning', { time: v })} />
          </Row>
          <Row icon="✨" title="Привычки и уходы" hint="Если что-то не отмечено" on={n.habits.on} onChange={v => set('habits', { on: v })}>
            <Time label="Время напоминания" value={n.habits.time} onChange={v => set('habits', { time: v })} />
          </Row>
          <Row icon="🙂" title="Настроение" hint="Если не отмечено за день" on={n.mood.on} onChange={v => set('mood', { on: v })}>
            <Time label="Время напоминания" value={n.mood.time} onChange={v => set('mood', { time: v })} />
          </Row>

          <div className="text-xs opacity-60 pt-1 px-1">Звук и вибрация</div>
          <div className="rounded-xl bg-white/70 px-3 py-2">
            <button type="button" className="w-full flex items-center gap-2 text-left font-semibold" aria-expanded={snd} onClick={() => setSnd(!snd)}>
              <span className="text-lg leading-none">🔊</span><span className="flex-1">Для каждого вида свои</span>
              <span className="text-xs font-normal opacity-60">{snd ? 'свернуть' : 'настроить'}</span>
            </button>
            {snd && (
              <div className="mt-2 space-y-2 anim-pop">
                {CATS.map(([cat, name]) => (
                  <div key={cat} className="flex flex-wrap items-center gap-1">
                    <span className="basis-full text-sm font-semibold">{name}</span>
                    <Pick label={`Мелодия: ${name}`} value={n.alert[cat].sound} options={Object.entries(SOUND_LABELS)} onChange={v => { setAlert(cat, { sound: v }); preview(cat, { sound: v }) }} />
                    <Pick label={`Вибрация: ${name}`} value={n.alert[cat].vibe} options={Object.entries(VIBES).map(([k, v]) => [k, v.label])} onChange={v => { setAlert(cat, { vibe: v }); preview(cat, { vibe: v }) }} />
                    <button type="button" className="btn-ghost !p-1.5" aria-label={`Послушать: ${name}`} onClick={() => preview(cat, {})}>▶</button>
                  </div>
                ))}
                <p className="text-xs opacity-60">
                  Мелодия играет, пока приложение открыто. Когда оно свёрнуто или закрыто, звук уведомления системный — его выбирают в настройках телефона (Приложения → Планер → Уведомления). Вибрация работает на Android; на iPhone её для сайтов нет. Если выбрать «без мелодии» и «без вибрации», уведомление придёт беззвучно.
                </p>
              </div>
            )}
          </div>

          <div className="text-xs opacity-60 pt-1 px-1">Тишина</div>
          <Row icon="🌙" title="Не беспокоить" hint="Напоминания переносятся на конец тишины" on={n.quiet.on} onChange={v => set('quiet', { on: v })}>
            <span className="text-sm">с</span><Time label="Тишина с" value={n.quiet.from} onChange={v => set('quiet', { from: v })} />
            <span className="text-sm">до</span><Time label="Тишина до" value={n.quiet.to} onChange={v => set('quiet', { to: v })} />
          </Row>

          <div className="text-xs opacity-60 pt-1 px-1">Это устройство</div>
          {VAPID_KEY ? (
            <Row icon="📲" title="Приходят при закрытом приложении" hint={pushSupported() ? 'Push с сервера — сработает, даже если приложение выключено' : 'Этот браузер не поддерживает push'}
                 on={push} disabled={busy || !pushSupported() || !granted} onChange={togglePush} />
          ) : (
            <p className="text-xs opacity-60 px-1">Уведомления при закрытом приложении пока не подключены на сервере — см. README, раздел «Уведомления». Сейчас они приходят, пока приложение открыто или свёрнуто.</p>
          )}
          <div className="flex items-center gap-2">
            <button className="btn-ghost !py-1 text-sm" onClick={test} disabled={!granted}>Показать пробное</button>
            {VAPID_KEY && <button className="btn-ghost !py-1 text-sm" onClick={testPush} disabled={busy || !push}>Проверить push</button>}
            <span className="text-xs opacity-50 ml-auto">пояс: {n.tz || deviceTz() || '—'}</span>
          </div>
        </>
      )}
      {msg && <p role="alert" className="text-sm text-rose-500">{msg}</p>}
    </div>
  )
}
