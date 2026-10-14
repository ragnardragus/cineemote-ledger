import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import app from '../src/index.js'

test('unlock respeita estados, limite de 24h, validação e consumo único', async (t) => {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  sqlite.exec(readFileSync(new URL('../migrations/0003_create_user_code.sql', import.meta.url), 'utf8'))
  const DB = {
    prepare(sql) {
      return {
        bind(...values) {
          return { async first() { return sqlite.prepare(sql).get(...values) ?? null } }
        },
      }
    },
  }
  const now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const insert = (code, status, age) => sqlite.prepare(
    'INSERT INTO UserCode (UUID, Status, CreationDate) VALUES (?, ?, ?)',
  ).run(code, status, new Date(now - age).toISOString())
  const day = 24 * 60 * 60 * 1000
  const unlock = (body) => app.request('/api/usecode/unlock', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }, { DB })
  const status = (code) => sqlite.prepare('SELECT Status FROM UserCode WHERE UUID = ?').get(code)?.Status
  async function expect(body, http, message) {
    const response = await unlock(body)
    assert.equal(response.status, http)
    assert.deepEqual(await response.json(), { message })
  }

  insert('new', 'GENERATED', 0)
  await expect({ code: 'new' }, 200, 'codigo usado com sucesso')
  assert.equal(status('new'), 'USED')
  await expect({ code: 'new' }, 409, 'código já foi usado')

  insert('before', 'GENERATED', day - 1)
  await expect({ code: 'before' }, 200, 'codigo usado com sucesso')
  insert('boundary', 'GENERATED', day)
  await expect({ code: 'boundary' }, 410, 'código expirado')
  assert.equal(status('boundary'), 'EXPIRED')
  insert('old', 'GENERATED', day + 1000)
  await expect({ code: 'old' }, 410, 'código expirado')
  assert.equal(status('old'), 'EXPIRED')
  insert('expired', 'EXPIRED', 0)
  await expect({ code: 'expired' }, 410, 'código expirado')
  insert('used', 'USED', day * 2)
  await expect({ code: 'used' }, 409, 'código já foi usado')
  assert.equal(status('used'), 'USED')
  await expect({ code: "missing' OR 1=1 --" }, 404, 'código inválido ou inexistente')
  for (const body of [null, {}, [], { code: '' }, { code: ' ' }, { code: 123 }]) {
    await expect(body, 400, 'código inválido ou inexistente')
  }
  const malformed = await app.request('/api/usecode/unlock', { method: 'POST', body: '{' }, { DB })
  assert.equal(malformed.status, 400)

  insert('race', 'GENERATED', 0)
  const concurrent = await Promise.all([unlock({ code: 'race' }), unlock({ code: 'race' })])
  assert.deepEqual(concurrent.map((res) => res.status).sort(), [200, 409])
  assert.equal(status('race'), 'USED')
  assert.equal(sqlite.prepare('SELECT CreationDate FROM UserCode WHERE UUID = ?').get('race').CreationDate, new Date(now).toISOString())
})
