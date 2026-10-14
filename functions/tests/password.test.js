import assert from 'node:assert/strict'
import { pbkdf2Sync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { derivePasswordProof } from '../../frontend/src/auth/password.js'
import { createPasswordRecord, dummySalt, parsePasswordRecord, verifyPasswordProof } from '../src/auth/password.js'
import { provisionSql } from '../src/auth/provision.js'

test('derivação corresponde ao PBKDF2 padrão; verificador armazenado não é uma credencial de login', async () => {
  const salt = '0123456789abcdef0123456789abcdef'
  const proof = await derivePasswordProof('test-password', salt)
  assert.equal(proof, pbkdf2Sync('test-password', Buffer.from(salt, 'hex'), 600000, 32, 'sha256').toString('hex'))
  const record = await createPasswordRecord(proof, salt)
  assert.equal(await verifyPasswordProof(proof, record), true)
  assert.equal(await verifyPasswordProof('0'.repeat(64), record), false)
  assert.equal(await verifyPasswordProof(parsePasswordRecord(record).verifier, record), false)
  assert.equal(await verifyPasswordProof(proof, 'malformed'), false)
  assert.equal(await verifyPasswordProof('malformed', record), false)
  assert.equal(await verifyPasswordProof(proof, record + '$extra'), false)
  await assert.rejects(derivePasswordProof('test', salt, 1))
  await assert.rejects(derivePasswordProof('test', 'bad-salt'))
  const a = await dummySalt('UNKNOWN', 'secret')
  assert.equal(a, await dummySalt('unknown', 'secret'))
  assert.notEqual(a, await dummySalt('unknown', 'another-secret'))
})

test('provisionamento atualiza apenas o administrador solicitado e revoga suas sessões', async () => {
  const sqlite = new DatabaseSync(':memory:')
  try {
    for (const name of ['0005_create_auth.sql', '0006_seed_admin.sql']) sqlite.exec(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'))
    const user = sqlite.prepare('SELECT * FROM Users').get()
    sqlite.prepare('INSERT INTO AuthSession (Id, UserId, ExpiresAt) VALUES (?, ?, ?)').run('session', user.Id, 9999999999)
    const record = await createPasswordRecord('1'.repeat(64), '0'.repeat(32))
    sqlite.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role) VALUES (?, ?, ?, ?)').run('other', 'other', 'custom-password-hash', 'ADMIN')
    const migration = provisionSql('ragnardragus', record)
    sqlite.exec(migration)
    assert.ok(parsePasswordRecord(sqlite.prepare('SELECT PasswordHash FROM Users').get().PasswordHash))
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM AuthSession').get().n, 0)
    assert.equal(sqlite.prepare('SELECT PasswordHash FROM Users WHERE Id = ?').get('other').PasswordHash, 'custom-password-hash')
  } finally { sqlite.close() }
})
