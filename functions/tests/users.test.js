import assert from 'node:assert/strict'
import { before, after, test } from 'node:test'
import { createIntegrationApi } from './helpers/integration-api.js'

let api
let cookie
const salt = 'abcdef0123456789abcdef0123456789'
const proof = 'a'.repeat(64)
const payload = { username: 'test_creator', role: 'CREATOR', salt, proof, channelName: 'TestCreatorChannel' }
const request = (route, method = 'GET', body, authenticated = true, csrf = true) => api.fetch(route, {
  method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Cookie: cookie } : {}), ...(csrf ? { 'X-Requested-With': 'Cinemotes' } : {}) },
  body: body === undefined ? undefined : JSON.stringify(body),
})
before(async () => {
  api = await createIntegrationApi()
  const login = await request('/api/auth/login', 'POST', { username: api.username, proof: api.proof }, false)
  assert.equal(login.status, 200)
  cookie = login.headers.get('set-cookie').split(';')[0]
})
after(async () => { if (api) await api.close() })

test('gerenciamento exige administrador e protege alterações contra CSRF', async () => {
  for (const [method, route] of [['GET', '/api/users'], ['POST', '/api/users'], ['PATCH', `/api/users/${crypto.randomUUID()}`], ['DELETE', `/api/users/${crypto.randomUUID()}`]]) {
    assert.equal((await request(route, method, method === 'GET' ? undefined : payload, false)).status, 401)
    if (method !== 'GET') assert.equal((await request(route, method, payload, true, false)).status, 403)
  }
})

test('CRUD de criadores preserva role, valida canal, oculta credenciais e bloqueia login', async () => {
  const response = await request('/api/users', 'POST', payload)
  assert.equal(response.status, 201)
  const creator = await response.json()
  assert.equal(creator.role, 'CREATOR')
  assert.equal(creator.channelName, payload.channelName)
  assert.match(creator.channelId, /^[0-9a-f-]{36}$/)
  const channelId = creator.channelId
  for (const key of ['PasswordHash', 'passwordHash', 'proof', 'salt']) assert.equal(Object.hasOwn(creator, key), false)
  const route = `/api/users/${creator.id}`
  try {
    assert.deepEqual(await (await request(route)).json(), creator)
    const listed = await (await request('/api/users')).json()
    assert.ok(listed.some((item) => item.id === creator.id))
    assert.ok(listed.every((item) => !Object.hasOwn(item, 'PasswordHash')))
    const countBefore = await api.DB.prepare('SELECT COUNT(*) AS n FROM channels').first()
    assert.equal((await request('/api/users', 'POST', { ...payload, username: payload.username.toUpperCase() })).status, 409)
    assert.deepEqual(await api.DB.prepare('SELECT COUNT(*) AS n FROM channels').first(), countBefore)
    assert.equal((await request(route, 'PATCH', { role: 'ADMIN' })).status, 400)
    assert.equal((await request(route, 'PATCH', { channelId: crypto.randomUUID() })).status, 400)
    assert.equal((await request(route, 'PATCH', { channelName: 'GlobalCE' })).status, 400)
    for (const channelName of ['Nome Canal', ' nome', 'nome ', 'nome_', 'nome-', 'nome.', 'canál']) assert.equal((await request(route, 'PATCH', { channelName })).status, 400)
    const renameOnly = await request(route, 'PATCH', { channelName: 'RenamedChannel' })
    assert.equal(renameOnly.status, 200)
    assert.equal((await renameOnly.json()).channelId, channelId)
    assert.equal((await api.DB.prepare('SELECT channelName FROM channels WHERE id = ?').bind(channelId).first()).channelName, 'RenamedChannel')
    const updated = await request(route, 'PATCH', { username: 'renamed_creator', channelName: 'FinalChannel', salt, proof: 'b'.repeat(64) })
    assert.equal(updated.status, 200)
    const edited = await updated.json()
    assert.equal(edited.channelId, channelId)
    assert.equal(edited.channelName, 'FinalChannel')
    const login = await request('/api/auth/login', 'POST', { username: 'renamed_creator', proof: 'b'.repeat(64) }, false)
    assert.equal(login.status, 401)
    assert.equal(login.headers.get('set-cookie'), null)
    // Even a valid session cannot authorize a creator.
    const { sign } = await import('hono/jwt')
    const now = Math.floor(Date.now() / 1000)
    const sessionId = crypto.randomUUID()
    await api.DB.prepare('INSERT INTO AuthSession (Id, UserId, ExpiresAt) VALUES (?, ?, ?)').bind(sessionId, creator.id, now + 60).run()
    const token = await sign({ sub: creator.id, jti: sessionId, iat: now, exp: now + 60, iss: 'cinemotes-ledger', aud: 'cinemotes-creator' }, api.secret, 'HS256')
    assert.equal((await api.fetch('/api/users', { headers: { Cookie: `cinemotes_session=${token}` } })).status, 403)
    assert.equal((await request(route, 'DELETE')).status, 204)
    assert.equal((await request(route)).status, 404)
  } finally {
    await api.DB.prepare("DELETE FROM Users WHERE Id = ? AND Role = 'CREATOR'").bind(creator.id).run()
  }
})

