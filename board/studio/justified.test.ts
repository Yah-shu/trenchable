// the reference app's justified rows: their measured Image feed (1904 px: a 3:4 at 380×506 beside
// three 506 squares, then four 475 squares), the last row left at the target height, clamped
// panoramas, each tile's aspect from what it knows, and the order (running first, then
// results and failures by time).
import { beforeEach, describe, expect, it } from 'vitest'
import type { HistoryItem } from './api.ts'
import { feedDefaults, rowHeight } from './feed.ts'
import type { Job } from './jobs.ts'
import { clampAspect, entryKey, feedOrder, itemAspect, jobAspect, measuredAspect, parseAspect, placeRows, rememberAspect, resetMeasured, rowsFor } from './justified.ts'

/** The Image feed's default card size. */
const DEF = feedDefaults('image', true).size

const sizes = (rows: ReturnType<typeof rowsFor>) => rows.map((r) => r.map((c) => [Math.round(c.width), Math.round(c.height)]))
const rowWidth = (row: ReturnType<typeof rowsFor>[number], gap = 2) => row.reduce((s, c) => s + c.width, 0) + gap * (row.length - 1)

describe('rowsFor', () => {
  it("reproduces the reference app's measured rows at 1904 px with the default card size", () => {
    const target = rowHeight(DEF, 1904)
    const rows = rowsFor([3 / 4, 1, 1, 1, 1, 1, 1, 1], 1904, target)
    expect(sizes(rows)).toEqual([
      [
        [380, 506],
        [506, 506],
        [506, 506],
        [506, 506],
      ],
      [
        [475, 475],
        [475, 475],
        [475, 475],
        [475, 475],
      ],
    ])
    for (const r of rows) expect(rowWidth(r)).toBeCloseTo(1904, 6)
  })

  it('keeps about four squares a row from a 1440 px window to a 1920 px one', () => {
    for (const w of [1392, 1424, 1872, 1904]) expect(rowsFor(Array(12).fill(1), w, rowHeight(DEF, w))[0]).toHaveLength(4)
  })

  it('the card size slider runs from ~10 squares a row to 3, fewer and taller as it grows', () => {
    const per = (size: number, w = 1904) => rowsFor(Array(40).fill(1), w, rowHeight(size, w))[0].length
    expect(per(160)).toBe(10)
    expect(per(520)).toBe(3)
    expect(per(160, 1600)).toBeGreaterThan(per(300, 1600))
    expect(per(300, 1600)).toBeGreaterThan(per(520, 1600))
  })

  it("leaves a short last row at the target height, left-aligned, but stretches one that's nearly full", () => {
    const short = rowsFor([1, 1, 1, 1, 1], 1000, 240)
    const last = short[short.length - 1]
    expect(last).toHaveLength(1)
    expect(last[0].height).toBe(240)
    expect(last[0].width).toBe(240)
    // 3 squares at 310 + gaps = 934 of 1000 px: nearly full, so justified.
    const full = rowsFor([1, 1, 1], 1000, 310)
    expect(full).toHaveLength(1)
    expect(rowWidth(full[0])).toBeCloseTo(1000, 6)
  })

  it('clamps extreme aspects so a panorama cannot flatten its row', () => {
    expect(clampAspect(12)).toBe(3)
    expect(clampAspect(0.05)).toBe(0.4)
    expect(clampAspect(Number.NaN)).toBe(1)
    const rows = rowsFor([12, 1, 1], 900, 300)
    for (const r of rows) for (const c of r) expect(c.height).toBeGreaterThan(150)
  })

  it('puts a tile wider than the box at the target height on a row of its own', () => {
    const rows = rowsFor([1, 3, 1], 600, 400)
    expect(rows.map((r) => r.map((c) => c.index))).toEqual([[0], [1], [2]])
    expect(rows[1][0].width).toBeCloseTo(600, 6)
  })

  it('every index appears once, in order', () => {
    const aspects = Array.from({ length: 57 }, (_, i) => [1, 0.75, 16 / 9, 9 / 16, 1.5, 0.8][i % 6])
    const rows = rowsFor(aspects, 1333, 280)
    expect(rows.flat().map((c) => c.index)).toEqual(aspects.map((_, i) => i))
  })

  it('lays out nothing without a width', () => {
    expect(rowsFor([1, 1], 0, 300)).toEqual([])
    expect(rowsFor([], 900, 300)).toEqual([])
  })
})

