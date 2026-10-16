import { isValidChannelName, channelNameError } from '../channel-name.js'
import { validateEmoteImage, inspectImage, MAX_IMAGE_BYTES } from '../emote-image.js'
import { storeImage, removeUnusedImage, cleanupImages } from '../emote-storage.js'
import { bodyLimit } from 'hono/body-limit'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { requireCreator, requireSameOrigin } from '../auth/security.js'

const emotes = new Hono()
emotes.use('*', bodyLimit({ maxSize: MAX_IMAGE_BYTES + 65536, onError: (c) => c.json({ error: 'Envie uma imagem de até 1 MB.' }, 413) }))
const fields = ['emote_name', 'url', 'channelId']

async function requireEmoteWrite(c, next) {
  const code = c.req.header('UserCode')?.trim()
  if (!code) {
    const authorization = c.req.header('Authorization')
    const token = authorization?.match(/^Bearer ([^\s]+)$/i)?.[1]
    if (authorization && !token) throw new HTTPException(401, { message: 'Token de acesso inválido' })
    const authorizeChannel = async () => {
      const channel = await c.env.DB.prepare('SELECT channels.id, channels.channelName FROM Users JOIN channels ON channels.id = Users.channelId WHERE Users.Id = ?').bind(c.get('user').id).first()
      if (!channel || channel.channelName.trim().toLowerCase() === 'globalce') throw new HTTPException(403, { message: 'Criador sem canal disponível para gerenciar emotes' })
      c.set('creatorChannel', channel)
      return next()
    }
    return requireCreator(c, () => token ? authorizeChannel() : requireSameOrigin(c, authorizeChannel), token)
  }
  const record = await c.env.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(code).first()
  if (record?.Status !== 'GENERATED') {
    throw new HTTPException(403, { message: 'UserCode inválido ou indisponível' })
  }
  c.set('userCode', code)
  return next()
}

// O batch executa os dois comandos na mesma transação. O código só é
// consumido se o comando anterior realmente alterou um emote.
async function mutate(c, sql, values, preceding = []) {
  const code = c.get('userCode')
  const results = await c.env.DB.batch([
    ...preceding,
    c.env.DB.prepare(sql).bind(...values, code),
    c.env.DB.prepare(
      `UPDATE UserCode SET Status = 'USED'
       WHERE UUID = ? AND Status = 'GENERATED' AND changes() > 0`,
    ).bind(code),
  ])
  const emote = results[preceding.length].results[0]
  if (!emote) {
    const record = await c.env.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(code).first()
    if (record?.Status !== 'GENERATED') {
      throw new HTTPException(403, { message: 'UserCode inválido ou indisponível' })
    }
  }
  return emote
}

const registrationFields = (emote) => ({ ...emote, createdWithUserCode: emote.createdWithUserCode === null ? null : Boolean(emote.createdWithUserCode) })

const emoteSelect = `SELECT emotes.id, emotes.emote_name, emotes.url, emotes.consumer, emotes.createdWithUserCode,
  channels.channelName AS channel FROM emotes JOIN channels ON channels.id = emotes.channelId`

const creatorPermission = `EXISTS (SELECT 1 FROM Users
  JOIN AuthSession ON AuthSession.UserId = Users.Id
  JOIN channels ON channels.id = Users.channelId
  WHERE Users.Id = ? AND Users.channelId = ? AND Users.Active = 1 AND Users.Role = 'CREATOR'
    AND AuthSession.Id = ? AND AuthSession.ExpiresAt > CAST(strftime('%s', 'now') AS INTEGER)
    AND lower(trim(channels.channelName)) <> 'globalce')`

async function mutateAsCreator(c, sql, values) {
  return c.env.DB.prepare(sql).bind(...values, c.get('user').id, c.get('creatorChannel').id, c.get('sessionId')).first()
}

async function requireOwnEmote(c, id) {
  const record = await c.env.DB.prepare('SELECT channelId FROM emotes WHERE id = ?').bind(id).first()
  if (!record) throw new HTTPException(404, { message: 'Emote não encontrado' })
  if (record.channelId !== c.get('creatorChannel').id) throw new HTTPException(403, { message: 'Você só pode gerenciar emotes do seu canal' })
}

