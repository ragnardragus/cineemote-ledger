import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import FormInput from '../components/FormInput.jsx'
import FormSelect from '../components/FormSelect.jsx'
import UserCardHeading from '../components/UserCardHeading.jsx'
import { derivePasswordProof } from '../auth/password.js'
import { useAuth } from '../auth/context.js'
import { requestUsers } from '../api/users.js'

const blank = { username: '', password: '', role: 'CREATOR', channelName: '' }

export default function UserFormPage() {
  const { id } = useParams()
  return <UserForm key={id || 'new'} editing={id || null} />
}

function UserForm({ editing }) {
  const { user, invalidate } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState(blank)
  const [currentUser, setCurrentUser] = useState(null)
  const [loading, setLoading] = useState(Boolean(editing))
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)

  useEffect(() => {
    if (!editing) return
    const controller = new AbortController()
    requestUsers(`/api/users/${editing}`, { signal: controller.signal }, invalidate).then((item) => {
      if (controller.signal.aborted) return
      setCurrentUser(item)
      setForm({ username: item.username, role: item.role, channelName: item.channelName || '', password: '' })
    }).catch((failure) => { if (!controller.signal.aborted) setLoadError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [editing, invalidate])

  async function save(event) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const body = { username: form.username.trim() }
      if (form.role === 'CREATOR' && (!editing || currentUser?.channelId)) body.channelName = form.channelName.trim()
      if (!editing) body.role = form.role
      if (form.password) {
        body.salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
        body.proof = await derivePasswordProof(form.password, body.salt)
      }
      await requestUsers(editing ? `/api/users/${editing}` : '/api/users', { method: editing ? 'PATCH' : 'POST', body }, invalidate)
      if (editing === user.id) { invalidate(); return }
      navigate('/admin/users', { replace: true, state: { message: editing ? 'Usuário atualizado.' : 'Usuário cadastrado.' } })
    } catch (failure) { setError(failure.message) } finally { setBusy(false); submitting.current = false }
  }
  const change = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }))
  return <main className="users-page">
    {error && <Alert severity="error">{error}</Alert>}
    {loadError ? <><Alert severity="error">{loadError}</Alert><Button component={Link} to="/admin/users">Voltar para usuários</Button></> : loading ? <p role="status">Carregando usuário…</p> : <>
    <Paper component="section" variant="outlined" className="code-card" aria-labelledby="user-form-title">
      <UserCardHeading id="user-form-title" title={editing ? 'Editar usuário' : 'Cadastrar usuário'} subtitle={editing ? 'Atualize os dados do usuário.' : 'Adicione administradores e criadores à comunidade.'} />
      <form onSubmit={save}><fieldset className="emote-fields" disabled={busy || loading}>
        <div className="form-field"><label htmlFor="user-name">Nome de usuário *</label><FormInput id="user-name" name="username" value={form.username} onChange={change} required minLength={3} maxLength={64} pattern="[a-zA-Z0-9_.\-]{3,64}" autoComplete="off"  disabled={busy || loading}/></div>
        <div className="form-field">{editing ? <p className="user-role-label">Perfil: <strong>{form.role === 'ADMIN' ? 'Administrador' : 'Criador'}</strong></p> : <><label htmlFor="user-role">Perfil *</label><FormSelect disabled={busy || loading} id="user-role" name="role" value={form.role} onChange={change} ><option value="CREATOR">Criador</option><option value="ADMIN">Administrador</option></FormSelect></>}<p className="field-help">O perfil é definido no cadastro e não pode ser alterado.</p></div>
        {form.role === 'CREATOR' && <div className="form-field"><label htmlFor="user-channel">Nome do canal *</label><FormInput id="user-channel" name="channelName" pattern="[A-Za-z0-9]{1,120}" title="Use apenas letras de A a Z e números, sem espaços ou caracteres especiais." value={form.channelName} onChange={change} placeholder="Nome do canal" helperText="Apenas letras de A a Z e números, sem espaços ou caracteres especiais." required maxLength={120} disabled={busy || loading || Boolean(editing && !currentUser?.channelId)} /></div>}
        <div className="form-field"><label htmlFor="user-password">{editing ? 'Nova senha' : 'Senha *'}</label><FormInput id="user-password" name="password" type="password" value={form.password} onChange={change} required={!editing} minLength={8} maxLength={128} autoComplete="new-password"  disabled={busy || loading}/><p className="field-help">{editing ? 'Deixe em branco para manter a senha. Alterar nome ou senha encerra as sessões desse usuário.' : 'Use pelo menos 8 caracteres.'}</p></div>
        <div className="user-form-actions"><Button variant="contained" color="primary" size="small" type="submit" disabled={busy || loading}>{busy ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar usuário'}</Button>
        <Button component={Link} to="/admin/users" disabled={busy}>{editing ? 'Cancelar edição' : 'Cancelar'}</Button>
        </div>
      </fieldset></form>
    </Paper>
    </>}
  </main>
}
