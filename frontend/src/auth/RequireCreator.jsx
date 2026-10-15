import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context.js'
import SiteLayout from '../components/SiteLayout.jsx'

export default function RequireCreator() {
  const { user, loading, error, refresh } = useAuth()
  if (loading || error) return <SiteLayout><main className="login-page">
    {loading ? <p role="status">Verificando sua sessão…</p> : <><Alert severity="error">{error}</Alert><Button onClick={refresh}>Tentar novamente</Button></>}
  </main></SiteLayout>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'CREATOR') return <Navigate to="/admin/usercodes" replace />
  return <Outlet />
}
