import Alert from '@mui/material/Alert'
import Snackbar from '@mui/material/Snackbar'

export default function ToastSnackbar({ message, onClose, severity = 'error' }) {
  return <Snackbar
    key={`${severity}:${message}`}
    open={Boolean(message)}
    autoHideDuration={6000}
    anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    onClose={(_, reason) => { if (reason !== 'clickaway') onClose() }}
  >
    <Alert severity={severity} variant="filled" onClose={onClose} sx={{ width: '100%', maxWidth: 560, mt: 0, boxShadow: 6 }}>
      {message}
    </Alert>
  </Snackbar>
}
