import { useEffect, useRef, useState } from 'react'
import { Calendar as CalIcon, CheckSquare, Network, Clock, BookOpen, Palette, LogOut, ImagePlus, ChevronDown, RotateCcw, Sun, Inbox as InboxIcon, Bell } from 'lucide-react'
import { supabase, uploadImage } from './supabase'
import { setUid, getUid, getStatus, useSettings, saveSettings } from './store'
import { useTable } from './useTable'
import SyncBadge from './SyncBadge'
import NotifyPanel from './Notifications'
import Reminders from './Reminders'
import { pushLogout } from './notify'
import Today from './Today'
import Inbox from './Inbox'
import { GRADIENTS, PASTELS } from './util'
import Auth from './Auth'
import Calendar from './Calendar'
import Tasks from './Tasks'
import MindMap from './MindMap'
import Planner from './Planner'
import Journal from './Journal'

const TABS = [
  { id: 'today', label: 'Сегодня', icon: Sun, View: Today },
  { id: 'calendar', label: 'Календарь', icon: CalIcon, View: Calendar },
  { id: 'tasks', label: 'Задачи', icon: CheckSquare, View: Tasks },
  { id: 'inbox', label: 'Входящие', icon: InboxIcon, View: Inbox },
  { id: 'mind', label: 'Ментальная карта', icon: Network, View: MindMap },
  { id: 'planner', label: 'Расписание', icon: Clock, View: Planner },
  { id: 'journal', label: 'Журнал', icon: BookOpen, View: Journal }
]
const DEFAULT_BG = { type: 'gradient', value: GRADIENTS[0] }

