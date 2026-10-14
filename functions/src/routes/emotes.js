import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'

const emotes = new Hono()
const fields = ['emote_name', 'url', 'author', 'channel']

emotes.use('*', async (c, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) return next()
  const code = c.req.header('UserCode')?.trim()
  if (!code) throw new HTTPException(401, { message: 'Cabeçalho UserCode obrigatório' })
  const record = await c.env.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(code).first()
  if (record?.Status !== 'GENERATED') {
    throw new HTTPException(403, { message: 'UserCode inválido ou indisponível' })
  }
  c.set('userCode', code)
  return next()
})

// O batch executa os dois comandos na mesma transação. O código só é
// consumido se o comando anterior realmente alterou um emote.
async function mutate(c, sql, values) {
  const code = c.get('userCode')
  const [result] = await c.env.DB.batch([
    c.env.DB.prepare(sql).bind(...values, code),
    c.env.DB.prepare(
      `UPDATE UserCode SET Status = 'USED'
       WHERE UUID = ? AND Status = 'GENERATED' AND changes() > 0`,
    ).bind(code),
  ])
  const emote = result.results[0]
  if (!emote) {
    const record = await c.env.DB.prepare('SELECT Status FROM UserCode WHERE UUID = ?').bind(code).first()
    if (record?.Status !== 'GENERATED') {
      throw new HTTPException(403, { message: 'UserCode inválido ou indisponível' })
    }
  }
  return emote
}

const availableCode = "EXISTS (SELECT 1 FROM UserCode WHERE UUID = ? AND Status = 'GENERATED')"

function badRequest(message) {
  throw new HTTPException(400, { message })
}

function getId(c) {
  const value = c.req.param('id')
  const id = Number(value)
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
    badRequest('ID deve ser um inteiro positivo')
  }
  return id
}

async function readBody(c, partial = false) {
  let body
  try {
    body = await c.req.json()
  } catch {
    badRequest('Corpo deve conter JSON válido')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    badRequest('Corpo deve ser um objeto JSON')
  }
  if (Object.keys(body).some((key) => !fields.includes(key))) {
    badRequest('Campos permitidos: emote_name, url, author e channel')
  }
  if (partial && Object.keys(body).length === 0) {
    badRequest('Informe ao menos um campo para alterar')
  }
  for (const field of fields) {
    if (partial && !Object.hasOwn(body, field)) continue
    if (field === 'author' && !Object.hasOwn(body, field)) {
      body.author = ''
      continue
    }
    if (typeof body[field] !== 'string' || (field !== 'author' && !body[field].trim())) {
      badRequest(`${field} deve ser um texto${field === 'author' ? '' : ' não vazio'}`)
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
  return body
}

emotes.onError((error, c) => {
  if (error instanceof HTTPException) return c.json({ error: error.message }, error.status)
  console.error(error)
  return c.json({ error: 'Erro interno da API' }, 500)
})

emotes.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM emotes ORDER BY id').all()
  return c.json(results)
})

emotes.get('/:id', async (c) => {
  const emote = await c.env.DB.prepare('SELECT * FROM emotes WHERE id = ?').bind(getId(c)).first()
  return emote ? c.json(emote) : c.json({ error: 'Emote não encontrado' }, 404)
})

emotes.post('/', async (c) => {
  const body = await readBody(c)
  if (body.channel.trim().toLowerCase() === 'globalce') {
    badRequest('Não é permitido cadastrar emotes no channel GlobalCE')
  }
  const emote = await mutate(c,
    `INSERT INTO emotes (emote_name, url, author, channel)
     SELECT ?, ?, ?, ? WHERE ${availableCode} RETURNING *`,
    fields.map((field) => body[field]),
  )
  c.header('Location', `/api/emotes/${emote.id}`)
  return c.json(emote, 201)
})

async function update(c, partial) {
  const id = getId(c)
  const body = await readBody(c, partial)
  const keys = fields.filter((field) => Object.hasOwn(body, field))
  const emote = await mutate(c,
    `UPDATE emotes SET ${keys.map((field) => `${field} = ?`).join(', ')}
     WHERE id = ? AND ${availableCode} RETURNING *`,
    [...keys.map((field) => body[field]), id],
  )
  return emote ? c.json(emote) : c.json({ error: 'Emote não encontrado' }, 404)
}

emotes.put('/:id', (c) => update(c, false))
emotes.patch('/:id', (c) => update(c, true))

emotes.delete('/:id', async (c) => {
  const emote = await mutate(c,
    `DELETE FROM emotes WHERE id = ? AND ${availableCode} RETURNING id`,
    [getId(c)],
  )
  return emote ? c.body(null, 204) : c.json({ error: 'Emote não encontrado' }, 404)
})

export default emotes
