/**
 * Kie credit prices for Generation Studio, so a Generate button can say what a job costs before it runs.
 *
 * Two sources, both handed to the board as they are (board/studio/pricing.ts turns them into one number):
 *
 * - Kie's public price list. kie.ai/pricing only server-renders its first 25 rows (in __NEXT_DATA__); the
 *   table pages through POST api.kie.ai/client/v1/model-pricing/page (no key, 100 rows a page at most), so
 *   that is read first and the page is the fallback. Kept in memory and in <studioDir>/pricing.json
 *   (paths.ts) and refreshed at most every 12h. When Kie can't be reached the last
 *   saved copy is served, however old.
 * - What Kie actually charged: history items with `creditsConsumed`, keyed by model + the inputs that move
 *   the price (resolution, quality, duration, audio, a video reference, ...), median of the last 5. The list
 *   is written for people and is sometimes ambiguous or stale; a real charge is neither.
 *
 * `learnedKey` has a twin in board/studio/pricing.ts (the board computes the same key from its form) — change
 * both together; each side's tests pin the same example key.
 */
import { join } from 'node:path'
import type { HistoryItem } from '../../src/lib/models/types.ts'
import { readJson, writeJson } from '../lib/json-file.ts'
import { studioDir } from './paths.ts'

export type PriceUnit = 'image' | 'second' | 'video' | 'call' | 'other'

export interface PriceRow {
  /** The Kie model id from the row's link (`?model=`); null for rows that only link a model page. */
  modelId: string | null
  /** Kie's wording, e.g. "kling 3.0 omni, text-to-video, 1080p with native audio". */
  description: string
  credits: number
  unit: PriceUnit
  /** Kie's own unit text ("per second", "per 1000 characters", "per vedio" ...). */
  unitText: string
  usd?: number
  /** The model page the row links to ("nano-banana-pro"): the only name some rows have. */
  page?: string
  /** Kie's interface type: image, video, music or chat. */
  kind?: string
}

export interface LearnedPrice {
  modelId: string
  key: string
  /** Median of the last (up to) 5 charges for this model + key. */
  credits: number
  samples: number
  /** createdAt of the newest charge used. */
  lastAt: number
}

export interface PriceList {
  fetchedAt: string | null
  rows: PriceRow[]
  /** False when only the page's first rows could be read; such a copy is retried soon and never saved. */
  complete?: boolean
}

const API_URL = 'https://api.kie.ai/client/v1/model-pricing/page'
const PAGE_URL = 'https://kie.ai/pricing'
const PAGE_SIZE = 100
const MAX_PAGES = 30
const REFRESH_MS = 12 * 60 * 60 * 1000
const RETRY_MS = 10 * 60 * 1000
const TIMEOUT_MS = 15_000
const KEEP = 5
// Kie's edge refuses some bare clients; a browser-like agent is what the page itself sends.
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Trenchable Studio price check)', Accept: 'application/json, text/html' }

const cachePath = () => join(studioDir(), 'pricing.json')

/* ---------- parsing ---------- */

const text = (v: unknown): string =>
  typeof v === 'string'
    ? v.replace(/（/g, '(').replace(/）/g, ')').replace(/\s+/g, ' ').replace(/\s+,/g, ',').trim()
    : ''

function amount(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v.trim()) : Number.NaN
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** Kie's unit strings, typos included ("per vedio", "per milion tokens", "per request "). */
export function unitOf(unitText: string): PriceUnit {
  const t = unitText.toLowerCase().trim()
  if (/\bsec(ond)?s?\b/.test(t)) return 'second'
  if (/^per (an? )?image$/.test(t)) return 'image'
  if (/\b(video|vedio)s?\b/.test(t)) return 'video'
  if (/\b(request|generation|call|upscale|task|run)s?\b/.test(t)) return 'call'
  return 'other'
}

function fromAnchor(anchor: unknown): { modelId: string | null; page?: string } {
  if (typeof anchor !== 'string' || !anchor.trim()) return { modelId: null }
  try {
    const url = new URL(anchor.trim(), 'https://kie.ai')
    const modelId = url.searchParams.get('model')?.trim() || null
    const page = url.hostname.endsWith('kie.ai') ? url.pathname.replace(/^\/+|\/+$/g, '') : ''
    return page ? { modelId, page } : { modelId }
  } catch {
    return { modelId: null }
  }
}

