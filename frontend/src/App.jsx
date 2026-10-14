import { useState } from 'react'
import SiteLayout from './components/SiteLayout.jsx'
import CreateEmote from './pages/CreateEmote.jsx'
import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import AuthProvider from './auth/AuthProvider.jsx'
import RequireAdmin from './auth/RequireAdmin.jsx'
import { useAuth } from './auth/context.js'
import Login from './pages/Login.jsx'

function UserCodesPage() {
  const { user, invalidate } = useAuth()
  const [quantity, setQuantity] = useState(1)
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  async function generateCodes() {
    if (loading) return
    setLoading(true)
    setError('')
    setCopyMessage('')
    try {
      const response = await fetch('/api/usecode/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes' },
        credentials: 'same-origin',
        body: JSON.stringify({ quantity }),
        signal: AbortSignal.timeout(15000),
      })
      const data = await response.json().catch(() => null)
      if (response.status === 401) { invalidate(); return }
      if (!response.ok) throw new Error(data?.error || 'Não foi possível gerar os códigos. Tente novamente.')
      if (!Array.isArray(data?.UUIDs) || data.UUIDs.length !== quantity || data.UUIDs.some((code) => typeof code !== 'string' || !code)) {
        throw new Error('A API retornou uma resposta inválida.')
      }
      setCodes(data.UUIDs)
    } catch (failure) {
      setError(failure instanceof TypeError || ['TimeoutError', 'AbortError'].includes(failure.name)
        ? 'Não foi possível conectar à API. Tente novamente em instantes.' : failure.message)
    } finally {
      setLoading(false)
    }
  }

  async function copyCodes(value, all = false) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyMessage(all && codes.length > 1 ? 'Todos os códigos foram copiados!' : 'Código copiado!')
    } catch {
      setCopyMessage('Não foi possível copiar. Selecione o código e copie manualmente.')
    }
  }

  return (
    <SiteLayout active="codes">
      <main>
        <div className="intro">
          <span className="eyebrow">ADMINISTRAÇÃO · {user.username}</span>
          <h1>Boas ideias merecem<br /><span>um código de acesso.</span></h1>
          <p>Crie, edite ou exclua um emote com um UserCode.<br className="desktop-break" /> Gere até 15 de uma vez e deixe as próximas ideias prontas.</p>
        </div>
        <section className="code-card" aria-labelledby="code-title" aria-busy={loading}>
          <div className="card-heading">
            <span className="key-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="9" r="4" /><path d="m11 12 8 8m-3-3 3-3m-6 0 3-3" /></svg></span>
            <div><h2 id="code-title">Gerar UserCodes</h2><p>Um código para cada alteração.</p></div>
            <span className="limit-tag">ATÉ 15</span>
          </div>
          <div className="quantity-section">
            <div className="quantity-label"><label htmlFor="quantity">Quantos códigos você precisa?</label><span>Escolha de 1 a 15</span></div>
            <div className="quantity-controls">
              <select id="quantity" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={loading}>
                {Array.from({ length: 15 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} {value === 1 ? 'código' : 'códigos'}</option>)}
              </select>
              <div className="presets" aria-label="Quantidades rápidas">{[1, 5, 10, 15].map((value) => <button key={value} className={quantity === value ? 'preset selected' : 'preset'} onClick={() => setQuantity(value)} aria-pressed={quantity === value} aria-label={`${value} ${value === 1 ? 'código' : 'códigos'}`} disabled={loading}>{value}</button>)}</div>
            </div>
          </div>
          <button className="generate-button" onClick={generateCodes} disabled={loading}>
            <span>{loading ? 'Gerando seus códigos…' : `Gerar ${quantity === 1 ? 'código' : quantity + ' códigos'}`}</span>
            <span aria-hidden="true">{loading ? '…' : '↗'}</span>
          </button>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="results">
            <div className="results-heading"><h3>{codes.length ? `SEUS CÓDIGOS (${codes.length})` : 'SEUS CÓDIGOS'}</h3>{codes.length > 0 && <button className="copy-all" onClick={() => copyCodes(codes.join('\n'), true)} disabled={loading}>{codes.length > 1 ? 'Copiar todos' : 'Copiar código'}</button>}</div>
            {codes.length > 0 ? <ol className="code-list">{codes.map((code, index) => <li key={code}>
              <span className="code-number">{String(index + 1).padStart(2, '0')}</span>
              <input aria-label={`Código ${index + 1}`} value={code} readOnly spellCheck="false" />
              <button className="copy-code" onClick={() => copyCodes(code)} aria-label={`Copiar código ${index + 1}`} disabled={loading}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M15 8V4H4v11h4" /></svg></button>
            </li>)}</ol> : <div className="empty-state"><span aria-hidden="true">✦</span><p>Seus próximos códigos estão a um clique.</p><span>Escolha a quantidade e clique em gerar.</span></div>}
          </div>
          <p className="feedback" role="status" aria-live="polite">{copyMessage || (codes.length ? `${codes.length === 1 ? '1 código gerado' : codes.length + ' códigos gerados'} com sucesso. Copie e use quando precisar.` : '')}</p>
          <p className="card-note"><span aria-hidden="true">●</span> Cada código é consumido após uma alteração concluída.</p>
        </section>
        <ol className="steps">
          <li><span>01</span><div><h3>Escolha e gere</h3><p>De 1 a 15 códigos por vez.</p></div></li>
          <li><span>02</span><div><h3>Copie seus códigos</h3><p>Um por vez ou todos juntos.</p></div></li>
          <li><span>03</span><div><h3>Dê vida às ideias</h3><p>Um código, uma alteração.</p></div></li>
        </ol>
      </main>
    </SiteLayout>
  )
}

export default function App() {
  return <BrowserRouter><AuthProvider><Routes>
    <Route path="/" element={<Navigate to="/emotes/novo" replace />} />
    <Route path="/emotes/novo" element={<CreateEmote />} />
    <Route path="/login" element={<Login />} />
    <Route element={<RequireAdmin />}><Route path="/admin/usercodes" element={<UserCodesPage />} /></Route>
    <Route path="*" element={<SiteLayout><main><h1>Página não encontrada</h1><Link to="/emotes/novo">Voltar ao início</Link></main></SiteLayout>} />
  </Routes></AuthProvider></BrowserRouter>
}
