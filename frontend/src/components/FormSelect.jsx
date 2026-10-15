import TextField from '@mui/material/TextField'

export default function FormSelect({ children, ...props }) {
  return <TextField {...props} select slotProps={{ select: { native: true } }}>{children}</TextField>
}
