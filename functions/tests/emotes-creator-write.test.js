import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { sign, decode } from 'hono/jwt'
import { createIntegrationApi } from './helpers/integration-api.js'
import { createPasswordRecord } from '../src/auth/password.js'

let api
const creatorId = crypto.randomUUID()
const ownChannel = crypto.randomUUID()
const otherChannel = crypto.randomUUID()
const proof = 'e'.repeat(64)
const payload = { emote_name: 'Creator emote', url: 'https://example.com/emote.gif' }
const send = (route, method, body, headers = {}) => api.fetch(route, {
  method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
})
async function login() {
  const response = await send('/api/auth/creator/login', 'POST', { username: 'emote_creator', proof }, { 'X-Requested-With': 'Cinemotes' })
  assert.equal(response.status, 200)
  const cookie = response.headers.get('set-cookie').split(';')[0]
  return { cookie, headers: { Cookie: cookie, 'X-Requested-With': 'Cinemotes' }, token: cookie.slice(cookie.indexOf('=') + 1) }
}
before(async () => {
  api = await createIntegrationApi()
  const record = await createPasswordRecord(proof, '0123456789abcdef0123456789abcdef')
  await api.DB.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?), (?, ?)').bind(ownChannel, 'CreatorOwn', otherChannel, 'OtherChannel').run()
  await api.DB.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role, channelId) VALUES (?, ?, ?, ?, ?)').bind(creatorId, 'emote_creator', record, 'CREATOR', ownChannel).run()
})
after(async () => { if (api) await api.close() })

test('criador cadastra, altera e exclui seus emotes por cookie sem consumir UserCode', async () => {
  const { headers } = await login()
  const before = await api.DB.prepare('SELECT COUNT(*) AS n FROM UserCode').first()
  const created = await send('/api/emotes', 'POST', payload, headers)
  assert.equal(created.status, 201)
  const emote = await created.json()
  assert.equal(emote.channel, 'CreatorOwn')
  assert.equal(emote.consumer, 'emote_creator')
  assert.equal(emote.createdWithUserCode, false)
  for (const filename of ['oversize.png', 'large.png', 'not-image.png']) {
    const body = { ...payload, url: `https://example.com/${filename}` }
    assert.equal((await send('/api/emotes', 'POST', body, headers)).status, 400)
    for (const method of ['PATCH', 'PUT']) assert.equal((await send(`/api/emotes/${emote.id}`, method, body, headers)).status, 400)
    assert.deepEqual(await (await send(`/api/emotes/${emote.id}`, 'GET', undefined, headers)).json(), emote)
  }
  for (const field of ['author', 'consumer', 'createdWithUserCode']) {
    assert.equal((await send('/api/emotes', 'POST', { ...payload, [field]: 'forged' }, headers)).status, 400)
    assert.equal((await send(`/api/emotes/${emote.id}`, 'PATCH', { [field]: 'forged' }, headers)).status, 400)
  }
  assert.equal((await api.DB.prepare('SELECT channelId FROM emotes WHERE id = ?').bind(emote.id).first()).channelId, ownChannel)
  const route = `/api/emotes/${emote.id}`
  assert.equal((await send(route, 'PATCH', { emote_name: 'Creator' }, headers)).status, 200)
  const replaced = await send(route, 'PUT', { ...payload, emote_name: 'Replaced' }, headers)
  assert.equal(replaced.status, 200)
  const updated = await replaced.json()
  assert.equal(updated.consumer, emote.consumer)
  assert.equal(updated.createdWithUserCode, false)
  assert.equal((await send(route, 'DELETE', undefined, headers)).status, 204)
  assert.deepEqual(await api.DB.prepare('SELECT COUNT(*) AS n FROM UserCode').first(), before)
})

