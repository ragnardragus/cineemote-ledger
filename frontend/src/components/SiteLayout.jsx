import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../auth/context.js'

export default function SiteLayout({ children }) {
  const { user, logout } = useAuth()
  const [leaving, setLeaving] = useState(false)
  const [error, setError] = useState('')
  async function leave() {
    setLeaving(true)
    setError('')
    try { await logout() } catch (failure) { setError(failure.message || 'Não foi possível sair.') } finally { setLeaving(false) }
  }
  return <div className="page">
    <header className="header">
      <Link className="brand" to="/" aria-label="Cinemotes, início"><img src="/cinemotes.svg" alt="" className="brand-mark" /><span>Cinemotes<span className="brand-label">Ledger</span></span></Link>
      <nav className="navigation" aria-label="Navegação principal">
        <NavLink to="/emotes/novo">Cadastrar emote</NavLink>
        <NavLink to={user ? '/admin/usercodes' : '/login'}>{user ? 'UserCodes' : 'Administração'}</NavLink>
        {user && <button className="logout-button" onClick={leave} disabled={leaving}>{leaving ? 'Saindo…' : 'Sair'}</button>}
      </nav>
    </header>
    {error && <p className="error" role="alert">{error}</p>}
    {children}
    <footer><span>Cinemotes Ledger <span className="footer-dot">·</span> Feito para a comunidade.</span><span>Um pouco mais de expressão. <span aria-hidden="true">✦</span></span></footer>
  </div>
}
