/**
 * The feeds' Filter and View — the two buttons the reference app puts over every feed — as pure
 * decisions plus their memory.
 *
 *  - Filter: which models (out of the ones this feed actually has, with counts), which days
 *    (Today / Last 7 days / Last 30 days / All), Hide failed, Liked only.
 *  - View: the card size (the justified rows' height, `rowHeight`; the List view's card height)
 *    and, on the rail surfaces, List or Grid. Video opens on List like theirs; every other feed
 *    on its grid.
 *
 * Each surface remembers its own choice in localStorage. A job still running is never
 * filtered out: you just pressed Generate, and the tile is how you know it went.
 *
 * The List view's side panel reads a job's input for its chips: the prompt with its
 * `@image1` / `@Video1` / `[Image 1]` tokens as chips, and resolution · duration · aspect.
 */
import type { HistoryItem } from './api.ts'
import { inDateRange, selectRange } from './actions.ts'
import type { Job } from './jobs.ts'

export type FeedRange = 'all' | 'today' | '7d' | '30d'
export type FeedLayout = 'grid' | 'list'

export interface FeedPrefs {
  /** Model keys to show (catalogue id, else Kie's model name); empty shows them all. */
  models: string[]
  range: FeedRange
  hideFailed: boolean
  liked: boolean
  /** Card size in px: the grid's row height (at the reference app's width, `rowHeight`), the List card's half-height. */
  size: number
  layout: FeedLayout
}

export const SIZE_MIN = 160
export const SIZE_MAX = 520

export const RANGES: { id: FeedRange; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
]

export interface FeedDefaults {
  size: number
  layout: FeedLayout
}

/**
 * Video opens on List like the reference app's, and so does Genjutsu (its own lane, once part of
 * Video). The Image feed's rows start at their density, mid
 * slider: four squares a row on a 1920 px window (and on a 1440 px one, see `rowHeight`).
 */
export const feedDefaults = (surface: string, wide = false): FeedDefaults => ({ size: wide ? 340 : 230, layout: surface === 'video' || surface === 'genjutsu' ? 'list' : 'grid' })

const keyOf = (surface: string) => `st-feed:${surface}`

const clampSize = (n: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n)))

/** the reference app's Image feed is 1904 px wide on a 1920 px window: the width the row heights below are for. */
const REF_WIDTH = 1904
/** The slider's ends as row heights there: ~10 squares a row … 3; mid (340) is their 470 px, four a row. */
const ROW_MIN = 180
const ROW_MAX = 760

/**
 * The justified rows' target height (justified.ts) for a card size, in a feed `width` px
 * wide. At their 1904 px the slider runs 180–760 px; narrower feeds scale it down part of
 * the way, so the default keeps ~4 squares a row from a 1440 px window to a 1920 px one
 * (a fixed height gives 3 on one and 5 on the other), and a narrow pane still gets fewer,
 * larger tiles rather than the same count shrunk.
 */
