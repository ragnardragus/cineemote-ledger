import { getCookie } from 'hono/cookie'
import { verify } from 'hono/jwt'

export const COOKIE_NAME = 'cinemotes_session'
export const SESSION_SECONDS = 8 * 60 * 60
export const ISSUER = 'cinemotes-ledger'
export const AUDIENCE = 'cinemotes-admin'

export function getSecret(c) {
  if (typeof c.env.JWT_SECRET !== 'string' || c.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET ausente ou menor que 32 caracteres')
  }
  return c.env.JWT_SECRET
}

export function cookieOptions(c) {
  return { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/api' }
}

// O cabeçalho customizado exige preflight em requisições de outra origem.
// A API não habilita CORS para origens externas.
export async function requireSameOrigin(c, next) {
  if (c.req.header('X-Requested-With') !== 'Cinemotes' || c.req.header('Sec-Fetch-Site') === 'cross-site') {
    return c.json({ error: 'Requisição não autorizada' }, 403)
  }
  return next()
}

export async function requireAdmin(c, next) {
  c.header('Cache-Control', 'no-store')
  const token = getCookie(c, COOKIE_NAME)
  if (!token) return c.json({ error: 'Faça login para continuar' }, 401)
  const secret = getSecret(c)
  let payload
  try {
    payload = await verify(token, secret, { alg: 'HS256', iss: ISSUER, aud: AUDIENCE })
    if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string'
      || !Number.isInteger(payload.exp) || !Number.isInteger(payload.iat)) throw new Error('Claims inválidos')
  } catch {
    return c.json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401)
  }
  const user = await c.env.DB.prepare(
    `SELECT Users.Id, Users.Username, Users.Role FROM AuthSession
     JOIN Users ON Users.Id = AuthSession.UserId
     WHERE AuthSession.Id = ? AND Users.Id = ? AND Users.Active = 1 AND AuthSession.ExpiresAt > ?`,
  ).bind(payload.jti, payload.sub, Math.floor(Date.now() / 1000)).first()
  if (!user) return c.json({ error: 'Sessão inválida ou expirada. Faça login novamente.' }, 401)
  if (user.Role !== 'ADMIN') return c.json({ error: 'Acesso restrito à administração' }, 403)
  c.set('admin', { id: user.Id, username: user.Username, role: user.Role })
  c.set('sessionId', payload.jti)
  return next()
}
