import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import FormInput from '../components/FormInput.jsx'
import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/context.js'
import SiteLayout from '../components/SiteLayout.jsx'

export default function Login({ creator = false }) {
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
      await login(username.trim(), password, creator ? 'CREATOR' : 'ADMIN')
      setPassword('')
    } catch (failure) {
      setError(failure instanceof TypeError || ['TimeoutError', 'AbortError'].includes(failure.name) ? 'Não foi possível conectar à API. Tente novamente.' : failure.message)
    } finally {
      submitting.current = false
      setSending(false)
    }
  }

  if (!loading && user) return <Navigate to={user.role === 'CREATOR' ? '/my-emotes' : '/admin/usercodes'} replace />
  return <SiteLayout active="login"><main className="login-page">
    <div className="intro"><h1>{creator ? 'Acesso do criador.' : 'Acesso reservado.'}</h1></div>
    <Paper component="section" variant="outlined" className="code-card" aria-labelledby="login-title">
      <div className="card-heading"><span className="key-icon" aria-hidden="true">⌘</span><div><h2 id="login-title">{creator ? 'Entrar na sua conta' : 'Entrar na administração'}</h2><p>Use seu usuário e senha.</p></div></div>
      <form onSubmit={submit}><fieldset className="emote-fields" disabled={sending || loading}>
        <div className="form-field"><label htmlFor="login-username">Usuário</label><FormInput id="login-username" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" maxLength={64} placeholder="Seu usuário"  disabled={sending || loading}/></div>
        <div className="form-field"><label htmlFor="login-password">Senha</label><div className="url-controls"><FormInput id="login-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" placeholder="Sua senha"  disabled={sending || loading}/><Button type="button" className="preview-button" onClick={() => setShowPassword(!showPassword)} disabled={sending || loading} aria-pressed={showPassword}>{showPassword ? 'Ocultar' : 'Mostrar'}</Button></div></div>
        <Button variant="contained" color="primary" className="generate-button" type="submit" disabled={sending || loading}><span>{loading ? 'Verificando sessão…' : sending ? 'Entrando…' : 'Entrar'}</span><span aria-hidden="true">↗</span></Button>
      </fieldset>{error && <Alert severity="error">{error}</Alert>}</form>
    </Paper>
  </main></SiteLayout>
}
