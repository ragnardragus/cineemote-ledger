import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import { useState } from 'react'
import { useAuth } from '../auth/context.js'
import FormInput from '../components/FormInput.jsx'
import FormSelect from '../components/FormSelect.jsx'

export default function UserCodesPage() {
  const { invalidate } = useAuth()
  const [quantity, setQuantity] = useState(1)
  const [receiver, setReceiver] = useState('')
  const [codes, setCodes] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [copyMessage, setCopyMessage] = useState('')

  async function generateCodes() {
    if (loading) return
    if (!receiver.trim()) {
      setError('Informe o destinatário dos códigos.')
      return
    }
    setLoading(true)
    setError('')
    setCopyMessage('')
    try {
      const response = await fetch('/api/usecode/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes' },
        credentials: 'same-origin',
        body: JSON.stringify({ quantity, receiver: receiver.trim() }),
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
    <>
      <main>
        <div className="intro">
          <h1>Gere novos códigos de usuário</h1>
          <p>É possível gerar um ou mais códigos para cadastrar novos emotes.</p>
        </div>
        <Paper component="section" variant="outlined" className="code-card" aria-labelledby="code-title" aria-busy={loading}>
          <div className="card-heading">
            <span className="key-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="8" cy="9" r="4" /><path d="m11 12 8 8m-3-3 3-3m-6 0 3-3" /></svg></span>
            <div><h2 id="code-title">Gerar UserCodes</h2><p>Um código para cada alteração.</p></div>
          </div>
          <div className="form-field">
            <label htmlFor="receiver">Destinatário (Receiver) *</label>
            <FormInput id="receiver" value={receiver} onChange={(event) => setReceiver(event.target.value)} required maxLength={120} disabled={loading} placeholder="Nome ou @usuário de quem receberá os códigos" aria-describedby="receiver-help" />
            <p id="receiver-help" className="field-help">Todos os códigos deste lote serão identificados com esse destinatário.</p>
          </div>
          <div className="quantity-section">
            <div className="quantity-label"><label htmlFor="quantity">Quantos códigos você precisa?</label><span>Escolha de 1 a 15</span></div>
            <div className="quantity-controls">
              <FormSelect id="quantity" value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} disabled={loading}>
                {Array.from({ length: 15 }, (_, index) => index + 1).map((value) => <option key={value} value={value}>{value} {value === 1 ? 'código' : 'códigos'}</option>)}
              </FormSelect>
              <div className="presets" aria-label="Quantidades rápidas">{[1, 5, 10, 15].map((value) => <Button key={value} variant={quantity === value ? 'contained' : 'outlined'} color={quantity === value ? 'primary' : 'secondary'} className="preset" onClick={() => setQuantity(value)} aria-pressed={quantity === value} aria-label={`${value} ${value === 1 ? 'código' : 'códigos'}`} disabled={loading}>{value}</Button>)}</div>
            </div>
          </div>
          <div className="user-form-actions">
          <Button variant="contained" color="primary" size="small" onClick={generateCodes} disabled={loading}>
            <span>{loading ? 'Gerando seus códigos…' : `Gerar ${quantity === 1 ? 'código' : quantity + ' códigos'}`}</span>
          </Button>
          </div>
          {error && <Alert severity="error">{error}</Alert>}
          <div className="results">
            <div className="results-heading"><h3>{codes.length ? `SEUS CÓDIGOS (${codes.length})` : 'SEUS CÓDIGOS'}</h3>{codes.length > 0 && <Button variant="text" className="copy-all" onClick={() => copyCodes(codes.join('\n'), true)} disabled={loading}>{codes.length > 1 ? 'Copiar todos' : 'Copiar código'}</Button>}</div>
            {codes.length > 0 ? <ol className="code-list">{codes.map((code, index) => <li key={code}>
              <span className="code-number">{String(index + 1).padStart(2, '0')}</span>
              <FormInput aria-label={`Código ${index + 1}`} value={code} readOnly spellCheck="false"  disabled={loading}/>
              <Button className="copy-code" onClick={() => copyCodes(code)} aria-label={`Copiar código ${index + 1}`} disabled={loading}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M15 8V4H4v11h4" /></svg></Button>
            </li>)}</ol> : <div className="empty-state"><span aria-hidden="true">✦</span><p>Seus próximos códigos estão a um clique.</p><span>Escolha a quantidade e clique em gerar.</span></div>}
          </div>
          <p className="feedback" role="status" aria-live="polite">{copyMessage || (codes.length ? `${codes.length === 1 ? '1 código gerado' : codes.length + ' códigos gerados'} com sucesso. Copie e use quando precisar.` : '')}</p>
          <p className="card-note"><span aria-hidden="true">●</span> Cada código é consumido após uma alteração concluída.</p>
        </Paper>
        <ol className="steps">
          <li><span>01</span><div><h3>Escolha e gere</h3><p>De 1 a 15 códigos por vez.</p></div></li>
          <li><span>02</span><div><h3>Copie seus códigos</h3><p>Um por vez ou todos juntos.</p></div></li>
          <li><span>03</span><div><h3>Dê vida às ideias</h3><p>Um código, uma alteração.</p></div></li>
        </ol>
      </main>
    </>
  )
}

