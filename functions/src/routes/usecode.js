import { Hono } from 'hono'
import { requireAdmin, requireSameOrigin } from '../auth/security.js'

const usecode = new Hono()

usecode.post('/generate', requireAdmin, requireSameOrigin, async (c) => {
  const rawBody = await c.req.text()
  if (rawBody.trim()) {
    let body
    try { body = JSON.parse(rawBody) } catch {
      return c.json({ error: 'Corpo deve conter JSON válido' }, 400)
    }
    if (!body || Array.isArray(body) || typeof body !== 'object'
      || Object.keys(body).some((key) => key !== 'quantity')
      || !Number.isInteger(body.quantity) || body.quantity < 1 || body.quantity > 15) {
      return c.json({ error: 'quantity deve ser um inteiro entre 1 e 15' }, 400)
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const uuids = Array.from({ length: body.quantity }, () => crypto.randomUUID())
      const creationDate = new Date().toISOString()
      try {
        // Um único INSERT: se houver colisão, nenhum código do lote é inserido.
        const { results } = await c.env.DB.prepare(
          `INSERT INTO UserCode (UUID, Status, CreationDate) VALUES
           ${uuids.map(() => "(?, 'GENERATED', ?)").join(', ')} RETURNING UUID`,
        ).bind(...uuids.flatMap((uuid) => [uuid, creationDate])).all()
        c.header('Cache-Control', 'no-store')
        return c.json({ UUIDs: results.map((row) => row.UUID) }, 201)
      } catch (error) {
        if (!/UNIQUE constraint failed: UserCode\.UUID/i.test(error.message)) throw error
      }
    }
    throw new Error('Não foi possível gerar um lote de UUIDs únicos após três tentativas')
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const uuid = crypto.randomUUID()
    const result = await c.env.DB.prepare(
      `INSERT INTO UserCode (UUID, Status, CreationDate)
       VALUES (?, 'GENERATED', ?)
       ON CONFLICT (UUID) DO NOTHING
       RETURNING UUID`,
    ).bind(uuid, new Date().toISOString()).first()

    if (result) {
      c.header('Cache-Control', 'no-store')
      return c.json({ UUID: result.UUID }, 201)
    }
  }

  throw new Error('Não foi possível gerar um UUID único após três tentativas')
})

usecode.post('/unlock', async (c) => {
  c.header('Cache-Control', 'no-store')
  let body
  try {
    body = await c.req.json()
  } catch {
    return c.json({ message: 'código inválido ou inexistente' }, 400)
  }
  if (!body || typeof body.code !== 'string' || !body.code.trim()) {
    return c.json({ message: 'código inválido ou inexistente' }, 400)
  }

  const code = body.code.trim()
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  // Somente uma chamada pode consumir GENERATED; códigos já usados não são alterados.
  const updated = await c.env.DB.prepare(
    `UPDATE UserCode
     SET Status = CASE WHEN julianday(CreationDate) <= julianday(?)
       THEN 'EXPIRED' ELSE 'USED' END
     WHERE UUID = ? AND Status = 'GENERATED'
     RETURNING Status`,
  ).bind(cutoff, code).first()

  if (updated?.Status === 'USED') {
    return c.json({ message: 'codigo usado com sucesso' }, 200)
  }
  if (updated?.Status === 'EXPIRED') {
    return c.json({ message: 'código expirado' }, 410)
  }

  const existing = await c.env.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(code).first()
  if (!existing) return c.json({ message: 'código inválido ou inexistente' }, 404)
  if (existing.Status === 'EXPIRED') return c.json({ message: 'código expirado' }, 410)
  return c.json({ message: 'código já foi usado' }, 409)
})

export default usecode
