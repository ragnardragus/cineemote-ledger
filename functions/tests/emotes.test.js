import assert from 'node:assert/strict'
import { createIntegrationApi } from './helpers/integration-api.js'
import { test as nodeTest, before, after } from 'node:test'

const test = nodeTest
let api
const testReceiver = `__test__:emotes:${crypto.randomUUID()}`
let authCookie = ''
const adminHeaders = () => ({ Cookie: authCookie, 'X-Requested-With': 'Cinemotes' })

const path = '/api/emotes'
const payload = { emote_name: "test'CRUD", url: 'https://example.com/emote.png', channel: 'TestChannel' }

async function request(route, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const generated = await (await api.fetch('/api/usecode/generate', { method: 'POST', headers: { ...adminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: 1, receiver: testReceiver }) })).json()
    headers.UserCode = generated.UUIDs[0]
  }
  return api.fetch(route, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

test('CRUD persiste dados e preserva os registros existentes', async () => {
  const before = await (await request(path)).json()
  assert.ok(Array.isArray(before))
  assert.ok(before.every((item) => item.channel === 'GlobalCE' && !Object.hasOwn(item, 'channelId')))
  const created = await request(path, 'POST', payload)
  assert.equal(created.status, 201)
  const emote = await created.json()
  assert.match(emote.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const route = `${path}/${emote.id}`
  try {
    assert.equal(created.headers.get('Location'), route)
    assert.deepEqual(emote, { id: emote.id, emote_name: payload.emote_name, url: payload.url, author: '', channel: 'TestChannel' })
    assert.deepEqual(await (await request(route)).json(), emote)
    assert.ok((await (await request(path)).json()).some((item) => item.id === emote.id))
    const patched = await request(route, 'PATCH', { author: 'Autor' })
    assert.equal(patched.status, 200)
    assert.deepEqual(await patched.json(), { ...emote, author: 'Autor' })
    const replaced = await request(route, 'PUT', { emote_name: 'changed', url: payload.url, author: 'Outro', channelId: '01952dac-b55c-4a28-8de1-efba3729bd96' })
    assert.equal(replaced.status, 200)
    assert.equal((await replaced.json()).emote_name, 'changed')
    for (const invalid of [{}, { url: 'javascript:alert(1)' }, { author: null }, { id: 1 }, []]) {
      assert.equal((await request(route, 'PATCH', invalid)).status, 400)
    }
    assert.equal((await request(route, 'PUT', { author: 'incomplete' })).status, 400)
    assert.equal((await request(route)).status, 200)
    assert.equal((await request(route, 'DELETE')).status, 204)
    for (const method of ['GET', 'DELETE', 'PATCH', 'PUT']) {
      assert.equal((await request(route, method, ['PUT', 'PATCH'].includes(method) ? { emote_name: payload.emote_name, url: payload.url, channelId: '01952dac-b55c-4a28-8de1-efba3729bd96' } : undefined)).status, 404)
    }
  } finally {
    await request(route, 'DELETE')
  }
  assert.deepEqual(await (await request(path)).json(), before)
})

test('rejeita JSON inválido, campos incorretos e IDs inválidos', async () => {
  for (const body of [null, [], {}, { ...payload, url: 'invalid' }, { ...payload, channel: ' ' }, { ...payload, channel: 'x'.repeat(121) }, ...['Nome Canal', ' canal', 'canal ', 'canal_nome', 'canal-nome', 'canal.nome', 'canal@', 'canál', 'canal\nnome'].map((channel) => ({ ...payload, channel })), { ...payload, channelId: crypto.randomUUID() }, { ...payload, author: 1 }]) {
    assert.equal((await request(path, 'POST', body)).status, 400)
  }
  const code = await (await api.fetch('/api/usecode/generate', { method: 'POST', headers: { ...adminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: 1, receiver: testReceiver }) })).json()
  const malformed = await api.fetch(path, { method: 'POST', headers: { UserCode: code.UUIDs[0] }, body: '{' })
  assert.equal(malformed.status, 400)
  for (const id of ['abc', '0', '-1', '1.5', '9007199254740992']) {
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await request(`${path}/${id}`, method, ['PUT', 'PATCH'].includes(method) ? { emote_name: payload.emote_name, url: payload.url, channelId: '01952dac-b55c-4a28-8de1-efba3729bd96' } : undefined)).status, 400)
    }
  }
})