async function serializeEmote(c, emote) {
  const { channelId, imageKey: _imageKey, ...fields } = emote
  const channel = await c.env.DB.prepare('SELECT channelName FROM channels WHERE id = ?').bind(channelId).first()
  return registrationFields({ ...fields, channel: channel.channelName })
}

const availableCode = "EXISTS (SELECT 1 FROM UserCode WHERE UUID = ? AND Status = 'GENERATED')"

function badRequest(message) {
  throw new HTTPException(400, { message })
}

function getId(c) {
  const value = c.req.param('id')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    badRequest('ID deve ser um UUID v4 válido')
  }
  return value.toLowerCase()
}

async function readBody(c, partial = false, creating = false) {
  let body
  try {
    if (c.req.header('Content-Type')?.startsWith('multipart/form-data')) {
      const form = await c.req.formData()
      body = {}
      for (const [key, value] of form.entries()) {
        if (Object.hasOwn(body, key)) badRequest('Campos duplicados não são permitidos')
        body[key] = value
      }
    } else body = await c.req.json()
  } catch (error) {
    if (error instanceof HTTPException) throw error
    badRequest('Corpo deve conter JSON ou formulário válido')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    badRequest('Corpo deve ser um objeto JSON')
  }
  if (Object.hasOwn(body, 'image')) {
    if (!(body.image instanceof File) || !body.image.size || body.image.size > MAX_IMAGE_BYTES) badRequest('Envie uma imagem de até 1 MB.')
    if (Object.hasOwn(body, 'url')) badRequest('Envie uma imagem ou uma URL, não as duas opções.')
    const bytes = new Uint8Array(await body.image.arrayBuffer())
    c.set('imageUpload', { bytes, metadata: inspectImage(bytes) })
    delete body.image
    body.url = 'https://upload.invalid/pending'
  }
  const creatorChannel = c.get('creatorChannel')
  if (creatorChannel && creating && !Object.hasOwn(body, 'channel')) body.channel = creatorChannel.channelName
  if (creatorChannel && !creating && !partial && !Object.hasOwn(body, 'channelId')) body.channelId = creatorChannel.id
  const inputFields = creating ? ['emote_name', 'url', 'channel'] : fields
  if (Object.keys(body).some((key) => !inputFields.includes(key))) {
    badRequest(`Campos permitidos: ${inputFields.join(', ')}`)
  }
  if (partial && Object.keys(body).length === 0) {
    badRequest('Informe ao menos um campo para alterar')
  }
  for (const field of inputFields) {
    if (partial && !Object.hasOwn(body, field)) continue
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      badRequest(`${field} deve ser um texto não vazio`)
    }
  }
  if (Object.hasOwn(body, 'url')) {
    let url
    try {
      url = new URL(body.url)
    } catch {
      badRequest('url deve ser uma URL HTTP ou HTTPS válida')
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
      badRequest('url deve ser uma URL HTTP ou HTTPS válida')
    }
  }
  if (creating) {
    if (!isValidChannelName(body.channel)) badRequest(channelNameError)
    if (body.channel.toLowerCase() === 'globalce') badRequest('Não é permitido cadastrar emotes no canal GlobalCE')
  }
  if (Object.hasOwn(body, 'channelId')) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.channelId)) {
      badRequest('channelId deve ser um UUID v4 válido')
    }
    body.channelId = body.channelId.toLowerCase()
    const channel = await c.env.DB.prepare('SELECT channelName FROM channels WHERE id = ?').bind(body.channelId).first()
    if (!channel) badRequest('Canal inexistente')
    if (c.req.method === 'POST' && channel.channelName.trim().toLowerCase() === 'globalce') {
      badRequest('Não é permitido cadastrar emotes no canal GlobalCE')
    }
  }
  if (creatorChannel && (creating ? body.channel.toLowerCase() !== creatorChannel.channelName.trim().toLowerCase() : Object.hasOwn(body, 'channelId') && body.channelId !== creatorChannel.id)) {
    throw new HTTPException(403, { message: 'Você só pode gerenciar emotes do seu canal' })
  }
  return body
}

