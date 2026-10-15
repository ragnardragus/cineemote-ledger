import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/context.js'

import { Link, useLocation } from 'react-router-dom'
import UserCardHeading from '../components/UserCardHeading.jsx'
import { requestUsers } from '../api/users.js'

export default function Users() {
  const { invalidate } = useAuth()
  const location = useLocation()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState(location.state?.message || '')
  const [deleting, setDeleting] = useState(null)
  const [deleteError, setDeleteError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    requestUsers('/api/users', { signal: controller.signal }, invalidate).then((items) => {
      if (!controller.signal.aborted) setUsers(items)
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [invalidate])

  function confirmRemoval(item) {
    setDeleteError(''); setDeleting(item)
  }
  function cancelRemoval() {
    if (busy || submitting.current) return
    setDeleting(null); setDeleteError('')
  }
  async function remove(item) {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setDeleteError(''); setMessage('')
    try {
      await requestUsers(`/api/users/${item.id}`, { method: 'DELETE' }, invalidate)
      setUsers((current) => current.filter((entry) => entry.id !== item.id))
      setDeleting(null); setMessage('Usuário removido.')
    } catch (failure) { setDeleteError(failure.message) } finally { setBusy(false); submitting.current = false }
  }
  return <main className="users-page">
    <div className="intro"><h1>Usuários</h1><p>Cadastre administradores e criadores. Apenas administradores acessam este painel.</p></div>
    {error && <Alert severity="error">{error}</Alert>}
    {message && <Alert severity="success" role="status">{message}</Alert>}
    <Paper component="section" variant="outlined" className="code-card users-list" aria-busy={loading} aria-labelledby="users-list-title">
      <div className="users-card-header">
        <UserCardHeading id="users-list-title" title="Usuários cadastrados" subtitle="Gerencie os administradores e criadores da comunidade." />
        <Button component={Link} to="/admin/users/novo" variant="contained" color="primary" size="small" startIcon={<span aria-hidden="true">+</span>}>Novo usuário</Button>
      </div>
      {loading ? <p role="status">Carregando usuários…</p> : <TableContainer><Table><TableHead><TableRow><TableCell>Usuário</TableCell><TableCell>Perfil</TableCell><TableCell>Canal</TableCell><TableCell>Ações</TableCell></TableRow></TableHead><TableBody>{users.map((item) => <TableRow key={item.id}>
        <TableCell>{item.username}</TableCell><TableCell>{item.role === 'ADMIN' ? 'Administrador' : 'Criador'}</TableCell><TableCell>{item.channelName || '—'}</TableCell>
        <TableCell><div className="user-actions">
          <Tooltip title="Editar usuário"><span><IconButton component={Link} to={`/admin/users/${item.id}/editar`} disabled={busy} aria-label={`Editar ${item.username}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m16 3 5 5M3 21l5-1L21 7a2.1 2.1 0 0 0-5-5L3 15v6Z" /></svg></IconButton></span></Tooltip>
          {item.role === 'ADMIN'
            ? <Tooltip title="Exclusão bloqueada"><span tabIndex={0} aria-label="Exclusão bloqueada"><IconButton disabled aria-label="Exclusão bloqueada"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m6 6 12 12" /></svg></IconButton></span></Tooltip>
            : <Tooltip title="Excluir usuário"><span><IconButton disabled={busy} onClick={() => confirmRemoval(item)} aria-label={`Excluir ${item.username}`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg></IconButton></span></Tooltip>}

        </div></TableCell>
      </TableRow>)}</TableBody></Table></TableContainer>}
    </Paper>
    <Dialog open={Boolean(deleting)} onClose={cancelRemoval} disableEscapeKeyDown={busy} fullWidth maxWidth="xs" aria-labelledby="delete-user-title" aria-describedby="delete-user-description">
      <DialogTitle id="delete-user-title">Excluir usuário?</DialogTitle>
      <DialogContent aria-busy={busy}>
        <DialogContentText id="delete-user-description">Deseja excluir o usuário <strong>{deleting?.username}</strong>? Esta ação não pode ser desfeita.</DialogContentText>
        {deleteError && <Alert severity="error">{deleteError}</Alert>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button onClick={cancelRemoval} disabled={busy} autoFocus>Cancelar</Button>
        <Button variant="contained" color="error" onClick={() => remove(deleting)} disabled={busy || !deleting}>{busy ? 'Excluindo…' : 'Excluir usuário'}</Button>
      </DialogActions>
    </Dialog>
  </main>
}
