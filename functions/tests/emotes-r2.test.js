import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createPasswordRecord } from '../src/auth/password.js'
import { STORAGE_LIMIT_BYTES } from '../src/emote-storage.js'
import { cleanupImages } from '../src/emote-storage.js'
import app from '../src/index.js'
import { createIntegrationApi } from './helpers/integration-api.js'
import { png, gif } from './helpers/image-fixtures.js'

let api, cookie, creatorCookie
const creatorId = crypto.randomUUID(), channelId = crypto.randomUUID()
const headers = () => ({ Cookie: cookie, 'X-Requested-With': 'Cinemotes' })
const creatorHeaders = () => ({ Cookie: creatorCookie, 'X-Requested-With': 'Cinemotes' })
const json = (body, extra = {}) => ({ headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(body) })
async function code() {
  const response = await api.fetch('/api/usecode/generate', { method: 'POST', ...json({ quantity: 1, receiver: 'UploadReceiver' }, headers()) })
  return (await response.json()).UUIDs[0]
}
function form(bytes = png, values = { emote_name: 'Uploaded', channel: 'UploadChannel' }) {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  data.set('image', new File([bytes], '../../arbitrary-name.exe', { type: 'application/octet-stream' }))
  return data
}
const upload = async (headers, data = form(), path = '/api/emotes', method = 'POST') => {
  // Serialize with the same FormData implementation before passing to Wrangler's fetch.
  const request = new Request('http://localhost' + path, { method, headers, body: data })
  return api.fetch(path, { method, headers: Object.fromEntries(request.headers), body: await request.arrayBuffer() })
}
const keyFrom = (emote) => new URL(emote.url).pathname.replace('/api/images/', '')
const images = async () => (await api.EMOTE_IMAGES.list()).objects

before(async () => {
  api = await createIntegrationApi()
  const login = await api.fetch('/api/auth/login', { method: 'POST', ...json({ username: api.username, proof: api.proof }, { 'X-Requested-With': 'Cinemotes' }) })
  cookie = login.headers.get('set-cookie').split(';')[0]
  await api.DB.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').bind(channelId, 'CreatorUploads').run()
  await api.DB.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role, channelId) VALUES (?, ?, ?, ?, ?)').bind(creatorId, 'upload_creator', await createPasswordRecord('e'.repeat(64), '0123456789abcdef0123456789abcdef'), 'CREATOR', channelId).run()
  const creator = await api.fetch('/api/auth/creator/login', { method: 'POST', ...json({ username: 'upload_creator', proof: 'e'.repeat(64) }, { 'X-Requested-With': 'Cinemotes' }) })
  creatorCookie = creator.headers.get('set-cookie').split(';')[0]
})
after(async () => { if (api) await api.close() })

test('upload por UserCode publica bytes, CORS, cache, HEAD e ETag e remove R2 ao excluir', async () => {
  const userCode = await code()
  const response = await upload({ UserCode: userCode })
  assert.equal(response.status, 201, await response.clone().text())
  const emote = await response.json(), key = keyFrom(emote)
  assert.match(key, /^emotes\/[0-9a-f-]+\.png$/)
  assert.equal(emote.consumer, 'UploadReceiver'); assert.equal(emote.createdWithUserCode, true)
  assert.equal(Object.hasOwn(emote, 'imageKey'), false)
  assert.equal((await api.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(userCode).first()).Status, 'USED')
  const path = new URL(emote.url).pathname
  const image = await api.fetch(path)
  assert.equal(image.status, 200)
  assert.equal(image.headers.get('Content-Type'), 'image/png')
  assert.equal(image.headers.get('Access-Control-Allow-Origin'), '*')
  assert.equal(image.headers.get('Cross-Origin-Resource-Policy'), 'cross-origin')
  assert.match(image.headers.get('Cache-Control'), /max-age=/)
  assert.deepEqual(new Uint8Array(await image.arrayBuffer()), png)
  const head = await api.fetch(path, { method: 'HEAD' })
  assert.equal(head.status, 200); assert.equal(head.headers.get('Content-Length'), String(png.length)); assert.equal((await head.arrayBuffer()).byteLength, 0)
  assert.equal((await api.fetch(path, { headers: { 'If-None-Match': image.headers.get('ETag') } })).status, 304)
  assert.equal((await api.fetch(path, { method: 'OPTIONS', headers: { Origin: 'https://extension.example' } })).status, 204)
  assert.equal((await api.fetch('/api/emotes/' + emote.id, { method: 'DELETE', headers: { UserCode: await code() } })).status, 204)
  assert.equal(await api.EMOTE_IMAGES.head(key), null)
  assert.equal(await api.DB.prepare('SELECT * FROM EmoteImage WHERE ObjectKey = ?').bind(key).first(), null)
  assert.equal((await api.fetch(path)).status, 404)
})

