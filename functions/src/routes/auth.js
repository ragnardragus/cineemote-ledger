import { Hono } from 'hono'
import { compare } from 'bcryptjs'
import { setCookie, deleteCookie } from 'hono/cookie'
import { sign } from 'hono/jwt'
import { bodyLimit } from 'hono/body-limit'
import { AUDIENCE, COOKIE_NAME, ISSUER, SESSION_SECONDS, cookieOptions, getSecret, requireAdmin, requireSameOrigin } from '../auth/security.js'

const auth = new Hono()
auth.use('*', async (c, next) => { c.header('Cache-Control', 'no-store'); return next() })
auth.use('*', bodyLimit({ maxSize: 4096, onError: (c) => c.json({ error: 'Requisição muito grande' }, 413) }))

auth.post('/login', requireSameOrigin, async (c) => {
  if (!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) {
    return c.json({ error: 'Envie username e password em JSON' }, 400)
  }
  let body
  try { body = await c.req.json() } catch { return c.json({ error: 'JSON inválido' }, 400) }
  if (!body || typeof body.username !== 'string' || !body.username.trim() || body.username.length > 64
    || typeof body.password !== 'string' || !body.password || new TextEncoder().encode(body.password).length > 72) {
    return c.json({ error: 'Informe usuário e senha válidos' }, 400)
  }
  const secret = getSecret(c)
  const now = Math.floor(Date.now() / 1000)
  const username = body.username.trim()
  const bucket = username.toLowerCase()
  const throttle = await c.env.DB.prepare(
    `INSERT INTO LoginThrottle (Bucket, Attempts, ResetAt) VALUES (?, 1, ?)
     ON CONFLICT (Bucket) DO UPDATE SET
       Attempts = CASE WHEN ResetAt <= ? THEN 1 ELSE Attempts + 1 END,
       ResetAt = CASE WHEN ResetAt <= ? THEN excluded.ResetAt ELSE ResetAt END
     RETURNING Attempts, ResetAt`,
  ).bind(bucket, now + 900, now, now).first()
  if (throttle.Attempts > 5) {
    c.header('Retry-After', String(Math.max(1, throttle.ResetAt - now)))
    return c.json({ error: 'Muitas tentativas. Aguarde 15 minutos e tente novamente.' }, 429)
  }
  const user = await c.env.DB.prepare('SELECT * FROM Users WHERE Username = ? AND Active = 1').bind(username).first()
  // Executa bcrypt também para usuários inexistentes, reduzindo diferenças de tempo.
  const validPassword = await compare(body.password, user?.PasswordHash || '$2b$12$' + 'A'.repeat(53))
  if (!user || !validPassword || user.Role !== 'ADMIN') {
    return c.json({ error: 'Usuário ou senha inválidos' }, 401)
  }
  const sessionId = crypto.randomUUID()
  const exp = now + SESSION_SECONDS
  const token = await sign({ sub: user.Id, jti: sessionId, iat: now, exp, iss: ISSUER, aud: AUDIENCE }, secret, 'HS256')
  await c.env.DB.batch([
    c.env.DB.prepare('DELETE FROM LoginThrottle WHERE Bucket = ?').bind(bucket),
    c.env.DB.prepare('DELETE FROM AuthSession WHERE ExpiresAt <= ?').bind(now),
    c.env.DB.prepare('INSERT INTO AuthSession (Id, UserId, ExpiresAt) VALUES (?, ?, ?)').bind(sessionId, user.Id, exp),
  ])
  setCookie(c, COOKIE_NAME, token, { ...cookieOptions(c), maxAge: SESSION_SECONDS })
  return c.json({ user: { id: user.Id, username: user.Username, role: user.Role } })
})

auth.get('/me', requireAdmin, (c) => c.json({ user: c.get('admin') }))

auth.post('/logout', requireSameOrigin, requireAdmin, async (c) => {
  await c.env.DB.prepare('DELETE FROM AuthSession WHERE Id = ?').bind(c.get('sessionId')).run()
  deleteCookie(c, COOKIE_NAME, cookieOptions(c))
  return c.body(null, 204)
})

export default auth
