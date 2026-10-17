import { useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import { useAuth } from '../auth/context.js'

export default function DeleteEmoteDialog({ emote, onClose, onDeleted, apiBase = '/api/emotes' }) {
  const { invalidate } = useAuth()
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const submitting = useRef(false)
  const close = () => { if (!submitting.current) onClose() }

  async function remove() {
    if (submitting.current) return
    submitting.current = true; setDeleting(true); setError('')
    try {
      const response = await fetch(`${apiBase}/${emote.id}`, {
        method: 'DELETE', credentials: 'same-origin',
        headers: { 'X-Requested-With': 'Cinemotes' }, signal: AbortSignal.timeout(15000),
      })
      if (response.status === 401) { invalidate(); return }
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error || 'Não foi possível excluir o emote.')
      }
      onDeleted(emote)
    } catch (failure) {
      setError(failure instanceof TypeError || ['TimeoutError', 'AbortError'].includes(failure.name)
        ? 'Não foi possível confirmar a exclusão. Confira seus emotes antes de tentar novamente.' : failure.message)
    } finally { submitting.current = false; setDeleting(false) }
  }

  return <Dialog open onClose={close} disableEscapeKeyDown={deleting} fullWidth maxWidth="xs" aria-labelledby="delete-emote-title" aria-describedby="delete-emote-description">
    <DialogTitle id="delete-emote-title">Excluir emote?</DialogTitle>
    <DialogContent aria-busy={deleting}>
      <DialogContentText id="delete-emote-description">Deseja excluir <strong>{emote.emote_name}</strong>? Esta ação não pode ser desfeita.</DialogContentText>
      {error && <Alert severity="error">{error}</Alert>}
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
      <Button onClick={close} disabled={deleting} autoFocus>Cancelar</Button>
      <Button variant="contained" color="error" onClick={remove} disabled={deleting}>{deleting ? 'Excluindo…' : 'Excluir emote'}</Button>
    </DialogActions>
  </Dialog>
}
