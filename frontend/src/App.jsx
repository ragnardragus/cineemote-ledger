import { lazy, Suspense } from 'react'
import SiteLayout from './components/SiteLayout.jsx'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider.jsx'
import RequireAdmin from './auth/RequireAdmin.jsx'
import RequireCreator from './auth/RequireCreator.jsx'

const CreateEmote = lazy(() => import('./pages/CreateEmote.jsx'))
const GlobalEmotes = lazy(() => import('./pages/GlobalEmotes.jsx'))
const Login = lazy(() => import('./pages/Login.jsx'))
const MyEmotes = lazy(() => import('./pages/MyEmotes.jsx'))
const Users = lazy(() => import('./pages/Users.jsx'))
const UserForm = lazy(() => import('./pages/UserForm.jsx'))
const UserCodesPage = lazy(() => import('./pages/UserCodes.jsx'))
const AdminLayout = lazy(() => import('./components/AdminLayout.jsx'))

export default function App() {
  return <BrowserRouter><AuthProvider><Suspense fallback={<div className="route-loading" role="status">Carregando…</div>}><Routes>
    <Route path="/" element={<Navigate to="/emotes/globais" replace />} />
    <Route path="/emotes/novo" element={<CreateEmote />} />
    <Route path="/emotes/globais" element={<GlobalEmotes />} />
    <Route path="/admin/login" element={<Login key="admin" />} />
    <Route path="/login" element={<Login key="creator" creator />} />
    <Route element={<RequireCreator />}>
      <Route path="/my-emotes" element={<MyEmotes />} />
    </Route>
    <Route element={<RequireAdmin />}>
      <Route element={<AdminLayout />}>
        <Route path="/admin" element={<Navigate to="/admin/usercodes" replace />} />
        <Route path="/admin/users" element={<Users />} />
        <Route path="/admin/users/novo" element={<UserForm />} />
        <Route path="/admin/users/:id/editar" element={<UserForm />} />
        <Route path="/admin/usercodes" element={<UserCodesPage />} />
        <Route path="/admin/emotes/novo" element={<CreateEmote administrative />} />
        <Route path="/admin/emotes/globais" element={<MyEmotes key="global-admin" administrative />} />
      </Route>
    </Route>
    <Route path="*" element={<SiteLayout><main><h1>Página não encontrada</h1><Link to="/">Voltar ao início</Link></main></SiteLayout>} />
  </Routes></Suspense></AuthProvider></BrowserRouter>
}
