import { useState } from 'react'
import { Trash2, ImagePlus } from 'lucide-react'
import { useTable } from './useTable'
import { uploadImage } from './supabase'
import { fmt, toLocalInput, ymd, addDays } from './util'
import { CTX, nextCtx, ctxVisible } from './shift'

// Отметка выполнения: фиксируем время закрытия; для повторяющихся создаём следующую копию.
// Вынесено отдельно, чтобы то же самое работало и на экране «Сегодня».
export async function toggleTask({ update, add }, t) {
  const done = !t.done
  await update(t.id, { done, done_at: done ? new Date().toISOString() : null }, done ? 'completed' : 'updated')
  if (done && t.repeat !== 'none' && t.due_at) {
    const next = addDays(new Date(t.due_at), t.repeat === 'daily' ? 1 : 7)
    if (!t.repeat_until || ymd(next) <= t.repeat_until) {
      await add({ title: t.title, note: t.note, image_url: t.image_url, due_at: next.toISOString(),
                  repeat: t.repeat, repeat_until: t.repeat_until, context: t.context || 'any' })
    }
  }
}

const NO_DATE = 8.64e15

export default function Tasks() {
  const table = useTable('tasks')
  const { rows, add, update, remove } = table
  const [f, setF] = useState({ title: '', due: toLocalInput(new Date()), repeat: 'none', until: '', context: 'any' })
  const [filter, setFilter] = useState('all')

  const submit = async (e) => {
    e.preventDefault()
    if (!f.title.trim()) return
    await add({
      title: f.title, due_at: f.due ? new Date(f.due).toISOString() : null, context: f.context,
      repeat: f.repeat, repeat_until: f.repeat !== 'none' && f.until ? f.until : null
    })
    setF({ ...f, title: '' })
  }

  const attach = async (t, file) => { if (file) { const url = await uploadImage(file); if (url) update(t.id, { image_url: url }) } }
  const due = t => (t.due_at ? +new Date(t.due_at) : NO_DATE)
  const sorted = rows.filter(t => ctxVisible(t.context, filter)).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || due(a) - due(b))

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <form onSubmit={submit} className="card space-y-2 h-fit">
        <b>Новая задача</b>
        <input className="input" placeholder="Что нужно сделать?" value={f.title} onChange={e => setF({ ...f, title: e.target.value })} />
        <input className="input" type="datetime-local" value={f.due} onChange={e => setF({ ...f, due: e.target.value })} />
        <select className="input" aria-label="Где" value={f.context} onChange={e => setF({ ...f, context: e.target.value })}>
          {Object.entries(CTX).map(([k, v]) => <option key={k} value={k}>{v.emoji} {v.label}</option>)}
        </select>
        <select className="input" value={f.repeat} onChange={e => setF({ ...f, repeat: e.target.value })}>
          <option value="none">Не повторять</option>
          <option value="daily">Каждый день</option>
          <option value="weekly">Раз в неделю</option>
        </select>
        {f.repeat !== 'none' && (
          <label className="text-sm block">Повторять до (пусто — бессрочно)
            <input className="input mt-1" type="date" value={f.until} onChange={e => setF({ ...f, until: e.target.value })} />
          </label>
        )}
        <button className="btn">Добавить</button>
      </form>

      <div className="lg:col-span-2 space-y-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Фильтр по месту">
          {[['all', 'Все'], ['work', `${CTX.work.emoji} На вахте`], ['home', `${CTX.home.emoji} Дома`]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={filter === k ? 'btn !py-1' : 'btn-ghost !py-1'}>{l}</button>
          ))}
        </div>
        {sorted.length === 0 && <div className="card opacity-70">{rows.length ? 'В этой категории пусто.' : 'Пока пусто. Добавьте первую задачу слева.'}</div>}
        {sorted.map(t => (
          <div key={t.id} className="card flex gap-3 items-start">
            <input type="checkbox" checked={!!t.done} onChange={() => toggleTask(table, t)}
                   className="mt-1 w-5 h-5 rounded-md accent-[#b9a5ee]" aria-label="Выполнено" />
            <div className="flex-1 min-w-0">
              <div className={`font-semibold ${t.done ? 'task-done' : ''}`}>
                {t.title} {t.repeat !== 'none' && <span className="text-xs opacity-60">↻ {t.repeat === 'daily' ? 'ежедневно' : 'еженедельно'}</span>}
              </div>
              {t.note && <div className="text-sm opacity-80 whitespace-pre-wrap break-words">{t.note}</div>}
              <div className="text-xs opacity-60">
                На: {fmt(t.due_at) || '—'} · создана: {fmt(t.created_at)}{t.done_at && ` · выполнена: ${fmt(t.done_at)}`}
              </div>
              {t.image_url && <img src={t.image_url} alt="" className="mt-2 rounded-xl max-h-40" />}
            </div>
            <button className="btn-ghost !px-2 !py-1 text-sm" title="Нажмите, чтобы сменить: везде → на вахте → дома"
                    onClick={() => update(t.id, { context: nextCtx(t.context) }, null)}>
              {CTX[t.context || 'any'].emoji} <span className="hidden sm:inline">{CTX[t.context || 'any'].label}</span>
            </button>
            <label className="btn-ghost cursor-pointer" aria-label="Добавить картинку">
              <ImagePlus size={16} />
              <input type="file" accept="image/*" hidden onChange={e => attach(t, e.target.files[0])} />
            </label>
            <button className="btn-ghost" aria-label="Удалить" onClick={() => remove(t.id)}><Trash2 size={16} /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
