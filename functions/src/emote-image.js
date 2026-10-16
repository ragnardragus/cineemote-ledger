import { HTTPException } from 'hono/http-exception'

export const MAX_IMAGE_BYTES = 1024 * 1024
export const MAX_IMAGE_DIMENSION = 200
const fail = (message) => { throw new HTTPException(400, { message }) }
const invalid = () => fail('Imagem inválida ou formato não permitido. Use GIF, JPG ou PNG.')

// Read metadata from the bytes, never from the filename or Content-Type.
export function inspectImage(bytes) {
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) fail('A imagem deve ter no máximo 1 MB (1.048.576 bytes).')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const text = (start, end) => String.fromCharCode(...bytes.subarray(start, end))
  let width, height, format
  if (bytes.length >= 33 && text(0, 8) === '\x89PNG\r\n\x1a\n') {
    format = 'png'
    if (view.getUint32(8) !== 13 || text(12, 16) !== 'IHDR') invalid()
    width = view.getUint32(16); height = view.getUint32(20)
    let offset = 8, data = false, ended = false
    while (offset + 12 <= bytes.length) {
      const size = view.getUint32(offset), type = text(offset + 4, offset + 8)
      if (offset + 12 + size > bytes.length) invalid()
      if (type === 'IHDR' && offset !== 8) invalid()
      if (type === 'fcTL') {
        if (size !== 26) invalid()
        const w = view.getUint32(offset + 12), h = view.getUint32(offset + 16)
        if (!w || !h || w + view.getUint32(offset + 20) > width || h + view.getUint32(offset + 24) > height) invalid()
      }
      if (type === 'IDAT' && size) data = true
      offset += 12 + size
      if (type === 'IEND') { ended = size === 0 && offset === bytes.length; break }
    }
    if (!data || !ended) invalid()
  } else if (bytes.length >= 14 && ['GIF87a', 'GIF89a'].includes(text(0, 6))) {
    format = 'gif'; width = view.getUint16(6, true); height = view.getUint16(8, true)
    let offset = 13 + ((bytes[10] & 128) ? 3 * (2 ** ((bytes[10] & 7) + 1)) : 0)
    let frames = 0, ended = false
    const subblocks = () => {
      while (offset < bytes.length) {
        const size = bytes[offset++]
        if (!size) return
        offset += size
        if (offset > bytes.length) invalid()
      }
      invalid()
    }
    while (offset < bytes.length) {
      const type = bytes[offset++]
      if (type === 0x3b) { ended = offset === bytes.length; break }
      if (type === 0x21) { if (offset >= bytes.length) invalid(); offset++; subblocks(); continue }
      if (type !== 0x2c || offset + 9 > bytes.length) invalid()
      const x = view.getUint16(offset, true), y = view.getUint16(offset + 2, true)
      const w = view.getUint16(offset + 4, true), h = view.getUint16(offset + 6, true)
      if (!w || !h || x + w > width || y + h > height) invalid()
      const packed = bytes[offset + 8]
      offset += 9 + ((packed & 128) ? 3 * (2 ** ((packed & 7) + 1)) : 0)
      if (offset >= bytes.length || bytes[offset] < 2 || bytes[offset] > 8) invalid()
      offset++; subblocks(); frames++
    }
    if (!frames || !ended) invalid()
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    format = 'jpg'
    let offset = 2, scan = false, ended = false
    while (offset < bytes.length) {
      if (bytes[offset++] !== 0xff) { if (scan) continue; invalid() }
      while (bytes[offset] === 0xff) offset++
      if (offset >= bytes.length) invalid()
      const marker = bytes[offset++]
      if (scan && (marker === 0 || (marker >= 0xd0 && marker <= 0xd7))) continue
      if (marker === 0xd9) { ended = offset === bytes.length; break }
      if (offset + 2 > bytes.length) invalid()
      const size = view.getUint16(offset)
      if (size < 2 || offset + size > bytes.length) invalid()
      if ([0xc0, 0xc1, 0xc2].includes(marker)) {
        if (size < 8 || width !== undefined) invalid()
        height = view.getUint16(offset + 3); width = view.getUint16(offset + 5)
      }
      if (marker === 0xda) scan = true
      offset += size
    }
    if (!scan || !ended) invalid()
  } else invalid()
  if (!width || !height) invalid()
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) fail('A imagem deve ter largura e altura de no máximo 200 pixels (200 × 200).')
  return { format, width, height, bytes: bytes.length }
}

