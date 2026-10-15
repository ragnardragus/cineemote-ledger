import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import { useThemeMode } from '../theme/context.js'

export default function ThemeSwitch() {
  const { mode, setMode } = useThemeMode()
  return <FormControlLabel className="theme-switch" label="Tema escuro"
    control={<Switch size="small" checked={mode === 'dark'} onChange={(event) => setMode(event.target.checked ? 'dark' : 'light')} slotProps={{ input: { 'aria-label': 'Tema escuro' } }} />} />
}
