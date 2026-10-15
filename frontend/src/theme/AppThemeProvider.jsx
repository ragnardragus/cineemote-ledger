import { useEffect, useMemo, useState } from 'react'
import { ThemeProvider } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import createCinemotesTheme from '../theme.js'
import { ThemeModeContext } from './context.js'

const storageKey = 'cinemotes-theme'

export default function AppThemeProvider({ children }) {
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem(storageKey) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
  })
  const theme = useMemo(() => createCinemotesTheme(mode), [mode])
  const context = useMemo(() => ({ mode, setMode }), [mode])

  useEffect(() => {
    try { localStorage.setItem(storageKey, mode) } catch { /* The switch also works without storage. */ }
    document.documentElement.dataset.theme = mode
  }, [mode])

  return <ThemeModeContext.Provider value={context}><ThemeProvider theme={theme}><CssBaseline />{children}</ThemeProvider></ThemeModeContext.Provider>
}
