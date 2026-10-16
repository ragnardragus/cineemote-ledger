import { useEffect, useId, useRef, useState } from 'react'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import FormInput from './FormInput.jsx'

function ImageIcon({ kind, ...props }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    {kind === 'check' ? <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>
      : kind === 'upload' ? <><path d="M12 16V4m-4 4 4-4 4 4M5 16v4h14v-4" /></>
        : kind === 'remove' ? <><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7m4-7v7" /></>
        : kind === 'replace' ? <><path d="M20 8a8 8 0 0 0-13-3L4 8m0-5v5h5M4 16a8 8 0 0 0 13 3l3-3m0 5v-5h-5" /></>
        : kind === 'link' ? <><path d="m10 13 4-4m-6 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m0 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-2 2" transform="translate(1 1) scale(.9)" /></>
        : kind === 'info' ? <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>
          : <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8" cy="8" r="1.5" /><path d="m4 19 6-6 3 3 4-6 4 6" /></>}
  </svg>
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.referrerPolicy = 'no-referrer'
    const finish = (error) => {
      clearTimeout(timer); image.onload = null; image.onerror = null
      if (error) { image.src = ''; reject(error) }
      else resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    const timer = setTimeout(() => finish(new Error('A imagem demorou para carregar. Tente novamente.')), 12000)
    image.onload = () => finish()
    image.onerror = () => finish(new Error('Não foi possível carregar a imagem. Confira o arquivo ou link.'))
    image.src = url
  })
}

