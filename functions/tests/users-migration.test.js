import assert from 'node:assert/strict'
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('migração preserva usuários, converte criadores e protege roles e administradores', () => {
  const db = new DatabaseSync(':memory:')
  const migrate = (name) => db.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
  try {
    db.exec('PRAGMA foreign_keys = ON')
    for (const name of ['0005_create_auth.sql', '0011_create_channels.sql', '0012_seed_global_channel.sql', '0013_users_channel_id.sql']) migrate(name)
    const channelId = db.prepare('SELECT id FROM channels').get().id
    db.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role, channelId) VALUES (?, ?, ?, ?, ?)').run('admin', 'admin', 'hash-admin', 'ADMIN', null)
    db.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role, channelId) VALUES (?, ?, ?, ?, ?)').run('creator', 'creator', 'hash-creator', 'USER', channelId)
    db.prepare('INSERT INTO AuthSession (Id, UserId, ExpiresAt) VALUES (?, ?, ?)').run('session', 'admin', 9999999999)
    const before = db.prepare('SELECT Id, Username, PasswordHash, Active, CreationDate, channelId FROM Users ORDER BY Id').all()
    migrate('0015_user_management.sql')
    assert.deepEqual(db.prepare('SELECT Id, Username, PasswordHash, Active, CreationDate, channelId FROM Users ORDER BY Id').all(), before)
    assert.equal(db.prepare("SELECT Role FROM Users WHERE Id = 'creator'").get().Role, 'CREATOR')
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM AuthSession').get().n, 0)
    assert.throws(() => db.exec("UPDATE Users SET Role = 'CREATOR' WHERE Id = 'admin'"), /role cannot/)
    assert.throws(() => db.exec("UPDATE Users SET Role = 'ADMIN' WHERE Id = 'creator'"), /role cannot/)
    assert.throws(() => db.exec("DELETE FROM Users WHERE Id = 'admin'"), /cannot be deleted/)
    assert.throws(() => db.prepare("UPDATE Users SET channelId = ? WHERE Id = 'admin'").run(channelId), /CHECK/)
    db.exec("DELETE FROM Users WHERE Id = 'creator'")
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), [])
  } finally { db.close() }
})
