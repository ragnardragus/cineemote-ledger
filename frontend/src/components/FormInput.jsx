import TextField from '@mui/material/TextField'

// Preserve native validation and accessible labels while sharing the MUI theme.
export default function FormInput({ maxLength, minLength, pattern, spellCheck, readOnly, 'aria-label': ariaLabel, 'aria-describedby': describedBy, ...props }) {
  return <TextField {...props} slotProps={{
    htmlInput: { maxLength, minLength, pattern, spellCheck, 'aria-label': ariaLabel, 'aria-describedby': describedBy },
    input: { readOnly },
  }} />
}
