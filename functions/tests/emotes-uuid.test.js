import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('migração gera UUIDs únicos e preserva todos os dados dos emotes', () => {
  const db = new DatabaseSync(':memory:')
  try {
    for (const name of ['0001_create_emotes.sql', '0002_seed_emotes.sql']) {
      db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    }
    const before = db.prepare('SELECT emote_name, url, author, channel FROM emotes ORDER BY emote_name, url').all()
    db.exec(readFileSync(new URL('../migrations/0010_emotes_uuid.sql', import.meta.url), 'utf8'))
    const after = db.prepare('SELECT emote_name, url, author, channel FROM emotes ORDER BY emote_name, url').all()
    assert.deepEqual(after, before)
    const ids = db.prepare('SELECT id FROM emotes').all().map((row) => row.id)
    assert.equal(ids.length, 28)
    assert.equal(new Set(ids).size, ids.length)
    for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    const column = db.prepare('PRAGMA table_info(emotes)').all().find((column) => column.name === 'id')
    assert.equal(column.type, 'TEXT')
    assert.equal(column.pk, 1)
    assert.equal(column.notnull, 1)
  } finally { db.close() }
})
