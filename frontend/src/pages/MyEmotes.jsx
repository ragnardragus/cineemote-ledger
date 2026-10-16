import ListItemIcon from '@mui/material/ListItemIcon'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import DeleteEmoteDialog from '../components/DeleteEmoteDialog.jsx'
import CreatorEmoteDialog from '../components/CreatorEmoteDialog.jsx'
import ToastSnackbar from '../components/ToastSnackbar.jsx'
import ButtonBase from '@mui/material/ButtonBase'
import EmoteTile from '../components/EmoteTile.jsx'
import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import { useAuth } from '../auth/context.js'
import SiteLayout from '../components/SiteLayout.jsx'

export default function MyEmotes() {
  const { invalidate } = useAuth()
  const [verified, setVerified] = useState(false)
  const [emotes, setEmotes] = useState([])
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [success, setSuccess] = useState('')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [menu, setMenu] = useState(null)
  function openDialog(event) {
    if (event.detail === 0) return
    setSuccess(''); setEditing(null); setDialogOpen(true)
  }
  function saved(emote) {
    setEmotes((current) => (editing ? current.map((item) => item.id === emote.id ? emote : item) : [...current, emote]).sort((a, b) => a.id.localeCompare(b.id)))
    setSuccess(`Emote ${emote.emote_name} ${editing ? 'alterado' : 'cadastrado'} com sucesso!`)
    setDialogOpen(false)
  }
  function openEmoteMenu(event, emote) {
    if (event.detail === 0) return
    const position = { top: event.clientY, left: event.clientX }
    setMenu({ position, emote })
  }
  function editSelected() {
    setSuccess(''); setEditing(menu.emote); setMenu(null); setDialogOpen(true)
  }
  function deleteSelected() { setSuccess(''); setDeleting(menu.emote); setMenu(null) }
  function deleted(emote) {
    setEmotes((current) => current.filter((item) => item.id !== emote.id))
    setSuccess(`Emote ${emote.emote_name} excluído.`); setDeleting(null)
  }
  const addButton = <ButtonBase tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.preventDefault() }} onClick={openDialog} className="add-emote-tile" aria-label="Cadastrar emote" title="Cadastrar emote"><svg viewBox="0 0 120 140" width="64" height="64" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" aria-hidden="true"><path d="M60 18v104M12 70h96" /></svg></ButtonBase>
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/emotes/mine', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) { invalidate(); return }
        if (!response.ok) throw new Error('Não foi possível carregar seus emotes.')
        const data = await response.json()
        if (!Array.isArray(data)) throw new Error('Lista de emotes inválida.')
        if (!controller.signal.aborted) { setEmotes(data); setVerified(true) }
      }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [invalidate, attempt])
  return <SiteLayout><main className="my-emotes-page" aria-label="Meus emotes">
    <div className="intro"><h1>Meus emotes</h1></div>
    <ToastSnackbar message={success} severity="success" onClose={() => setSuccess('')} />
    <section className={`my-emotes-panel ${verified && emotes.length ? 'has-emotes' : ''}`} aria-label="Emotes do seu canal" aria-busy={!verified && !error}>
    {error ? <><Alert severity="error">{error}</Alert><Button onClick={() => { setError(''); setVerified(false); setAttempt((value) => value + 1) }}>Tentar novamente</Button></> : !verified && <p role="status">Carregando seus emotes…</p>}
    {verified && !error && (emotes.length
      ? <ul className="global-emotes-grid">{emotes.map((emote) => <EmoteTile key={emote.id} emote={emote} onClick={(event) => openEmoteMenu(event, emote)} menuOpen={menu?.emote.id === emote.id} />)}<li className="my-emotes-add-cell">{addButton}</li></ul>
      : addButton)}
    </section>
    <Menu id="emote-actions-menu" anchorReference="anchorPosition" anchorPosition={menu?.position} transformOrigin={{ vertical: 'top', horizontal: 'left' }} open={Boolean(menu)} onClose={() => setMenu(null)} disableRestoreFocus={dialogOpen || Boolean(deleting)} slotProps={{
      paper: { sx: { minWidth: 240, maxWidth: 'calc(100vw - 24px)', bgcolor: 'background.paper', backgroundImage: 'none', border: '1px solid', borderColor: 'divider', borderRadius: '10px', boxShadow: 'none' } },
      list: { 'aria-label': menu ? `Opções de ${menu.emote.emote_name}` : 'Opções do emote', sx: { py: 1, '& .MuiMenuItem-root': { px: 2, gap: '12px', minHeight: 48, fontSize: 13, fontWeight: 400, color: 'text.primary', '&:hover, &.Mui-focusVisible': { bgcolor: 'var(--cinemotes-tint)' }, '& .MuiListItemIcon-root': { minWidth: '18px !important', color: 'inherit' } } } },
    }}>
      <MenuItem onClick={editSelected}>
        <ListItemIcon sx={{ color: 'secondary.main', minWidth: '30px !important' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m16 3 5 5M3 21l5-1L21 7a2.1 2.1 0 0 0-5-5L3 15v6Z" /></svg></ListItemIcon>
        Alterar
      </MenuItem>
      <MenuItem onClick={deleteSelected}>
        <ListItemIcon sx={{ color: 'error.main', minWidth: '30px !important' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg></ListItemIcon>
        Excluir
      </MenuItem>
    </Menu>
    {dialogOpen && <CreatorEmoteDialog key={editing?.id || 'new'} emote={editing} onClose={() => setDialogOpen(false)} onSaved={saved} />}
    {deleting && <DeleteEmoteDialog emote={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
  </main></SiteLayout>
}
