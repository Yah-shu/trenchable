// @vitest-environment node
// Studio library: elements (create, images from uploads / the media archive / https, cover, limits, serving)
// and projects (items newest first). Everything lives in a temp folder; the network is a fake.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Hono } from 'hono'
import sharp from 'sharp'
import { afterAll, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => {
  const tmp = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/trenchable-studio-library-test-${process.pid}`
  process.env.TRENCHABLE_DATA = `${tmp}/studio`
  // The media root is <dir of STUDIO_DB_PATH>/media.
  process.env.STUDIO_DB_PATH = `${tmp}/db/studio.db`
  return { tmp, root: `${tmp}/studio`, media: `${tmp}/db/media` }
})

import type { SafeDeps } from '../lib/safe-fetch.ts'
import { addImageFromUrl, createElement, type Element, LibraryError, MAX_IMAGES, type Project } from './library.ts'
import { libraryRoutes } from './library-routes.ts'

const app = new Hono().route('/api/studio', libraryRoutes)
const B = '/api/studio'

async function call<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T; error?: string }> {
  const init: RequestInit = { method }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'content-type': 'application/json' }
  }
  const res = await app.request(`${B}${path}`, init)
  const json = (await res.json().catch(() => ({}))) as { data: T; error?: string }
  return { status: res.status, data: json.data, error: json.error }
}

const png = (width = 64, height = 48, background = '#c33') => sharp({ create: { width, height, channels: 3, background } }).png().toBuffer()

/** A generation in the fake media archive, as the archiver leaves it: media/<taskId>/0.png. */
async function archived(taskId: string): Promise<string> {
  mkdirSync(join(h.media, taskId), { recursive: true })
  writeFileSync(join(h.media, taskId, '0.png'), await png(80, 60, '#3a3'))
  return `/media/${taskId}/0.png`
}

function upload(...files: { name: string; bytes: Buffer; type?: string }[]): FormData {
  const form = new FormData()
  for (const f of files) form.append('file', new File([new Uint8Array(f.bytes)], f.name, { type: f.type ?? 'image/png' }))
  return form
}

const newElement = async (body: Record<string, unknown> = {}) => {
  const r = await call<Element>('POST', '/elements', { name: 'Maria', kind: 'character', ...body })
  expect(r.error).toBeUndefined()
  return r.data
}

/** A pretend internet: every host is public and every GET answers with `bytes`. */
const fakeNet = (bytes: Buffer, address = '93.184.216.34'): SafeDeps & { urls: string[] } => {
  const urls: string[] = []
  return {
    urls,
    resolve: async () => [address],
    fetch: async (url) => {
      urls.push(url)
      return new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } })
    },
  }
}

afterAll(() => rmSync(h.tmp, { recursive: true, force: true }))

describe('elements', () => {
  it('creates an element with no images and lists it newest first', async () => {
    const a = await newElement({ name: '  Old   one ', kind: 'product', description: 'A jar' })
    expect(a).toMatchObject({ name: 'Old one', kind: 'product', description: 'A jar', images: [], cover: 0 })
    expect(a.id).toMatch(/^el-[0-9a-f]{12}$/)
    await new Promise((r) => setTimeout(r, 5))
    const b = await newElement({ name: 'New one' })
    const list = await call<{ items: Element[] }>('GET', '/elements')
    const ids = list.data.items.map((e) => e.id)
    expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id))
    expect(existsSync(join(h.root, 'elements', a.id, 'element.json'))).toBe(true)
  })

  it('refuses a missing name, an unknown kind and unknown fields', async () => {
    expect((await call('POST', '/elements', { kind: 'character' })).status).toBe(400)
    expect((await call('POST', '/elements', { name: 'x', kind: 'dragon' })).error).toMatch(/Pick a kind/)
    expect((await call('POST', '/elements', { name: 'x', secret: 1 })).error).toMatch(/can't include secret/)
    expect((await call('POST', '/elements', { name: 'x'.repeat(81) })).error).toMatch(/too long/)
    expect((await call('POST', '/elements')).status).toBe(400)
  })

  it('copies a generation from the media archive into the element folder', async () => {
    const el = await newElement({ sources: [{ url: await archived('task_abc123') }] })
    expect(el.images).toHaveLength(1)
    const img = el.images[0]!
    expect(img).toMatchObject({ n: 1, file: '1.png', width: 80, height: 60 })
    expect(img.url).toBe(`/api/studio/elements/${el.id}/files/1.png`)
    expect(img.thumb).toBe(`/api/studio/elements/${el.id}/files/1-thumb.webp`)
    expect(el.cover).toBe(1)
    const files = readdirSync(join(h.root, 'elements', el.id)).sort()
    expect(files).toEqual(['1-thumb.webp', '1.png', 'element.json'])
    // The copy is the element's own: removing the generation doesn't touch it.
    rmSync(join(h.media, 'task_abc123'), { recursive: true, force: true })
    const res = await app.request(img.url)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
    expect([meta.width, meta.height]).toEqual([80, 60])
    const thumb = await app.request(img.thumb)
    expect(thumb.headers.get('content-type')).toBe('image/webp')
  })

  it('adds uploaded images, rejects files that are not images, and keeps one bad file from saving any', async () => {
    const el = await newElement()
    const r = await call<Element>('POST', `/elements/${el.id}/images`, upload({ name: 'a.png', bytes: await png() }, { name: 'b.png', bytes: await png(32, 32) }))
    expect(r.error).toBeUndefined()
    expect(r.data.images.map((i) => i.n)).toEqual([1, 2])
    expect(r.data.cover).toBe(1)
    const bad = await call('POST', `/elements/${el.id}/images`, upload({ name: 'c.png', bytes: await png() }, { name: 'notes.png', bytes: Buffer.from('hello, not a picture') }))
    expect(bad.status).toBe(400)
    expect(bad.error).toMatch(/"notes.png" isn't an image/)
    expect((await call<Element>('GET', `/elements/${el.id}`)).data.images).toHaveLength(2)
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')
    expect((await call('POST', `/elements/${el.id}/images`, upload({ name: 'x.svg', bytes: svg, type: 'image/svg+xml' }))).status).toBe(400)
  })

  it('downloads an https image through the SSRF guard', async () => {
    const el = await newElement()
    const net = fakeNet(await png(40, 40))
    const out = await addImageFromUrl(el.id, 'https://cdn.example.com/face.png', net)
    expect(out.images).toHaveLength(1)
    expect(net.urls).toEqual(['https://cdn.example.com/face.png'])
    // A public-looking name that resolves to a private address is refused before any request.
    const inside = fakeNet(await png(), '192.168.1.10')
    await expect(addImageFromUrl(el.id, 'https://intranet.example.com/a.png', inside)).rejects.toThrow(/public website/)
    expect(inside.urls).toEqual([])
    const both = await createElement({ name: 'From links', sources: [{ url: 'https://a.example.com/1.png' }, { url: 'https://b.example.com/2.png' }] }, net)
    expect(both.images.map((i) => i.file)).toEqual(['1.png', '2.png'])
  })

  it('refuses links that are not https or point at this machine', async () => {
    const el = await newElement()
    for (const url of ['http://example.com/a.png', 'https://localhost/a.png', 'https://127.0.0.1/a.png', 'https://10.0.0.5/a.png', 'ftp://example.com/a.png', 'file:///C:/Windows/win.ini']) {
      const r = await call('POST', `/elements/${el.id}/images`, { url })
      expect(r.status, url).toBe(400)
    }
  })

  it('refuses source paths outside the media root', async () => {
    mkdirSync(join(h.tmp, 'db'), { recursive: true })
    writeFileSync(join(h.tmp, 'db', 'secret.png'), await png())
    await archived('task_ok')
    const attempts = [
      '/media/../secret.png',
      '/media/..%2Fsecret.png',
      '/media/task_ok/..%2F..%2Fsecret.png',
      '/media/%2e%2e/secret.png',
      '/media/task_ok\\..\\..\\secret.png',
      '/media/C:/Windows/win.ini',
      '//evil.example.com/a.png',
      '/data/studio.db',
      '/api/upload',
      '/api/studio/elements/../projects.json',
      'C:/Users/secret.png',
      '../secret.png',
    ]
    const before = (await call<{ items: Element[] }>('GET', '/elements')).data.items.length
    for (const url of attempts) {
      const r = await call('POST', '/elements', { name: 'Sneaky', sources: [{ url }] })
      expect([400, 404], url).toContain(r.status)
    }
    expect((await call<{ items: Element[] }>('GET', '/elements')).data.items.length).toBe(before)
    // A real archived file next to those attempts still works.
    expect((await call('POST', '/elements', { name: 'Fine', sources: [{ url: '/media/task_ok/0.png' }] })).status).toBe(200)
  })

  it('copies an image from another element', async () => {
    const a = await newElement({ sources: [{ url: await archived('task_copy') }] })
    const b = await newElement({ name: 'Copy', sources: [{ url: a.images[0]!.url }] })
    expect(b.images).toHaveLength(1)
    expect((await call('POST', '/elements', { name: 'x', sources: [{ url: `/api/studio/elements/${a.id}/files/element.json` }] })).status).toBe(404)
  })

  it('serves only listed files, whatever the path says', async () => {
    const el = await newElement({ sources: [{ url: await archived('task_srv') }] })
    const base = `${B}/elements/${el.id}/files`
    for (const path of [
      `${base}/element.json`,
      `${base}/..%2Felement.json`,
      `${base}/2.png`,
      `${base}/1.jpg`,
      `${base}/2-thumb.webp`,
      `${B}/elements/..%2F..%2Fprojects.json/files/1.png`,
      `${B}/elements/el-000000000000/files/1.png`,
      `${base}/1.png%00.txt`,
    ]) {
      const res = await app.request(path)
      expect(res.status, path).toBe(404)
    }
    expect((await app.request(`${base}/1.png`)).status).toBe(200)
  })

  it('patches name, kind, description and cover', async () => {
    const el = await newElement()
    await call('POST', `/elements/${el.id}/images`, upload({ name: 'a.png', bytes: await png() }, { name: 'b.png', bytes: await png() }))
    const r = await call<Element>('PATCH', `/elements/${el.id}`, { name: 'Maria B', kind: 'style', description: 'warm film look', cover: 2 })
    expect(r.data).toMatchObject({ name: 'Maria B', kind: 'style', description: 'warm film look', cover: 2 })
    expect((await call('PATCH', `/elements/${el.id}`, { cover: 7 })).error).toMatch(/cover image isn't in this element/)
    expect((await call('PATCH', `/elements/${el.id}`, { kind: 'monster' })).status).toBe(400)
    expect((await call('PATCH', `/elements/${el.id}`, { name: '' })).status).toBe(400)
    expect((await call('PATCH', `/elements/${el.id}`, { images: [] })).error).toMatch(/can't include images/)
    expect((await call('PATCH', '/elements/el-ffffffffffff', { name: 'x' })).status).toBe(404)
    expect((await call('PATCH', '/elements/..', { name: 'x' })).status).toBe(404)
  })

  it('deletes images without ever reusing a number, and moves the cover', async () => {
    const el = await newElement()
    await call('POST', `/elements/${el.id}/images`, upload({ name: 'a.png', bytes: await png() }, { name: 'b.png', bytes: await png() }))
    const after = await call<Element>('DELETE', `/elements/${el.id}/images/1`)
    expect(after.data.images.map((i) => i.n)).toEqual([2])
    expect(after.data.cover).toBe(2)
    expect(existsSync(join(h.root, 'elements', el.id, '1.png'))).toBe(false)
    expect(existsSync(join(h.root, 'elements', el.id, '1-thumb.webp'))).toBe(false)
    expect((await call('DELETE', `/elements/${el.id}/images/1`)).status).toBe(404)
    expect((await call('DELETE', `/elements/${el.id}/images/abc`)).status).toBe(404)
    const more = await call<Element>('POST', `/elements/${el.id}/images`, upload({ name: 'c.png', bytes: await png() }))
    expect(more.data.images.map((i) => i.n)).toEqual([2, 3])
  })

  it(`holds at most ${MAX_IMAGES} images`, async () => {
    const el = await newElement()
    const one = await png(16, 16)
    const files = Array.from({ length: MAX_IMAGES }, (_, i) => ({ name: `${i}.png`, bytes: one }))
    expect((await call<Element>('POST', `/elements/${el.id}/images`, upload(...files))).data.images).toHaveLength(MAX_IMAGES)
    const full = await call('POST', `/elements/${el.id}/images`, upload({ name: 'extra.png', bytes: one }))
    expect(full.status).toBe(400)
    expect(full.error).toMatch(/up to 12 images/)
    const tooMany = Array.from({ length: MAX_IMAGES + 1 }, () => ({ url: '/media/x/0.png' }))
    expect((await call('POST', '/elements', { name: 'x', sources: tooMany })).status).toBe(400)
  })

  it('deletes an element and its folder', async () => {
    const el = await newElement({ sources: [{ url: await archived('task_del') }] })
    expect((await call('DELETE', `/elements/${el.id}`)).data).toEqual({ deleted: true, id: el.id })
    expect(existsSync(join(h.root, 'elements', el.id))).toBe(false)
    expect((await call('GET', `/elements/${el.id}`)).status).toBe(404)
    expect((await call('DELETE', `/elements/${el.id}`)).status).toBe(404)
    expect((await call('DELETE', '/elements/..%2F..')).status).toBe(404)
  })

  it('refuses a JSON body over the cap', async () => {
    const r = await call('POST', '/elements', { name: 'x', description: 'y'.repeat(70_000) })
    expect(r.status).toBe(400)
    expect(r.error).toMatch(/too large/)
  })

  it('throws LibraryError with a status from the store', async () => {
    await expect(addImageFromUrl('el-000000000000', 'https://x.example.com/a.png')).rejects.toBeInstanceOf(LibraryError)
  })
})

describe('projects', () => {
  it('creates, renames, adds notes and lists most recently changed first', async () => {
    const a = (await call<Project>('POST', '/projects', { title: '  Spring   launch ' })).data
    expect(a).toMatchObject({ title: 'Spring launch', notes: '', taskIds: [] })
    expect(a.id).toMatch(/^pr-[0-9a-f]{12}$/)
    const b = (await call<Project>('POST', '/projects', {})).data
    expect(b.title).toBe('Untitled project')
    await new Promise((r) => setTimeout(r, 5))
    const renamed = await call<Project>('PATCH', `/projects/${a.id}`, { title: 'Spring drops', notes: 'hook tests' })
    expect(renamed.data).toMatchObject({ title: 'Spring drops', notes: 'hook tests' })
    const list = (await call<{ items: Project[] }>('GET', '/projects')).data.items
    expect(list[0]?.id).toBe(a.id)
    expect((await call('PATCH', `/projects/${a.id}`, { title: '' })).status).toBe(400)
    expect((await call('PATCH', `/projects/${a.id}`, { taskIds: [] })).status).toBe(400)
    expect((await call('PATCH', '/projects/pr-000000000000', { title: 'x' })).status).toBe(404)
  })

  it('adds generations newest first without duplicates and removes them', async () => {
    const p = (await call<Project>('POST', '/projects', { title: 'Items' })).data
    await call('POST', `/projects/${p.id}/items`, { taskIds: ['t1', 't2'] })
    const r = await call<Project>('POST', `/projects/${p.id}/items`, { taskIds: ['t3', 't1', 't3'] })
    expect(r.data.taskIds).toEqual(['t3', 't1', 't2'])
    expect((await call('POST', `/projects/${p.id}/items`, { taskIds: ['../etc'] })).status).toBe(400)
    expect((await call('POST', `/projects/${p.id}/items`, { taskIds: [] })).status).toBe(400)
    expect((await call('POST', `/projects/${p.id}/items`, { taskIds: 't9' })).status).toBe(400)
    const removed = await call<Project>('DELETE', `/projects/${p.id}/items/t1`)
    expect(removed.data.taskIds).toEqual(['t3', 't2'])
    expect((await call('DELETE', `/projects/${p.id}/items/t1`)).status).toBe(404)
    expect((await call('GET', `/projects/${p.id}`)).data).toMatchObject({ taskIds: ['t3', 't2'] })
  })

  it('deletes a project but never anything else', async () => {
    await archived('task_keep')
    const p = (await call<Project>('POST', '/projects', { title: 'Gone' })).data
    await call('POST', `/projects/${p.id}/items`, { taskIds: ['task_keep'] })
    expect((await call('DELETE', `/projects/${p.id}`)).data).toEqual({ deleted: true, id: p.id })
    expect((await call('GET', `/projects/${p.id}`)).status).toBe(404)
    expect((await call('DELETE', `/projects/${p.id}`)).status).toBe(404)
    expect(existsSync(join(h.media, 'task_keep', '0.png'))).toBe(true)
  })

  it('keeps every change when several land at once', async () => {
    const p = (await call<Project>('POST', '/projects', { title: 'Busy' })).data
    await Promise.all(Array.from({ length: 10 }, (_, i) => call('POST', `/projects/${p.id}/items`, { taskIds: [`job${i}`] })))
    expect((await call<Project>('GET', `/projects/${p.id}`)).data.taskIds).toHaveLength(10)
  })
})

describe('uploads', () => {
  type Up = import('./library.ts').Upload
  const mp4 = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom'), Buffer.alloc(64, 1)])
  const send = (name: string, bytes: Buffer, type: string, extra: Record<string, string> = {}) => {
    const form = upload({ name, bytes, type })
    for (const [k, v] of Object.entries(extra)) form.append(k, v)
    return call<Up>('POST', '/uploads', form)
  }

  it('keeps a copy of each upload, newest first, with the Kie link it got', async () => {
    const a = await send('face.png', await png(40, 30, '#123'), 'image/png', { hostedUrl: 'https://kie.test/a.png', expiresAt: '2026-10-20T00:00:00Z' })
    expect(a.error).toBeUndefined()
    expect(a.data).toMatchObject({ kind: 'image', name: 'face.png', width: 40, height: 30, hostedUrl: 'https://kie.test/a.png', hostedUntil: '2026-10-20T00:00:00.000Z' })
    expect(a.data.thumb).toMatch(/-thumb\.webp$/)
    const b = await send('clip.mp4', mp4(), 'video/mp4')
    expect(b.data).toMatchObject({ kind: 'video', mime: 'video/mp4' })
    expect(b.data.thumb).toBeUndefined()
    const list = await call<{ items: Up[]; total: number }>('GET', '/uploads?limit=1')
    expect(list.data.total).toBe(2)
    expect(list.data.items.map((u) => u.id)).toEqual([b.data.id])
    expect((await call<{ items: Up[] }>('GET', '/uploads?kind=image')).data.items.map((u) => u.id)).toEqual([a.data.id])
    // Served back from disk, file and thumbnail.
    const file = await app.request(a.data.url)
    expect(file.status).toBe(200)
    expect(file.headers.get('content-type')).toBe('image/png')
    expect((await app.request(a.data.thumb ?? '')).status).toBe(200)
  })

  it('makes one entry of the same file uploaded twice, moved to the top', async () => {
    const bytes = await png(20, 20, '#456')
    const first = await send('one.png', bytes, 'image/png')
    await send('other.mp4', mp4(), 'video/mp4')
    const again = await send('again.png', bytes, 'image/png', { hostedUrl: 'https://kie.test/new.png' })
    expect(again.data.id).toBe(first.data.id)
    expect(again.data).toMatchObject({ name: 'again.png', hostedUrl: 'https://kie.test/new.png' })
    expect((await call<{ items: Up[] }>('GET', '/uploads')).data.items[0]?.id).toBe(first.data.id)
  })

  it('refuses what is not a picture, video or sound, and serves nothing else', async () => {
    const bad = await send('notes.txt', Buffer.from('just some text, nothing to see'), 'text/plain')
    expect(bad.status).toBe(400)
    expect(bad.error).toMatch(/isn't a picture, video or sound/)
    expect((await send('x.png', await png(), 'image/png', { hostedUrl: 'http://plain.test/x' })).data.hostedUrl).toBeUndefined()
    expect((await app.request(`${B}/uploads/files/..%2Fprojects.json`)).status).toBe(404)
    expect((await app.request(`${B}/uploads/files/up-000000000000.png`)).status).toBe(404)
  })

  it('deletes an upload and its files', async () => {
    const u = (await send('gone.png', await png(10, 10, '#789'), 'image/png')).data
    expect((await call('DELETE', `/uploads/${u.id}`)).data).toEqual({ deleted: true, id: u.id })
    expect((await app.request(u.url)).status).toBe(404)
    expect(existsSync(join(h.root, 'uploads', u.file))).toBe(false)
    expect((await call('DELETE', `/uploads/${u.id}`)).status).toBe(404)
  })

  it('reads what a video or sound is from its bytes', async () => {
    const { sniffMedia } = await import('./library.ts')
    expect(sniffMedia(mp4())).toEqual({ kind: 'video', ext: 'mp4' })
    expect(sniffMedia(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(20)]))).toEqual({ kind: 'audio', ext: 'mp3' })
    expect(sniffMedia(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(8)]))).toEqual({ kind: 'audio', ext: 'wav' })
    expect(sniffMedia(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull()
  })
})
