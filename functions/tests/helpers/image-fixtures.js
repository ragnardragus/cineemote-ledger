export const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='), (c) => c.charCodeAt(0))
export const gif = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='), (c) => c.charCodeAt(0))

export function fixtureResponse(value) {
  const url = new URL(value)
  if (url.hostname === 'cloudflare-dns.com') {
    return Response.json({ Status: 0, Answer: [{ type: 1, data: '8.8.8.8' }] })
  }
  if (url.hostname !== 'example.com') throw new Error('Unexpected external request in test: ' + url.hostname)
  if (url.pathname === '/oversize.png') return new Response(new Uint8Array(1024 * 1024 + 1))
  if (url.pathname === '/large.png') {
    const bytes = png.slice(); new DataView(bytes.buffer).setUint32(16, 201)
    return new Response(bytes)
  }
  if (url.pathname === '/not-image.png') return new Response('<html>Not an image</html>', { headers: { 'Content-Type': 'image/png' } })
  if (url.pathname === '/missing.png') return new Response(null, { status: 404 })
  if (url.pathname === '/internal.png') return new Response(null, { status: 302, headers: { Location: 'http://127.0.0.1/private' } })
  return new Response(url.pathname.endsWith('.gif') ? gif : png, { headers: { 'Content-Type': 'application/octet-stream' } })
}