test('UserCode autoriza uma única alteração e falhas não consomem o código', async () => {
  const generate = async () => (await (await api.fetch('/api/usecode/generate', { method: 'POST', headers: { ...adminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: 1, receiver: testReceiver }) })).json()).UUIDs[0]
  const send = (route, method, code, body) => api.fetch(route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(code === undefined ? {} : { UserCode: code }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const before = await (await request(path)).json()
  for (const code of [undefined, '', 'missing', 'ed9bf1bf-2f9e-4a2f-b7f4-e49a796d38ba']) {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      const response = await send(method === 'POST' ? path : `${path}/${before[0].id}`, method, code, method === 'DELETE' ? undefined : payload)
      assert.equal(response.status, !code ? 401 : 403)
    }
  }
  assert.deepEqual(await (await request(path)).json(), before)
  assert.equal((await request(`${path}/${before[0].id}`)).status, 200)

  const ids = []
  try {
    const code = await generate()
    for (const channel of ['GlobalCE', 'globalce', 'GLOBALCE']) {
      const rejected = await send(path, 'POST', code, { ...payload, channel })
      assert.equal(rejected.status, 400)
      assert.match((await rejected.json()).error, /GlobalCE/)
    }
    assert.deepEqual(await (await request(path)).json(), before)
    const created = await send(path, 'POST', code, payload)
    assert.equal(created.status, 201)
    const emote = await created.json()
    ids.push(emote.id)
    const route = `${path}/${emote.id}`
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await send(method === 'POST' ? path : route, method, code, method === 'DELETE' ? undefined : payload)).status, 403)
    }
    const validationCode = await generate()
    assert.equal((await send(route, 'PATCH', validationCode, { url: 'invalid' })).status, 400)
    assert.equal((await send(route, 'PATCH', validationCode, { author: 'Valid' })).status, 200)
    assert.equal((await send(route, 'PATCH', validationCode, { author: 'Again' })).status, 403)

    const missingCode = await generate()
    assert.equal((await send(`${path}/${crypto.randomUUID()}`, 'DELETE', missingCode)).status, 404)
    assert.equal((await send(route, 'PUT', missingCode, { emote_name: payload.emote_name, url: payload.url, channelId: '01952dac-b55c-4a28-8de1-efba3729bd96' })).status, 200)
    assert.equal((await send(route, 'DELETE', missingCode)).status, 403)

    const concurrentCode = await generate()
    const responses = await Promise.all([
      send(path, 'POST', concurrentCode, payload), send(path, 'POST', concurrentCode, payload),
    ])
    for (const response of responses) {
      if (response.status === 201) ids.push((await response.json()).id)
    }
    assert.deepEqual(responses.map((response) => response.status).sort(), [201, 403])
    const deleteCode = await generate()
    assert.equal((await send(route, 'DELETE', deleteCode)).status, 204)
    assert.equal((await send(path, 'POST', deleteCode, payload)).status, 403)
  } finally {
    for (const id of ids) await request(`${path}/${id}`, 'DELETE')
  }
  assert.deepEqual(await (await request(path)).json(), before)
})