/** One price-list record (API or page) → a row, or null when it has no description or no usable price. */
export function parsePriceRecord(raw: unknown): PriceRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const description = text(r.modelDescription)
  const credits = amount(r.creditPrice)
  if (!description || credits === null) return null
  const unitText = text(r.creditUnit)
  const usd = amount(r.usdPrice)
  const kind = text(r.interfaceType).toLowerCase()
  return {
    ...fromAnchor(r.anchor),
    description,
    credits,
    unit: unitOf(unitText),
    unitText,
    ...(usd !== null ? { usd } : {}),
    ...(kind ? { kind } : {}),
  }
}

/** A list of records; duplicates (same description + unit) keep the first. */
export function parsePriceRecords(list: unknown): PriceRow[] {
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const rows: PriceRow[] = []
  for (const raw of list) {
    const row = parsePriceRecord(raw)
    if (!row) continue
    const id = `${row.description.toLowerCase()}|${row.unitText.toLowerCase()}`
    if (seen.has(id)) continue
    seen.add(id)
    rows.push(row)
  }
  return rows
}

function findRecords(node: unknown, out: unknown[], depth = 0): void {
  if (!node || typeof node !== 'object' || depth > 12) return
  if (Array.isArray(node)) {
    if (node.some((x) => x && typeof x === 'object' && 'modelDescription' in x)) out.push(...node)
    else for (const x of node) findRecords(x, out, depth + 1)
    return
  }
  for (const v of Object.values(node)) findRecords(v, out, depth + 1)
}

/**
 * The rows kie.ai/pricing embeds. Reads __NEXT_DATA__ when it is there; otherwise scans for the bare record
 * objects (also in their escaped form), so a change of page framework still yields what the page shows.
 */
