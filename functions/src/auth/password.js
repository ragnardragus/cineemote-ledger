export const PASSWORD_ITERATIONS = 600000
const RECORD_PREFIX = 'client-pbkdf2-sha256'

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function parsePasswordRecord(record) {
  if (typeof record !== 'string') return null
  const [scheme, iterations, salt, verifier, extra] = record.split('$')
  if (scheme !== RECORD_PREFIX || iterations !== String(PASSWORD_ITERATIONS)
    || !/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(verifier) || extra !== undefined) return null
  return { salt, verifier }
}

export async function createPasswordRecord(proof, salt) {
  if (!/^[0-9a-f]{64}$/.test(proof) || !/^[0-9a-f]{32}$/.test(salt)) throw new Error('Formato de credencial inválido')
  const bytes = Uint8Array.from(proof.match(/../g), (value) => parseInt(value, 16))
  const verifier = toHex(await crypto.subtle.digest('SHA-256', bytes))
  return `${RECORD_PREFIX}$${PASSWORD_ITERATIONS}$${salt}$${verifier}`
}

export async function verifyPasswordProof(proof, record) {
  const parsed = parsePasswordRecord(record)
  const validFormat = typeof proof === 'string' && /^[0-9a-f]{64}$/.test(proof)
  const bytes = validFormat ? Uint8Array.from(proof.match(/../g), (value) => parseInt(value, 16)) : new Uint8Array(32)
  const digest = toHex(await crypto.subtle.digest('SHA-256', bytes))
  const expected = parsed?.verifier || '0'.repeat(64)
  // Comparação de tamanho fixo, sem parar no primeiro caractere diferente.
  let difference = 0
  for (let index = 0; index < 64; index++) difference |= digest.charCodeAt(index) ^ expected.charCodeAt(index)
  return !!parsed && validFormat && difference === 0
}

export async function dummySalt(username, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`login-salt:${username.toLowerCase()}`))).slice(0, 32)
}
