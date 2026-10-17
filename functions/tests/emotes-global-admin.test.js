import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createIntegrationApi } from './helpers/integration-api.js'
import { createPasswordRecord } from '../src/auth/password.js'
import { png } from './helpers/image-fixtures.js'

let api, adminCookie, creatorCookie, outsideChannel
const route = '/api/emotes/global'
const payload = { emote_name: 'NewGlobal', url: 'https://example.com/emote.gif' }
const send = (path, method = 'GET', body, cookie = adminCookie, csrf = true) => api.fetch(path, {
  method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { 'X-Requested-With': 'Cinemotes' } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
})
before(async () => {
  api = await createIntegrationApi()
  const admin = await send('/api/auth/login', 'POST', { username: api.username, proof: api.proof }, null)
  adminCookie = admin.headers.get('set-cookie').split(';')[0]
  outsideChannel = crypto.randomUUID()
  await api.DB.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').bind(outsideChannel, 'OutsideAdminGlobal').run()
  const password = await createPasswordRecord('e'.repeat(64), '0123456789abcdef0123456789abcdef')
  await api.DB.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role, channelId) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), 'global_test_creator', password, 'CREATOR', outsideChannel).run()
  const creator = await send('/api/auth/creator/login', 'POST', { username: 'global_test_creator', proof: 'e'.repeat(64) }, null)
  creatorCookie = creator.headers.get('set-cookie').split(';')[0]
})
after(async () => { if (api) await api.close() })

test('admin manages GlobalCE with session consumer, no UserCode, and public gallery receives it', async () => {
  const codesBefore = (await api.DB.prepare('SELECT UUID, Status FROM UserCode ORDER BY UUID').all()).results
  const response = await send(route, 'POST', payload)
  assert.equal(response.status, 201, await response.clone().text())
  const emote = await response.json()
  assert.equal(emote.channel, 'GlobalCE')
  assert.equal(emote.consumer, api.username)
  assert.equal(emote.createdWithUserCode, false)
  const list = await send(route)
  assert.equal(list.status, 200)
  const rows = await list.json()
  assert.ok(rows.every((item) => item.channel === 'GlobalCE'))
  assert.ok(rows.some((item) => item.id === emote.id))
  const publicRows = await (await send('/api/emotes?channel=GlobalCE&channelOnly=true', 'GET', undefined, null)).json()
  assert.ok(publicRows.some((item) => item.id === emote.id))
  for (const method of ['PATCH', 'PUT']) {
    const result = await send(`${route}/${emote.id}`, method, { ...payload, emote_name: 'EditedGlobal' })
    assert.equal(result.status, 200, await result.clone().text())
    const updated = await result.json()
    assert.equal(updated.consumer, api.username); assert.equal(updated.channel, 'GlobalCE')
    assert.equal(updated.createdWithUserCode, false)
  }
  assert.equal((await send(`${route}/${emote.id}`, 'DELETE')).status, 204)
  assert.deepEqual((await api.DB.prepare('SELECT UUID, Status FROM UserCode ORDER BY UUID').all()).results, codesBefore)
})

test('global admin routes reject guests, creators, missing CSRF and invalid session', async () => {
  const global = (await (await send(route)).json())[0]
  for (const [method, path, body] of [
    ['GET', route], ['POST', route, payload], ['PATCH', `${route}/${global.id}`, { emote_name: 'Denied' }],
    ['PUT', `${route}/${global.id}`, payload], ['DELETE', `${route}/${global.id}`],
  ]) {
    assert.equal((await send(path, method, body, null)).status, 401)
    assert.equal((await send(path, method, body, creatorCookie)).status, 403)
    if (method !== 'GET') assert.equal((await send(path, method, body, adminCookie, false)).status, 403)
    assert.equal((await send(path, method, body, 'cinemotes_session=invalid')).status, 401)
  }
})

test('admin endpoint cannot target other channels or spoof consumer; UserCode still cannot create globals', async () => {
  assert.equal((await send(route, 'POST', { ...payload, channel: 'OtherChannel' })).status, 403)
  for (const forged of [{ consumer: 'SomeoneElse' }, { createdWithUserCode: true }, { channelId: outsideChannel }]) {
    assert.equal((await send(route, 'POST', { ...payload, ...forged })).status, 400)
  }
  const own = await (await send(route, 'POST', payload)).json()
  assert.equal((await send(`${route}/${own.id}`, 'PATCH', { channelId: outsideChannel })).status, 403)
  const outsider = crypto.randomUUID()
  await api.DB.prepare('INSERT INTO emotes (id, emote_name, url, consumer, createdWithUserCode, channelId) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(outsider, 'Outside', payload.url, 'Original', 0, outsideChannel).run()
  for (const method of ['PUT', 'PATCH', 'DELETE']) {
    assert.equal((await send(`${route}/${outsider}`, method, method === 'DELETE' ? undefined : payload)).status, 403)
  }
  const generated = await (await send('/api/usecode/generate', 'POST', { quantity: 1, receiver: 'GlobalAdminTests' })).json()
  const code = generated.UUIDs[0]
  const denied = await api.fetch('/api/emotes', { method: 'POST', headers: { 'Content-Type': 'application/json', UserCode: code }, body: JSON.stringify({ ...payload, channel: 'GlobalCE' }) })
  assert.equal(denied.status, 400)
  assert.equal((await api.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(code).first()).Status, 'GENERATED')
  await send(`${route}/${own.id}`, 'DELETE')
})

test('admin upload validates images, saves to R2 and deletes managed image', async () => {
  async function upload(bytes) {
    const form = new FormData()
    form.set('emote_name', 'UploadedGlobal'); form.set('image', new File([bytes], 'emote.png'))
    const request = new Request('http://localhost' + route, { method: 'POST', headers: { Cookie: adminCookie, 'X-Requested-With': 'Cinemotes' }, body: form })
    return api.fetch(route, { method: 'POST', headers: Object.fromEntries(request.headers), body: await request.arrayBuffer() })
  }
  const before = (await api.EMOTE_IMAGES.list()).objects.length
  assert.equal((await upload(new TextEncoder().encode('<svg/>'))).status, 400)
  const saved = await upload(png)
  assert.equal(saved.status, 201, await saved.clone().text())
  const emote = await saved.json()
  assert.equal(emote.consumer, api.username); assert.equal(emote.channel, 'GlobalCE')
  const imagePath = new URL(emote.url).pathname
  assert.equal((await api.fetch(imagePath)).status, 200)
  assert.equal((await api.EMOTE_IMAGES.list()).objects.length, before + 1)
  assert.equal((await send(`${route}/${emote.id}`, 'DELETE')).status, 204)
  assert.equal((await api.fetch(imagePath)).status, 404)
  assert.equal((await api.EMOTE_IMAGES.list()).objects.length, before)
})
