/**
 * the reference app's feed layout: justified rows, newest first, read left to right.
 *
 * Every row has one height; each tile keeps its own aspect ratio (width = height × aspect),
 * and a row's tiles are scaled so it exactly fills the width, 2 px apart. Measured on their
 * Image feed at 1920 px (1904 px wide): a 3:4 image 380×506 beside three squares 506×506,
 * then four squares 475×475. The last row isn't stretched unless it's nearly full: it keeps
 * the target height and sits left.
 *
 * The order is theirs too: jobs still running first (newest first), then one time-ordered
 * list of finished results and failures — a failure stays where it happened instead of
 * sitting top-left above everything made since.
 *
 * Pure layout and ordering here; `JustifiedFeed.tsx` measures the width and draws it.
 */
import type { HistoryItem } from './api.ts'
import type { Job } from './jobs.ts'

export interface Cell {
  /** The tile's position in the list given to `rowsFor`. */
  index: number
  width: number
  height: number
}

/** Narrowest and widest a tile may be, so one panorama can't turn its row into a sliver. */
export const ASPECT_MIN = 0.4
export const ASPECT_MAX = 3

export const clampAspect = (a: number): number => (Number.isFinite(a) && a > 0 ? Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, a)) : 1)

/** A last row this full (at the target height) is stretched like the rest. */
const NEARLY_FULL = 0.85

/**
 * The rows for tiles of these aspects (width / height) in a box `width` wide. A row takes
 * tiles until its height would fall to the target, then keeps whichever of "with this tile"
 * or "without it" lands nearer the target (by ratio).
 */
export function rowsFor(aspects: number[], width: number, targetHeight: number, gap = 2): Cell[][] {
  if (!(width > 0) || !(targetHeight > 0) || !aspects.length) return []
  const rows: Cell[][] = []
  const heightOf = (sum: number, n: number) => (width - gap * (n - 1)) / sum
  const close = (idx: number[], height: number) => rows.push(idx.map((index) => ({ index, width: clampAspect(aspects[index]) * height, height })))
  let row: number[] = []
  let sum = 0
  for (let i = 0; i < aspects.length; i++) {
    const a = clampAspect(aspects[i])
    row.push(i)
    sum += a
    const h = heightOf(sum, row.length)
    if (h > targetHeight) continue
    const without = row.length > 1 ? heightOf(sum - a, row.length - 1) : Infinity
    if (without / targetHeight < targetHeight / h) {
      row.pop()
      close(row, without)
      row = [i]
      sum = a
      // A tile that alone is wider than the box at the target height is a row of its own.
      const alone = heightOf(a, 1)
      if (alone <= targetHeight) {
        close(row, alone)
        row = []
        sum = 0
      }
    } else {
      close(row, h)
      row = []
      sum = 0
    }
  }
  if (row.length) {
    const natural = sum * targetHeight + gap * (row.length - 1)
    close(row, natural / width >= NEARLY_FULL ? heightOf(sum, row.length) : targetHeight)
  }
  return rows
}