export default function EmoteImagePicker({ source, onSource, onFile, disabled, onError, url, onUrlChange, onReady }) {
  const [preview, setPreview] = useState(null)
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)
  const input = useRef(null), request = useRef(0), blob = useRef(null)
  const id = useId()
  useEffect(() => () => {
    request.current++
    if (blob.current) URL.revokeObjectURL(blob.current)
  }, [])

  function clear() {
    dragDepth.current = 0; setDragging(false)
    request.current++
    if (blob.current) { URL.revokeObjectURL(blob.current); blob.current = null }
    setPreview(null); onFile(null); onReady(false); onError('')
    if (input.current) input.current.value = ''
  }

  async function verify(file = null) {
    clear()
    const current = request.current
    let src
    try {
      if (file) {
        if (!file.size || file.size > 1048576) throw new Error('A imagem deve ter no máximo 1 MB.')
        const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer())
        const signature = String.fromCharCode(...bytes)
        if (!signature.startsWith('GIF87a') && !signature.startsWith('GIF89a') && signature !== '\x89PNG\r\n\x1a\n' && !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)) throw new Error('Selecione uma imagem GIF, JPG ou PNG.')
        if (request.current !== current) return
        src = URL.createObjectURL(file); blob.current = src
      } else {
        const parsed = new URL(url.trim())
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Informe uma URL HTTP ou HTTPS válida.')
        src = parsed.href
      }
      setPreview({ status: 'loading' })
      const dimensions = await loadImage(src)
      if (request.current !== current) return
      if (!dimensions.width || !dimensions.height || dimensions.width > 200 || dimensions.height > 200) throw new Error('A imagem deve ter largura e altura de até 200 pixels.')
      let name = file?.name || 'Imagem por link'
      if (!file) {
        try { name = decodeURIComponent(new URL(src).pathname.split('/').pop()) || name } catch { /* Keep fallback. */ }
      }
      setPreview({ status: 'loaded', src, name, ...dimensions, bytes: file?.size })
      onFile(file); onReady(true)
    } catch (error) {
      if (request.current !== current) return
      clear(); onError(error instanceof TypeError ? 'Informe uma URL HTTP ou HTTPS válida.' : error.message)
    }
  }

  const loaded = preview?.status === 'loaded', loading = preview?.status === 'loading'
  const isFileDrag = (event) => Array.from(event.dataTransfer.types).includes('Files')
  return <section className={`emote-image-picker ${loaded ? 'is-loaded' : ''} ${dragging ? 'is-dragging' : ''}`} aria-label="Imagem do emote" aria-busy={loading}
    onDragEnter={(event) => {
      if (source !== 'file' || !isFileDrag(event)) return
      event.preventDefault()
      if (!disabled && !loading) { dragDepth.current++; setDragging(true) }
    }}
    onDragOver={(event) => {
      if (source !== 'file' || !isFileDrag(event)) return
      event.preventDefault()
      event.dataTransfer.dropEffect = disabled || loading ? 'none' : 'copy'
    }}
    onDragLeave={() => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (!dragDepth.current) setDragging(false)
    }}
    onDrop={(event) => {
      if (source !== 'file') return
      event.preventDefault(); event.stopPropagation()
      dragDepth.current = 0; setDragging(false)
      if (disabled || loading) return
      const files = Array.from(event.dataTransfer.files)
      if (files.length !== 1) { onError('Arraste apenas um arquivo de imagem por vez.'); return }
      void verify(files[0])
    }}>
    <input ref={input} className="emote-image-file-input" type="file" accept="image/gif,image/jpeg,image/png" aria-label="Escolher imagem do emote" disabled={disabled} tabIndex={-1} onChange={(event) => { const file = event.target.files?.[0]; if (file) void verify(file) }} />
    {loaded ? <div className="emote-image-summary">
      <div className="emote-image-thumbnail"><img src={preview.src} alt="Prévia do emote" referrerPolicy="no-referrer" /></div>
      <div className="emote-image-details">
        <div className="emote-image-status" role="status"><ImageIcon kind="check" /><span>Imagem carregada</span></div>
        <span className="emote-image-filename" title={preview.name}>{preview.name}</span>
        <span className="emote-image-metadata">{preview.width} × {preview.height} px{preview.bytes !== undefined ? ` · ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(preview.bytes / 1024)} KB` : ''}</span>
      </div>
      <div className="emote-image-actions">
        {source === 'file' && <Tooltip title="Trocar arquivo"><span><IconButton type="button" size="small" aria-label="Trocar arquivo" disabled={disabled} onClick={() => input.current?.click()}><ImageIcon kind="replace" /></IconButton></span></Tooltip>}
        <Tooltip title="Remover imagem"><span><IconButton type="button" size="small" className="emote-image-remove" aria-label="Remover imagem" disabled={disabled} onClick={() => { clear(); onUrlChange('') }}><ImageIcon kind="remove" /></IconButton></span></Tooltip>
      </div>
    </div> : <>
      <p className="emote-image-label">Imagem do emote <span>*</span></p>
      <div className="emote-image-tabs" role="group" aria-label="Origem da imagem">
        <Button type="button" variant="text" startIcon={<ImageIcon kind="upload" width="17" height="17" />} aria-pressed={source === 'file'} disabled={disabled} onClick={() => { clear(); onSource('file') }}>Enviar arquivo</Button>
        <Button type="button" variant="text" startIcon={<ImageIcon kind="link" width="17" height="17" />} aria-pressed={source === 'url'} disabled={disabled} onClick={() => { clear(); onSource('url') }}>Usar link</Button>
      </div>
      {source === 'file' ? <div className="emote-image-dropzone">
        <ImageIcon width="27" height="27" />
        <span role="status">{loading ? 'Verificando imagem…' : dragging ? 'Solte a imagem aqui' : 'Arraste uma imagem aqui ou escolha um arquivo'}</span>
        <small>GIF, JPG ou PNG</small>
        <Button type="button" variant="contained" size="small" disabled={disabled || loading} startIcon={<ImageIcon kind="upload" width="15" height="15" />} onClick={() => input.current?.click()}>Escolher arquivo</Button>
      </div> : <div className="emote-image-url">
        <label htmlFor={id}>URL da imagem</label>
        <div className="emote-image-url-controls">
          <FormInput id={id} type="url" value={url} disabled={disabled || loading} placeholder="https://exemplo.com/emote.png" onChange={(event) => { clear(); onUrlChange(event.target.value) }} />
          <Button type="button" variant="contained" color="primary" className="emote-image-verify" disabled={disabled || loading || !url.trim()} onClick={() => void verify()}>{loading ? 'Verificando…' : 'Verificar imagem'}</Button>
        </div>
      </div>}
      <p className="emote-image-limits"><ImageIcon kind="info" width="14" height="14" /><span>Tamanho máximo: 1 MB · Dimensões máximas: 200 × 200 px</span></p>
    </>}
  </section>
}
