export const channelNameError = 'Nome do canal deve conter apenas letras de A a Z e números, sem espaços ou caracteres especiais (máximo de 120 caracteres).'

export function isValidChannelName(value) {
  return typeof value === 'string' && value.length >= 1 && value.length <= 120 && !/[^A-Za-z0-9]/.test(value)
}
