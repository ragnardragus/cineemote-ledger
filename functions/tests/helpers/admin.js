import { readFileSync } from 'node:fs'
import { sign } from 'hono/jwt'

export const TEST_SECRET = 'test-only-secret-with-at-least-32-characters'

export async function authenticatedAdmin(sqlite) {
  sqlite.exec(readFileSync(new URL('../../migrations/0005_create_auth.sql', import.meta.url), 'utf8'))
  const userId = crypto.randomUUID()
  const sessionId = crypto.randomUUID()
  const now = Math.floor(Date.now() / 1000)
  sqlite.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role) VALUES (?, ?, ?, ?)').run(userId, 'testadmin', 'unused-test-hash', 'ADMIN')
  sqlite.prepare('INSERT INTO AuthSession (Id, UserId, ExpiresAt) VALUES (?, ?, ?)').run(sessionId, userId, now + 3600)
  const token = await sign({ sub: userId, jti: sessionId, iat: now, exp: now + 3600, iss: 'cinemotes-ledger', aud: 'cinemotes-admin' }, TEST_SECRET, 'HS256')
  return { headers: { Cookie: `cinemotes_session=${token}`, 'X-Requested-With': 'Cinemotes' }, JWT_SECRET: TEST_SECRET }
}
