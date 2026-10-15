import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import FormInput from '../components/FormInput.jsx'
import { Fragment, useEffect, useRef, useState } from 'react'
import SiteLayout from '../components/SiteLayout.jsx'

const emptyForm = { emote_name: '', url: '', author: '', channel: '', code: '' }

export default function CreateEmote({ administrative = false }) {
  const Layout = administrative ? Fragment : SiteLayout
  const [form, setForm] = useState(emptyForm)
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  const previewUrl = preview?.url
  const previewStatus = preview?.status

  useEffect(() => {
    if (previewStatus !== 'loading') return
    const timer = setTimeout(() => setPreview((current) => current?.url === previewUrl && current.status === 'loading' ? { ...current, status: 'error' } : current), 15000)
    return () => clearTimeout(timer)
  }, [previewUrl, previewStatus])

  function change(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
    setSuccess('')
    if (name === 'url') setPreview(null)
  }

  function loadPreview() {
    setError('')
    try {
      const url = new URL(form.url.trim())
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error()
      setPreview({ url: url.href, status: 'loading' })
    } catch {
      setPreview(null)
      setError('Informe uma URL HTTP ou HTTPS válida para carregar a imagem.')
    }
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    setSuccess('')
    const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
    if (!values.emote_name || !values.url || (!values.channel || !values.code)) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }
    if (!preview || preview.status !== 'loaded') {
      setError('Clique em Carregar imagem e aguarde a prévia antes de cadastrar.')
      return
    }
    submitting.current = true
    setSaving(true)
    try {
      const { code, ...body } = values
      const response = await fetch('/api/emotes', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes', UserCode: code },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível cadastrar o emote.')
      setSuccess(`Emote ${data.emote_name} cadastrado com sucesso! Seu UserCode foi consumido.`)
      setForm(emptyForm)
      setPreview(null)
    } catch (failure) {
      setError(failure instanceof TypeError || ['TimeoutError', 'AbortError'].includes(failure.name)
        ? 'Não foi possível confirmar o cadastro. Confira os emotes antes de tentar novamente, pois o código pode ter sido consumido.' : failure.message)
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return <Layout><main className="emote-page">
    <div className="intro"><h1>Cadastrar um novo emote.</h1><p>Escolha a imagem, preencha os detalhes e use seu código para cadastrar.</p></div>
    <Paper component="section" variant="outlined" className="code-card" aria-labelledby="form-title">
      <div className="card-heading"><span className="key-icon" aria-hidden="true">✦</span><div><h2 id="form-title">Cadastrar Emote</h2></div></div>
      <form onSubmit={submit}><fieldset className="emote-fields" disabled={saving}>
        <div className="form-field"><label htmlFor="emote-name">Nome do emote *</label><FormInput id="emote-name" name="emote_name" value={form.emote_name} onChange={change} required placeholder="Ex.: peepoHappy" autoComplete="off"  disabled={saving}/></div>
        <div className="form-field"><label htmlFor="emote-url">URL da imagem *</label><div className="url-controls"><FormInput id="emote-url" name="url" value={form.url} onChange={change} required type="url" placeholder="https://.../emote.gif" aria-describedby="url-help"  disabled={saving}/><Button type="button" className="preview-button" onClick={loadPreview} disabled={!form.url.trim() || previewStatus === 'loading'}>{previewStatus === 'loading' ? 'Carregando…' : 'Carregar imagem'}</Button></div><p id="url-help" className="field-help">Use o link direto de uma imagem, como GIF ou PNG. Carregue a prévia para validar.</p></div>
        <div className={`image-preview ${previewStatus === 'loaded' ? 'has-image' : ''}`}>
          {preview && previewStatus !== 'error' && <img key={preview.url} src={preview.url} alt="Prévia do emote" referrerPolicy="no-referrer" style={{ display: previewStatus === 'loaded' ? 'block' : 'none' }} onLoad={(event) => { if (event.currentTarget.naturalWidth) setPreview((current) => current?.url === preview.url && current.status === 'loading' ? { ...current, status: 'loaded' } : current) }} onError={() => setPreview((current) => current?.url === preview.url ? { ...current, status: 'error' } : current)} />}
          <div role="status" aria-live="polite">{previewStatus === 'loaded' ? 'Imagem carregada' : previewStatus === 'loading' ? 'Carregando prévia…' : previewStatus === 'error' ? 'Não foi possível carregar uma imagem dessa URL. Confira o link e tente novamente.' : 'A prévia da imagem aparecerá aqui.'}</div>
        </div>
        <div className="form-columns">
          <div className="form-field"><label htmlFor="emote-author">Author</label><FormInput id="emote-author" name="author" value={form.author} onChange={change} placeholder="Nome do autor"  disabled={saving}/></div>
          <div className="form-field"><label htmlFor="emote-channel">Nome do canal *</label><FormInput id="emote-channel" name="channel" pattern="[A-Za-z0-9]{1,120}" title="Use apenas letras de A a Z e números, sem espaços ou caracteres especiais." value={form.channel} onChange={change} required placeholder="Nome do canal" maxLength={120} aria-describedby="channel-help"  disabled={saving}/><p id="channel-help" className="field-help">Use apenas letras de A a Z e números, sem espaços ou caracteres especiais. Se o canal não existir, ele será criado. O canal GlobalCE é reservado.</p></div>
        </div>
        <div className="form-field"><label htmlFor="emote-code">Código (UserCode) *</label><FormInput id="emote-code" name="code" value={form.code} onChange={change} required placeholder="Cole seu UUID aqui" autoComplete="off" spellCheck="false" className="uuid-input"  disabled={saving}/><p className="field-help">O código será consumido após o cadastro. Solicite um código à administração.</p></div>
        <div className="user-form-actions"><Button variant="contained" color="primary" size="small" type="submit" disabled={saving}>{saving ? 'Cadastrando…' : 'Cadastrar emote'}</Button></div>
      </fieldset>{error && <Alert severity="error">{error}</Alert>}{success && <Alert severity="success" role="status">{success}</Alert>}</form>
    </Paper>
  </main></Layout>
}
