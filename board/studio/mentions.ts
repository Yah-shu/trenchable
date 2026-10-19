/**
 * Mentions: pointing a new job at something you already made.
 *
 * Their `@` opens a list of your own work and drops a token into the prompt. The token
 * is not decoration — the model reads `@image1` as "the first reference image", so the
 * token and the reference slot have to agree. That is what `mentionFor` works out.
 *
 * Reuses `formatMention` / `insertMentionToken` from the Kie Studio side so a mention
 * typed here behaves exactly as one typed in Generate.
 */
import { formatMention, insertMentionToken } from '../../src/lib/models/mentions.ts'
import { mediaUrl, refFieldKind, studioApi, type FieldSchema, type HistoryItem, type MediaAsset, type ModelDefinition, type Ref, type RefKind } from './api.ts'

export { insertMentionToken }

/**
 * An attached reference, with the picker entry it came from when it came from one. The
 * attached `url` is a fresh Kie upload, never the result's own address, so the picker
 * can only tell an entry is already in use by this key.
 */
export type MentionRef = Ref & { from?: string }

export const kindOfMedia = (m: MediaAsset): RefKind => (m.kind === 'video' ? 'video' : m.kind === 'audio' ? 'audio' : 'image')

/** Everything in one past job that could be mentioned. */
export function mentionableMedia(item: HistoryItem): MediaAsset[] {
  return (item.media ?? []).filter((m) => Boolean(mediaUrl(m)))
}

/**
 * Give Kie something it can actually fetch.
 *
 * An archived result lives on our own disk, which Kie cannot reach, so its bytes go up
 * as a fresh upload. We prefer the archive over the provider's URL even though it costs
 * a round trip: provider URLs expire, and a reference that 404s mid-job is worse than a
 * slow one.
 */
export async function hostForKie(media: MediaAsset): Promise<string> {
  if (media.localPath) {
    const res = await fetch(`/${media.localPath}`)
    if (!res.ok) throw new Error('That result is no longer on disk.')
    const blob = await res.blob()
    const name = media.localPath.split('/').pop() || 'asset'
    const type = blob.type || media.mimeType || 'application/octet-stream'
    const { fileUrl } = await studioApi.upload(new File([blob], name, { type }))
    return fileUrl
  }
  if (media.url) return (await studioApi.rehost(media.url)).fileUrl
  throw new Error('That result has no file to send.')
}

/** The reference field on this model that takes a file of this kind. */
export function refFieldFor(model: ModelDefinition, kind: RefKind): FieldSchema | null {
  const fields = model.fields.filter((f) => f.type === 'reference')
  if (!fields.length) return null
  if (fields.length === 1) return fields[0] ?? null
  return fields.find((f) => refFieldKind(f) === kind) ?? null
}

const TOKENS: Record<RefKind, RegExp> = {
  image: /@image\d+|\[Image \d+\]/gi,
  video: /@Video\d+/gi,
  audio: /@Audio\d+/gi,
}

/**
 * The prompt with the tokens of these kinds taken out — for a model that takes no such
 * file, so a set-aside reference isn't sent as the literal text "@image1". The prompt
 * on screen keeps them; they mean something again once a model that takes them is back.
 */
export function stripMentions(prompt: string, kinds: RefKind[]): string {
  let out = prompt
  for (const k of kinds) out = out.replace(TOKENS[k], '')
  return out === prompt ? prompt : out.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+|[ \t]+$/gm, '')
}

/** One run of the prompt for the chip overlay: plain text, or a reference token. */
export interface PromptSegment {
  text: string
  /** Set on a token: its kind, its 1-based number, and whether a file of that number is attached. */
  ref?: { kind: RefKind; n: number; attached: boolean }
}

const ANY_TOKEN = /@image(\d+)|\[Image (\d+)\]|@Video(\d+)|@Audio(\d+)/gi

/**
 * The prompt cut into text and tokens, for the composer's `@Image 1` chips. The pieces join back to the
 * exact prompt — the overlay draws the same characters behind the textarea, so the caret never drifts —
 * and a token whose file isn't attached (`@image3` with two images) is marked so it can look different.
 */
export function promptSegments(prompt: string, counts: Partial<Record<RefKind, number>>): PromptSegment[] {
  const out: PromptSegment[] = []
  let at = 0
  for (const m of prompt.matchAll(ANY_TOKEN)) {
    const start = m.index ?? 0
    if (start > at) out.push({ text: prompt.slice(at, start) })
    const kind: RefKind = m[3] ? 'video' : m[4] ? 'audio' : 'image'
    const n = Number(m[1] ?? m[2] ?? m[3] ?? m[4])
    out.push({ text: m[0], ref: { kind, n, attached: n >= 1 && n <= (counts[kind] ?? 0) } })
    at = start + m[0].length
  }
  if (at < prompt.length) out.push({ text: prompt.slice(at) })
  return out
}

/** The media picker's Recent / All sub-tabs and its Sort by menu (A–Z only where things have names). */
export type PickerScope = 'recent' | 'all'
export type PickerSort = 'newest' | 'oldest' | 'az'

/** How many of the newest things Recent shows. */
export const RECENT_COUNT = 30

/**
 * A picker list as the sub-tabs and Sort by want it: Recent is the newest RECENT_COUNT whatever the
 * sort, All is everything; then newest or oldest first, or A–Z by name. Equal keys keep their order,
 * and something with no date counts as oldest.
 */
export function arrange<T>(items: T[], scope: PickerScope, sort: PickerSort, dateOf: (t: T) => number, nameOf?: (t: T) => string): T[] {
  const when = (t: T) => {
    const d = dateOf(t)
    return Number.isFinite(d) ? d : -Infinity
  }
  const newest = items.map((t, i) => ({ t, i, d: when(t) })).sort((a, b) => b.d - a.d || a.i - b.i)
  const pool = scope === 'recent' ? newest.slice(0, RECENT_COUNT) : newest
  if (sort === 'newest') return pool.map((x) => x.t)
  if (sort === 'oldest') return [...pool].sort((a, b) => a.d - b.d || a.i - b.i).map((x) => x.t)
  const name = (t: T) => (nameOf ? nameOf(t) : '').trim()
  return [...pool].sort((a, b) => name(a.t).localeCompare(name(b.t), undefined, { sensitivity: 'base', numeric: true }) || a.i - b.i).map((x) => x.t)
}

/** A date the picker can sort on: epoch ms as is, an ISO string parsed, anything else NaN. */
export const dateMs = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' ? Date.parse(v) : Number.NaN)

export interface Mention {
  /** The token to put in the prompt, or '' when this model does not use tokens. */
  token: string
  /** False when the model has nowhere to put a file of this kind. */
  accepted: boolean
}

/**
 * What mentioning this kind of file should do to the prompt, given what is already
 * attached. The index is per field and 1-based, so the second image is `@image2` even
 * if an audio clip was attached between them.
 */
export function mentionFor(model: ModelDefinition, kind: RefKind, existing: Ref[]): Mention {
  const field = refFieldFor(model, kind)
  if (!field) return { token: '', accepted: false }
  const full = field.maxItems != null && existing.filter((r) => r.kind === kind).length >= field.maxItems
  if (full) return { token: '', accepted: false }
  if (!field.mentionStyle || field.mentionStyle === 'none') return { token: '', accepted: true }
  const index = (field.scalar ? 0 : existing.filter((r) => r.kind === kind).length) + 1
  return { token: formatMention(field.mentionStyle, index), accepted: true }
}
