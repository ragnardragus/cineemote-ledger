import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('consumer migration preserves emotes and requires a nonblank consumer', () => {
  const db = new DatabaseSync(':memory:')
  try {
    db.exec("PRAGMA foreign_keys = ON; CREATE TABLE channels (id TEXT PRIMARY KEY); INSERT INTO channels VALUES ('channel'); CREATE TABLE emotes (id TEXT PRIMARY KEY, emote_name TEXT, url TEXT, author TEXT, channelId TEXT REFERENCES channels(id)); INSERT INTO emotes VALUES ('emote', 'Name', 'https://example.com/emote.gif', 'Old author', 'channel');")
    db.exec(readFileSync(new URL('../migrations/0018_emotes_consumer.sql', import.meta.url), 'utf8'))
    assert.deepEqual({ ...db.prepare('SELECT * FROM emotes').get() }, { id: 'emote', emote_name: 'Name', url: 'https://example.com/emote.gif', consumer: 'ragnardragus', createdWithUserCode: null, channelId: 'channel' })
    const insert = db.prepare('INSERT INTO emotes (id, emote_name, url, consumer, createdWithUserCode, channelId) VALUES (?, ?, ?, ?, ?, ?)')
    for (const consumer of [null, '', '   ']) assert.throws(() => insert.run(crypto.randomUUID(), 'Name', 'url', consumer, 0, 'channel'))
    assert.throws(() => insert.run('invalid', 'Name', 'url', 'User', 2, 'channel'))
    assert.throws(() => insert.run('foreign', 'Name', 'url', 'User', 0, 'missing'))
    for (const source of [0, 1]) insert.run(crypto.randomUUID(), 'Name', 'url', 'User', source, 'channel')
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db.close() }
})