describe('placeRows', () => {
  it('snaps boxes to whole pixels, rows a gap apart, with room for buttons under each', () => {
    const rows = rowsFor([3 / 4, 1, 1, 1, 1, 1, 1, 1], 1904, rowHeight(DEF, 1904))
    const { boxes, height } = placeRows(rows, 2, 40)
    expect(boxes[0]).toEqual({ index: 0, x: 0, y: 0, width: 380, height: 506 })
    const endOfRow1 = boxes[3]
    expect(endOfRow1.x + endOfRow1.width).toBe(1904)
    expect(boxes[4].y).toBe(506 + 40 + 2)
    expect(height).toBe(506 + 40 + 2 + 475 + 40)
  })
})

describe('aspects', () => {
  beforeEach(() => {
    sessionStorage.clear()
    resetMeasured()
  })
  const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({ taskId: 't1', model: 'm', category: 'image', state: 'success', createdAt: 1, ...over })

  it('reads aspect words and ratios, and not auto', () => {
    expect(parseAspect('16:9')).toBeCloseTo(16 / 9)
    expect(parseAspect('3:4')).toBe(0.75)
    expect(parseAspect('portrait_4_3')).toBe(0.75)
    expect(parseAspect('square_hd')).toBe(1)
    expect(parseAspect('auto')).toBeNull()
    expect(parseAspect('adaptive')).toBeNull()
    expect(parseAspect(undefined)).toBeNull()
  })

  it("prefers the media's size, then the asked aspect, then what the file measured", () => {
    const media = [{ kind: 'image' as const, url: 'x', metadata: { width: 600, height: 300 } }]
    expect(itemAspect(item({ media, input: { aspect_ratio: '9:16' } }))).toBe(2)
    expect(itemAspect(item({ input: { aspect_ratio: '9:16' } }))).toBeCloseTo(9 / 16)
    expect(itemAspect(item({ input: { aspect_ratio: 'auto' } }))).toBeNull()
    expect(rememberAspect('t1', 400, 500)).toBe(true)
    expect(rememberAspect('t1', 400, 500)).toBe(false)
    expect(itemAspect(item({ input: { aspect_ratio: 'auto' } }))).toBe(0.8)
    // Kept for the session: a fresh module state reads it back.
    resetMeasured()
    expect(measuredAspect('t1')).toBe(0.8)
  })

  it("gives a job's placeholder the shape it asked for", () => {
    const job = (over: Partial<Job>) => ({ category: 'image', meta: { surface: 'image' }, input: {}, ...over }) as Job
    expect(jobAspect(job({ meta: { surface: 'image', aspect: '3:4' } }))).toBe(0.75)
    expect(jobAspect(job({ input: { aspect_ratio: '16:9' } }))).toBeCloseTo(16 / 9)
    expect(jobAspect(job({ meta: { surface: 'image', aspect: 'auto' } }))).toBe(1)
    expect(jobAspect(job({ category: 'video' }))).toBeCloseTo(16 / 9)
  })
})

describe('feedOrder', () => {
  const job = (id: string, startedAt: number, status: Job['status']) => ({ id, startedAt, status }) as Job
  const row = (taskId: string, createdAt: number, state: HistoryItem['state'] = 'success'): HistoryItem => ({ taskId, model: 'm', category: 'image', state, createdAt })

  it('puts running jobs first, newest first, then results and failures by time', () => {
    const { pending, timeline } = feedOrder({
      jobs: [job('old-run', 50, 'running'), job('new-run', 90, 'submitting'), job('live-fail', 45, 'error')],
      failed: [row('day-old-fail', 10, 'fail')],
      done: [row('r80', 80), row('r40', 40), row('r5', 5)],
    })
    expect(pending.map(entryKey)).toEqual(['job:new-run', 'job:old-run'])
    expect(timeline.map(entryKey)).toEqual(['r80', 'job:live-fail', 'r40', 'day-old-fail', 'r5'])
  })
})