emotes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
  console.error(error)
  return c.json({ error: 'Erro interno da API' }, 500)
})

emotes.get('/', async (c) => {
  const channel = c.req.query('channel')
  const channelOnly = c.req.query('channelOnly')
  if (channelOnly !== undefined && !['true', 'false'].includes(channelOnly)) {
    badRequest('channelOnly deve ser true ou false')
  }
  if (channel === undefined) {
    if (channelOnly === 'true') badRequest('Informe channel para usar channelOnly=true')
    const { results } = await c.env.DB.prepare(`${emoteSelect} ORDER BY emotes.id`).all()
    return c.json(results.map(registrationFields))
  }
  if (!channel.trim() || channel.trim().length > 120) badRequest('channel deve ser um nome de canal de 1 a 120 caracteres')
  const filter = channelOnly === 'true'
    ? 'lower(trim(channels.channelName)) = lower(?)'
    : "lower(trim(channels.channelName)) IN ('globalce', lower(?))"
  const { results } = await c.env.DB.prepare(`${emoteSelect} WHERE ${filter} ORDER BY emotes.id`).bind(channel.trim()).all()
  return c.json(results.map(registrationFields))
})

emotes.get('/mine', requireCreator, async (c) => {
  const { results } = await c.env.DB.prepare(
    `${emoteSelect} WHERE emotes.channelId = (SELECT channelId FROM Users WHERE Id = ?) ORDER BY emotes.id`,
  ).bind(c.get('user').id).all()
  return c.json(results.map(registrationFields))
})

emotes.get('/:id', async (c) => {
  const emote = await c.env.DB.prepare(`${emoteSelect} WHERE emotes.id = ?`).bind(getId(c)).first()
  return emote ? c.json(registrationFields(emote)) : c.json({ error: 'Emote não encontrado' }, 404)
})

async function withImage(c, body, action) {
  const old = c.get('previousEmote')
  let uploaded
  try {
    if (c.get('imageUpload')) {
      uploaded = await storeImage(c, c.get('imageUpload'))
      body.url = uploaded.url
      body.imageKey = uploaded.key
    } else if (Object.hasOwn(body, 'url')) {
      if (old?.imageKey && old.url === body.url) body.imageKey = old.imageKey
      else {
        await validateEmoteImage(body.url)
        body.imageKey = null
      }
    }
    const result = await action()
    if (result.status >= 400 && uploaded) await removeUnusedImage(c.env, uploaded.key)
    if (old?.imageKey && Object.hasOwn(body, 'imageKey') && old.imageKey !== body.imageKey) await removeUnusedImage(c.env, old.imageKey)
    return result
  } catch (error) {
    if (uploaded) await removeUnusedImage(c.env, uploaded.key)
    throw error
  } finally {
    c.executionCtx.waitUntil(cleanupImages(c.env).catch(() => console.warn('Limpeza de imagens pendente.')))
  }
}

async function createEmote(c, body) {
  if (c.get('creatorChannel')) {
    const emote = await mutateAsCreator(c,
      `INSERT INTO emotes (id, emote_name, url, consumer, createdWithUserCode, channelId, imageKey) SELECT ?, ?, ?, (SELECT Username FROM Users WHERE Id = ?), 0, ?, ? WHERE ${creatorPermission} RETURNING *`,
      [crypto.randomUUID(), body.emote_name, body.url, c.get('user').id, c.get('creatorChannel').id, body.imageKey ?? null],
    )
    if (!emote) throw new HTTPException(403, { message: 'Permissão para cadastrar indisponível' })
    c.header('Location', `/api/emotes/${emote.id}`)
    return c.json(await serializeEmote(c, emote), 201)
  }
  const code = c.get('userCode')
  const channelLookup = `(SELECT id FROM channels WHERE lower(trim(channelName)) = lower(?) ORDER BY id LIMIT 1)`
  const createChannel = c.env.DB.prepare(
    `INSERT INTO channels (id, channelName)
     SELECT ?, ? WHERE ${availableCode}
     AND NOT EXISTS (SELECT 1 FROM channels WHERE lower(trim(channelName)) = lower(?))`,
  ).bind(crypto.randomUUID(), body.channel, code, body.channel)
  const emote = await mutate(c,
    `INSERT INTO emotes (id, emote_name, url, consumer, createdWithUserCode, channelId, imageKey)
     SELECT ?, ?, ?, (SELECT Receiver FROM UserCode WHERE UUID = ?), 1, ${channelLookup}, ? WHERE ${availableCode} RETURNING *`,
    [crypto.randomUUID(), body.emote_name, body.url, code, body.channel, body.imageKey ?? null],
    [createChannel],
  )
  c.header('Location', `/api/emotes/${emote.id}`)
  return c.json(await serializeEmote(c, emote), 201)
}

