import { Outlet } from 'react-router-dom'
import SiteLayout from './SiteLayout.jsx'

export default function AdminLayout() {
  return <SiteLayout administrative><Outlet /></SiteLayout>
}
