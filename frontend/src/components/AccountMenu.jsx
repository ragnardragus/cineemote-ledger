import { useEffect, useRef, useState } from 'react'
import Alert from '@mui/material/Alert'
import Avatar from '@mui/material/Avatar'
import Button from '@mui/material/Button'
import ClickAwayListener from '@mui/material/ClickAwayListener'
import MenuItem from '@mui/material/MenuItem'
import MenuList from '@mui/material/MenuList'
import Paper from '@mui/material/Paper'
import Popper from '@mui/material/Popper'
import Switch from '@mui/material/Switch'
import { useAuth } from '../auth/context.js'
import { useThemeMode } from '../theme/context.js'

export default function AccountMenu() {
  const { user, logout } = useAuth()
  const { mode, setMode } = useThemeMode()
  const anchor = useRef(null)
  const closeTimer = useRef(null)
  const [open, setOpen] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => () => clearTimeout(closeTimer.current), [])

  function keepOpen() { clearTimeout(closeTimer.current) }
  function close() { keepOpen(); setOpen(false); setKeyboardOpen(false) }
  function scheduleClose() {
    if (keyboardOpen || leaving) return
    keepOpen()
    closeTimer.current = setTimeout(close, 180)
  }
  function show() { keepOpen(); setOpen(true) }
  function keyDown(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(); anchor.current?.focus() }
    if (event.key === 'Tab') close()
  }
  async function leave() {
    if (leaving) return
    setLeaving(true); setError('')
    try { await logout(); close() } catch (failure) { setError(failure.message || 'Não foi possível sair.') } finally { setLeaving(false) }
  }
  return <ClickAwayListener onClickAway={close}><div className="account-menu">
    <Button ref={anchor} className="account-trigger" variant="text" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'account-menu-list' : undefined}
      onMouseEnter={show} onMouseLeave={scheduleClose}
      onClick={() => { setKeyboardOpen(true); show() }}
      onKeyDown={(event) => { if (event.key === 'ArrowDown') { event.preventDefault(); setKeyboardOpen(true); show() } else keyDown(event) }}>
      <Avatar sx={{ width: 30, height: 30, fontSize: 14, bgcolor: 'primary.light', color: 'secondary.main' }}>{user.username.charAt(0).toUpperCase()}</Avatar>
      <span className="account-name">{user.username}</span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </Button>
    <Popper open={open} anchorEl={() => anchor.current} placement="bottom-end" className="account-popper" modifiers={[{ name: 'offset', options: { offset: [0, 6] } }, { name: 'preventOverflow', options: { padding: 12 } }]}>
      <Paper variant="outlined" className="account-dropdown" onMouseEnter={keepOpen} onMouseLeave={scheduleClose}>
        <MenuList id="account-menu-list" aria-label="Minha conta" autoFocusItem={keyboardOpen} onKeyDown={keyDown}>
          <MenuItem role="menuitemcheckbox" aria-checked={mode === 'dark'} onClick={() => setMode(mode === 'dark' ? 'light' : 'dark')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.5 13A9 9 0 0 1 11 3.5 9 9 0 1 0 20.5 13Z" /></svg>
            <span>Tema escuro</span>
            <Switch size="small" checked={mode === 'dark'} tabIndex={-1} sx={{ ml: 'auto', pointerEvents: 'none' }} aria-hidden="true" slotProps={{ input: { tabIndex: -1, readOnly: true } }} />
          </MenuItem>
          <MenuItem onClick={leave} disabled={leaving}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M10 4H4v16h6M9 12h11m-4-4 4 4-4 4" /></svg>
            <span>{leaving ? 'Saindo…' : 'Sair'}</span>
          </MenuItem>
        </MenuList>
        {error && <Alert severity="error" sx={{ m: 1 }}>{error}</Alert>}
      </Paper>
    </Popper>
  </div></ClickAwayListener>
}
