import { fileURLToPath } from 'node:url'
import { createTestHarness } from 'wrangler'
import { derivePasswordProof } from '../../../frontend/src/auth/password.js'
import { createPasswordRecord } from '../../src/auth/password.js'
import { TEST_SECRET } from './admin.js'

export async function createIntegrationApi() {
  const server = createTestHarness({
    root: fileURLToPath(new URL('../..', import.meta.url)),
    workers: [{ config: {
      name: 'cinemotes-integration-test',
      main: 'tests/helpers/integration-worker.js',
      compatibility_date: '2026-10-13',
      compatibility_flags: ['global_fetch_strictly_public'],
      vars: { JWT_SECRET: TEST_SECRET },
      r2_buckets: [{ binding: 'EMOTE_IMAGES', bucket_name: 'integration-images' }],
      d1_databases: [{ binding: 'DB', database_name: 'integration-test', database_id: crypto.randomUUID(), migrations_dir: 'migrations' }],
    } }],
  })
  try {
    await server.listen()
    const worker = server.getWorker()
    await worker.applyD1Migrations('DB')
    const { DB, JWT_SECRET, EMOTE_IMAGES } = await worker.getEnv()
    const username = 'integration-admin'
    const salt = '0123456789abcdef0123456789abcdef'
    const proof = await derivePasswordProof('temporary-test-password', salt)
    const record = await createPasswordRecord(proof, salt)
    await DB.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role) VALUES (?, ?, ?, ?)')
      .bind(crypto.randomUUID(), username, record, 'ADMIN').run()
    return { secret: JWT_SECRET, fetch: server.fetch.bind(server), DB, EMOTE_IMAGES, username, proof, close: () => server.close() }
  } catch (error) {
    await server.close()
    throw error
  }
}
