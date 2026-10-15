import { useEffect, useState } from 'react'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import EmoteTile from '../components/EmoteTile.jsx'
import SiteLayout from '../components/SiteLayout.jsx'

export default function GlobalEmotes() {
  const [emotes, setEmotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/emotes?channel=GlobalCE&channelOnly=true', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    }).then(async (response) => {
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.error || 'Não foi possível carregar os emotes.')
      if (!Array.isArray(data)) throw new Error('A API retornou uma lista de emotes inválida.')
      if (!controller.signal.aborted) setEmotes(data)
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(['TimeoutError', 'TypeError'].includes(failure.name) ? 'Não foi possível conectar à API. Tente novamente.' : failure.message)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])

  function retry() {
    setError(''); setLoading(true); setAttempt((current) => current + 1)
  }

  return <SiteLayout><main className="global-emotes-page">
    <div className="intro"><h1>Emotes globais</h1><p>Emotes disponíveis para todos os canais.</p></div>
    <section className="global-emotes-gallery" aria-label="Emotes do GlobalCE" aria-busy={loading}>
      {loading ? <p className="global-emotes-status" role="status">Carregando emotes…</p>
        : error ? <><Alert severity="error">{error}</Alert><div className="user-form-actions"><Button onClick={retry}>Tentar novamente</Button></div></>
          : emotes.length ? <><p className="global-emotes-count">{emotes.length} {emotes.length === 1 ? 'emote disponível' : 'emotes disponíveis'}</p><ul className="global-emotes-grid">{emotes.map((emote) => <EmoteTile key={emote.id} emote={emote} />)}</ul></>
            : <p className="global-emotes-status" role="status">Nenhum emote global cadastrado por enquanto.</p>}
    </section>
  </main></SiteLayout>
}