export interface Box {
  index: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * The rows as absolute boxes, snapped to whole pixels so borders stay crisp (a stretched
 * row's right edge still lands on the box's edge). `extra` is room under every tile, for
 * buttons a surface hangs below its results.
 */
export function placeRows(rows: Cell[][], gap = 2, extra = 0): { boxes: Box[]; height: number } {
  const boxes: Box[] = []
  let y = 0
  for (const row of rows) {
    const h = Math.round(row[0]?.height ?? 0)
    let x = 0
    for (const c of row) {
      const left = Math.round(x)
      const right = Math.round(x + c.width)
      boxes.push({ index: c.index, x: left, y, width: Math.max(1, right - left), height: h })
      x += c.width + gap
    }
    y += h + extra + gap
  }
  return { boxes, height: Math.max(0, y - gap) }
}

/* ---------- each tile's aspect ---------- */

const WORDS: Record<string, number> = {
  square: 1,
  square_hd: 1,
  landscape_16_9: 16 / 9,
  landscape_4_3: 4 / 3,
  portrait_16_9: 9 / 16,
  portrait_4_3: 3 / 4,
}

/** "16:9", "9x16", "1.5", Kie's `portrait_4_3` words → width / height; `auto` and the rest → null. */
export function parseAspect(v: unknown): number | null {
  if (typeof v === 'number') return v > 0 && Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const s = v.trim().toLowerCase()
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(s)
  if (m) {
    const a = Number(m[1]) / Number(m[2])
    return a > 0 && Number.isFinite(a) ? a : null
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) > 0 ? Number(s) : null
  return WORDS[s] ?? null
}

/** The size a history row recorded for its media, when it has one. */
function mediaAspect(item: HistoryItem): number | null {
  const m = item.media?.[0] as (Record<string, unknown> & { metadata?: Record<string, unknown> }) | undefined
  if (!m) return null
  for (const src of [m, m.metadata ?? {}]) {
    const w = Number(src.width)
    const h = Number(src.height)
    if (w > 0 && h > 0) return w / h
  }
  return null
}

/** What the job asked for: aspect_ratio (or the model's own name for it), unless it's `auto`. */
function inputAspect(input?: Record<string, unknown>): number | null {
  if (!input) return null
  for (const k of ['aspect_ratio', 'aspectRatio', 'aspect', 'image_size', 'ratio']) {
    const a = parseAspect(input[k])
    if (a) return a
  }
  return null
}

/**
 * A finished (or failed) row's aspect, best first: the media's recorded size → the aspect it
 * was asked for → what the file measured once loaded (`measuredAspect`) → null while unknown.
 */
export function itemAspect(item: HistoryItem, measured: (id: string) => number | null = measuredAspect): number | null {
  if (item.category === 'audio') return 4
  return mediaAspect(item) ?? inputAspect(item.input) ?? measured(item.taskId)
}

/** A job's placeholder takes the shape it asked for (a 3:4 job holds a 3:4 slot). */
export function jobAspect(job: Pick<Job, 'category' | 'meta' | 'input'>): number {
  if (job.category === 'audio') return 4
  return parseAspect(job.meta.aspect) ?? inputAspect(job.input) ?? (job.category === 'video' ? 16 / 9 : 1)
}

/* ---------- aspects measured from the file, for rows that don't say ---------- */

const STORE_KEY = 'st-aspects'
const STORE_MAX = 2000
let measured: Map<string, number> | null = null

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function loadMeasured(): Map<string, number> {
  if (measured) return measured
  measured = new Map()
  try {
    const raw = JSON.parse(sessionStore()?.getItem(STORE_KEY) ?? '{}') as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && v > 0 && Number.isFinite(v)) measured.set(k, v)
    }
  } catch {
    // Junk in storage: measure again.
  }
  return measured
}

export const measuredAspect = (id: string): number | null => loadMeasured().get(id) ?? null

/**
 * Remember what a loaded image or video measured (by taskId, for this browser session).
 * True when that changes anything, i.e. the layout should run again.
 */
export function rememberAspect(id: string, width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false
  const map = loadMeasured()
  const a = width / height
  const was = map.get(id)
  if (was !== undefined && Math.abs(was - a) < 0.005) return false
  map.set(id, a)
  if (map.size > STORE_MAX) map.delete(map.keys().next().value as string)
  try {
    sessionStore()?.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(map)))
  } catch {
    // Storage off or full: it lasts until the page closes.
  }
  return true
}

/** Forget every measurement (tests). */
export function resetMeasured() {
  measured = null
}

/* ---------- the order ---------- */

export type FeedEntry = { kind: 'job'; job: Job; at: number } | { kind: 'failed'; item: HistoryItem; at: number } | { kind: 'result'; item: HistoryItem; at: number }

export const entryKey = (e: FeedEntry): string => (e.kind === 'job' ? `job:${e.job.id}` : e.item.taskId)

/**
 * Jobs still running come first, newest first; everything else — finished results, failed
 * history rows and live failed jobs — is one list by when it was made, newest first.
 * Returned as the two parts so a feed can page the second and always show the first.
 */
export function feedOrder({ jobs, failed, done }: { jobs: Job[]; failed: HistoryItem[]; done: HistoryItem[] }): { pending: FeedEntry[]; timeline: FeedEntry[] } {
  const live = (j: Job) => j.status === 'submitting' || j.status === 'running'
  const pending = jobs
    .filter(live)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((job): FeedEntry => ({ kind: 'job', job, at: job.startedAt }))
  const timeline: FeedEntry[] = [
    ...jobs.filter((j) => !live(j)).map((job): FeedEntry => ({ kind: 'job', job, at: job.startedAt })),
    ...failed.map((item): FeedEntry => ({ kind: 'failed', item, at: item.createdAt })),
    ...done.map((item): FeedEntry => ({ kind: 'result', item, at: item.createdAt })),
  ]
  // Array.sort is stable: equal times keep the order above (history's own order for results).
  timeline.sort((a, b) => b.at - a.at)
  return { pending, timeline }
}