test('criador faz upload, altera nome sem baixar URL e substitui imagem preservando consumer', async () => {
  const response = await upload(creatorHeaders(), form(png, { emote_name: 'CreatorUpload' }))
  assert.equal(response.status, 201, await response.clone().text())
  const emote = await response.json(), path = `/api/emotes/${emote.id}`
  assert.equal(emote.consumer, 'upload_creator'); assert.equal(emote.createdWithUserCode, false)
  const renamed = await api.fetch(path, { method: 'PATCH', ...json({ emote_name: 'Renamed', url: emote.url }, creatorHeaders()) })
  assert.equal(renamed.status, 200, await renamed.clone().text())
  const updated = await upload(creatorHeaders(), form(gif, { emote_name: 'Changed' }), path, 'PATCH')
  assert.equal(updated.status, 200, await updated.clone().text())
  const replacement = await updated.json()
  assert.match(replacement.url, /\.gif$/)
  assert.equal(replacement.consumer, emote.consumer)
  assert.equal(await api.EMOTE_IMAGES.head(keyFrom(emote)), null)
  assert.ok(await api.EMOTE_IMAGES.head(keyFrom(replacement)))
  assert.equal((await api.fetch(path, { method: 'PATCH', ...json({ url: 'https://example.com/emote.png' }, creatorHeaders()) })).status, 200)
  assert.equal(await api.EMOTE_IMAGES.head(keyFrom(replacement)), null)
  await api.fetch(path, { method: 'DELETE', headers: creatorHeaders() })
})

test('falhas de validação/autorização não salvam arquivos nem consomem o código', async () => {
  const userCode = await code(), before = (await images()).length
  for (const bytes of [new Uint8Array(), new Uint8Array(1048577), new TextEncoder().encode('<svg/>')]) {
    assert.equal((await upload({ UserCode: userCode }, form(bytes))).status, 400)
  }
  const large = png.slice(); new DataView(large.buffer).setUint32(16, 201)
  assert.equal((await upload({ UserCode: userCode }, form(large))).status, 400)
  const both = form(); both.set('url', 'https://example.com/emote.png')
  assert.equal((await upload({ UserCode: userCode }, both)).status, 400)
  assert.equal((await upload({})).status, 401)
  assert.equal((await upload({ UserCode: 'invalid' })).status, 403)
  assert.equal((await upload(creatorHeaders(), form(png, { emote_name: 'Wrong', channel: 'OtherChannel' }))).status, 403)
  assert.equal((await upload({ UserCode: userCode }, form(png, { emote_name: 'Wrong', channel: 'GlobalCE' }))).status, 400)
  assert.equal((await images()).length, before)
  assert.equal((await api.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(userCode).first()).Status, 'GENERATED')
})

test('consumo concorrente de código mantém apenas um upload e a reserva correta', async () => {
  const userCode = await code(), before = (await images()).length
  const responses = await Promise.all([upload({ UserCode: userCode }), upload({ UserCode: userCode })])
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 403])
  assert.equal((await images()).length, before + 1)
  const emote = await responses.find((r) => r.status === 201).json()
  await api.fetch(`/api/emotes/${emote.id}`, { method: 'DELETE', headers: { UserCode: await code() } })
})