export function parsePricingHtml(html: string): PriceRow[] {
  const next = /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/.exec(html)
  if (next) {
    try {
      const found: unknown[] = []
      findRecords(JSON.parse(next[1]), found)
      const rows = parsePriceRecords(found)
      if (rows.length) return rows
    } catch {
      // fall through to the scan
    }
  }
  const scan = (source: string): unknown[] => {
    const out: unknown[] = []
    for (const m of source.matchAll(/\{[^{}]*"modelDescription"[^{}]*\}/g)) {
      try {
        out.push(JSON.parse(m[0]))
      } catch {
        // not a whole record
      }
    }
    return out
  }
  let found = scan(html)
  if (!found.length && html.includes('\\"modelDescription\\"')) found = scan(html.replace(/\\"/g, '"'))
  return parsePriceRecords(found)
}

/* ---------- fetching + cache ---------- */

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>

async function fetchApiRows(fetcher: Fetcher): Promise<PriceRow[]> {
  const records: unknown[] = []
  let pages = 1
  for (let page = 1; page <= pages && page <= MAX_PAGES; page++) {
    const res = await fetcher(API_URL, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageNum: page, pageSize: PAGE_SIZE, modelDescription: '', interfaceType: '' }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Kie's price API answered ${res.status}`)
    const body = (await res.json().catch(() => null)) as { code?: number; msg?: string; data?: { records?: unknown; pages?: unknown } } | null
    if (!body || body.code !== 200 || !body.data || !Array.isArray(body.data.records)) {
      throw new Error(`Kie's price API said: ${body?.msg || 'nothing usable'}`)
    }
    records.push(...body.data.records)
    pages = Math.max(1, Math.floor(Number(body.data.pages) || 1))
  }
  const rows = parsePriceRecords(records)
  if (!rows.length) throw new Error("Kie's price API returned no prices")
  return rows
}

async function fetchPageRows(fetcher: Fetcher): Promise<PriceRow[]> {
  const res = await fetcher(PAGE_URL, { headers: HEADERS, signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`kie.ai/pricing answered ${res.status}`)
  const rows = parsePricingHtml(await res.text())
  if (!rows.length) throw new Error('kie.ai/pricing had no prices in it')
  return rows
}

/** The whole list from the API, or the page's first rows (complete: false) when the API is down. */
export async function fetchPriceRows(fetcher: Fetcher = fetch): Promise<{ rows: PriceRow[]; complete: boolean }> {
  try {
    return { rows: await fetchApiRows(fetcher), complete: true }
  } catch (apiError) {
    try {
      return { rows: await fetchPageRows(fetcher), complete: false }
    } catch {
      throw apiError
    }
  }
}

let memory: PriceList | null = null
let loadedFromDisk = false
let lastAttempt = 0
let inflight: Promise<PriceList> | null = null

function readSaved(): PriceList | null {
  const saved = readJson<Partial<PriceList> | null>(cachePath(), null)
  if (!saved || !Array.isArray(saved.rows) || !saved.rows.length) return null
  return { fetchedAt: typeof saved.fetchedAt === 'string' ? saved.fetchedAt : null, rows: saved.rows, complete: true }
}

async function refresh(fetcher: Fetcher, now: number): Promise<PriceList> {
  lastAttempt = now
  try {
    const { rows, complete } = await fetchPriceRows(fetcher)
    // A partial copy never replaces a whole one: 25 rows would hide every other model's price.
    if (!complete && memory?.complete && memory.rows.length > rows.length) return memory
    memory = { fetchedAt: new Date(now).toISOString(), rows, complete }
    if (complete) {
      try {
        writeJson(cachePath(), { fetchedAt: memory.fetchedAt, rows })
      } catch (e) {
        console.warn(`[studio] could not save the price list: ${(e as Error).message}`)
      }
    }
    return memory
  } catch (e) {
    if (memory?.rows.length) return memory
    throw new Error(`Kie's price list could not be read (${(e as Error).message}) and there is no saved copy yet.`)
  }
}

/**
 * The price list, refetched when older than 12h (a partial or failed fetch is retried after 10 minutes).
 * A stale copy is answered at once while the refetch runs behind it; only a cold start waits for Kie.
 */
export async function getPriceList(deps: { fetch?: Fetcher; now?: () => number } = {}): Promise<PriceList> {
  const now = (deps.now ?? Date.now)()
  if (!memory && !loadedFromDisk) {
    loadedFromDisk = true
    memory = readSaved()
  }
  const stale = memory?.rows.length ? memory : null
  if (stale) {
    const age = stale.fetchedAt ? now - Date.parse(stale.fetchedAt) : Number.POSITIVE_INFINITY
    if (age < (stale.complete ? REFRESH_MS : RETRY_MS)) return stale
    if (now - lastAttempt < RETRY_MS) return stale
  }
  inflight ??= refresh(deps.fetch ?? fetch, now).finally(() => {
    inflight = null
  })
  if (stale) {
    inflight.catch(() => undefined)
    return stale
  }
  return inflight
}

/** Drops the in-memory copy so the next call reads disk again. For tests. */
export function forgetPriceList(): void {
  memory = null
  loadedFromDisk = false
  lastAttempt = 0
  inflight = null
}

/* ---------- learned from history ---------- */

/** Input fields whose value can change what Kie charges. Same list as the board's. */
const KEY_FIELDS = [
  'resolution', 'quality', 'size', 'image_resolution', 'output_resolution', 'mode', 'rendering_speed', 'model',
  'duration', 'extend_times', 'generate_audio', 'generate_audio_switch', 'sound', 'audio',
  'num_images', 'n', 'max_images', 'upscale_factor',
]

const filled = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : false)

/** Whether a video (or clip) went in: Kie prices video-to-video runs differently from prompt-only ones. */
export const hasVideoInput = (input: Record<string, unknown>): boolean =>
  Object.entries(input).some(([k, v]) => /video|clip/i.test(k) && filled(v))

function keyValue(v: unknown): string | null {
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim().toLowerCase()
  const n = /^(\d+(?:\.\d+)?)s?$/.exec(s)
  return n ? String(Number(n[1])) : s
}

/** "duration=7|generate_audio=false|resolution=720p" — the price-moving part of an input, in a fixed order. */
export function learnedKey(input: Record<string, unknown>): string {
  const parts: string[] = []
  for (const name of KEY_FIELDS) {
    const v = keyValue(input[name])
    if (v !== null) parts.push(`${name}=${v}`)
  }
  if (hasVideoInput(input)) parts.push('video_input=true')
  return parts.join('|')
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  const m = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
  return Math.round(m * 1000) / 1000
}

/** Real charges per model + key: the median of the newest 5. */
export function learnedPrices(items: HistoryItem[]): LearnedPrice[] {
  const groups = new Map<string, { modelId: string; key: string; charges: { credits: number; at: number }[] }>()
  for (const item of items) {
    const credits = item.creditsConsumed
    if (typeof credits !== 'number' || !Number.isFinite(credits) || credits <= 0) continue
    const modelId = item.modelId || item.model
    if (!modelId) continue
    const key = learnedKey(item.input ?? {})
    const id = `${modelId}\n${key}`
    const g = groups.get(id) ?? { modelId, key, charges: [] }
    g.charges.push({ credits, at: item.createdAt ?? 0 })
    groups.set(id, g)
  }
  return [...groups.values()]
    .map(({ modelId, key, charges }) => {
      const last = charges.sort((a, b) => b.at - a.at).slice(0, KEEP)
      return { modelId, key, credits: median(last.map((c) => c.credits)), samples: last.length, lastAt: last[0].at }
    })
    .sort((a, b) => a.modelId.localeCompare(b.modelId) || a.key.localeCompare(b.key))
}
