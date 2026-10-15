import { isValidChannelName, channelNameError } from '../channel-name.js'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { bodyLimit } from 'hono/body-limit'
import { requireAdmin, requireSameOrigin } from '../auth/security.js'
import { createPasswordRecord } from '../auth/password.js'

const users = new Hono()
const columns = 'Users.Id AS id, Username AS username, Role AS role, Active AS active, CreationDate AS creationDate, channelId, channels.channelName AS channelName'
const userSelect = `SELECT ${columns} FROM Users LEFT JOIN channels ON channels.id = Users.channelId`
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const fail = (message, status = 400) => { throw new HTTPException(status, { message }) }
users.use('*', requireAdmin)
users.use('*', bodyLimit({ maxSize: 4096 }))
users.use('*', async (c, next) => ['POST', 'PATCH', 'DELETE'].includes(c.req.method) ? requireSameOrigin(c, next) : next())
users.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
  if (String(error.message).includes('UNIQUE constraint failed: Users.Username')) return c.json({ error: 'Nome de usuário já cadastrado' }, 409)
  console.error(error)
  return c.json({ error: 'Não foi possível concluir a operação' }, 500)
})

async function readBody(c, creating, current) {
  let body
  try { body = await c.req.json() } catch { fail('JSON inválido') }
  const allowed = ['username', 'channelName', 'salt', 'proof', ...(creating ? ['role'] : [])]
  if (!body || Array.isArray(body) || typeof body !== 'object' || !Object.keys(body).length) fail('Informe os dados do usuário')
  if (Object.keys(body).some((key) => !allowed.includes(key))) fail('Campos inválidos. A role não pode ser alterada.')
  if (creating || Object.hasOwn(body, 'username')) {
    if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_.-]{3,64}$/.test(body.username.trim())) fail('Usuário deve ter de 3 a 64 letras, números, pontos, traços ou sublinhados')
    body.username = body.username.trim()
  }
  if (creating && !['ADMIN', 'CREATOR'].includes(body.role)) fail('Escolha administrador ou criador')
  if (creating || Object.hasOwn(body, 'salt') || Object.hasOwn(body, 'proof')) {
    if (typeof body.salt !== 'string' || !/^[0-9a-f]{32}$/.test(body.salt) || typeof body.proof !== 'string' || !/^[0-9a-f]{64}$/.test(body.proof)) fail('Informe uma credencial válida')
    body.passwordHash = await createPasswordRecord(body.proof, body.salt)
  }
  const role = creating ? body.role : current.role
  if (creating && role === 'CREATOR' && !Object.hasOwn(body, 'channelName')) fail('Informe o nome do canal')
  if (Object.hasOwn(body, 'channelName')) {
    if (role !== 'CREATOR') fail('Somente criadores podem ter um canal')
    if (!isValidChannelName(body.channelName)) fail(channelNameError)
    if (body.channelName.toLowerCase() === 'globalce') fail('GlobalCE é reservado')
    if (!creating && !current.channelId) fail('Este usuário não possui canal vinculado para editar')
    if (!creating && current.channelName?.trim().toLowerCase() === 'globalce') fail('GlobalCE é reservado')
  }
  return body
}

async function find(c) {
  if (!uuid.test(c.req.param('id'))) fail('ID inválido')
  const user = await c.env.DB.prepare(`${userSelect} WHERE Users.Id = ?`).bind(c.req.param('id').toLowerCase()).first()
  if (!user) fail('Usuário não encontrado', 404)
  return user
}

users.get('/', async (c) => c.json((await c.env.DB.prepare(`${userSelect} ORDER BY Username`).all()).results))
users.get('/:id', async (c) => c.json(await find(c)))
users.post('/', async (c) => {
  const body = await readBody(c, true)
  const id = crypto.randomUUID()
  const channelId = body.role === 'CREATOR' ? crypto.randomUUID() : null
  const statements = []
  if (channelId) statements.push(c.env.DB.prepare('INSERT INTO channels (id, channelName) VALUES (?, ?)').bind(channelId, body.channelName))
  statements.push(c.env.DB.prepare('INSERT INTO Users (Id, Username, PasswordHash, Role, channelId) VALUES (?, ?, ?, ?, ?)')
    .bind(id, body.username, body.passwordHash, body.role, channelId))
  await c.env.DB.batch(statements)
  c.header('Location', `/api/users/${id}`)
  return c.json(await c.env.DB.prepare(`${userSelect} WHERE Users.Id = ?`).bind(id).first(), 201)
})
users.patch('/:id', async (c) => {
  const current = await find(c)
  const body = await readBody(c, false, current)
  const keys = ['username', 'passwordHash'].filter((key) => Object.hasOwn(body, key))
  const dbNames = { username: 'Username', passwordHash: 'PasswordHash' }
  const statements = []
  if (keys.length) statements.push(c.env.DB.prepare(`UPDATE Users SET ${keys.map((key) => `${dbNames[key]} = ?`).join(', ')} WHERE Id = ?`).bind(...keys.map((key) => body[key]), current.id))
  if (Object.hasOwn(body, 'channelName')) statements.push(c.env.DB.prepare('UPDATE channels SET channelName = ? WHERE id = ? AND EXISTS (SELECT 1 FROM Users WHERE Id = ? AND channelId = channels.id)').bind(body.channelName, current.channelId, current.id))
  if (body.passwordHash || body.username) statements.push(c.env.DB.prepare('DELETE FROM AuthSession WHERE UserId = ?').bind(current.id))
  await c.env.DB.batch(statements)
  return c.json(await c.env.DB.prepare(`${userSelect} WHERE Users.Id = ?`).bind(current.id).first())
})
users.delete('/:id', async (c) => {
  const current = await find(c)
  if (current.role === 'ADMIN') fail('Não é possível excluir um administrador', 403)
  await c.env.DB.prepare("DELETE FROM Users WHERE Id = ? AND Role = 'CREATOR'").bind(current.id).run()
  return c.body(null, 204)
})
export default users
