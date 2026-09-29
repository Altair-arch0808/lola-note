import { useEffect, useRef, useState } from 'react'
import { Calendar as CalIcon, CheckSquare, Network, Clock, BookOpen, Palette, LogOut, ImagePlus, ChevronDown, RotateCcw } from 'lucide-react'
import { supabase, uploadImage } from './supabase'
import { GRADIENTS, PASTELS } from './util'
import Auth from './Auth'
import Calendar from './Calendar'
import Tasks from './Tasks'
import MindMap from './MindMap'
import Planner from './Planner'
import Journal from './Journal'

const TABS = [
  { id: 'calendar', label: 'Календарь', icon: CalIcon, View: Calendar },
  { id: 'tasks', label: 'Задачи', icon: CheckSquare, View: Tasks },
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
  const [tab, setTab] = useState('calendar')
  const [bg, setBg] = useState(DEFAULT_BG)
  const [covers, setCovers] = useState({})
  const [panel, setPanel] = useState(false)   // выпадающая панель оформления
  const [group, setGroup] = useState(null)    // какая группа внутри раскрыта: 'bg' | 'cover' | null
  const popRef = useRef(null)
  const uid = session?.user?.id

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Настройки принадлежат пользователю: при смене логина сбрасываем чужие и грузим свои
  useEffect(() => {
    setBg(DEFAULT_BG); setCovers({}); setPanel(false); setGroup(null); setTab('calendar')
    if (!uid) return
    let off = false
    supabase.from('settings').select('*').eq('user_id', uid).maybeSingle().then(({ data }) => {
      if (off) return
      if (data?.bg) setBg(data.bg)
      if (data?.covers) setCovers(data.covers)
    })
    return () => { off = true }
  }, [uid])

  // Закрытие панели по клику снаружи и по Esc
  useEffect(() => {
    if (!panel) return
    const onDown = e => { if (!popRef.current?.contains(e.target)) setPanel(false) }
    const onKey = e => { if (e.key === 'Escape') setPanel(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey) }
  }, [panel])

  const save = (nb, nc) => supabase.from('settings').upsert({ user_id: uid, bg: nb, covers: nc })
  const changeBg = (b) => { setBg(b); save(b, covers) }
  const changeCover = (patch) => { const c = { ...covers, [tab]: { ...covers[tab], ...patch } }; setCovers(c); save(bg, c) }
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
      <div className="max-w-6xl mx-auto p-3 sm:p-6">
        <nav className="card !p-2 flex flex-wrap items-center gap-1 mb-4 relative z-30">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'btn' : 'btn-ghost'}>
              <span>{covers[t.id]?.icon || <t.icon size={16} />}</span> {t.label}
            </button>
          ))}
          <div className="ml-auto flex gap-1" ref={popRef}>
            <button className={panel ? 'btn !px-3' : 'btn-ghost'} aria-label="Оформление" aria-expanded={panel}
                    onClick={() => setPanel(!panel)}><Palette size={18} /></button>
            <button className="btn-ghost" aria-label="Выйти" onClick={() => supabase.auth.signOut()}><LogOut size={18} /></button>

            {panel && (
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
        <Active.View key={`${uid}-${tab}`} />
      </div>
    </div>
  )
}
