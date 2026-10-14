import { useEffect, useRef, useState } from 'react'
import SiteLayout from '../components/SiteLayout.jsx'

const emptyForm = { emote_name: '', url: '', author: '', channel: '', code: '' }

export default function CreateEmote() {
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
    if (!values.emote_name || !values.url || !values.channel || !values.code) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }
    if (values.channel.toLowerCase() === 'globalce') {
      setError('Não é permitido cadastrar emotes no channel GlobalCE.')
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
        method: 'POST', headers: { 'Content-Type': 'application/json', UserCode: code },
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

  return <SiteLayout active="emotes"><main className="emote-page">
    <div className="intro"><span className="eyebrow">MAIS EXPRESSÃO PARA A COMUNIDADE</span><h1>Um novo emote.<br /><span>Uma nova reação.</span></h1><p>Escolha a imagem, preencha os detalhes e use seu código para cadastrar.</p></div>
    <section className="code-card" aria-labelledby="form-title">
      <div className="card-heading"><span className="key-icon" aria-hidden="true">✦</span><div><h2 id="form-title">Cadastrar emote</h2><p>Campos com * são obrigatórios.</p></div></div>
      <form onSubmit={submit}><fieldset className="emote-fields" disabled={saving}>
        <div className="form-field"><label htmlFor="emote-name">Nome do emote *</label><input id="emote-name" name="emote_name" value={form.emote_name} onChange={change} required placeholder="Ex.: peepoHappy" autoComplete="off" /></div>
        <div className="form-field"><label htmlFor="emote-url">URL da imagem *</label><div className="url-controls"><input id="emote-url" name="url" value={form.url} onChange={change} required type="url" placeholder="https://.../emote.gif" aria-describedby="url-help" /><button type="button" className="preview-button" onClick={loadPreview} disabled={!form.url.trim() || previewStatus === 'loading'}>{previewStatus === 'loading' ? 'Carregando…' : 'Carregar imagem'}</button></div><p id="url-help" className="field-help">Use o link direto de uma imagem, como GIF ou PNG. Carregue a prévia para validar.</p></div>
        <div className={`image-preview ${previewStatus === 'loaded' ? 'has-image' : ''}`}>
          {preview && previewStatus !== 'error' && <img key={preview.url} src={preview.url} alt="Prévia do emote" referrerPolicy="no-referrer" style={{ display: previewStatus === 'loaded' ? 'block' : 'none' }} onLoad={(event) => { if (event.currentTarget.naturalWidth) setPreview((current) => current?.url === preview.url && current.status === 'loading' ? { ...current, status: 'loaded' } : current) }} onError={() => setPreview((current) => current?.url === preview.url ? { ...current, status: 'error' } : current)} />}
          <div role="status" aria-live="polite">{previewStatus === 'loaded' ? 'Imagem carregada' : previewStatus === 'loading' ? 'Carregando prévia…' : previewStatus === 'error' ? 'Não foi possível carregar uma imagem dessa URL. Confira o link e tente novamente.' : 'A prévia da imagem aparecerá aqui.'}</div>
        </div>
        <div className="form-columns">
          <div className="form-field"><label htmlFor="emote-author">Author <span className="optional">opcional</span></label><input id="emote-author" name="author" value={form.author} onChange={change} placeholder="Nome do autor" /></div>
          <div className="form-field"><label htmlFor="emote-channel">Channel *</label><input id="emote-channel" name="channel" value={form.channel} onChange={change} required placeholder="Nome do canal" aria-describedby="channel-help" /><p id="channel-help" className="field-help">O channel GlobalCE é reservado.</p></div>
        </div>
        <div className="form-field"><label htmlFor="emote-code">Código (UserCode) *</label><input id="emote-code" name="code" value={form.code} onChange={change} required placeholder="Cole seu UUID aqui" autoComplete="off" spellCheck="false" className="uuid-input" /><p className="field-help">O código será consumido após o cadastro. Solicite um código à administração.</p></div>
        <button className="generate-button" type="submit"><span>{saving ? 'Cadastrando…' : 'Cadastrar emote'}</span><span aria-hidden="true">↗</span></button>
      </fieldset>{error && <p className="error" role="alert">{error}</p>}{success && <p className="success-message" role="status">{success}</p>}</form>
    </section>
  </main></SiteLayout>
}
