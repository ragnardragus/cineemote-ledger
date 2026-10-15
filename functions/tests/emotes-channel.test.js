import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'

test('migração relaciona todos os emotes ao GlobalCE e preserva UUIDs e dados', () => {
  const db = new DatabaseSync(':memory:')
  const migrate = (name) => db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const name of ['0001_create_emotes.sql', '0002_seed_emotes.sql', '0010_emotes_uuid.sql', '0011_create_channels.sql', '0012_seed_global_channel.sql']) migrate(name)
    const before = db.prepare('SELECT id, emote_name, url, author FROM emotes ORDER BY id').all()
    migrate('0014_emotes_channel_id.sql')
    assert.deepEqual(db.prepare('SELECT id, emote_name, url, author FROM emotes ORDER BY id').all(), before)
    assert.equal(db.prepare('PRAGMA table_info(emotes)').all().some((field) => field.name === 'channel'), false)
    const global = db.prepare("SELECT id FROM channels WHERE channelName = 'GlobalCE'").get().id
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM emotes WHERE channelId = ?').get(global).n, before.length)
    assert.throws(() => db.prepare('UPDATE emotes SET channelId = ?').run(crypto.randomUUID()), /FOREIGN KEY/)
    assert.throws(() => db.prepare('DELETE FROM channels WHERE id = ?').run(global), /FOREIGN KEY/)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db.close() }
})
