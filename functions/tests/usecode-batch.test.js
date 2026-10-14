import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import app from '../src/index.js'
import { authenticatedAdmin } from './helpers/admin.js'

test('geração em lote valida limites, persiste datas e evita inserção parcial em colisões', async (t) => {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  sqlite.exec(readFileSync(new URL('../migrations/0003_create_user_code.sql', import.meta.url), 'utf8'))
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...values) } },
            async first() { return sqlite.prepare(sql).get(...values) ?? null },
          }
        },
      }
    },
  }
  const admin = await authenticatedAdmin(sqlite)
  const env = { DB, JWT_SECRET: admin.JWT_SECRET }
  const generate = (body) => app.request('/api/usecode/generate', {
    method: 'POST', headers: { ...admin.headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, env)
  const start = Date.now()
  for (const quantity of [1, 5, 15]) {
    const response = await generate({ quantity })
    assert.equal(response.status, 201)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const { UUIDs } = await response.json()
    assert.equal(UUIDs.length, quantity)
    assert.equal(new Set(UUIDs).size, quantity)
    for (const uuid of UUIDs) {
      assert.match(uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      const row = sqlite.prepare('SELECT * FROM UserCode WHERE UUID = ?').get(uuid)
      assert.equal(row.Status, 'GENERATED')
      assert.ok(Date.parse(row.CreationDate) >= start && Date.parse(row.CreationDate) <= Date.now())
    }
  }
  for (const body of [null, [], {}, { quantity: 0 }, { quantity: 16 }, { quantity: -1 }, { quantity: 1.5 }, { quantity: '5' }, { quantity: true }, { quantity: 1, extra: 1 }]) {
    assert.equal((await generate(body)).status, 400)
  }
  assert.equal((await app.request('/api/usecode/generate', { method: 'POST', headers: admin.headers, body: '{' }, env)).status, 400)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM UserCode').get().n, 21)

  const existing = sqlite.prepare('SELECT UUID FROM UserCode LIMIT 1').get().UUID
  const fresh = Array.from({ length: 3 }, () => crypto.randomUUID())
  const sequence = [fresh[0], existing, fresh[1], fresh[2]]
  const uuidMock = t.mock.method(crypto, 'randomUUID', () => sequence.shift())
  const retried = await generate({ quantity: 2 })
  assert.equal(retried.status, 201)
  assert.deepEqual((await retried.json()).UUIDs, fresh.slice(1))
  assert.equal(sqlite.prepare('SELECT UUID FROM UserCode WHERE UUID = ?').get(fresh[0]), undefined)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM UserCode').get().n, 23)
  uuidMock.mock.restore()

  t.mock.method(crypto, 'randomUUID', () => existing)
  t.mock.method(console, 'error', () => {})
  assert.equal((await generate({ quantity: 2 })).status, 500)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM UserCode').get().n, 23)
})