export const rowHeight = (size: number, width: number): number => {
  const atRef = ROW_MIN + ((clampSize(size) - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * (ROW_MAX - ROW_MIN)
  const scale = 0.35 + 0.65 * Math.min(1.25, Math.max(0, width / REF_WIDTH))
  return Math.max(96, Math.round(atRef * scale))
}

/** A surface's remembered prefs; anything missing or malformed falls back to the defaults. */
export function readPrefs(surface: string, d: FeedDefaults, storage: Pick<Storage, 'getItem'> | null = safeStorage()): FeedPrefs {
  let raw: Partial<FeedPrefs> = {}
  try {
    raw = (JSON.parse(storage?.getItem(keyOf(surface)) ?? '{}') ?? {}) as Partial<FeedPrefs>
  } catch {
    raw = {}
  }
  return {
    models: Array.isArray(raw.models) ? raw.models.filter((m): m is string => typeof m === 'string') : [],
    range: RANGES.some((r) => r.id === raw.range) ? (raw.range as FeedRange) : 'all',
    hideFailed: raw.hideFailed === true,
    liked: raw.liked === true,
    size: typeof raw.size === 'number' && Number.isFinite(raw.size) ? clampSize(raw.size) : d.size,
    layout: raw.layout === 'list' || raw.layout === 'grid' ? raw.layout : d.layout,
  }
}

export function writePrefs(surface: string, prefs: FeedPrefs, storage: Pick<Storage, 'setItem'> | null = safeStorage()) {
  try {
    storage?.setItem(keyOf(surface), JSON.stringify(prefs))
  } catch {
    // Storage off or full: the choice lasts until the page closes.
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** How many filters are on, for the dot on the Filter button. */
export const activeFilters = (p: FeedPrefs): number => (p.models.length ? 1 : 0) + (p.range !== 'all' ? 1 : 0) + (p.hideFailed ? 1 : 0) + (p.liked ? 1 : 0)

/** The prefs with every filter off (the view choices stay). */
export const clearFilters = (p: FeedPrefs): FeedPrefs => ({ ...p, models: [], range: 'all', hideFailed: false, liked: false })

export const modelKey = (i: Pick<HistoryItem, 'modelId' | 'model'>): string => i.modelId ?? i.model

export interface ModelChoice {
  id: string
  label: string
  count: number
}

/**
 * The models a feed's own history holds, most used first, each with how many results it
 * has. `titleOf` names a catalogue id; without a title the row's own model name is used.
 */
export function modelChoices(items: HistoryItem[], titleOf?: (id: string) => string | undefined): ModelChoice[] {
  const by = new Map<string, ModelChoice>()
  for (const i of items) {
    const id = modelKey(i)
    const hit = by.get(id)
    if (hit) hit.count++
    else by.set(id, { id, label: titleOf?.(id) || i.model || id, count: 1 })
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
}

/** Toggle one model in the filter. */
export const toggleModel = (p: FeedPrefs, id: string): string[] => (p.models.includes(id) ? p.models.filter((m) => m !== id) : [...p.models, id])

const inModels = (p: FeedPrefs, key: string) => !p.models.length || p.models.includes(key)
const inRange = (p: FeedPrefs, at: number, now: Date) => inDateRange(at, { kind: p.range }, now)

/** A finished result: model, days, Liked only. */
export function showResult(item: HistoryItem, p: FeedPrefs, now = new Date()): boolean {
  return inModels(p, modelKey(item)) && inRange(p, item.createdAt, now) && (!p.liked || Boolean(item.pinned))
}

/** A failed history row: gone under Hide failed or Liked only (a failure can't be liked), else as a result. */
export function showFailure(item: HistoryItem, p: FeedPrefs, now = new Date()): boolean {
  return !p.hideFailed && !p.liked && inModels(p, modelKey(item)) && inRange(p, item.createdAt, now)
}

/** A job in the queue: a running one always shows; a failed one follows the failure rules. */
export function showJob(job: Pick<Job, 'status' | 'modelId'>, p: FeedPrefs): boolean {
  if (job.status !== 'error') return true
  return !p.hideFailed && !p.liked && inModels(p, job.modelId)
}

/* ---------- the List view's side panel ---------- */

export type PromptPart = { text: string } | { chip: string }

const TOKEN = /@(image|video|audio|element)\s?(\d+)|\[(image|video|audio)\s?(\d+)\]/gi

/** The prompt split around its reference tokens, each token named the way the viewer shows it ("Image 1"). */
export function promptParts(text: string): PromptPart[] {
  const out: PromptPart[] = []
  let at = 0
  for (const m of text.matchAll(TOKEN)) {
    const start = m.index ?? 0
    if (start > at) out.push({ text: text.slice(at, start) })
    const kind = (m[1] ?? m[3] ?? '').toLowerCase()
    out.push({ chip: `${kind[0]?.toUpperCase() ?? ''}${kind.slice(1)} ${m[2] ?? m[4]}` })
    at = start + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

const ASPECT_WORDS: Record<string, string> = {
  square: '1:1',
  square_hd: '1:1',
  landscape_16_9: '16:9',
  landscape_4_3: '4:3',
  portrait_16_9: '9:16',
  portrait_4_3: '3:4',
}

/**
 * The chips under a job's prompt: resolution · duration · aspect, from whatever the model
 * called them, when the job set them ("720p", "5s", "16:9").
 */
export function specChips(input?: Record<string, unknown>): string[] {
  if (!input) return []
  const pick = (re: RegExp) => Object.keys(input).find((k) => re.test(k) && input[k] !== '' && input[k] != null)
  const out: string[] = []
  const res = pick(/resolution/i) ?? pick(/^quality$/i)
  const resV = res ? String(input[res]) : ''
  if (resV && (/resolution/i.test(res ?? '') || /^\d+(p|k)$/i.test(resV))) out.push(resV)
  const dur = pick(/duration|^seconds$|^length$/i)
  if (dur) {
    const v = input[dur]
    const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null
    if (n !== null) out.push(`${n}s`)
    else if (typeof v === 'string' && /^\d+(\.\d+)?\s?s$/i.test(v.trim())) out.push(v.trim())
  }
  const asp = pick(/^aspect|(^|_)ratio$|^image_size$/i)
  if (asp) {
    const v = String(input[asp])
    const label = /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(v) ? v : ASPECT_WORDS[v]
    if (label) out.push(label)
  }
  return out
}

/** When a job ran, the way the List view's panel ends: "Oct 16, 2:05 PM". */
export const whenLabel = (ms: number): string =>
  new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/* ---------- selecting tiles, and "Last viewed" ---------- */

/** The surface a hash route names (`#/gen/image` → "image"), so each feed keeps its own memory. */
export function surfaceKeyOf(hash: string): string {
  return /^#\/gen\/([^/?#]+)/.exec(hash)?.[1] ?? 'studio'
}

type Listener = () => void

/**
 * the reference app's select box on every finished tile, for the feeds that don't run their own selection
 * (Assets does): one shared set, so a tile anywhere can tick itself and the floating bulk bar
 * (mounted once, beside the viewer) can act on all of them. It forgets everything when the surface
 * changes. A shift-click adds the run between the last click and this one, in the order on screen.
 */
export function createSelection() {
  let picked = new Map<string, HistoryItem>()
  let anchor: string | null = null
  let version = 0
  const subs = new Set<Listener>()
  const emit = () => {
    version++
    subs.forEach((f) => f())
  }
  return {
    has: (id: string) => picked.has(id),
    size: () => picked.size,
    items: () => [...picked.values()],
    version: () => version,
    subscribe: (f: Listener) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
    /** `order` is the tiles' ids as shown; `lookup` finds the item behind one of them. */
    toggle(item: HistoryItem, shift: boolean, order: string[] = [], lookup: (id: string) => HistoryItem | undefined = () => undefined) {
      const ids = selectRange(order.includes(item.taskId) ? order : [...order, item.taskId], new Set(picked.keys()), anchor, item.taskId, shift)
      const next = new Map<string, HistoryItem>()
      for (const id of ids) {
        const it = id === item.taskId ? item : (picked.get(id) ?? lookup(id))
        if (it) next.set(id, it)
      }
      picked = next
      anchor = item.taskId
      emit()
    },
    clear() {
      if (!picked.size && anchor === null) return
      picked = new Map()
      anchor = null
      emit()
    },
  }
}

/**
 * The tile you last opened in the viewer, per surface ("Last viewed", as on their feed). Kept for the
 * browser session only; `storage` is injectable for tests.
 */
export function createLastViewed(storage: Pick<Storage, 'getItem' | 'setItem'> | null = sessionStore()) {
  const KEY = 'st-last-viewed'
  let map: Record<string, string> = {}
  try {
    const raw = JSON.parse(storage?.getItem(KEY) ?? '{}') as unknown
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) map = Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === 'string')) as Record<string, string>
  } catch {
    map = {}
  }
  const subs = new Set<Listener>()
  return {
    get: (surface: string): string | null => map[surface] ?? null,
    mark(surface: string, taskId: string) {
      if (map[surface] === taskId) return
      map = { ...map, [surface]: taskId }
      try {
        storage?.setItem(KEY, JSON.stringify(map))
      } catch {
        // Storage off: it lasts until the page closes.
      }
      subs.forEach((f) => f())
    },
    subscribe: (f: Listener) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
  }
}

function sessionStore(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}
