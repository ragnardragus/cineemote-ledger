import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import FormInput from '../components/FormInput.jsx'
import { Fragment, useRef, useState } from 'react'
import SiteLayout from '../components/SiteLayout.jsx'
import EmoteImagePicker from '../components/EmoteImagePicker.jsx'
import ToastSnackbar from '../components/ToastSnackbar.jsx'

const emptyForm = { emote_name: '', url: '', channel: '', code: '' }

export default function CreateEmote({ administrative = false }) {
  const Layout = administrative ? Fragment : SiteLayout
  const [form, setForm] = useState(emptyForm)
  const [source, setSource] = useState('file')
  const [file, setFile] = useState(null)
  const [fileVersion, setFileVersion] = useState(0)
  const [imageReady, setImageReady] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)

  function change(event) {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
    setError('')
    setSuccess('')
  }

  async function submit(event) {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    setSuccess('')
    const values = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, value.trim()]))
    if (!values.emote_name || (source === 'url' ? !values.url : !file) || (!values.channel || !values.code)) {
      setError('Preencha todos os campos obrigatórios.')
      return
    }
    if (!imageReady) {
      setError('Selecione um arquivo ou verifique o link da imagem antes de cadastrar.')
      return
    }
    submitting.current = true
    setSaving(true)
    try {
      const { code, ...body } = values
      let requestBody = JSON.stringify(body)
      const headers = { 'X-Requested-With': 'Cinemotes', UserCode: code }
      if (source === 'file') {
        const data = new FormData()
        data.set('emote_name', body.emote_name); data.set('channel', body.channel); data.set('image', file)
        requestBody = data
      } else headers['Content-Type'] = 'application/json'
      const response = await fetch('/api/emotes', {
        method: 'POST', credentials: 'same-origin', headers,
        body: requestBody, signal: AbortSignal.timeout(30000),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível cadastrar o emote.')
      setSuccess(`Emote ${data.emote_name} cadastrado com sucesso! Seu UserCode foi consumido.`)
      setForm(emptyForm)
      setImageReady(false)
      setFile(null)
      setFileVersion((value) => value + 1)
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
        <EmoteImagePicker key={fileVersion} source={source} onSource={setSource} onFile={setFile} disabled={saving} onError={setError} url={form.url} onUrlChange={(url) => setForm((current) => ({ ...current, url }))} onReady={setImageReady} />
        <div>
          <div className="form-field"><label htmlFor="emote-channel">Nome do canal *</label><FormInput id="emote-channel" name="channel" pattern="[A-Za-z0-9]{1,120}" title="Use apenas letras de A a Z e números, sem espaços ou caracteres especiais." value={form.channel} onChange={change} required placeholder="Nome do canal" maxLength={120} aria-describedby="channel-help"  disabled={saving}/><p id="channel-help" className="field-help">Use apenas letras de A a Z e números, sem espaços ou caracteres especiais. Se o canal não existir, ele será criado. O canal GlobalCE é reservado.</p></div>
        </div>
        <div className="form-field"><label htmlFor="emote-code">Código (UserCode) *</label><FormInput id="emote-code" name="code" value={form.code} onChange={change} required placeholder="Cole seu UUID aqui" autoComplete="off" spellCheck="false" className="uuid-input"  disabled={saving}/><p className="field-help">O código será consumido após o cadastro. Solicite um código à administração.</p></div>
        <div className="user-form-actions"><Button variant="contained" color="primary" size="small" type="submit" disabled={saving}>{saving ? 'Cadastrando…' : 'Cadastrar emote'}</Button></div>
      </fieldset></form>
    </Paper>
    <ToastSnackbar message={error || success} severity={error ? 'error' : 'success'} onClose={() => { setError(''); setSuccess('') }} />
  </main></Layout>
}