export function publicImageUrl(value) {
  let url
  try { url = new URL(value) } catch { fail('Informe uma URL pública HTTP ou HTTPS para a imagem.') }
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password ||
    url.port || !host.includes('.') || /[:\[\]]/.test(host) || /^[\d.]+$/.test(host) ||
    /(^|\.)(localhost|local|internal|lan|home|test|invalid|onion)$/.test(host)) {
    fail('Informe uma URL pública HTTP ou HTTPS, sem credenciais ou portas alternativas.')
  }
  return url
}

export function isPublicAddress(address) {
  if (address.includes(':')) {
    // Only global unicast; exclude special-purpose and documentation ranges.
    const [first, second] = address.split(':').map((part) => parseInt(part || '0', 16))
    return /^[23][0-9a-f]{3}:/i.test(address) && first !== 0x2002 && !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8))
  }
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) return false
  const [a, b, c, d] = address.split('.').map(Number)
  if ([a, b, c, d].some((n) => n > 255)) return false
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 2 && c === 0))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113))
}

async function checkPublicDns(host, signal, fetcher) {
  const answers = await Promise.all(['A', 'AAAA'].map(async (type) => {
    const url = new URL('https://cloudflare-dns.com/dns-query')
    url.search = new URLSearchParams({ name: host, type }).toString()
    const response = await fetcher(url.href, { signal, redirect: 'manual', headers: { Accept: 'application/dns-json' } })
    if (!response.ok) fail('Não foi possível verificar o endereço da imagem.')
    const data = await response.json()
    if (![0, 3].includes(data.Status)) fail('Não foi possível verificar o endereço da imagem.')
    return (data.Answer || []).filter((answer) => [1, 28].includes(answer.type)).map((answer) => answer.data)
  }))
  const addresses = answers.flat()
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) fail('O endereço da imagem deve apontar para um servidor público.')
}

export async function validateEmoteImage(value, { fetcher = fetch, timeoutMs = 8000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response, reader
  try {
    let url = publicImageUrl(value)
    for (let redirects = 0; ; redirects++) {
      await checkPublicDns(url.hostname, controller.signal, fetcher)
      response = await fetcher(url.href, { signal: controller.signal, redirect: 'manual', headers: { Accept: 'image/png,image/jpeg,image/gif', 'Accept-Encoding': 'identity' } })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      await response.body?.cancel()
      const location = response.headers.get('Location')
      if (!location || redirects >= 3) fail('Não foi possível validar os redirecionamentos da imagem.')
      url = publicImageUrl(new URL(location, url).href)
    }
    if (!response.ok || response.status === 206 || !response.body) fail('Não foi possível baixar a imagem. Use um link direto e acessível publicamente.')
    if (Number(response.headers.get('Content-Length')) > MAX_IMAGE_BYTES) fail('A imagem deve ter no máximo 1 MB (1.048.576 bytes).')
    reader = response.body.getReader()
    const bytes = new Uint8Array(MAX_IMAGE_BYTES)
    let size = 0
    while (true) {
      const { done, value: chunk } = await reader.read()
      if (done) break
      if (size + chunk.byteLength > MAX_IMAGE_BYTES) fail('A imagem deve ter no máximo 1 MB (1.048.576 bytes).')
      bytes.set(chunk, size)
      size += chunk.byteLength
    }
    return inspectImage(bytes.subarray(0, size))
  } catch (error) {
    if (error instanceof HTTPException) throw error
    fail(controller.signal.aborted ? 'A imagem demorou demais para responder. Tente outro link.' : 'Não foi possível verificar a imagem. Use um link direto e acessível publicamente.')
  } finally {
    clearTimeout(timer)
    controller.abort()
    try { if (reader) await reader.cancel(); else await response?.body?.cancel() } catch { /* Already closed or aborted. */ }
  }
}