test('falhas de R2 e D1 desfazem upload sem consumir código; exclusão falha é retomada', async () => {
  const userCode = await code(), initial = (await images()).length
  const call = async (env, data = form(), path = '/api/emotes', method = 'POST') => {
    const pending = []
    const response = await app.fetch(new Request('http://localhost' + path, { method, headers: { UserCode: userCode }, body: method === 'DELETE' ? undefined : data }), env, { waitUntil(promise) { pending.push(promise) } })
    await Promise.all(pending)
    return response
  }
  const failingBucket = new Proxy(api.EMOTE_IMAGES, { get(target, key) { return key === 'put' ? async () => { throw new Error('simulated write failure') } : target[key] } })
  assert.equal((await call({ DB: api.DB, EMOTE_IMAGES: failingBucket })).status, 503)
  assert.equal((await images()).length, initial)
  const failingDB = new Proxy(api.DB, { get(target, key) { return key === 'batch' ? async () => { throw new Error('simulated database failure') } : target[key] } })
  assert.equal((await call({ DB: failingDB, EMOTE_IMAGES: api.EMOTE_IMAGES })).status, 500)
  assert.equal((await images()).length, initial)
  assert.equal((await api.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(userCode).first()).Status, 'GENERATED')
  const saved = await upload({ UserCode: userCode })
  const emote = await saved.json(), key = keyFrom(emote)
  const deleteCode = await code()
  const failingDelete = new Proxy(api.EMOTE_IMAGES, { get(target, name) { return name === 'delete' ? async () => { throw new Error('simulated delete failure') } : target[name] } })
  const pending = []
  const deleted = await app.fetch(new Request('http://localhost/api/emotes/' + emote.id, { method: 'DELETE', headers: { UserCode: deleteCode } }), { DB: api.DB, EMOTE_IMAGES: failingDelete }, { waitUntil(p) { pending.push(p) } })
  await Promise.all(pending)
  assert.equal(deleted.status, 204)
  assert.ok(await api.EMOTE_IMAGES.head(key))
  assert.ok(await api.DB.prepare('SELECT ObjectKey FROM EmoteImage WHERE ObjectKey = ?').bind(key).first())
  await api.DB.prepare('UPDATE EmoteImage SET CreationDate = unixepoch() - 7200 WHERE ObjectKey = ?').bind(key).run()
  await cleanupImages({ DB: api.DB, EMOTE_IMAGES: api.EMOTE_IMAGES })
  assert.equal(await api.EMOTE_IMAGES.head(key), null)
  assert.equal(await api.DB.prepare('SELECT ObjectKey FROM EmoteImage WHERE ObjectKey = ?').bind(key).first(), null)
})

test('cota é reservada atomicamente e bloqueia novos uploads sem consumir UserCode', async () => {
  await api.DB.prepare(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x < 9000)
    INSERT INTO EmoteImage (ObjectKey, Size) SELECT 'quota/' || x, 1000000 FROM n`).run()
  const userCode = await code()
  const response = await upload({ UserCode: userCode })
  assert.equal(response.status, 409, await response.clone().text())
  assert.equal((await api.DB.prepare('SELECT SUM(Size) AS total FROM EmoteImage').first()).total, STORAGE_LIMIT_BYTES)
  assert.equal((await api.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(userCode).first()).Status, 'GENERATED')
  await api.DB.prepare("UPDATE EmoteImage SET Size = Size - ? WHERE ObjectKey = 'quota/9000'").bind(png.length).run()
  const secondCode = await code()
  const concurrent = await Promise.all([upload({ UserCode: userCode }), upload({ UserCode: secondCode })])
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [201, 409])
  assert.equal((await api.DB.prepare('SELECT SUM(Size) AS total FROM EmoteImage').first()).total, STORAGE_LIMIT_BYTES)
  const emote = await concurrent.find((r) => r.status === 201).json()
  await api.fetch(`/api/emotes/${emote.id}`, { method: 'DELETE', headers: { UserCode: await code() } })
  await api.DB.prepare("DELETE FROM EmoteImage WHERE ObjectKey LIKE 'quota/%'").run()
})
