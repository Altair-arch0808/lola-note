import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from './supabase'

// Supabase требует e-mail, поэтому логин превращается в «служебную» почту: anna -> u.anna@lola-note.app.
// Если человек ввёл настоящую почту (есть «@») — используем её как есть (старые аккаунты продолжают работать).
// Если в Supabase изменится проверка адресов — поменяйте домен здесь.
const DOMAIN = 'lola-note.app'
export function loginToEmail(login) {
  const s = login.trim().toLowerCase()
  if (s.includes('@')) return s
  const local = [...s].map(ch => (/[a-z0-9_]/.test(ch) ? ch : `-${ch.codePointAt(0).toString(16)}-`)).join('')
  return `u.${local}@${DOMAIN}`
}

function human(err) {
  const m = (err?.message || '').toLowerCase()
  if (m.includes('invalid login')) return 'Неверный логин или пароль'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Такой логин уже занят — попробуйте другой или войдите'
  if (m.includes('not confirmed')) return 'В Supabase включено подтверждение почты. Отключите: Authentication → Sign In / Providers → Email → «Confirm email» (выкл.)'
  if (m.includes('rate limit') || m.includes('too many')) return 'Слишком много попыток — подождите минуту'
  if (m.includes('password')) return 'Пароль должен быть не короче 6 символов'
  if (m.includes('invalid') && m.includes('email')) return 'Логин не подходит. Используйте буквы, цифры и _'
  if (m.includes('fetch') || m.includes('network')) return 'Нет связи с сервером'
  return err?.message || 'Не получилось. Попробуйте ещё раз'
}

export default function Auth() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [signup, setSignup] = useState(false)
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setMsg(''); setBusy(true)
    try {
      const email = loginToEmail(login)
      if (signup) {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) { setMsg(human(error)); return }
        // Если подтверждение почты выключено, сессия приходит сразу. Если нет — пробуем войти, чтобы показать понятную подсказку.
        if (!data.session) {
          const r = await supabase.auth.signInWithPassword({ email, password })
          if (r.error) setMsg(human(r.error))
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) setMsg(human(error))
      }
    } catch (err) {
      setMsg(human(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4"
         style={{ background: 'linear-gradient(135deg,#fde2e9,#e6dcf7)' }}>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-bold">Мой планер</h1>
        <p className="text-sm opacity-70">{signup ? 'Придумайте логин и пароль — почта не нужна.' : 'Войдите по логину и паролю.'}</p>
        <input className="input" type="text" placeholder="Логин" value={login}
               autoCapitalize="none" autoCorrect="off" spellCheck={false}
               autoComplete="username"
               onChange={e => setLogin(e.target.value)} required minLength={2} />
        <div className="relative">
          <input className="input !pr-11" type={show ? 'text' : 'password'} placeholder="Пароль (от 6 символов)" value={password}
                 autoComplete={signup ? 'new-password' : 'current-password'}
                 onChange={e => setPassword(e.target.value)} minLength={6} required />
          <button type="button" aria-label={show ? 'Скрыть пароль' : 'Показать пароль'} onClick={() => setShow(!show)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 opacity-60 hover:opacity-100">
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <button className="btn w-full justify-center" disabled={busy}>
          {busy ? 'Подождите…' : signup ? 'Создать аккаунт' : 'Войти'}
        </button>
        <button type="button" className="text-sm underline" onClick={() => { setSignup(!signup); setMsg('') }}>
          {signup ? 'Уже есть аккаунт' : 'Впервые здесь? Создать аккаунт'}
        </button>
        {msg && <p className="text-sm text-red-700" role="alert">{msg}</p>}
      </form>
    </div>
  )
}