test('JWT não autoriza outros canais, GlobalCE ou transferência de emotes', async () => {
  const { headers } = await login()
  const before = await api.DB.prepare('SELECT COUNT(*) AS n FROM channels').first()
  for (const channel of ['OtherChannel', 'UnknownChannel']) {
    assert.equal((await send('/api/emotes', 'POST', { ...payload, channel }, headers)).status, 403)
  }
  assert.equal((await send('/api/emotes', 'POST', { ...payload, channel: 'GlobalCE' }, headers)).status, 400)
  assert.deepEqual(await api.DB.prepare('SELECT COUNT(*) AS n FROM channels').first(), before)
  const created = await send('/api/emotes', 'POST', { ...payload, channel: 'creatorown' }, headers)
  assert.equal(created.status, 201)
  const own = await created.json()
  const route = `/api/emotes/${own.id}`
  for (const method of ['PATCH', 'PUT']) {
    assert.equal((await send(route, method, { ...payload, channelId: otherChannel }, headers)).status, 403)
  }
  const foreignId = crypto.randomUUID()
  await api.DB.prepare("INSERT INTO emotes (id, emote_name, url, channelId, consumer, createdWithUserCode) VALUES (?, ?, ?, ?, 'fixture', 0)").bind(foreignId, 'Other', payload.url, otherChannel).run()
  const global = await api.DB.prepare("SELECT emotes.id FROM emotes JOIN channels ON channels.id = emotes.channelId WHERE channelName = 'GlobalCE' LIMIT 1").first()
  for (const id of [foreignId, global.id]) {
    for (const method of ['PATCH', 'PUT', 'DELETE']) {
      assert.equal((await send(`/api/emotes/${id}`, method, method === 'DELETE' ? undefined : { ...payload, channelId: ownChannel }, headers)).status, 403)
    }
  }
  assert.equal((await send(`/api/emotes/${crypto.randomUUID()}`, 'DELETE', undefined, headers)).status, 404)
  assert.equal((await send('/api/emotes', 'POST', payload, { ...headers, UserCode: 'invalid' })).status, 403)
  await send(route, 'DELETE', undefined, headers)
})

test('Bearer válido funciona; cookie exige proteção CSRF; JWT expirado ou revogado é rejeitado', async () => {
  const { cookie, token, headers } = await login()
  assert.equal((await send('/api/emotes', 'POST', payload, { Cookie: cookie })).status, 403)
  const created = await send('/api/emotes', 'POST', payload, { Authorization: `Bearer ${token}` })
  assert.equal(created.status, 201)
  const emote = await created.json()
  assert.equal((await send(`/api/emotes/${emote.id}`, 'PATCH', { emote_name: 'Bearer' }, { Authorization: `Bearer ${token}` })).status, 200)
  const expired = await sign({ ...decode(token).payload, exp: Math.floor(Date.now() / 1000) - 1 }, api.secret, 'HS256')
  for (const authorization of ['Bearer invalid', 'Basic invalid', `Bearer ${expired}`]) {
    assert.equal((await send('/api/emotes', 'POST', payload, { Authorization: authorization })).status, 401)
  }
  await send(`/api/emotes/${emote.id}`, 'DELETE', undefined, headers)
  await send('/api/auth/logout', 'POST', undefined, headers)
  assert.equal((await send('/api/emotes', 'POST', payload, { Authorization: `Bearer ${token}` })).status, 401)
})

test('criador sem canal ou inativo e administrador não recebem autorização de criador', async () => {
  const { headers } = await login()
  await api.DB.prepare('UPDATE Users SET channelId = NULL WHERE Id = ?').bind(creatorId).run()
  assert.equal((await send('/api/emotes', 'POST', payload, headers)).status, 403)
  await api.DB.prepare('UPDATE Users SET channelId = ?, Active = 0 WHERE Id = ?').bind(ownChannel, creatorId).run()
  assert.equal((await send('/api/emotes', 'POST', payload, headers)).status, 401)
  const adminLogin = await send('/api/auth/login', 'POST', { username: api.username, proof: api.proof }, { 'X-Requested-With': 'Cinemotes' })
  const adminCookie = adminLogin.headers.get('set-cookie').split(';')[0]
  assert.equal((await send('/api/emotes', 'POST', payload, { Cookie: adminCookie, 'X-Requested-With': 'Cinemotes' })).status, 403)
})
