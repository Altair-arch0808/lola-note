import { useCallback, useEffect, useRef, useState } from 'react'
import { X, Plus, Trash2, ImagePlus, Link2, Globe } from 'lucide-react'
import { uploadImage } from './supabase'
import { PASTELS, shade } from './util'

/* ---------- формат содержимого ----------
   body хранится строкой: либо обычный текст (старые заметки),
   либо JSON {"v":2,"text":"...","cards":["https://..."]} */
export function parseBody(raw) {
  if (!raw) return { text: '', cards: [] }
  if (raw.startsWith('{"v":2')) {
    try { const o = JSON.parse(raw); return { text: o.text || '', cards: Array.isArray(o.cards) ? o.cards : [] } } catch { /* обычный текст */ }
  }
  return { text: raw, cards: [] }
}
export const serializeBody = ({ text, cards }) => (!text.trim() && !cards.length) ? '' : JSON.stringify({ v: 2, text, cards })
export const hasContent = (raw) => { const b = parseBody(raw); return !!(b.text.trim() || b.cards.length) }

export const isUrl = s => /^https?:\/\/\S+$/i.test(s)
export const host = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

/* ---------- карточка: картинка или ссылка ---------- */
const kindCache = new Map()
function useKind(url) {
  const [kind, setKind] = useState(kindCache.get(url) || 'checking')
  useEffect(() => {
    if (kindCache.has(url)) { setKind(kindCache.get(url)); return }
    let off = false
    const im = new Image()
    im.referrerPolicy = 'no-referrer'
    im.onload = () => { kindCache.set(url, 'img'); if (!off) setKind('img') }
    im.onerror = () => { kindCache.set(url, 'link'); if (!off) setKind('link') }
    im.src = url
    return () => { off = true }
  }, [url])
  return kind
}

const TILT = [-1.6, 1.2, -0.6, 1.8]

function Card({ url, i, onRemove }) {
  const kind = useKind(url)
  const rm = (
    <button type="button" aria-label="Убрать карточку" onClick={onRemove}
            className="absolute -top-2 -right-2 z-10 w-6 h-6 rounded-full bg-white shadow grid place-items-center hover:bg-rose-soft transition">
      <X size={13} />
    </button>
  )
  if (kind === 'checking') return <div className="h-32 rounded-md bg-white/70 animate-pulse" />
  if (kind === 'img') return (
    <div className="relative" style={{ transform: `rotate(${TILT[i % TILT.length]}deg)` }}>
      <span className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-5 bg-rose-soft/80 rotate-[-3deg] shadow-sm" />
      {rm}
      <a href={url} target="_blank" rel="noopener noreferrer" className="block bg-white p-2 pb-1 shadow-soft rounded-md">
        <img src={url} alt="" referrerPolicy="no-referrer" className="w-full max-h-64 object-cover rounded-sm" />
        <div className="font-hand text-lg text-ink/70 truncate pt-1">{host(url)}</div>
      </a>
    </div>
  )
  return (
    <div className="relative" style={{ transform: `rotate(${TILT[i % TILT.length]}deg)` }}>
      {rm}
      <a href={url} target="_blank" rel="noopener noreferrer"
         className="flex items-center gap-3 bg-cream rounded-xl p-3 shadow-soft hover:brightness-95 transition">
        <span className="w-9 h-9 rounded-lg bg-white/80 grid place-items-center shrink-0"><Globe size={18} /></span>
        <span className="min-w-0">
          <span className="block font-hand text-xl leading-5 truncate">{host(url)}</span>
          <span className="block text-[11px] opacity-60 truncate">{url}</span>
        </span>
      </a>
    </div>
  )
}

