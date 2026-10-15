import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { isValidChannelName } from '../src/channel-name.js'

const invalid = ['', ' ', 'Meu Canal', ' canal', 'canal ', 'canal_', 'canal-', 'canal.nome', '@canal', 'canál', 'canal\n', 'canal\tnome', '😀', 'a'.repeat(121)]

test('nome de canal permite somente letras ASCII e números na API e no banco', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec(readFileSync(new URL('../migrations/0011_create_channels.sql', import.meta.url), 'utf8'))
    db.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').run('legacy', 'Legacy Channel')
    db.exec(readFileSync(new URL('../migrations/0017_channels_name_validation.sql', import.meta.url), 'utf8'))
    for (const value of ['Cinemotes', 'channel123', '123', 'A'.repeat(120)]) {
      assert.equal(isValidChannelName(value), true)
      db.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').run(crypto.randomUUID(), value)
    }
    for (const value of invalid) {
      assert.equal(isValidChannelName(value), false, JSON.stringify(value))
      assert.throws(() => db.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').run(crypto.randomUUID(), value))
      assert.throws(() => db.prepare('UPDATE channels SET channelName = ? WHERE id = ?').run(value, 'legacy'))
    }
    for (const value of [null, undefined, 123, {}, []]) assert.equal(isValidChannelName(value), false)
    assert.equal(db.prepare('SELECT channelName FROM channels WHERE id = ?').get('legacy').channelName, 'Legacy Channel')
    db.prepare('UPDATE channels SET channelName = ? WHERE id = ?').run('LegacyChannel', 'legacy')
  } finally { db.close() }
})
