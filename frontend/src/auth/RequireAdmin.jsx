import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'
import SiteLayout from '../components/SiteLayout.jsx'

export default function RequireAdmin() {
  const { user, loading, error, refresh } = useAuth()
  const location = useLocation()
  if (loading || error) return <SiteLayout><main className="login-page"><section className="code-card">
    {loading ? <p role="status">Verificando sua sessão…</p> : <><p className="error" role="alert">{error}</p><button className="generate-button" onClick={() => refresh()}>Tentar novamente</button></>}
  </section></main></SiteLayout>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
