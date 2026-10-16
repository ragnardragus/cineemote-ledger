import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectImage, validateEmoteImage, publicImageUrl, isPublicAddress, MAX_IMAGE_BYTES } from '../src/emote-image.js'
import { png, gif, fixtureResponse } from './helpers/image-fixtures.js'

// JPEG marker fixture with SOF, SOS, entropy bytes and EOI.
const jpg = new Uint8Array([255,216,255,192,0,11,8,0,200,0,200,1,1,17,0,255,218,0,8,1,1,0,0,63,0,42,255,217])
const fetcher = async (url) => fixtureResponse(url)

test('recognizes GIF, PNG and JPEG bytes, dimensions and boundaries', () => {
  assert.deepEqual(inspectImage(png), { format: 'png', width: 1, height: 1, bytes: png.length })
  assert.deepEqual(inspectImage(gif), { format: 'gif', width: 1, height: 1, bytes: gif.length })
  assert.deepEqual(inspectImage(jpg), { format: 'jpg', width: 200, height: 200, bytes: jpg.length })
  for (const dimension of [0, 201]) {
    for (const offset of [7, 9]) {
      const bytes = jpg.slice(); new DataView(bytes.buffer).setUint16(offset, dimension)
      assert.throws(() => inspectImage(bytes))
    }
  }
  for (const bytes of [new Uint8Array(), new TextEncoder().encode('<svg/>'), new TextEncoder().encode('RIFFxxxxWEBP'), png.slice(0, 24), gif.slice(0, -1), jpg.slice(0, -1)]) assert.throws(() => inspectImage(bytes))
  const large = new Uint8Array(MAX_IMAGE_BYTES + 1)
  assert.throws(() => inspectImage(large), /1 MB/)
  // Pad a JPEG with legal COM segments to exercise the inclusive 1 MB boundary.
  const boundary = new Uint8Array(MAX_IMAGE_BYTES)
  boundary.set(jpg.subarray(0, 2))
  let offset = 2, remaining = MAX_IMAGE_BYTES - jpg.length
  while (remaining > 0) {
    const total = Math.min(65537, remaining)
    boundary[offset] = 255; boundary[offset + 1] = 254
    new DataView(boundary.buffer).setUint16(offset + 2, total - 2)
    offset += total; remaining -= total
  }
  boundary.set(jpg.subarray(2), offset)
  assert.equal(inspectImage(boundary).bytes, MAX_IMAGE_BYTES)
  const start = gif.indexOf(0x2c), frame = gif.subarray(start, -1)
  const animated = new Uint8Array(start + frame.length * 2 + 1)
  animated.set(gif.subarray(0, start)); animated.set(frame, start); animated.set(frame, start + frame.length); animated[animated.length - 1] = 0x3b
  assert.equal(inspectImage(animated).format, 'gif')
})

test('reads actual image bytes, enforces streamed size and rejects failed responses', async () => {
  assert.equal((await validateEmoteImage('https://example.com/no-extension', { fetcher })).format, 'png')
  for (const [path, error] of [['oversize.png', /1 MB/], ['large.png', /200/], ['not-image.png', /formato/], ['missing.png', /baixar/], ['internal.png', /pública/]]) {
    await assert.rejects(validateEmoteImage(`https://example.com/${path}`, { fetcher }), error)
  }
  let cancelled = false
  await assert.rejects(validateEmoteImage('https://example.com/huge', { fetcher: async (url) => url.includes('dns-query') ? fixtureResponse(url) : new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(MAX_IMAGE_BYTES)); controller.enqueue(new Uint8Array(1)) },
    cancel() { cancelled = true },
  })) }), /1 MB/)
  assert.equal(cancelled, true)
  await assert.rejects(validateEmoteImage('https://example.com/huge', { fetcher: async (url) => url.includes('dns-query') ? fixtureResponse(url) : new Response(png, { headers: { 'Content-Length': MAX_IMAGE_BYTES + 1 } }) }), /1 MB/)
  await assert.rejects(validateEmoteImage('https://example.com/fail', { fetcher: async () => { throw new Error('network') } }), /verificar/)
})

test('blocks private URLs and DNS results, including redirect destinations', async () => {
  for (const url of ['file:///tmp/image', 'http://localhost/x', 'http://127.1/x', 'http://2130706433/x', 'http://[::1]/x', 'https://user:pass@example.com/x', 'http://example.com:8080/x', 'http://host.local/x']) assert.throws(() => publicImageUrl(url))
  for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', '2001:db8::1', '2002:7f00:1::']) assert.equal(isPublicAddress(address), false)
  for (const address of ['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111', '2001:4860:4860::8888']) assert.equal(isPublicAddress(address), true)
  await assert.rejects(validateEmoteImage('https://example.com/image', { fetcher: async () => Response.json({ Status: 0, Answer: [{ type: 1, data: '127.0.0.1' }] }) }), /servidor público/)
  let redirects = 0
  await assert.rejects(validateEmoteImage('https://example.com/loop', { fetcher: async (url) => {
    if (url.includes('dns-query')) return fixtureResponse(url)
    redirects++
    return new Response(null, { status: 302, headers: { Location: '/loop' } })
  } }), /redirecionamentos/)
  assert.equal(redirects, 4)
})

test('DNS validation uses Workers-compatible manual redirects and rejects redirected DNS responses', async () => {
  const calls = []
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, 'manual')
    calls.push(url)
    return fixtureResponse(url)
  }
  assert.equal((await validateEmoteImage('https://example.com/emote.png', { fetcher })).format, 'png')
  assert.equal(calls.filter((url) => url.includes('dns-query')).length, 2)
  await assert.rejects(validateEmoteImage('https://example.com/emote.png', {
    fetcher: async () => new Response(null, { status: 302, headers: { Location: 'https://example.com/other' } }),
  }), /verificar o endereço/)
})

test('aborts downloads that take too long', async () => {
  await assert.rejects(validateEmoteImage('https://example.com/slow', { timeoutMs: 10, fetcher: async (url, options) => {
    if (url.includes('dns-query')) return fixtureResponse(url)
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  } }), /demorou/)
})
