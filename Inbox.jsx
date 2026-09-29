import { useState } from 'react'
import { Plus, Trash2, CheckSquare, BookOpen, Lightbulb } from 'lucide-react'
import { useTable } from './useTable'
import { fmt } from './util'
import { serializeBody, isUrl, host } from './Notebook'

// Первая строка записи — короткое название
const makeTitle = t => {
  const first = t.trim().split('\n')[0]
  return first.length > 60 ? first.slice(0, 57).trimEnd() + '…' : first
}

// Поле «Что в голове?» — быстрая запись во «Входящие». Используется на главной и здесь.
export function QuickCapture({ go }) {
  const inbox = useTable('inbox')
  const [text, setText] = useState('')
  const [ok, setOk] = useState(false)
  const n = inbox.rows.length

  const submit = async e => {
    e.preventDefault()
    const t = text.trim(); if (!t) return
    setText('')
    await inbox.add({ text: t }, null)
    setOk(true); setTimeout(() => setOk(false), 1800)
  }
  return (
    <form onSubmit={submit} className="card">
      <label htmlFor="quick" className="font-hand text-2xl leading-6 block mb-1">Что в голове?</label>
      <div className="flex gap-2">
        <input id="quick" className="input" value={text} onChange={e => setText(e.target.value)}
               placeholder="Запиши мысль — разберёшь потом" enterKeyHint="send" autoComplete="off" />
        <button className="btn !px-3" aria-label="Записать" disabled={!text.trim()}><Plus size={20} /></button>
      </div>
      <div className="text-xs opacity-70 mt-1 min-h-[1rem]" aria-live="polite">
        {ok ? 'Записано ✓' : n > 0 && (
          <>Во входящих: {n}{go && <> · <button type="button" className="underline" onClick={() => go('inbox')}>разобрать</button></>}</>
        )}
      </div>
    </form>
  )
}

const CATS = { notes: { title: 'Заметки', color: '#C9EFD9' }, ideas: { title: 'Идеи', color: '#FFF3DC' } }

export default function Inbox() {
  const inbox = useTable('inbox')
  const tasks = useTable('tasks')
  const nodes = useTable('mind_nodes')
  const [msg, setMsg] = useState('')
  const say = m => { setMsg(m); setTimeout(() => setMsg(''), 3500) }
  const items = [...inbox.rows].reverse()

  const toTask = async it => {
    const text = it.text.trim(), title = makeTitle(text)
    await tasks.add({ title, note: text !== title ? text : null, due_at: new Date().toISOString(), context: 'any' })
    await inbox.remove(it.id, null)
    say('Добавлено в задачи — на сегодня')
  }

  // Блокнот и идея — это страницы ментальной карты: лежат в своей категории («Заметки» / «Идеи»)
  const toNode = async (it, kind) => {
    if (!nodes.ready) await nodes.reload()
    const cat = CATS[kind]
    let parent = nodes.rows.find(n => !n.parent_id && n.title === cat.title)
    if (!parent) parent = await nodes.add({ title: cat.title, parent_id: null, color: cat.color })
    if (!parent) return
    const text = it.text.trim()
    const link = isUrl(text)
    await nodes.add({
      title: link ? host(text) : makeTitle(text), parent_id: parent.id, color: parent.color,
      body: serializeBody(link ? { text: '', cards: [text] } : { text, cards: [] })
    })
    await inbox.remove(it.id, null)
    say(`Записано в «${cat.title}» — найдёшь на ментальной карте`)
  }

  const drop = async it => { if (confirm('Удалить запись?')) await inbox.remove(it.id, null) }

  return (
    <div className="space-y-3 max-w-3xl">
      <QuickCapture />
      <div className="text-sm min-h-[1.25rem]" aria-live="polite">{msg}</div>
      {items.length === 0 && <div className="card opacity-70">Пусто — всё разобрано ✨</div>}
      {items.map(it => (
        <div key={it.id} className="card space-y-2">
          <p className="whitespace-pre-wrap break-words">{it.text}</p>
          <div className="text-xs opacity-60">{fmt(it.created_at)}</div>
          <div className="flex flex-wrap gap-1">
            <button className="btn !py-1 text-sm" onClick={() => toTask(it)}><CheckSquare size={15} /> В задачу</button>
            <button className="btn !py-1 text-sm" onClick={() => toNode(it, 'notes')}><BookOpen size={15} /> В блокнот</button>
            <button className="btn !py-1 text-sm" onClick={() => toNode(it, 'ideas')}><Lightbulb size={15} /> В идею</button>
            <button className="btn-ghost !py-1 ml-auto" aria-label="Удалить" onClick={() => drop(it)}><Trash2 size={16} /></button>
          </div>
        </div>
      ))}
    </div>
  )
}
