import ThemeSwitch from './ThemeSwitch.jsx'
import AccountMenu from './AccountMenu.jsx'
import Button from '@mui/material/Button'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/context.js'

export default function SiteLayout({ children, administrative = false }) {
  const { user, loading } = useAuth()
  return <div className="site-shell">
    <header className="header">
      <Link className="brand" to="/" aria-label="Cinemotes, início"><img src="/cinemotes.svg" alt="" className="brand-mark" /><span>Cinemotes<span className="brand-label">Ledger</span></span></Link>
      <nav className="navigation" aria-label="Navegação principal">
        <NavLink className="header-nav-link" to="/emotes/globais">Emotes globais</NavLink>
        <NavLink className="header-nav-link" to={user?.role === 'ADMIN' ? '/admin/emotes/novo' : '/emotes/novo'}>Cadastrar Emote</NavLink>
        {user?.role === 'ADMIN' && <>
          <NavLink className="header-nav-link" to="/admin/usercodes">Gerar UserCode</NavLink>
          <NavLink className="header-nav-link" to="/admin/users">Usuários</NavLink>
        </>}
        {user?.role === 'CREATOR' && <NavLink className="header-nav-link" to="/my-emotes">Meus Emotes</NavLink>}
      </nav>
      <div className="header-actions">
        {user ? <AccountMenu /> : <><ThemeSwitch /><Button component={Link} to="/login" variant="contained" color="primary" size="small" disabled={loading}>Login</Button></>}
      </div>
    </header>
    <div className={administrative ? 'page admin-page' : 'page'}>
    {children}
    <footer><span>Cinemotes Ledger <span className="footer-dot">·</span> Feito para a comunidade.</span><span>Um pouco mais de expressão. <span aria-hidden="true">✦</span></span></footer>
    </div>
  </div>
}
