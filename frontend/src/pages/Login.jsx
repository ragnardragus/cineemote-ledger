import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import SiteLayout from '../components/SiteLayout.jsx'

export default function Login() {
  const { user, loading, login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const submitting = useRef(false)

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    setSending(true)
    setError('')
    try {
      await login(username.trim(), password)
      setPassword('')
    } catch (failure) {
      setError(failure instanceof TypeError || ['TimeoutError', 'AbortError'].includes(failure.name) ? 'Não foi possível conectar à API. Tente novamente.' : failure.message)
    } finally {
      submitting.current = false
      setSending(false)
    }
  }

  if (!loading && user) return <Navigate to="/admin/usercodes" replace />
  return <SiteLayout active="login"><main className="login-page">
    <div className="intro"><span className="eyebrow">ÁREA ADMINISTRATIVA</span><h1>Acesso reservado.<br /><span>Ideias sem limites.</span></h1><p>Entre na sua conta para gerenciar os códigos da comunidade.</p></div>
    <section className="code-card" aria-labelledby="login-title">
      <div className="card-heading"><span className="key-icon" aria-hidden="true">⌘</span><div><h2 id="login-title">Entrar na administração</h2><p>Use seu usuário e senha.</p></div></div>
      <form onSubmit={submit}><fieldset className="emote-fields" disabled={sending || loading}>
        <div className="form-field"><label htmlFor="login-username">Usuário</label><input id="login-username" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" maxLength={64} placeholder="Seu usuário" /></div>
        <div className="form-field"><label htmlFor="login-password">Senha</label><div className="url-controls"><input id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="Sua senha" /><button type="button" className="preview-button" onClick={() => setShowPassword(!showPassword)} aria-pressed={showPassword}>{showPassword ? 'Ocultar' : 'Mostrar'}</button></div></div>
        <button className="generate-button" type="submit"><span>{loading ? 'Verificando sessão…' : sending ? 'Entrando…' : 'Entrar'}</span><span aria-hidden="true">↗</span></button>
      </fieldset>{error && <p className="error" role="alert">{error}</p>}</form>
      <p className="card-note">A geração de UserCodes é exclusiva da administração.</p>
    </section>
  </main></SiteLayout>
}
