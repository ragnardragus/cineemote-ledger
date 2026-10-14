import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { hash } from 'bcryptjs'
import { sign, decode } from 'hono/jwt'
import app from '../src/index.js'
import { TEST_SECRET } from './helpers/admin.js'

async function setup(t) {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  for (const migration of ['0003_create_user_code.sql', '0005_create_auth.sql']) {
    sqlite.exec(readFileSync(new URL(`../migrations/${migration}`, import.meta.url), 'utf8'))
  }
  const passwordHash = await hash('test-password', 4)
  sqlite.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role) VALUES (?, ?, ?, ?)').run('test-user', 'admin', passwordHash, 'ADMIN')
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async first() { return sqlite.prepare(sql).get(...values) ?? null },
            async all() { return { results: sqlite.prepare(sql).all(...values) } },
            async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: result.changes } } },
          }
        },
      }
    },
    async batch(statements) {
      sqlite.exec('BEGIN')
      try { const result = []; for (const statement of statements) result.push(await statement.run()); sqlite.exec('COMMIT'); return result } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  const env = { DB, JWT_SECRET: TEST_SECRET }
  const request = (path, method = 'GET', body, cookie, extraHeaders = {}) => app.request(`https://example.com${path}`, {
    method, headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes', ...(cookie ? { Cookie: cookie } : {}), ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  }, env)
  const login = () => request('/api/auth/login', 'POST', { username: 'admin', password: 'test-password' })
  return { sqlite, env, request, login }
}

test('login JWT, geração restrita e logout que revoga a sessão', async (t) => {
  const { request, login, sqlite } = await setup(t)
  assert.equal((await request('/api/auth/me')).status, 401)
  assert.equal((await request('/api/usecode/generate', 'POST')).status, 401)
  assert.equal((await request('/api/auth/login', 'POST', { username: 'admin', password: 'wrong' })).status, 401)
  const response = await login()
  assert.equal(response.status, 200)
  const body = await response.json()
  assert.deepEqual(body.user, { id: 'test-user', username: 'admin', role: 'ADMIN' })
  assert.equal(body.token, undefined)
  const setCookie = response.headers.get('set-cookie')
  for (const property of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/api', 'Max-Age=28800']) assert.ok(setCookie.includes(property))
  const cookie = setCookie.split(';')[0]
  assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 200)
  const generated = await request('/api/usecode/generate', 'POST', { quantity: 15 }, cookie)
  assert.equal(generated.status, 201)
  assert.equal((await generated.json()).UUIDs.length, 15)
  assert.equal((await request('/api/usecode/generate', 'POST', {}, cookie, { 'X-Requested-With': '' })).status, 403)
  assert.equal((await request('/api/usecode/generate', 'POST', {}, cookie, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await request('/api/auth/logout', 'POST', undefined, cookie, { 'X-Requested-With': '' })).status, 403)
  assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 200)
  assert.equal((await request('/api/auth/logout', 'POST', undefined, cookie)).status, 204)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM AuthSession').get().n, 0)
  assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 401)
  assert.equal((await request('/api/usecode/generate', 'POST', undefined, cookie)).status, 401)
})

test('rejeita JWT adulterado, expirado, claims incorretos e usuários sem acesso', async (t) => {
  const { request, login, sqlite } = await setup(t)
  const cookie = (await login()).headers.get('set-cookie').split(';')[0]
  const token = cookie.slice(cookie.indexOf('=') + 1)
  const { payload } = decode(token)
  for (const change of [{ exp: Math.floor(Date.now() / 1000) - 1 }, { aud: 'another-app' }, { iss: 'another-issuer' }, { jti: 'missing-session' }, { exp: undefined }]) {
    const altered = await sign({ ...payload, ...change }, TEST_SECRET, 'HS256')
    assert.equal((await request('/api/auth/me', 'GET', undefined, `cinemotes_session=${altered}`)).status, 401)
  }
  const forged = await sign(payload, 'another-secret-long-enough-for-testing', 'HS256')
  assert.equal((await request('/api/auth/me', 'GET', undefined, `cinemotes_session=${forged}`)).status, 401)
  assert.equal((await request('/api/auth/me', 'GET', undefined, 'cinemotes_session=invalid')).status, 401)
  sqlite.prepare("UPDATE Users SET Role = 'USER' WHERE Id = ?").run('test-user')
  assert.equal((await request('/api/usecode/generate', 'POST', undefined, cookie)).status, 403)
  sqlite.prepare("UPDATE Users SET Role = 'ADMIN', Active = 0 WHERE Id = ?").run('test-user')
  assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 401)
})

test('valida login, protege contra CSRF e limita tentativas', async (t) => {
  const { request, login } = await setup(t)
  for (const body of [null, {}, { username: '', password: 'x' }, { username: 'admin', password: 1 }, { username: 'admin', password: 'x'.repeat(73) }]) {
    assert.equal((await request('/api/auth/login', 'POST', body)).status, 400)
  }
  assert.equal((await request('/api/auth/login', 'POST', {}, undefined, { 'X-Requested-With': '' })).status, 403)
  assert.equal((await request('/api/auth/login', 'POST', {}, undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403)
  assert.equal((await request('/api/auth/login', 'POST', {}, undefined, { 'Content-Type': 'text/plain' })).status, 400)
  for (let i = 0; i < 5; i++) assert.equal((await request('/api/auth/login', 'POST', { username: 'admin', password: 'wrong' })).status, 401)
  const limited = await login()
  assert.equal(limited.status, 429)
  assert.ok(Number(limited.headers.get('Retry-After')) > 0)
  const later = Date.now() + 16 * 60 * 1000
  t.mock.method(Date, 'now', () => later)
  assert.equal((await login()).status, 200)
})