test('cadastro cria ou reutiliza canal por nome sem duplicar em requisições simultâneas', async () => {
  const channel = `TestChannel${crypto.randomUUID().replaceAll('-', '')}`
  const ids = []
  try {
    const responses = await Promise.all([
      request(path, 'POST', { ...payload, channel }),
      request(path, 'POST', { ...payload, channel: channel.toUpperCase() }),
    ])
    for (const response of responses) {
      assert.equal(response.status, 201)
      const emote = await response.json()
      ids.push(emote.id)
      assert.equal(emote.channel.toLowerCase(), channel.toLowerCase())
    }
    const { results } = await api.DB.prepare('SELECT id FROM channels WHERE lower(trim(channelName)) = ?').bind(channel.toLowerCase()).all()
    assert.equal(results.length, 1)
    for (const id of ids) {
      const emote = await api.DB.prepare('SELECT channelId FROM emotes WHERE id = ?').bind(id).first()
      assert.equal(emote.channelId, results[0].id)
    }
    const code = (await (await api.fetch('/api/usecode/generate', { method: 'POST', headers: { ...adminHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ quantity: 1, receiver: testReceiver }) })).json()).UUIDs[0]
    const send = (body) => api.fetch(path, { method: 'POST', headers: { UserCode: code, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const rejectedName = `${channel}:invalid`
    assert.equal((await send({ ...payload, channel: rejectedName, url: 'invalid' })).status, 400)
    assert.equal((await api.DB.prepare('SELECT COUNT(*) AS n FROM channels WHERE channelName = ?').bind(rejectedName).first()).n, 0)
    const valid = await send({ ...payload, channel })
    assert.equal(valid.status, 201)
    ids.push((await valid.json()).id)
    assert.equal((await send({ ...payload, channel: rejectedName })).status, 403)
    assert.equal((await api.DB.prepare('SELECT COUNT(*) AS n FROM channels WHERE channelName = ?').bind(rejectedName).first()).n, 0)
  } finally {
    for (const id of ids) await request(`${path}/${id}`, 'DELETE')
    await api.DB.prepare('DELETE FROM channels WHERE lower(trim(channelName)) = ?').bind(channel.toLowerCase()).run()
  }
})

test('listagem por canal inclui GlobalCE, ignora outros canais e aceita filtro opcional sem autenticação', async () => {
  const names = [`list${crypto.randomUUID().replaceAll('-', '')}`, `other${crypto.randomUUID().replaceAll('-', '')}`]
  const ids = []
  const list = (query = {}) => api.fetch(`${path}?${new URLSearchParams(query)}`)
  try {
    for (const channel of names) {
      const created = await request(path, 'POST', { ...payload, channel })
      assert.equal(created.status, 201)
      ids.push((await created.json()).id)
    }
    const all = await (await request(path)).json()
    for (const body of [undefined, {}, { channelOnly: 'false' }]) {
      const response = await list(body)
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), all)
    }
    const filtered = await list({ channel: ` ${names[0].toUpperCase()} ` })
    assert.equal(filtered.status, 200)
    assert.deepEqual(await filtered.json(), all.filter((item) => ['globalce', names[0]].includes(item.channel.toLowerCase())))
    const global = all.filter((item) => item.channel === 'GlobalCE')
    for (const channel of ['GlobalCE', 'no-such-channel']) {
      assert.deepEqual(await (await list({ channel })).json(), global)
    }
    const onlyChannel = all.filter((item) => item.channel.toLowerCase() === names[0])
    assert.deepEqual(await (await list({ channel: names[0], channelOnly: 'true' })).json(), onlyChannel)
    assert.deepEqual(await (await list({ channel: names[0], channelOnly: 'false' })).json(), all.filter((item) => ['globalce', names[0]].includes(item.channel.toLowerCase())))
    assert.deepEqual(await (await list({ channel: 'missing-channel', channelOnly: 'true' })).json(), [])
    assert.deepEqual(await (await list({ channel: 'GlobalCE', channelOnly: 'true' })).json(), global)
    for (const query of [{ channel: '' }, { channel: ' ' }, { channel: 'x'.repeat(121) }, { channelOnly: 'true' }, { channelOnly: '1' }, { channel: names[0], channelOnly: 'invalid' }]) {
      assert.equal((await list(query)).status, 400)
    }

  } finally {
    for (const id of ids) await request(`${path}/${id}`, 'DELETE')
    for (const name of names) await api.DB.prepare('DELETE FROM channels WHERE channelName = ?').bind(name).run()
  }
})

before(async () => {
  api = await createIntegrationApi()
  await api.DB.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').bind('01952dac-b55c-4a28-8de1-efba3729bd96', 'TestChannel').run()
  const response = await api.fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes' },
    body: JSON.stringify({ username: api.username, proof: api.proof }),
  })
  assert.equal(response.status, 200, 'Login no ambiente isolado de testes')
  authCookie = response.headers.get('set-cookie').split(';')[0]
})

after(async () => {
  if (!api) return
  try {
    await api.DB.prepare('DELETE FROM UserCode WHERE Receiver = ?').bind(testReceiver).run()
    const { n } = await api.DB.prepare('SELECT COUNT(*) AS n FROM UserCode WHERE Receiver = ?').bind(testReceiver).first()
    assert.equal(n, 0, 'Todos os UserCodes gerados por esta bateria devem ser removidos')
    if (authCookie) await api.fetch('/api/auth/logout', { method: 'POST', headers: adminHeaders() })
  } finally {
    await api.close()
  }
})
