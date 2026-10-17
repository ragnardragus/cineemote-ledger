import { useRef, useState } from 'react'
import ToastSnackbar from './ToastSnackbar.jsx'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import FormInput from './FormInput.jsx'
import EmoteImagePicker from './EmoteImagePicker.jsx'
import { useAuth } from '../auth/context.js'

export default function CreatorEmoteDialog({ emote = null, onClose, onSaved, apiBase = '/api/emotes' }) {
  const { invalidate } = useAuth()
  const [form, setForm] = useState({ emote_name: emote?.emote_name || '', url: emote?.url || '' })
  const [saving, setSaving] = useState(false)
  const [source, setSource] = useState(emote ? 'url' : 'file')
  const [imageReady, setImageReady] = useState(false)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const change = (event) => { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); setError('') }
  const close = () => { if (!submitting.current) onClose() }

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    const body = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
    if (!body.emote_name || (source === 'url' ? !body.url : !file)) { setError('Informe o nome e a imagem.'); return }
    if (!imageReady && !(source === 'url' && emote?.url === body.url)) { setError('Selecione um arquivo ou verifique o link da imagem antes de salvar.'); return }
    try {
      if (source === 'url' && !['http:', 'https:'].includes(new URL(body.url).protocol)) throw new Error()
    } catch { setError('Informe uma URL HTTP ou HTTPS válida.'); return }
    submitting.current = true; setSaving(true); setError('')
    try {
      const headers = { 'X-Requested-With': 'Cinemotes' }
      let requestBody
      if (source === 'file') {
        requestBody = new FormData(); requestBody.set('emote_name', body.emote_name); requestBody.set('image', file)
      } else {
        headers['Content-Type'] = 'application/json'
        if (emote && body.url === emote.url) delete body.url
        requestBody = JSON.stringify(body)
      }
      const response = await fetch(emote ? `${apiBase}/${emote.id}` : apiBase, {
        method: emote ? 'PATCH' : 'POST', credentials: 'same-origin',
        headers, body: requestBody, signal: AbortSignal.timeout(30000),
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
        <EmoteImagePicker source={source} onSource={setSource} onFile={setFile} disabled={saving} onError={setError} url={form.url} onUrlChange={(url) => setForm((current) => ({ ...current, url }))} onReady={setImageReady} />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={close} disabled={saving}>Cancelar</Button>
        <Button type="submit" variant="contained" color="primary" disabled={saving}>{saving ? 'Salvando…' : emote ? 'Salvar alterações' : 'Cadastrar emote'}</Button>
      </DialogActions>
    </form>
    <ToastSnackbar message={error} onClose={() => setError('')} />
  </Dialog>
}
