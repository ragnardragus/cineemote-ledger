import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { sign, decode } from 'hono/jwt'
import { createIntegrationApi } from './helpers/integration-api.js'
import { createPasswordRecord } from '../src/auth/password.js'

let api
const creatorId = crypto.randomUUID()
const proof = 'd'.repeat(64)
const username = 'test_creator_login'
const request = (route, method = 'GET', body, cookie, csrf = true) => api.fetch(route, {
  method,
  headers: { 'Content-Type': 'application/json', ...(csrf ? { 'X-Requested-With': 'Cinemotes' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
})
before(async () => {
  api = await createIntegrationApi()
  const record = await createPasswordRecord(proof, 'abcdef0123456789abcdef0123456789')
  await api.DB.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role) VALUES (?, ?, ?, ?)').bind(creatorId, username, record, 'CREATOR').run()
})
after(async () => { if (api) await api.close() })

test('criador entra pela rota exclusiva, restaura sessão e não acessa administração', async () => {
  assert.equal((await request('/api/auth/creator/me')).status, 401)
  assert.equal((await request('/api/auth/login', 'POST', { username, proof })).status, 401)
  assert.equal((await request('/api/auth/creator/login', 'POST', { username, proof }, undefined, false)).status, 403)
  const login = await request('/api/auth/creator/login', 'POST', { username, proof })
  assert.equal(login.status, 200)
  assert.equal((await login.json()).user.role, 'CREATOR')
  const cookie = login.headers.get('set-cookie').split(';')[0]
  assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 200)
  assert.equal((await request('/api/auth/creator/me', 'GET', undefined, cookie)).status, 200)
  assert.equal((await request('/api/users', 'GET', undefined, cookie)).status, 403)
  assert.equal((await request('/api/usecode/generate', 'POST', { quantity: 1, receiver: 'test' }, cookie)).status, 403)
  const payload = decode(cookie.slice(cookie.indexOf('=') + 1)).payload
  assert.equal(payload.aud, 'cinemotes-creator')
  for (const change of [{ aud: 'cinemotes-admin' }, { aud: 'other' }, { exp: Math.floor(Date.now() / 1000) - 1 }]) {
    const forged = await sign({ ...payload, ...change }, api.secret, 'HS256')
    assert.equal((await request('/api/auth/creator/me', 'GET', undefined, `cinemotes_session=${forged}`)).status, 401)
  }
  assert.equal((await request('/api/auth/logout', 'POST', undefined, cookie)).status, 204)
  assert.equal((await request('/api/auth/creator/me', 'GET', undefined, cookie)).status, 401)
})

test('administrador continua exclusivo do painel e não pode logar como criador', async () => {
  const creatorLogin = await request('/api/auth/creator/login', 'POST', { username: api.username, proof: api.proof })
  assert.equal(creatorLogin.status, 401)
  assert.equal(creatorLogin.headers.get('set-cookie'), null)
  const login = await request('/api/auth/login', 'POST', { username: api.username, proof: api.proof })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  assert.equal((await request('/api/auth/creator/me', 'GET', undefined, cookie)).status, 403)
  assert.equal((await request('/api/users', 'GET', undefined, cookie)).status, 200)
  await request('/api/auth/logout', 'POST', undefined, cookie)
})

test('meus emotes exige criador e lista somente o canal vinculado à conta', async () => {
  assert.equal((await request('/api/emotes/mine')).status, 401)
  const adminLogin = await request('/api/auth/login', 'POST', { username: api.username, proof: api.proof })
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0]
  assert.equal((await request('/api/emotes/mine', 'GET', undefined, adminCookie)).status, 403)
  const login = await request('/api/auth/creator/login', 'POST', { username, proof })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  assert.deepEqual(await (await request('/api/emotes/mine', 'GET', undefined, cookie)).json(), [])
  const channelId = crypto.randomUUID()
  const emoteId = crypto.randomUUID()
  await api.DB.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').bind(channelId, 'OwnCreatorChannel').run()
  await api.DB.prepare('UPDATE Users SET channelId = ? WHERE Id = ?').bind(channelId, creatorId).run()
  await api.DB.prepare('INSERT INTO emotes (id, emote_name, url, channelId) VALUES (?, ?, ?, ?)').bind(emoteId, 'Own emote', 'https://example.com/emote.png', channelId).run()
  const response = await request('/api/emotes/mine?channel=GlobalCE', 'GET', undefined, cookie)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), [{ id: emoteId, emote_name: 'Own emote', url: 'https://example.com/emote.png', author: '', channel: 'OwnCreatorChannel' }])
})

test('desativar criador invalida sua sessão e bloqueia novos logins', async () => {
  const login = await request('/api/auth/creator/login', 'POST', { username, proof })
  assert.equal(login.status, 200)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  await api.DB.prepare('UPDATE Users SET Active = 0 WHERE Id = ?').bind(creatorId).run()
  assert.equal((await request('/api/auth/creator/me', 'GET', undefined, cookie)).status, 401)
  assert.equal((await request('/api/auth/creator/login', 'POST', { username, proof })).status, 401)
})
