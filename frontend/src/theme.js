import colors from './colors.js'
import { createTheme } from '@mui/material/styles'

export default function createCinemotesTheme(mode = 'dark') {
  const dark = mode === 'dark'
  const surface = {
    ...colors,
    ink: dark ? '#FFF7E8' : colors.ink,
    brown: dark ? '#D8C7A5' : colors.brown,
    background: dark ? '#101010' : colors.background,
    paper: dark ? '#241E16' : '#FFFFFF',
    tint: dark ? '#3A3018' : colors.tint,
    border: dark ? '#65532D' : colors.border,
    highlight: dark ? '#514416' : colors.yellow,
  }
  const accent = dark ? colors.yellow : colors.brown
  return createTheme({
  palette: {
    mode,
    primary: { main: colors.yellow, light: surface.tint, dark: colors.gold, contrastText: colors.ink },
    secondary: { main: accent, contrastText: dark ? colors.ink : '#ffffff' },
    background: { default: surface.background, paper: surface.paper },
    text: { primary: surface.ink, secondary: surface.brown },
    divider: surface.border,
  },
  typography: { fontFamily: "Inter, 'Segoe UI', sans-serif", fontSize: 14, button: { textTransform: 'none', fontWeight: 700 } },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: { styleOverrides: {
      ':root': Object.fromEntries(Object.entries(surface).map(([name, value]) => [`--cinemotes-${name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase())}`, value])),
      html: { colorScheme: mode },
    } },
    MuiButton: {
      defaultProps: { disableElevation: true, variant: 'outlined', color: 'secondary' },
      styleOverrides: { root: { minHeight: 40, padding: '9px 16px' }, containedPrimary: { border: `1px solid ${colors.gold}`, '&:hover': { backgroundColor: colors.yellowHover } } },
    },
    MuiTextField: { defaultProps: { variant: 'outlined', size: 'small', fullWidth: true } },
    MuiOutlinedInput: { styleOverrides: {
      root: { backgroundColor: surface.background, '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: accent } },
      notchedOutline: { borderColor: surface.border },
      input: {
        '&:autofill': {
          boxShadow: `0 0 0 1000px ${surface.tint} inset`,
          color: surface.ink,
          caretColor: surface.ink,
          borderRadius: 'inherit',
        },
        '&:-webkit-autofill': {
          WebkitBoxShadow: `0 0 0 1000px ${surface.tint} inset`,
          WebkitTextFillColor: surface.ink,
          caretColor: surface.ink,
          borderRadius: 'inherit',
        },
      },
    } },
    MuiPaper: { defaultProps: { elevation: 0 }, styleOverrides: { outlined: { borderColor: surface.border } } },
    MuiAlert: { styleOverrides: { root: { marginTop: 16, lineHeight: 1.6 } } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 700, backgroundColor: surface.tint }, root: { borderColor: surface.border } } },
    MuiListItemButton: { styleOverrides: { root: { borderRadius: 8, '&.active': { backgroundColor: surface.tint, color: surface.ink }, '&:hover': { backgroundColor: dark ? surface.tint : colors.yellow } } } },
    MuiIconButton: { styleOverrides: { root: { color: accent } } },
  },
  })
}
