import { useState } from 'react'
import { supabase } from './supabase'

export default function Auth() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [signup, setSignup] = useState(false)
  const [msg, setMsg] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    const fn = signup ? supabase.auth.signUp : supabase.auth.signInWithPassword
    const { error } = await fn.call(supabase.auth, { email, password })
    setMsg(error ? error.message : signup ? 'Готово! Если включено подтверждение — проверьте почту.' : '')
  }
  return (
    <div className="min-h-screen grid place-items-center p-4"
         style={{ background: 'linear-gradient(135deg,#fde2e9,#e6dcf7)' }}>
      <form onSubmit={submit} className="card w-full max-w-sm space-y-3">
        <h1 className="text-2xl font-bold">Мой планер</h1>
        <input className="input" type="email" placeholder="Почта" value={email}
               onChange={e => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Пароль (от 6 символов)" value={password}
               onChange={e => setPassword(e.target.value)} minLength={6} required />
        <button className="btn w-full justify-center">{signup ? 'Создать аккаунт' : 'Войти'}</button>
        <button type="button" className="text-sm underline" onClick={() => setSignup(!signup)}>
          {signup ? 'Уже есть аккаунт' : 'Впервые здесь? Создать аккаунт'}
        </button>
        {msg && <p className="text-sm">{msg}</p>}
      </form>
    </div>
  )
}
