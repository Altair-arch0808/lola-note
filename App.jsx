import { useEffect, useState } from 'react'
import { Calendar as CalIcon, CheckSquare, Network, Clock, BookOpen, Palette, LogOut, ImagePlus } from 'lucide-react'
import { supabase, uploadImage } from './lib/supabase'
import { GRADIENTS, PASTELS } from './lib/util'
import Auth from './components/Auth'
import Calendar from './components/Calendar'
import Tasks from './components/Tasks'
import MindMap from './components/MindMap'
import Planner from './components/Planner'
import Journal from './components/Journal'

const TABS = [
  { id: 'calendar', label: 'Календарь', icon: CalIcon, View: Calendar },
  { id: 'tasks', label: 'Задачи', icon: CheckSquare, View: Tasks },
  { id: 'mind', label: 'Ментальная карта', icon: Network, View: MindMap },
  { id: 'planner', label: 'Расписание', icon: Clock, View: Planner },
  { id: 'journal', label: 'Журнал', icon: BookOpen, View: Journal }
]

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tab, setTab] = useState('calendar')
  const [bg, setBg] = useState({ type: 'gradient', value: GRADIENTS[0] })
  const [covers, setCovers] = useState({})
  const [panel, setPanel] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) return
    supabase.from('settings').select('*').maybeSingle().then(({ data }) => {
      if (data?.bg) setBg(data.bg); if (data?.covers) setCovers(data.covers)
    })
  }, [session])

  const save = (nb, nc) => supabase.from('settings').upsert({ user_id: session.user.id, bg: nb, covers: nc })
  const changeBg = (b) => { setBg(b); save(b, covers) }
  const changeCover = (patch) => { const c = { ...covers, [tab]: { ...covers[tab], ...patch } }; setCovers(c); save(bg, c) }
  const bgFile = async (f) => { if (f) { const u = await uploadImage(f); if (u) changeBg({ type: 'image', value: u }) } }
  const coverFile = async (f) => { if (f) { const u = await uploadImage(f); if (u) changeCover({ image: u }) } }

  if (session === undefined) return null
  if (!session) return <Auth />

  const style = bg.type === 'image'
    ? { backgroundImage: `url(${bg.value})`, backgroundSize: 'cover', backgroundAttachment: 'fixed' }
    : { background: bg.value }
  const Active = TABS.find(t => t.id === tab)
  const cover = covers[tab] || {}

  return (
    <div className="min-h-screen" style={style}>
      <div className="max-w-6xl mx-auto p-3 sm:p-6">
        <nav className="card !p-2 flex flex-wrap items-center gap-1 mb-4">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} className={tab === t.id ? 'btn' : 'btn-ghost'}>
              <span>{covers[t.id]?.icon || <t.icon size={16} />}</span> {t.label}
            </button>
          ))}
          <div className="ml-auto flex gap-1">
            <button className="btn-ghost" aria-label="Оформление" onClick={() => setPanel(!panel)}><Palette size={18} /></button>
            <button className="btn-ghost" aria-label="Выйти" onClick={() => supabase.auth.signOut()}><LogOut size={18} /></button>
          </div>
        </nav>

        {panel && (
          <div className="card mb-4 space-y-3">
            <div><b>Фон</b>
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                {GRADIENTS.map(g => <button key={g} aria-label="Градиент" onClick={() => changeBg({ type: 'gradient', value: g })}
                  className="w-10 h-10 rounded-xl border-2 border-white" style={{ background: g }} />)}
                {PASTELS.map(c => <button key={c} aria-label={c} onClick={() => changeBg({ type: 'solid', value: c })}
                  className="w-10 h-10 rounded-xl border-2 border-white" style={{ background: c }} />)}
                <label className="btn-ghost cursor-pointer"><ImagePlus size={16} /> Своя картинка
                  <input type="file" accept="image/*" hidden onChange={e => bgFile(e.target.files[0])} /></label>
              </div>
            </div>
            <div><b>Эта вкладка: «{Active.label}»</b>
              <div className="flex flex-wrap gap-2 mt-2 items-center">
                <input className="input !w-24" maxLength={2} placeholder="Эмодзи" value={cover.icon || ''}
                       onChange={e => changeCover({ icon: e.target.value })} />
                <label className="btn-ghost cursor-pointer"><ImagePlus size={16} /> Обложка
                  <input type="file" accept="image/*" hidden onChange={e => coverFile(e.target.files[0])} /></label>
              </div>
            </div>
          </div>
        )}

        {cover.image && <img src={cover.image} alt="" className="w-full h-36 object-cover rounded-2xl shadow-soft mb-4" />}
        <h1 className="text-2xl font-bold mb-3">{cover.icon} {Active.label}</h1>
        <Active.View />
      </div>
    </div>
  )
}
