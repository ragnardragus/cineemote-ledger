import assert from 'node:assert/strict'
import { test as nodeTest, before, after } from 'node:test'

const test = process.env.TEST_ADMIN_PASSWORD ? nodeTest : nodeTest.skip
let authCookie = ''
const adminHeaders = () => ({ Cookie: authCookie, 'X-Requested-With': 'Cinemotes' })

const base = process.env.API_URL || 'http://127.0.0.1:8787'
const path = '/api/emotes'
const payload = { emote_name: "test'CRUD", url: 'https://example.com/emote.png', channel: 'test' }

async function request(route, method = 'GET', body) {
  const headers = { 'Content-Type': 'application/json' }
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const generated = await (await fetch(`${base}/api/usecode/generate`, { method: 'POST', headers: adminHeaders() })).json()
    headers.UserCode = generated.UUID
  }
  return fetch(`${base}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

test('CRUD persiste dados e preserva os registros existentes', async () => {
  const before = await (await request(path)).json()
  assert.ok(Array.isArray(before))
  const created = await request(path, 'POST', payload)
  assert.equal(created.status, 201)
  const emote = await created.json()
  const route = `${path}/${emote.id}`
  try {
    assert.equal(created.headers.get('Location'), route)
    assert.deepEqual(emote, { id: emote.id, ...payload, author: '' })
    assert.deepEqual(await (await request(route)).json(), emote)
    assert.ok((await (await request(path)).json()).some((item) => item.id === emote.id))
    const patched = await request(route, 'PATCH', { author: 'Autor' })
    assert.equal(patched.status, 200)
    assert.deepEqual(await patched.json(), { ...emote, author: 'Autor' })
    const replaced = await request(route, 'PUT', { ...payload, emote_name: 'changed', author: 'Outro' })
    assert.equal(replaced.status, 200)
    assert.equal((await replaced.json()).emote_name, 'changed')
    for (const invalid of [{}, { url: 'javascript:alert(1)' }, { author: null }, { id: 1 }, []]) {
      assert.equal((await request(route, 'PATCH', invalid)).status, 400)
    }
    assert.equal((await request(route, 'PUT', { author: 'incomplete' })).status, 400)
    assert.equal((await request(route)).status, 200)
    assert.equal((await request(route, 'DELETE')).status, 204)
    for (const method of ['GET', 'DELETE', 'PATCH', 'PUT']) {
      assert.equal((await request(route, method, ['PUT', 'PATCH'].includes(method) ? payload : undefined)).status, 404)
    }
  } finally {
    await request(route, 'DELETE')
  }
  assert.deepEqual(await (await request(path)).json(), before)
})

test('rejeita JSON inválido, campos incorretos e IDs inválidos', async () => {
  for (const body of [null, [], {}, { ...payload, url: 'invalid' }, { ...payload, channel: ' ' }, { ...payload, author: 1 }]) {
    assert.equal((await request(path, 'POST', body)).status, 400)
  }
  const code = await (await fetch(`${base}/api/usecode/generate`, { method: 'POST', headers: adminHeaders() })).json()
  const malformed = await fetch(`${base}${path}`, { method: 'POST', headers: { UserCode: code.UUID }, body: '{' })
  assert.equal(malformed.status, 400)
  for (const id of ['abc', '0', '-1', '1.5', '9007199254740992']) {
    for (const method of ['GET', 'PUT', 'PATCH', 'DELETE']) {
      assert.equal((await request(`${path}/${id}`, method, ['PUT', 'PATCH'].includes(method) ? payload : undefined)).status, 400)
    }
  }
})

test('UserCode autoriza uma única alteração e falhas não consomem o código', async () => {
  const generate = async () => (await (await fetch(`${base}/api/usecode/generate`, { method: 'POST', headers: adminHeaders() })).json()).UUID
  const send = (route, method, code, body) => fetch(`${base}${route}`, {
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
    for (const channel of ['GlobalCE', 'globalce', ' GlobalCE ']) {
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
    assert.equal((await send(`${path}/9007199254740991`, 'DELETE', missingCode)).status, 404)
    assert.equal((await send(route, 'PUT', missingCode, payload)).status, 200)
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

before(async () => {
  if (!process.env.TEST_ADMIN_PASSWORD) return
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Cinemotes' },
    body: JSON.stringify({ username: process.env.TEST_ADMIN_USERNAME || 'ragnardragus', password: process.env.TEST_ADMIN_PASSWORD }),
  })
  assert.equal(response.status, 200, 'Login para testes de integração')
  authCookie = response.headers.get('set-cookie').split(';')[0]
})

after(async () => {
  if (authCookie) await fetch(`${base}/api/auth/logout`, { method: 'POST', headers: adminHeaders() })
})