emotes.post('/', requireEmoteWrite, async (c) => {
  const body = await readBody(c, false, true)
  return withImage(c, body, () => createEmote(c, body))
})

async function update(c, partial) {
  const id = getId(c)
  const body = await readBody(c, partial)
  if (c.get('creatorChannel')) await requireOwnEmote(c, id)
  const previous = await c.env.DB.prepare('SELECT url, imageKey FROM emotes WHERE id = ?').bind(id).first()
  if (!previous) {
    throw new HTTPException(404, { message: 'Emote não encontrado' })
  }
  c.set('previousEmote', previous)
  return withImage(c, body, async () => {
    const keys = [...fields, 'imageKey'].filter((field) => Object.hasOwn(body, field))
    if (c.get('creatorChannel')) {
      const emote = await mutateAsCreator(c,
        `UPDATE emotes SET ${keys.map((field) => `${field} = ?`).join(', ')} WHERE id = ? AND channelId = ? AND url = ? AND imageKey IS ? AND ${creatorPermission} RETURNING *`,
        [...keys.map((field) => body[field]), id, c.get('creatorChannel').id, previous.url, previous.imageKey],
      )
      if (!emote) throw new HTTPException(403, { message: 'Permissão para alterar indisponível' })
      return c.json(await serializeEmote(c, emote))
    }
    const emote = await mutate(c,
      `UPDATE emotes SET ${keys.map((field) => `${field} = ?`).join(', ')}
       WHERE id = ? AND url = ? AND imageKey IS ? AND ${availableCode} RETURNING *`,
      [...keys.map((field) => body[field]), id, previous.url, previous.imageKey],
    )
    if (emote) return c.json(await serializeEmote(c, emote))
    const exists = await c.env.DB.prepare('SELECT id FROM emotes WHERE id = ?').bind(id).first()
    return exists ? c.json({ error: 'O emote foi alterado por outra requisição. Atualize e tente novamente.' }, 409) : c.json({ error: 'Emote não encontrado' }, 404)
  })
}

emotes.put('/:id', requireEmoteWrite, (c) => update(c, false))
emotes.patch('/:id', requireEmoteWrite, (c) => update(c, true))

emotes.delete('/:id', requireEmoteWrite, async (c) => {
  if (c.get('creatorChannel')) {
    const id = getId(c)
    await requireOwnEmote(c, id)
    const emote = await mutateAsCreator(c,
      `DELETE FROM emotes WHERE id = ? AND channelId = ? AND ${creatorPermission} RETURNING id, imageKey`,
      [id, c.get('creatorChannel').id],
    )
    if (!emote) throw new HTTPException(403, { message: 'Permissão para excluir indisponível' })
    await removeUnusedImage(c.env, emote.imageKey)
    return c.body(null, 204)
  }
  const emote = await mutate(c,
    `DELETE FROM emotes WHERE id = ? AND ${availableCode} RETURNING id, imageKey`,
    [getId(c)],
  )
  if (emote) await removeUnusedImage(c.env, emote.imageKey)
  return emote ? c.body(null, 204) : c.json({ error: 'Emote não encontrado' }, 404)
})

export default emotes
