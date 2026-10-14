import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { derivePasswordProof } from '../../frontend/src/auth/password.js'
import { createPasswordRecord } from '../src/auth/password.js'
import { provisionSql } from '../src/auth/provision.js'

const mode = process.argv[2]
if (!['--local', '--remote'].includes(mode) || !process.env.ADMIN_PASSWORD) {
  console.error('Defina ADMIN_PASSWORD no terminal e use npm run admin:provision -- --local ou --remote.')
  process.exit(1)
}
const username = process.env.ADMIN_USERNAME || 'ragnardragus'
const salt = Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
const proof = await derivePasswordProof(process.env.ADMIN_PASSWORD, salt)
delete process.env.ADMIN_PASSWORD
const record = await createPasswordRecord(proof, salt)
const sql = provisionSql(username, record)
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const directory = mkdtempSync(join(tmpdir(), 'cinemotes-auth-'))
const file = join(directory, 'credential.sql')
try {
  writeFileSync(file, sql, { mode: 0o600 })
  execFileSync(process.execPath, [join(project, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'DB', mode,
    '--config', mode === '--local' ? 'wrangler.local.jsonc' : 'wrangler.jsonc', '--file', file], {
    cwd: project, stdio: 'ignore', timeout: 120000,
  })
  console.log('Administrador provisionado; sessões anteriores revogadas. Nenhuma credencial foi publicada.')
} catch {
  console.error('Falha no provisionamento. Confira a autenticação do Wrangler, a configuração e as migrações do banco.')
  process.exitCode = 1
} finally {
  unlinkSync(file)
  rmdirSync(directory)
}
