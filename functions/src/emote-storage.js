import { HTTPException } from 'hono/http-exception'

// Safety margin below the R2 allowance. This tracks files uploaded by this app.
export const STORAGE_LIMIT_BYTES = 9_000_000_000
export const imagePath = (key) => `/api/images/${key}`

export async function storeImage(c, upload) {
  if (!c.env.EMOTE_IMAGES) throw new HTTPException(503, { message: 'Armazenamento de imagens indisponível.' })
  const key = `emotes/${crypto.randomUUID()}.${upload.metadata.format}`
  const reservation = await c.env.DB.prepare(`INSERT INTO EmoteImage (ObjectKey, Size)
    SELECT ?, ? WHERE (SELECT COALESCE(SUM(Size), 0) FROM EmoteImage) + ? <= ? RETURNING ObjectKey`)
    .bind(key, upload.bytes.length, upload.bytes.length, STORAGE_LIMIT_BYTES).first()
  if (!reservation) throw new HTTPException(409, { message: 'O limite de armazenamento foi atingido. Novos uploads estão temporariamente bloqueados.' })
  try {
    await c.env.EMOTE_IMAGES.put(key, upload.bytes, { httpMetadata: {
      contentType: { gif: 'image/gif', png: 'image/png', jpg: 'image/jpeg' }[upload.metadata.format],
      cacheControl: 'public, max-age=86400',
    } })
  } catch {
    await removeUnusedImage(c.env, key)
    throw new HTTPException(503, { message: 'Não foi possível salvar a imagem. Tente novamente.' })
  }
  return { key, url: new URL(imagePath(key), c.req.url).href }
}

export async function removeUnusedImage(env, key) {
  if (!key) return
  // D1 may have committed even if its response was lost: check before deleting R2.
  try {
    const used = await env.DB.prepare('SELECT id FROM emotes WHERE imageKey = ? LIMIT 1').bind(key).first()
    if (used) return
    await env.EMOTE_IMAGES.delete(key)
    await env.DB.prepare('DELETE FROM EmoteImage WHERE ObjectKey = ?').bind(key).run()
  } catch {
    // Keep the reservation for quota accounting and retry on a later write.
    console.warn('Não foi possível limpar um arquivo de emote; limpeza pendente.')
  }
}

export async function cleanupImages(env) {
  const { results } = await env.DB.prepare(`SELECT ObjectKey FROM EmoteImage
    WHERE CreationDate < unixepoch() - 3600
      AND NOT EXISTS (SELECT 1 FROM emotes WHERE imageKey = ObjectKey)
    ORDER BY CreationDate LIMIT 10`).all()
  for (const row of results) await removeUnusedImage(env, row.ObjectKey)
}