// Раскрывающаяся группа настроек
function Section({ title, preview, open, onToggle, children }) {
  return (
    <div className="rounded-xl border border-beige/70 bg-white/60">
      <button type="button" onClick={onToggle} aria-expanded={open}
              className="w-full flex items-center gap-2 px-3 py-2 text-left font-semibold">
        <span className="flex-1">{title}</span>
        {preview}
        <ChevronDown size={16} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-1 anim-pop">{children}</div>}
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('today')
  const settings = useSettings()                 // фон, обложки и график вахты — из локального кэша, синхронизируются сами
  const bg = settings.bg || DEFAULT_BG
  const covers = settings.covers || {}
  const inbox = useTable('inbox')                // для счётчика на вкладке «Входящие»
  const [panel, setPanel] = useState(null)    // какая панель открыта: 'look' (оформление) | 'notify' (уведомления) | null
  const openTab = useRef(new URLSearchParams(window.location.search).get('tab'))   // ?tab=… — переход по нажатию на уведомление
  const [group, setGroup] = useState(null)    // какая группа внутри раскрыта: 'bg' | 'cover' | null
  const popRef = useRef(null)
  const uid = session?.user?.id

  // Если вошедший ранее пользователь открыл приложение без связи (или связь такая, что токен не обновился),
  // не выкидываем его на экран входа, а работаем с локальными данными.
  useEffect(() => {
    let off = false
    const resolve = (s, err) => {
      if (s) return s
      const cached = getUid()
      if (cached && (err || !navigator.onLine)) return { user: { id: cached }, offline: true }
      return null
    }
    supabase.auth.getSession().then(({ data, error }) => { if (!off) setSession(resolve(data.session, error)) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(resolve(s, null)))
    return () => { off = true; sub.subscription.unsubscribe() }
  }, [])

  // Данные принадлежат пользователю: при смене логина показываем только его локальные данные
  useEffect(() => {
    if (session === undefined) return
    setUid(uid || null)
    setPanel(null); setGroup(null)
    setTab(TABS.some(t => t.id === openTab.current) ? openTab.current : 'today')
    if (openTab.current) { openTab.current = null; window.history.replaceState(null, '', window.location.pathname) }
  }, [uid, session === undefined]) // eslint-disable-line react-hooks/exhaustive-deps

  // Нажали на уведомление, пока приложение уже открыто: сервис-воркер просит перейти на нужную вкладку
  useEffect(() => {
    const sw = navigator.serviceWorker
    if (!sw) return
    const onMsg = e => { if (e.data?.type === 'lola-open' && TABS.some(t => t.id === e.data.tab)) setTab(e.data.tab) }
    sw.addEventListener('message', onMsg)
    return () => sw.removeEventListener('message', onMsg)
  }, [])

  // Закрытие панели по клику снаружи и по Esc
  useEffect(() => {
    if (!panel) return
    const onDown = e => { if (!popRef.current?.contains(e.target)) setPanel(null) }
    const onKey = e => { if (e.key === 'Escape') setPanel(null) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [panel])

  const changeBg = (b) => saveSettings({ bg: b })
  const changeCover = (patch) => saveSettings({ covers: { ...covers, [tab]: { ...covers[tab], ...patch } } })
  const signOut = async () => {
    const { pending } = getStatus()
    if (pending && !confirm(`Не отправлено на сервер: ${pending}. При выходе эти записи пропадут. Всё равно выйти?`)) return
    await pushLogout()                    // подписка на push принадлежит аккаунту — снимаем её до выхода
    setUid(null)
    const { error } = await supabase.auth.signOut()
    if (error) await supabase.auth.signOut({ scope: 'local' })   // без сети — выходим только на этом устройстве
  }
  const bgFile = async (f) => { if (f) { const u = await uploadImage(f); if (u) changeBg({ type: 'image', value: u }) } }
  const coverFile = async (f) => { if (f) { const u = await uploadImage(f); if (u) changeCover({ image: u }) } }
  const toggle = (g) => setGroup(group === g ? null : g)

  if (session === undefined) return null
  if (!session) return <Auth />

  const style = bg.type === 'image'
    ? { backgroundImage: `url(${bg.value})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' }
    : { background: bg.value }
  const Active = TABS.find(t => t.id === tab)
  const cover = covers[tab] || {}
  const swatch = bg.type === 'image'
    ? { backgroundImage: `url(${bg.value})`, backgroundSize: 'cover' } : { background: bg.value }

  return (
    <div className="min-h-screen" style={style}>
      <Reminders />
      <div className="max-w-6xl mx-auto p-3 sm:p-6">
        <nav className="card !p-2 flex flex-wrap items-center gap-1 mb-4 relative z-30">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} aria-label={t.label} aria-current={tab === t.id ? 'page' : undefined}
                    className={`relative ${tab === t.id ? 'btn' : 'btn-ghost'}`}>
              <span>{covers[t.id]?.icon || <t.icon size={16} />}</span>
              <span className={tab === t.id ? '' : 'hidden sm:inline'}>{t.label}</span>
              {t.id === 'inbox' && inbox.rows.length > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-soft text-[11px] font-bold grid place-items-center">{inbox.rows.length}</span>
              )}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1" ref={popRef}>
            <SyncBadge />
            <button className={panel === 'notify' ? 'btn !px-3' : 'btn-ghost'} aria-label="Уведомления" aria-expanded={panel === 'notify'}
                    onClick={() => setPanel(panel === 'notify' ? null : 'notify')}><Bell size={18} /></button>
            <button className={panel === 'look' ? 'btn !px-3' : 'btn-ghost'} aria-label="Оформление" aria-expanded={panel === 'look'}
                    onClick={() => setPanel(panel === 'look' ? null : 'look')}><Palette size={18} /></button>
            <button className="btn-ghost" aria-label="Выйти" onClick={signOut}><LogOut size={18} /></button>

            {panel === 'notify' && <NotifyPanel />}

            {panel === 'look' && (
              <div className="absolute right-2 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-2xl bg-white/95 shadow-soft
                              border border-beige/60 p-2 space-y-2 anim-pop">
                <Section title="Фон" open={group === 'bg'} onToggle={() => toggle('bg')}
                         preview={<span className="w-5 h-5 rounded-md border border-white shadow" style={swatch} />}>
                  <div className="text-xs opacity-60 mb-1">Градиенты</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {GRADIENTS.map(g => <button key={g} aria-label="Градиент" onClick={() => changeBg({ type: 'gradient', value: g })}
                      className="w-8 h-8 rounded-lg border-2 border-white shadow-sm" style={{ background: g }} />)}
                  </div>
                  <div className="text-xs opacity-60 mb-1">Цвета</div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {PASTELS.map(c => <button key={c} aria-label={c} onClick={() => changeBg({ type: 'solid', value: c })}
                      className="w-8 h-8 rounded-lg border-2 border-white shadow-sm" style={{ background: c }} />)}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    <label className="btn-ghost cursor-pointer !py-1 text-sm"><ImagePlus size={15} /> Своя картинка
                      <input type="file" accept="image/*" hidden onChange={e => bgFile(e.target.files[0])} /></label>
                    <button className="btn-ghost !py-1 text-sm" onClick={() => changeBg(DEFAULT_BG)}><RotateCcw size={15} /> Сбросить</button>
                  </div>
                </Section>

                <Section title={`Вкладка «${Active.label}»`} open={group === 'cover'} onToggle={() => toggle('cover')}
                         preview={<span className="text-lg leading-none">{cover.icon}</span>}>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input className="input !w-20" maxLength={2} placeholder="Эмодзи" value={cover.icon || ''}
                           onChange={e => changeCover({ icon: e.target.value })} />
                    <label className="btn-ghost cursor-pointer !py-1 text-sm"><ImagePlus size={15} /> Обложка
                      <input type="file" accept="image/*" hidden onChange={e => coverFile(e.target.files[0])} /></label>
                    {cover.image && <button className="btn-ghost !py-1 text-sm" onClick={() => changeCover({ image: null })}>Убрать</button>}
                  </div>
                </Section>
              </div>
            )}
          </div>
        </nav>

        {cover.image && <img src={cover.image} alt="" className="w-full h-36 object-cover rounded-2xl shadow-soft mb-4" />}
        <h1 className="text-2xl font-bold mb-3">{cover.icon} {Active.label}</h1>
        {/* key по пользователю: при смене логина все данные вкладок загружаются заново */}
        <Active.View key={`${uid}-${tab}`} go={setTab} />
      </div>
    </div>
  )
}
