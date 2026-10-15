import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import app from '../src/index.js'
import { authenticatedAdmin } from './helpers/admin.js'

test('geração salva UUID, status e data; colisões não sobrescrevem registros', async (t) => {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  sqlite.exec(readFileSync(new URL('../migrations/0003_create_user_code.sql', import.meta.url), 'utf8'))
  sqlite.exec(readFileSync(new URL('../migrations/0008_user_code_receiver.sql', import.meta.url), 'utf8'))
  sqlite.exec(readFileSync(new URL('../migrations/0009_user_code_receiver_required.sql', import.meta.url), 'utf8'))
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return { async first() { return sqlite.prepare(sql).get(...values) ?? null }, async all() { return { results: sqlite.prepare(sql).all(...values) } } }
        },
      }
    },
  }
  const admin = await authenticatedAdmin(sqlite)
  const generate = () => app.request('/api/usecode/generate', { method: 'POST', headers: admin.headers, body: JSON.stringify({ quantity: 1, receiver: 'Cinemotes' }) }, { DB, JWT_SECRET: admin.JWT_SECRET })
  const start = Date.now()
  const response = await generate()
  assert.equal(response.status, 201)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  const body = await response.json()
  assert.deepEqual(Object.keys(body), ['UUIDs'])
  assert.match(body.UUIDs[0], /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const saved = sqlite.prepare('SELECT * FROM UserCode WHERE UUID = ?').get(body.UUIDs[0])
  assert.equal(saved.Status, 'GENERATED')
  assert.ok(Date.parse(saved.CreationDate) >= start)
  assert.ok(Date.parse(saved.CreationDate) <= Date.now())

  const second = await (await generate()).json()
  assert.notEqual(second.UUIDs[0], body.UUIDs[0])

  sqlite.prepare("UPDATE UserCode SET Status = 'USED' WHERE UUID = ?").run(body.UUIDs[0])
  const fresh = crypto.randomUUID()
  let calls = 0
  const uuidMock = t.mock.method(crypto, 'randomUUID', () => ++calls === 1 ? body.UUIDs[0] : fresh)
  const retry = await generate()
  assert.equal(retry.status, 201)
  assert.deepEqual(await retry.json(), { UUIDs: [fresh] })
  assert.equal(calls, 2)
  assert.equal(sqlite.prepare('SELECT Status FROM UserCode WHERE UUID = ?').get(body.UUIDs[0]).Status, 'USED')
  uuidMock.mock.restore()

  t.mock.method(crypto, 'randomUUID', () => body.UUIDs[0])
  const logMock = t.mock.method(console, 'error', () => {})
  const exhausted = await generate()
  assert.equal(exhausted.status, 500)
  assert.deepEqual(await exhausted.json(), { error: 'Erro interno da API' })
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS total FROM UserCode').get().total, 3)
  logMock.mock.restore()
  assert.equal((await app.request('/api/usecode/generate', {}, { DB })).status, 404)
})
