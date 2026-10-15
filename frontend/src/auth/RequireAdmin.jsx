import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './context.js'
import SiteLayout from '../components/SiteLayout.jsx'

export default function RequireAdmin() {
  const { user, loading, error, refresh } = useAuth()
  const location = useLocation()
  if (loading || error) return <SiteLayout><main className="login-page"><Paper component="section" variant="outlined" className="code-card">
    {loading ? <p role="status">Verificando sua sessão…</p> : <><Alert severity="error">{error}</Alert><Button variant="contained" color="primary" fullWidth onClick={() => refresh()}>Tentar novamente</Button></>}
  </Paper></main></SiteLayout>
  if (!user || user.role !== 'ADMIN') return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />
  return <Outlet />
}