/* ---------- блокнот ---------- */
export default function Notebook({ node, path, kids, onOpen, onClose, onAdd, onSave, onDelete }) {
  const init = useRef(null)
  if (!init.current) {
    const b = parseBody(node.body)
    // старая одиночная картинка узла становится карточкой
    if (node.image_url && !b.cards.includes(node.image_url)) b.cards = [node.image_url, ...b.cards]
    init.current = b
  }
  const [title, setTitle] = useState(node.title)
  const [text, setText] = useState(init.current.text)
  const [cards, setCards] = useState(init.current.cards)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const taRef = useRef(null), titleRef = useRef(null)
  const dirty = useRef(false), timer = useRef(null)
  const latest = useRef({}); latest.current = { title, text, cards }
  const saveRef = useRef(onSave); saveRef.current = onSave

  // Автосохранение: пишем в базу через паузу, а также при закрытии/переходе
  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (!dirty.current) return
    dirty.current = false
    const { title, text, cards } = latest.current
    saveRef.current({ title: title.trim() || 'Без названия', body: serializeBody({ text, cards }), image_url: null })
    setStatus('saved')
  }, [])
  const touch = () => { dirty.current = true; setStatus('saving'); clearTimeout(timer.current); timer.current = setTimeout(flush, 700) }
  useEffect(() => () => flush(), [flush])

  // Автовысота текстового поля (высота кратна строке тетради)
  useEffect(() => {
    const ta = taRef.current; if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.max(288, Math.ceil((ta.scrollHeight + 36) / 36) * 36) + 'px'
  }, [text])

  // Новый узел: сразу выделяем название, чтобы можно было печатать
  useEffect(() => {
    if (/^Нов(ая категория|ый раздел)$/.test(node.title)) { titleRef.current?.focus(); titleRef.current?.select() }
  }, []) // eslint-disable-line

  // Esc — закрыть, фон страницы не прокручивается
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow; document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  const addCard = (url) => {
    const u = url.trim(); if (!isUrl(u)) return false
    if (!latest.current.cards.includes(u)) { setCards(c => [...c, u]); touch() }
    return true
  }
  const submitLink = (e) => { e.preventDefault(); if (addCard(link)) setLink('') }
  const upload = async (file) => {
    if (!file) return
    setBusy(true); const u = await uploadImage(file); setBusy(false)
    if (u) addCard(u)
  }
  const onPaste = (e) => {
    const img = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith('image/'))
    if (img) { e.preventDefault(); upload(img); return }
    const t = (e.clipboardData?.getData('text') || '').trim()
    if (isUrl(t)) { e.preventDefault(); addCard(t) }   // вставленная ссылка сразу превращается в карточку
  }
  const removeCard = (u) => { setCards(c => c.filter(x => x !== u)); touch() }
  const close = () => { flush(); onClose() }
  const go = (id) => { flush(); onOpen(id) }
  const setColor = (c) => onSave({ color: c }, true)
  const isRoot = !node.parent_id || path.length === 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center sm:p-6 bg-ink/40 backdrop-blur-sm"
         onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <div role="dialog" aria-modal="true" aria-label={title}
           className="anim-pop flex w-full max-w-3xl h-full sm:h-[90vh] sm:rounded-3xl shadow-2xl overflow-hidden"
           style={{ background: shade(node.color, -0.08) }}>
        {/* переплёт-спираль */}
        <div className="w-9 sm:w-12 shrink-0 flex flex-col justify-evenly items-center py-4" aria-hidden>
          {Array.from({ length: 13 }).map((_, i) => (
            <span key={i} className="w-6 sm:w-8 h-3 rounded-full bg-white/90 border border-ink/20 shadow-inner" />
          ))}
        </div>

        {/* лист */}
        <div className="relative flex-1 min-w-0 flex flex-col bg-[#fffdf7] rounded-l-md">
          <div className="absolute inset-y-0 left-10 sm:left-12 w-[2px] bg-rose-300/60 pointer-events-none" aria-hidden />

          <div className="flex items-center gap-2 pl-14 sm:pl-16 pr-3 pt-3 pb-1">
            <nav className="flex-1 min-w-0 flex items-center flex-wrap gap-x-1 font-hand text-xl text-ink/70" aria-label="Путь">
              <button className="hover:underline" onClick={close}>Я</button>
              {path.map(p => (
                <span key={p.id} className="flex items-center gap-1">
                  <span aria-hidden>›</span>
                  <button className="hover:underline truncate max-w-[9rem]" onClick={() => go(p.id)}>{p.title}</button>
                </span>
              ))}
            </nav>
            <div className="hidden sm:flex gap-1 mr-1">
              {PASTELS.map(c => (
                <button key={c} aria-label={`Цвет ${c}`} onClick={() => setColor(c)}
                        className={`w-5 h-5 rounded-full border-2 ${node.color === c ? 'border-ink' : 'border-white'} shadow-sm`}
                        style={{ background: c }} />
              ))}
            </div>
            <button className="btn-ghost !p-2" aria-label="Удалить" onClick={onDelete}><Trash2 size={17} /></button>
            <button className="btn-ghost !p-2" aria-label="Закрыть" onClick={close}><X size={19} /></button>
          </div>

          <div className="flex-1 overflow-y-auto pl-14 sm:pl-16 pr-4 sm:pr-8 pb-6">
            <input ref={titleRef} value={title} placeholder="Название"
                   onChange={e => { setTitle(e.target.value); touch() }}
                   className="w-full bg-transparent font-script text-3xl sm:text-4xl text-[#33385a] py-1 outline-none
                              border-b-2 border-dashed border-ink/15 focus:border-ink/40" />

            {/* закладки: вложенные разделы */}
            <div className="flex flex-wrap items-end gap-2 mt-3 mb-4">
              <span className="font-hand text-lg text-ink/50 mr-1">{isRoot ? 'Разделы:' : 'Внутри:'}</span>
              {kids.map(k => (
                <button key={k.id} onClick={() => go(k.id)}
                        className="font-hand text-xl px-3 pt-1 pb-0.5 rounded-t-xl border-b-4 hover:-translate-y-0.5 transition"
                        style={{ background: k.color, borderColor: shade(k.color, -0.2) }}>{k.title}</button>
              ))}
              <button onClick={() => { flush(); onAdd(node) }}
                      className="font-hand text-xl px-3 pt-1 pb-0.5 rounded-t-xl border-b-4 border-dashed border-ink/25 text-ink/60 hover:bg-white transition inline-flex items-center gap-1">
                <Plus size={15} /> {isRoot ? 'подраздел' : 'раздел'}
              </button>
            </div>

            <textarea ref={taRef} className="notebook-text" value={text} spellCheck={false}
                      placeholder="Пиши здесь… Вставь ссылку — она станет карточкой."
                      onChange={e => { setText(e.target.value); touch() }} onPaste={onPaste} />

            {cards.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-5 gap-y-7 mt-6 pt-2">
                {cards.map((u, i) => <Card key={u} url={u} i={i} onRemove={() => removeCard(u)} />)}
              </div>
            )}
          </div>

          <form onSubmit={submitLink} className="flex items-center gap-2 pl-14 sm:pl-16 pr-3 py-2 border-t border-ink/10 bg-white/60">
            <Link2 size={16} className="opacity-50 shrink-0" />
            <input className="flex-1 min-w-0 bg-transparent outline-none text-sm py-1" value={link}
                   placeholder="Ссылка на картинку или сайт" onChange={e => setLink(e.target.value)} />
            <button className="btn !py-1 !px-3 text-sm" disabled={!isUrl(link.trim())}>Прикрепить</button>
            <label className="btn-ghost cursor-pointer !p-2" aria-label="Загрузить картинку" title="Загрузить картинку">
              <ImagePlus size={17} className={busy ? 'animate-pulse' : ''} />
              <input type="file" accept="image/*" hidden onChange={e => { upload(e.target.files[0]); e.target.value = '' }} />
            </label>
            <span className="text-xs opacity-50 w-16 text-right">{status === 'saving' ? 'пишу…' : status === 'saved' ? 'сохранено' : ''}</span>
          </form>
        </div>
      </div>
    </div>
  )
}
