import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../migrations/0020_unique_channel_names.sql', import.meta.url), 'utf8')
function database() {
  const db = new DatabaseSync(':memory:')
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE channels (id TEXT PRIMARY KEY, channelName TEXT NOT NULL);
    CREATE INDEX idx_channels_name_lookup ON channels(lower(trim(channelName)));
    CREATE TABLE Users (Id TEXT PRIMARY KEY, Role TEXT, channelId TEXT REFERENCES channels(id));
    CREATE TABLE emotes (id TEXT PRIMARY KEY, emote_name TEXT, channelId TEXT REFERENCES channels(id));
    CREATE TABLE AuthSession (Id TEXT PRIMARY KEY, UserId TEXT REFERENCES Users(Id));
    INSERT INTO channels VALUES ('a', 'Ferbr'), ('z', 'ferbr'), ('global', 'GlobalCE'), ('otherglobal', ' globalce '), ('empty1', 'FreeChannel'), ('empty2', 'freechannel');
    INSERT INTO Users VALUES ('creator', 'CREATOR', 'z');
    INSERT INTO emotes VALUES ('one', 'One', 'a'), ('two', 'Two', 'z'), ('three', 'Three', 'otherglobal');
    INSERT INTO AuthSession VALUES ('session', 'creator');`)
  return db
}

test('migration merges duplicate channels, prefers the owner UUID and preserves emotes/users', () => {
  const db = database()
  try {
    db.exec(migration)
    assert.deepEqual(db.prepare('SELECT id FROM channels ORDER BY id').all().map((r) => r.id), ['empty1', 'global', 'z'])
    assert.deepEqual(db.prepare('SELECT channelId FROM emotes ORDER BY id').all().map((r) => r.channelId), ['z', 'global', 'z'])
    assert.equal(db.prepare('SELECT channelId FROM Users').get().channelId, 'z')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM AuthSession').get().n, 1)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM emotes').get().n, 3)
    assert.throws(() => db.prepare('INSERT INTO channels VALUES (?, ?)').run('duplicate', ' FERBR '))
    assert.throws(() => db.prepare('UPDATE channels SET channelName = ? WHERE id = ?').run('FERBR', 'empty1'))
    assert.throws(() => db.prepare('INSERT INTO Users VALUES (?, ?, ?)').run('second', 'CREATOR', 'z'))
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db.close() }
})

test('migration aborts atomically if duplicate names belong to different creators', () => {
  const db = database()
  try {
    db.exec("INSERT INTO Users VALUES ('second', 'CREATOR', 'a')")
    const before = db.prepare('SELECT * FROM channels ORDER BY id').all()
    db.exec('BEGIN')
    assert.throws(() => db.exec(migration), /conflicting_channel_owners/)
    db.exec('ROLLBACK')
    assert.deepEqual(db.prepare('SELECT * FROM channels ORDER BY id').all(), before)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM Users').get().n, 2)
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db.close() }
})
