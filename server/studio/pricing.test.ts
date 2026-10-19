// @vitest-environment node
// Studio price list: parsing Kie's records (real ones, typos included), the page fallback, the 12h disk cache
// that outlives Kie being down, and learned prices from history. Temp folders and a fake fetch only.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryItem } from '../../src/lib/models/types.ts'

const h = vi.hoisted(() => {
  const root = `${process.env.TEMP ?? process.env.TMPDIR ?? '/tmp'}/trenchable-studio-pricing-test-${process.pid}`
  process.env.TRENCHABLE_DATA = root
  return { root }
})

import {
  fetchPriceRows,
  forgetPriceList,
  getPriceList,
  learnedKey,
  learnedPrices,
  parsePriceRecord,
  parsePriceRecords,
  parsePricingHtml,
  unitOf,
} from './pricing.ts'

/** Twelve real records from api.kie.ai/client/v1/model-pricing/page (2026-10-11). */
const RECORDS = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/kie-pricing-records.json', import.meta.url)), 'utf8')) as Record<string, unknown>[]

const nextData = (rows: unknown[]) =>
  `<!DOCTYPE html><html><head><title>Pricing</title></head><body><div id="__next"></div>` +
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps: { pricingSeed: { rows: rows.map((r, i) => ({ id: `1-${i}`, ...(r as object) })), pages: 23, total: 574 } } },
    page: '/pricing',
  })}</script></body></html>`

const apiPage = (records: unknown[], pages: number) => ({ code: 200, msg: 'success', data: { records, pages, total: records.length * pages } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** A fake fetch: the API answers `api(pageNum)`, the page answers `page()`. */
function fakeFetch(api: (pageNum: number) => Response | Promise<Response>, page: () => Response | Promise<Response> = () => new Response('', { status: 500 })) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('model-pricing/page')) return api(JSON.parse(String(init?.body)).pageNum)
    return page()
  })
}

beforeEach(() => {
  rmSync(h.root, { recursive: true, force: true })
  mkdirSync(h.root, { recursive: true })
  forgetPriceList()
})
afterAll(() => rmSync(h.root, { recursive: true, force: true }))

describe('parsing', () => {
  it('reads a record with a model link', () => {
    expect(parsePriceRecord(RECORDS[1])).toEqual({
      modelId: 'kling-3.0-omni/reference-to-video',
      page: 'kling-o3',
      description: 'kling 3.0 omni, reference-to-video, 1080p with native audio',
      credits: 23,
      unit: 'second',
      unitText: 'per second',
      usd: 0.115,
      kind: 'video',
    })
  })

  it('keeps the page name for rows that only link a model page', () => {
    expect(parsePriceRecord(RECORDS[10])).toMatchObject({ modelId: null, page: 'nano-banana-pro', description: 'Google nano banana pro, 1/2K', credits: 18, unit: 'image' })
    expect(parsePriceRecord(RECORDS[2])).toMatchObject({ modelId: null, page: 'gemini-omni-1-1-flash', credits: 63, unit: 'video' })
  })

  it("normalises Kie's spacing, full-width brackets and padded prices", () => {
    expect(parsePriceRecord(RECORDS[3])?.description).toBe('pixverse-v6, transition, 360p(no audio)')
    expect(parsePriceRecord(RECORDS[7])?.description).toBe('Qwen Image, text-to-image')
    expect(parsePriceRecord(RECORDS[8])?.description).toBe('seedream 5 Flash, Text to image, 1K')
    expect(parsePriceRecord(RECORDS[0])?.credits).toBe(170) // "170 "
    expect(parsePriceRecord(RECORDS[5])).toMatchObject({ credits: 0, unit: 'call', unitText: 'per request' }) // "per request "
  })

  it('maps every unit string Kie uses, typos included', () => {
    expect(unitOf('per second')).toBe('second')
    expect(unitOf('per image')).toBe('image')
    expect(unitOf('per video')).toBe('video')
    expect(unitOf('per vedio')).toBe('video')
    expect(unitOf('per request ')).toBe('call')
    expect(unitOf('per generation')).toBe('call')
    expect(unitOf('per upscale')).toBe('call')
    for (const odd of ['per 2 images', 'per megapixel', 'per 1000 characters', 'per million tokens', 'per milion tokens', 'per million toke']) {
      expect(unitOf(odd)).toBe('other')
    }
    expect(parsePriceRecord(RECORDS[6])?.unit).toBe('video')
  })

  it('skips records without a description or price, and repeats', () => {
    const rows = parsePriceRecords([...RECORDS, RECORDS[1], { modelDescription: '', creditPrice: '3' }, { modelDescription: 'x', creditPrice: 'n/a' }, null])
    expect(rows).toHaveLength(RECORDS.length)
  })

  it("reads the page's __NEXT_DATA__ rows", () => {
    const rows = parsePricingHtml(nextData(RECORDS.slice(0, 3)))
    expect(rows.map((r) => r.credits)).toEqual([170, 23, 63])
  })

  it('falls back to scanning for bare or escaped records when the page has no __NEXT_DATA__', () => {
    const bare = `<script>window.rows=[${JSON.stringify(RECORDS[1])}]</script>`
    expect(parsePricingHtml(bare).map((r) => r.modelId)).toEqual(['kling-3.0-omni/reference-to-video'])
    const escaped = `<script>self.__next_f.push([1,${JSON.stringify(JSON.stringify([RECORDS[10]]))}])</script>`
    expect(parsePricingHtml(escaped).map((r) => r.page)).toEqual(['nano-banana-pro'])
    expect(parsePricingHtml('<html>nothing here</html>')).toEqual([])
  })
})

describe('fetching', () => {
  it('pages through the API until the last page', async () => {
    const fetcher = fakeFetch((n) => json(apiPage(n === 1 ? RECORDS.slice(0, 6) : RECORDS.slice(6), 2)))
    const { rows, complete } = await fetchPriceRows(fetcher)
    expect(complete).toBe(true)
    expect(rows).toHaveLength(RECORDS.length)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("falls back to the page's first rows when the API is down", async () => {
    const fetcher = fakeFetch(() => json({ code: 500, msg: 'busy' }, 500), () => new Response(nextData(RECORDS.slice(0, 2))))
    expect(await fetchPriceRows(fetcher)).toMatchObject({ complete: false, rows: [{ credits: 170 }, { credits: 23 }] })
  })

  it("says what the API said when neither source works", async () => {
    const fetcher = fakeFetch(() => json({ code: 422, msg: 'page size too big', data: null }))
    await expect(fetchPriceRows(fetcher)).rejects.toThrow('page size too big')
  })
})

describe('cache', () => {
  const T0 = Date.parse('2026-10-11T08:00:00Z')
  const HOUR = 3600_000
  const ok = () => fakeFetch(() => json(apiPage(RECORDS, 1)))
  const down = () => fakeFetch(() => json({}, 503))
  const saved = () => join(h.root, 'pricing.json')

  it('fetches once, saves to TRENCHABLE_DATA, and answers from memory for 12h', async () => {
    const fetcher = ok()
    const first = await getPriceList({ fetch: fetcher, now: () => T0 })
    expect(first.rows).toHaveLength(RECORDS.length)
    expect(first.fetchedAt).toBe(new Date(T0).toISOString())
    expect(existsSync(saved())).toBe(true)
    await getPriceList({ fetch: fetcher, now: () => T0 + 11 * HOUR })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('answers a stale copy at once and refreshes it behind the request', async () => {
    await getPriceList({ fetch: ok(), now: () => T0 })
    const fetcher = fakeFetch(() => json(apiPage(RECORDS.slice(0, 2), 1)))
    const stale = await getPriceList({ fetch: fetcher, now: () => T0 + 13 * HOUR })
    expect(stale.rows).toHaveLength(RECORDS.length)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    await vi.waitFor(async () => expect((await getPriceList({ fetch: fetcher, now: () => T0 + 13 * HOUR })).rows).toHaveLength(2))
  })

  it('serves the saved copy after a restart when Kie is down, however old', async () => {
    writeFileSync(saved(), JSON.stringify({ fetchedAt: '2026-01-01T00:00:00.000Z', rows: parsePriceRecords(RECORDS) }))
    const fetcher = down()
    const list = await getPriceList({ fetch: fetcher, now: () => T0 })
    expect(list.fetchedAt).toBe('2026-01-01T00:00:00.000Z')
    expect(list.rows).toHaveLength(RECORDS.length)
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())
    expect((await getPriceList({ fetch: fetcher, now: () => T0 + 1000 })).rows).toHaveLength(RECORDS.length)
  })

  it('never lets a partial page copy replace a whole one', async () => {
    await getPriceList({ fetch: ok(), now: () => T0 })
    const fetcher = fakeFetch(() => json({}, 503), () => new Response(nextData(RECORDS.slice(0, 2))))
    await getPriceList({ fetch: fetcher, now: () => T0 + 13 * HOUR })
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
    expect((await getPriceList({ fetch: fetcher, now: () => T0 + 13 * HOUR })).rows).toHaveLength(RECORDS.length)
    expect(JSON.parse(readFileSync(saved(), 'utf8')).rows).toHaveLength(RECORDS.length)
  })

  it('fails in plain words on a cold start with Kie down', async () => {
    await expect(getPriceList({ fetch: down(), now: () => T0 })).rejects.toThrow(/could not be read .* no saved copy yet/)
  })
})

describe('learned prices', () => {
  const job = (over: Partial<HistoryItem>): HistoryItem => ({ taskId: Math.random().toString(36), model: 'x', category: 'image', state: 'success', createdAt: 0, ...over })

  it('builds the same key as the board for the same payload', () => {
    // Pinned in board/studio/pricing.test.ts too.
    expect(learnedKey({ prompt: 'x', resolution: '720p', duration: 7, aspect_ratio: '9:16', generate_audio: false })).toBe(
      'resolution=720p|duration=7|generate_audio=false',
    )
    expect(learnedKey({ duration: '5' })).toBe(learnedKey({ duration: 5 }))
    expect(learnedKey({ resolution: '2K', reference_video_urls: ['https://x/v.mp4'] })).toBe('resolution=2k|video_input=true')
    expect(learnedKey({ resolution: '2K', reference_video_urls: [] })).toBe('resolution=2k')
  })

  it('takes the median of the newest five charges per model + key', () => {
    const charges = [10, 10, 12, 10, 11, 99, 99] // the two 99s are the oldest
    const items = charges.map((credits, i) =>
      job({ modelId: 'gpt-image-2-text-to-image', input: { resolution: '2K', prompt: `p${i}` }, creditsConsumed: credits, createdAt: 1000 - i }),
    )
    expect(learnedPrices(items)).toEqual([{ modelId: 'gpt-image-2-text-to-image', key: 'resolution=2k', credits: 10, samples: 5, lastAt: 1000 }])
  })

  it('keeps keys apart, skips unpaid jobs and falls back to the model string', () => {
    const items = [
      job({ modelId: 'gpt-image-2-text-to-image', input: { resolution: '1K' }, creditsConsumed: 6, createdAt: 3 }),
      job({ modelId: 'gpt-image-2-text-to-image', input: { resolution: '2K' }, creditsConsumed: 10, createdAt: 2 }),
      job({ modelId: 'gpt-image-2-text-to-image', input: { resolution: '2K' }, creditsConsumed: 0, createdAt: 4 }),
      job({ modelId: 'gpt-image-2-text-to-image', input: { resolution: '2K' }, state: 'fail', createdAt: 5 }),
      job({ model: 'suno/music', input: { model: 'V5' }, creditsConsumed: 12, createdAt: 1 }),
      job({ modelId: 'bytedance/seedance-2', input: { duration: 4, resolution: '480p' }, creditsConsumed: 76, createdAt: 9 }),
      job({ modelId: 'bytedance/seedance-2', input: { duration: 4, resolution: '480p' }, creditsConsumed: 80, createdAt: 8 }),
    ]
    expect(learnedPrices(items).map(({ modelId, key, credits, samples }) => ({ modelId, key, credits, samples }))).toEqual([
      { modelId: 'bytedance/seedance-2', key: 'resolution=480p|duration=4', credits: 78, samples: 2 },
      { modelId: 'gpt-image-2-text-to-image', key: 'resolution=1k', credits: 6, samples: 1 },
      { modelId: 'gpt-image-2-text-to-image', key: 'resolution=2k', credits: 10, samples: 1 },
      { modelId: 'suno/music', key: 'model=v5', credits: 12, samples: 1 },
    ])
  })
})
