import ButtonBase from '@mui/material/ButtonBase'
import { useState } from 'react'
import Paper from '@mui/material/Paper'

export default function EmoteTile({ emote, onClick, menuOpen = false }) {
  const [failedUrl, setFailedUrl] = useState(null)
  const contents = <>
    <span className="global-emote-image">
      {failedUrl === emote.url ? <span className="field-help">Imagem indisponível</span> : <img src={emote.url} alt={emote.emote_name} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(emote.url)} />}
    </span>
    <strong className="global-emote-name">{emote.emote_name}</strong>
    {emote.author && <span className="global-emote-author">{emote.author}</span>}
  </>
  return <Paper component="li" variant="outlined" className={onClick ? 'global-emote-card interactive-emote-card' : 'global-emote-card'}>
    {onClick ? <ButtonBase className="emote-tile-button" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') event.preventDefault() }} onClick={(event) => { if (event.detail !== 0) onClick(event) }} aria-label={`Opções de ${emote.emote_name}`} aria-haspopup="menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'emote-actions-menu' : undefined}>{contents}</ButtonBase> : contents}
  </Paper>
}

