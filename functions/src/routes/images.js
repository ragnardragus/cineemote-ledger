import { Hono } from 'hono'

const images = new Hono()
images.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  c.header('Access-Control-Expose-Headers', 'ETag, Content-Length, Content-Type')
  c.header('Cross-Origin-Resource-Policy', 'cross-origin')
  await next()
})
images.options('*', (c) => c.body(null, 204))
images.on(['GET', 'HEAD'], '/emotes/:file', async (c) => {
  const file = c.req.param('file')
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(gif|png|jpg)$/.test(file)) return c.json({ error: 'Imagem não encontrada' }, 404)
  if (!c.env.EMOTE_IMAGES) return c.json({ error: 'Armazenamento indisponível' }, 503)
  const key = `emotes/${file}`
  // Unfinished uploads and orphan files are not published.
  if (!await c.env.DB.prepare('SELECT id FROM emotes WHERE imageKey = ? LIMIT 1').bind(key).first()) return c.json({ error: 'Imagem não encontrada' }, 404)
  const object = c.req.method === 'HEAD' ? await c.env.EMOTE_IMAGES.head(key) : await c.env.EMOTE_IMAGES.get(key)
  if (!object) return c.json({ error: 'Imagem não encontrada' }, 404)
  object.writeHttpMetadata(c.res.headers)
  c.header('ETag', object.httpEtag)
  c.header('Content-Length', String(object.size))
  c.header('Cache-Control', 'public, max-age=86400')
  c.header('X-Content-Type-Options', 'nosniff')
  if (c.req.header('If-None-Match')?.split(',').some((value) => value.trim() === object.httpEtag || value.trim() === '*')) {
    c.res.headers.delete('Content-Length')
    await object.body?.cancel()
    return c.body(null, 304)
  }
  return c.body(c.req.method === 'HEAD' ? null : object.body)
})
export default images