test('administradores podem ser criados e editados, mas nunca excluídos ou convertidos', async () => {
  const response = await request('/api/users', 'POST', { ...payload, username: 'test_admin', role: 'ADMIN', channelName: undefined })
  assert.equal(response.status, 201)
  const admin = await response.json()
  const route = `/api/users/${admin.id}`
  assert.equal((await request(route, 'DELETE')).status, 403)
  assert.equal((await request(route, 'PATCH', { role: 'CREATOR' })).status, 400)
  assert.equal((await request(route, 'PATCH', { channelName: 'AdminChannel' })).status, 400)
  assert.equal((await request(route, 'PATCH', { username: 'updated_admin' })).status, 200)
  const login = await request('/api/auth/login', 'POST', { username: 'updated_admin', proof }, false)
  assert.equal(login.status, 200)
  const sessionCookie = login.headers.get('set-cookie').split(';')[0]
  assert.equal((await request(route, 'PATCH', { salt, proof: 'c'.repeat(64) })).status, 200)
  assert.equal((await api.fetch('/api/auth/me', { headers: { Cookie: sessionCookie } })).status, 401)
  await assert.rejects(api.DB.prepare("UPDATE Users SET Role = 'CREATOR' WHERE Id = ?").bind(admin.id).run())
  await assert.rejects(api.DB.prepare('DELETE FROM Users WHERE Id = ?').bind(admin.id).run())
})

test('cadastro rejeita perfis, credenciais e campos inválidos', async () => {
  for (const body of [null, [], {}, { ...payload, role: 'USER' }, { ...payload, proof: 'invalid' }, { ...payload, username: ' ' }, { ...payload, Active: 0 }, { ...payload, channelId: crypto.randomUUID() }, { ...payload, channelName: '' }, { ...payload, channelName: 'GlobalCE' }, { ...payload, channelName: 'x'.repeat(121) }, ...['Nome Canal', ' canal', 'canal ', 'canal_nome', 'canal-nome', 'canal.nome', 'canal@', 'canál', 'canal\nnome', 'canal\n'].map((channelName) => ({ ...payload, channelName }))]) {
    assert.equal((await request('/api/users', 'POST', body)).status, 400)
  }
})

test('criador reutiliza canal livre; UserCode reutiliza canal vinculado; outro dono e renomeação duplicada são bloqueados', async () => {
  const generated = await request('/api/usecode/generate', 'POST', { quantity: 2, receiver: 'ChannelReuseTest' })
  const codes = (await generated.json()).UUIDs
  const publicEmote = async (code, channel) => api.fetch('/api/emotes', {
    method: 'POST', headers: { 'Content-Type': 'application/json', UserCode: code },
    body: JSON.stringify({ emote_name: 'PublicEmote', url: 'https://example.com/emote.png', channel }),
  })
  assert.equal((await publicEmote(codes[0], 'ClaimableChannel')).status, 201)
  const original = await api.DB.prepare("SELECT id FROM channels WHERE channelName = 'ClaimableChannel'").first()
  const created = await request('/api/users', 'POST', { ...payload, username: 'channel_owner', channelName: 'claimablechannel' })
  assert.equal(created.status, 201)
  const creator = await created.json()
  assert.equal(creator.channelId, original.id)
  assert.equal(creator.channelName, 'ClaimableChannel')
  assert.equal((await publicEmote(codes[1], 'CLAIMABLECHANNEL')).status, 201)
  assert.equal((await api.DB.prepare('SELECT COUNT(*) AS n FROM channels WHERE lower(channelName) = ?').bind('claimablechannel').first()).n, 1)
  assert.equal((await api.DB.prepare('SELECT COUNT(*) AS n FROM emotes WHERE channelId = ?').bind(original.id).first()).n, 2)
  assert.equal((await request('/api/users', 'POST', { ...payload, username: 'other_owner', channelName: 'CLAIMABLECHANNEL' })).status, 409)
  const freeId = crypto.randomUUID()
  await api.DB.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').bind(freeId, 'AnotherFreeChannel').run()
  assert.equal((await request(`/api/users/${creator.id}`, 'PATCH', { username: 'must_rollback', channelName: 'anotherfreechannel' })).status, 409)
  const unchanged = await (await request(`/api/users/${creator.id}`)).json()
  assert.equal(unchanged.username, 'channel_owner')
  assert.equal(unchanged.channelId, original.id)
  assert.equal((await request(`/api/users/${creator.id}`, 'PATCH', { channelName: 'CLAIMABLECHANNEL' })).status, 200)
  assert.equal((await request(`/api/users/${creator.id}`, 'DELETE')).status, 204)
  const reclaimed = await request('/api/users', 'POST', { ...payload, username: 'new_channel_owner', channelName: 'claimablechannel' })
  assert.equal(reclaimed.status, 201)
  assert.equal((await reclaimed.json()).channelId, original.id)
})

test('cadastros concorrentes não duplicam canal nem permitem dois donos', async () => {
  const responses = await Promise.all([
    request('/api/users', 'POST', { ...payload, username: 'race_owner_one', channelName: 'RaceChannel' }),
    request('/api/users', 'POST', { ...payload, username: 'race_owner_two', channelName: 'racechannel' }),
  ])
  assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409])
  assert.equal((await api.DB.prepare("SELECT COUNT(*) AS n FROM channels WHERE lower(channelName) = 'racechannel'").first()).n, 1)
  assert.equal((await api.DB.prepare("SELECT COUNT(*) AS n FROM Users JOIN channels ON channels.id = Users.channelId WHERE lower(channelName) = 'racechannel'").first()).n, 1)
})
