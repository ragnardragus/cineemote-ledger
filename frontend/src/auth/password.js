// O trabalho pesado acontece no navegador, fora do limite de CPU do Worker.
export async function derivePasswordProof(password, salt, iterations = 600000) {
  if (typeof password !== 'string' || !/^[0-9a-f]{32}$/.test(salt) || iterations !== 600000) {
    throw new Error('Parâmetros de autenticação inválidos')
  }
  if (!globalThis.crypto?.subtle) throw new Error('O login precisa de HTTPS ou localhost.')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bytes = Uint8Array.from(salt.match(/../g), (value) => parseInt(value, 16))
  const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: bytes, iterations }, key, 256)
  return Array.from(new Uint8Array(result), (value) => value.toString(16).padStart(2, '0')).join('')
}
