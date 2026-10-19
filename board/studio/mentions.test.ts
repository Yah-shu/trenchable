// The composer's @Image 1 chips and the Uploads tab's Kie links: the prompt cut into text and tokens
// (joining back to the exact prompt, tokens without a file marked), and when an upload's own Kie
// link is still good enough to send.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { arrange, promptSegments, RECENT_COUNT } from './mentions.ts'
import { loadUploads, uploadHosted, type Upload } from './library.ts'

describe('the media picker’s Recent / All and Sort by', () => {
  const things = Array.from({ length: 40 }, (_, i) => ({ id: i, name: `item ${String.fromCharCode(97 + (i % 26))}${i}`, at: 1000 + i }))
  const at = (t: { at: number }) => t.at

  it('Recent is the newest few whatever the sort; All is everything', () => {
    const recent = arrange(things, 'recent', 'newest', at)
    expect(recent).toHaveLength(RECENT_COUNT)
    expect(recent[0]?.id).toBe(39)
    const oldestOfRecent = arrange(things, 'recent', 'oldest', at)
    expect(oldestOfRecent[0]?.id).toBe(40 - RECENT_COUNT)
    expect(arrange(things, 'all', 'oldest', at).map((t) => t.id)).toEqual(things.map((t) => t.id))
  })

  it('sorts A–Z by name, numbers in order, ignoring case', () => {
    const named = [
      { name: 'beta 10', at: 3 },
      { name: 'Alpha', at: 1 },
      { name: 'beta 9', at: 2 },
    ]
    expect(arrange(named, 'all', 'az', (t) => t.at, (t) => t.name).map((t) => t.name)).toEqual(['Alpha', 'beta 9', 'beta 10'])
  })

  it('puts things with no date last when newest first, and keeps ties in their order', () => {
    const rows = [
      { id: 'a', at: Number.NaN },
      { id: 'b', at: 5 },
      { id: 'c', at: 5 },
    ]
    expect(arrange(rows, 'all', 'newest', (t) => t.at).map((t) => t.id)).toEqual(['b', 'c', 'a'])
    expect(arrange(rows, 'all', 'oldest', (t) => t.at).map((t) => t.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('loadUploads', () => {
  // 450 uploads, newest first as the server lists them; it hands back at most 200 at a time.
  const all = Array.from({ length: 450 }, (_, i) => ({ id: `up-${450 - i}` }) as Upload)
  const asked: [number, number][] = []
  const get = async (offset: number, limit: number) => {
    asked.push([offset, limit])
    return { items: all.slice(offset, offset + Math.min(limit, 200)), total: all.length }
  }
  afterEach(() => {
    asked.length = 0
  })

  it('reads past the server’s 200-a-request cap, newest first', async () => {
    const r = await loadUploads('newest', 260, get)
    expect(r.items).toHaveLength(260)
    expect(r.items[0]?.id).toBe('up-450')
    expect(asked).toEqual([
      [0, 200],
      [200, 60],
    ])
  })

  it('reads the oldest from the far end, turned round', async () => {
    const r = await loadUploads('oldest', 60, get)
    expect(r.items.map((u) => u.id).slice(0, 2)).toEqual(['up-1', 'up-2'])
    expect(r.items).toHaveLength(60)
    expect(asked.at(-1)).toEqual([390, 60])
  })
})

describe('promptSegments', () => {
  it('cuts the prompt into text and tokens that join back to the same prompt', () => {
    const prompt = 'put @image1 in front of [Image 2], voice @Audio1 and @video3'
    const segs = promptSegments(prompt, { image: 2, audio: 1 })
    expect(segs.map((s) => s.text).join('')).toBe(prompt)
    expect(segs.filter((s) => s.ref).map((s) => s.ref)).toEqual([
      { kind: 'image', n: 1, attached: true },
      { kind: 'image', n: 2, attached: true },
      { kind: 'audio', n: 1, attached: true },
      { kind: 'video', n: 3, attached: false },
    ])
  })

  it('marks a token past the files attached, and leaves plain text alone', () => {
    expect(promptSegments('@image3 here', { image: 2 })[0]?.ref).toEqual({ kind: 'image', n: 3, attached: false })
    expect(promptSegments('no tokens, just an email@image.com? no: email@image', {}).some((s) => s.ref && s.ref.n > 0)).toBe(false)
    expect(promptSegments('', {})).toEqual([])
  })
})

describe('uploadHosted', () => {
  const now = Date.parse('2026-10-16T12:00:00Z')
  const base: Upload = { id: 'up-000000000001', name: 'a.png', kind: 'image', mime: 'image/png', file: 'up-000000000001.png', url: '/api/studio/uploads/files/up-000000000001.png', size: 3, createdAt: '2026-10-16T10:00:00Z' }
  afterEach(() => vi.unstubAllGlobals())

  it('reuses the Kie link it got at upload time while it is fresh', async () => {
    expect(await uploadHosted({ ...base, hostedUrl: 'https://kie/a.png', hostedUntil: '2026-10-18T00:00:00Z' }, now)).toBe('https://kie/a.png')
    expect(await uploadHosted({ ...base, hostedUrl: 'https://kie/b.png' }, now)).toBe('https://kie/b.png')
  })

  it('pushes the copy on disk up again once the link is stale', async () => {
    const calls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls.push(url)
        if (url === base.url) return new Response(new Blob(['png'], { type: 'image/png' }))
        return new Response(JSON.stringify({ data: { fileUrl: 'https://kie/fresh.png' } }), { status: 200 })
      }),
    )
    const stale = { ...base, id: 'up-000000000002', hostedUrl: 'https://kie/old.png', hostedUntil: '2026-10-16T12:30:00Z' }
    expect(await uploadHosted(stale, now)).toBe('https://kie/fresh.png')
    expect(calls).toEqual([base.url, '/api/upload'])
  })
})
