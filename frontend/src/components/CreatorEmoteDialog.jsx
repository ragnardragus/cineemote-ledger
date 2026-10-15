import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import FormInput from './FormInput.jsx'
import { useAuth } from '../auth/context.js'

export default function CreatorEmoteDialog({ emote = null, onClose, onSaved }) {
  const { invalidate } = useAuth()
  const [form, setForm] = useState({ emote_name: emote?.emote_name || '', url: emote?.url || '', author: emote?.author || '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const change = (event) => { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); setError('') }
  const close = () => { if (!submitting.current) onClose() }

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
    if (!body.emote_name || !body.url) { setError('Informe o nome e a URL da imagem.'); return }
    try {
      if (!['http:', 'https:'].includes(new URL(body.url).protocol)) throw new Error()
    } catch { setError('Informe uma URL HTTP ou HTTPS válida.'); return }
    submitting.current = true; setSaving(true); setError('')
    try {
      const response = await fetch(emote ? `/api/emotes/${emote.id}` : '/api/emotes', {
        method: emote ? 'PATCH' : 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes' },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      })
      if (response.status === 401) { invalidate(); return }
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível salvar o emote.')
      if (!data?.id) throw new Error('Não foi possível confirmar a operação. Atualize seus emotes antes de tentar novamente.')
      onSaved(data)
    } catch (failure) {
      setError(failure instanceof TypeError || ['TimeoutError', 'AbortError'].includes(failure.name)
        ? 'Não foi possível confirmar a operação. Confira seus emotes antes de tentar novamente.' : failure.message)
    } finally { submitting.current = false; setSaving(false) }
  }

  return <Dialog open onClose={close} disableEscapeKeyDown={saving} fullWidth maxWidth="sm" aria-labelledby="creator-emote-title">
    <DialogTitle id="creator-emote-title">{emote ? 'Alterar emote' : 'Cadastrar emote'}</DialogTitle>
    <form onSubmit={submit}>
      <DialogContent aria-busy={saving}>
        <div className="form-field"><label htmlFor="creator-emote-name">Nome do emote *</label><FormInput id="creator-emote-name" name="emote_name" value={form.emote_name} onChange={change} required autoFocus autoComplete="off" disabled={saving} placeholder="Ex.: peepoHappy" /></div>
        <div className="form-field"><label htmlFor="creator-emote-url">URL da imagem *</label><FormInput id="creator-emote-url" name="url" value={form.url} onChange={change} required type="url" disabled={saving} placeholder="https://.../emote.gif" /></div>
        <div className="form-field"><label htmlFor="creator-emote-author">Autor</label><FormInput id="creator-emote-author" name="author" value={form.author} onChange={change} disabled={saving} placeholder="Nome do autor (opcional)" /></div>
        {error && <Alert severity="error">{error}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={close} disabled={saving}>Cancelar</Button>
        <Button type="submit" variant="contained" color="primary" disabled={saving}>{saving ? 'Salvando…' : emote ? 'Salvar alterações' : 'Cadastrar emote'}</Button>
      </DialogActions>
    </form>
  </Dialog>
}
