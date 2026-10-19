/**
 * What a Studio job will cost before it runs, the way the reference app's Generate button says it.
 *
 * The server (server/studio/pricing.ts) hands over Kie's whole price list plus what Kie actually charged for
 * past jobs. Turning that into one number is the work here: Kie's list is written for people ("kling 3.0
 * omni, text-to-video, 1080p with native audio = 23 per second") while a job is a model id plus an input
 * object. `estimateCredits` finds the model's rows (by model id, then by name for rows that only link a
 * model page), keeps the one variant whose words agree with the input — resolution, duration, audio on/off,
 * a video reference, fast/quality/pro — and multiplies by seconds or images. A past charge for the same
 * model and the same price-moving inputs beats the list. Whatever can't be pinned to one price comes back
 * null, so the button shows nothing rather than a guess.
 *
 * Only types come from ./api.ts: that file is being rewritten and this one must not depend on its code.
 */
import { useEffect, useState } from 'react'
import type { FieldSchema, ModelDefinition } from './api.ts'

export type PriceUnit = 'image' | 'second' | 'video' | 'call' | 'other'

/** One line of Kie's price list, as the server parsed it. */
export interface PriceRow {
  modelId: string | null
  description: string
  credits: number
  unit: PriceUnit
  unitText: string
  usd?: number
  page?: string
  kind?: string
}

/** What Kie charged per job for one model + learnedKey, median of the last 5. */
export interface LearnedPrice {
  modelId: string
  key: string
  credits: number
  samples: number
  lastAt: number
}

export interface Pricing {
  fetchedAt: string | null
  rows: PriceRow[]
  learned: LearnedPrice[]
}

export interface Estimate {
  credits: number
  basis: 'learned' | 'price-list'
  /** A short human line: "23/s × 8s, 1080p with audio". */
  detail: string
}

/* ---------- loading ---------- */

let loaded: Pricing | null = null
let loading: Promise<Pricing> | null = null

function loadPricing(): Promise<Pricing> {
  loading ??= fetch('/api/studio/pricing')
    .then(async (res) => {
      const body = (await res.json().catch(() => ({}))) as { data?: Pricing; error?: string }
      if (!res.ok || body.data === undefined) throw new Error(body.error ?? `Request failed (${res.status})`)
      loaded = body.data
      return body.data
    })
    .catch((e: unknown) => {
      loading = null // let a later mount try again
      throw e
    })
  return loading
}

/** Prices for this page load: fetched once, shared by every caller. null until loaded (or if it failed). */
export function usePricing(): Pricing | null {
  const [pricing, setPricing] = useState<Pricing | null>(loaded)
  useEffect(() => {
    if (loaded) return
    let live = true
    loadPricing()
      .then((p) => live && setPricing(p))
      .catch(() => live && setPricing(null))
    return () => {
      live = false
    }
  }, [])
  return pricing
}

/* ---------- learned key (twin of server/studio/pricing.ts learnedKey) ---------- */

const KEY_FIELDS = [
  'resolution', 'quality', 'size', 'image_resolution', 'output_resolution', 'mode', 'rendering_speed', 'model',
  'duration', 'extend_times', 'generate_audio', 'generate_audio_switch', 'sound', 'audio',
  'num_images', 'n', 'max_images', 'upscale_factor',
]

const filled = (v: unknown) => (typeof v === 'string' ? v.trim() !== '' : Array.isArray(v) ? v.length > 0 : false)

const hasVideoInput = (input: Record<string, unknown>): boolean =>
  Object.entries(input).some(([k, v]) => /video|clip/i.test(k) && filled(v))

function keyValue(v: unknown): string | null {
  if (typeof v === 'boolean') return String(v)
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null
  if (typeof v !== 'string' || !v.trim()) return null
  const s = v.trim().toLowerCase()
  const n = /^(\d+(?:\.\d+)?)s?$/.exec(s)
  return n ? String(Number(n[1])) : s
}

/** "duration=7|generate_audio=false|resolution=720p" — must match the server's key for the same payload. */
export function learnedKey(input: Record<string, unknown>): string {
  const parts: string[] = []
  for (const name of KEY_FIELDS) {
    const v = keyValue(input[name])
    if (v !== null) parts.push(`${name}=${v}`)
  }
  if (hasVideoInput(input)) parts.push('video_input=true')
  return parts.join('|')
}

/** The value a form would send for a field nobody touched (mirrors src/lib/form.ts buildDefaultValues). */
function formDefault(f: FieldSchema): unknown {
  if (f.default !== undefined) return f.default
  if (f.type === 'boolean') return false
  if (f.type === 'number') return f.min ?? 0
  if (f.type === 'enum') return f.enum?.[0]
  return undefined
}

/** The input as Kie will see it: every price-moving field filled the way the form would fill it. */
function effectiveInput(model: ModelDefinition, input: Record<string, unknown>): Record<string, unknown> {
  const out = { ...input }
  for (const f of model.fields) {
    if (out[f.name] !== undefined || !KEY_FIELDS.includes(f.name)) continue
    const d = formDefault(f)
    if (d !== undefined) out[f.name] = d
  }
  return out
}

/* ---------- reading Kie's wording ---------- */

/** Lower case, letters split from digits, everything else a dash: "wan3.0 video" → "wan-3-0-video". */
const canon = (s: string) =>
  s
    .toLowerCase()
    .replace(/([a-z])(\d)/g, '$1-$2')
    .replace(/(\d)([a-z])/g, '$1-$2')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

/** Operations in a name or description, as letter-only tokens so `canon` can't split them. Edits are image-to-image. */
const OPS: [RegExp, string[]][] = [
  [/text\s*\/\s*image[\s_-]*to[\s_-]*video/, ['ttv', 'itv']],
  [/text[\s_-]*to[\s_-]*video|\bt2v\b/, ['ttv']],
  [/image[\s_-]*to[\s_-]*video|\bi2v\b/, ['itv']],
  [/reference[\s_-]*to[\s_-]*video|\br2v\b/, ['rtv']],
  [/video[\s_-]*to[\s_-]*video|\bv2v\b/, ['vtv']],
  [/speech[\s_-]*to[\s_-]*video/, ['stv']],
  [/text[\s_-]*to[\s_-]*image|\bt2i\b/, ['tti']],
  [/image[\s_-]*to[\s_-]*image|\bi2i\b/, ['iti']],
  [/edit/, ['edit', 'iti']],
  [/remix/, ['remix', 'iti']],
  [/extend/, ['extend']],
  [/upscale/, ['upscale']],
  [/motion[\s_-]*control/, ['motion']],
  [/lip[\s_-]*sync/, ['lipsync']],
  [/transformation/, ['transform']],
  [/layer[\s_-]*decomposition/, ['layers']],
  [/segment[\s_-]*(edit|map)/, ['segment']],
]

function opsOf(s: string): Set<string> {
  const t = s.toLowerCase()
  const out = new Set<string>()
  for (const [re, ops] of OPS) if (re.test(t)) ops.forEach((o) => out.add(o))
  return out
}

const TIERS = ['fast', 'lite', 'quality', 'pro', 'standard', 'master', 'turbo', 'balanced', 'high', 'medium', 'low', 'ultra', 'flash', 'mini', 'draft', 'prime', 'flex', 'max', 'basic', 'plus']
/** Enum values whose tier is implied rather than written: Veo's plain "veo3" is the Quality model. */
const VALUE_TIERS: Record<string, string> = { veo3: 'quality' }

const tiersOf = (s: string): Set<string> => new Set(canon(s).split('-').filter((t) => TIERS.includes(t)))

function normRes(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).trim().toLowerCase()
  const p = /^(\d{3,4})p?$/.exec(s)
  if (p) return p[1] === '2160' ? '4k' : `${p[1]}p`
  const k = /^(\d(?:\.\d)?)k$/.exec(s)
  return k ? `${k[1]}k` : null
}

function resOf(desc: string): Set<string> {
  const out = new Set<string>()
  for (const m of desc.matchAll(/(\d{3,4})\s*p\b/gi)) out.add(m[1] === '2160' ? '4k' : `${m[1]}p`)
  for (const m of desc.matchAll(/(\d)\s*\/\s*(\d)\s*k\b/gi)) {
    out.add(`${m[1]}k`)
    out.add(`${m[2]}k`)
  }
  for (const m of desc.matchAll(/(?<![\d.])(\d(?:\.\d)?)\s*k\b/gi)) out.add(`${m[1]}k`)
  return out
}

function durationOf(desc: string): number | null {
  const m = /(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds+)\b/i.exec(desc)
  return m ? Number(m[1]) : null
}

function audioOf(desc: string): boolean | null {
  const t = desc.toLowerCase()
  if (/\b(no|without)\s+(native\s+)?audio\b/.test(t)) return false
  if (/\bwith\s+(native\s+)?audio\b/.test(t)) return true
  return null
}

function videoOf(desc: string): boolean | null {
  const t = desc.toLowerCase()
  if (/\b(no|without)\s+video\b/.test(t)) return false
  if (/\bwith\s+video\b|\bvideo input\b/.test(t)) return true
  return null
}

function factorsOf(desc: string): Set<string> {
  const out = new Set<string>()
  const m = /factor\s+([\dx/\s]+)/i.exec(desc)
  if (m) for (const f of m[1].matchAll(/(\d+)\s*x?/g)) out.add(f[1])
  return out
}

/** Charges for extra inputs ("Qwen image 3.0, input, 2K"), not for the job itself. */
const isAddOn = (row: PriceRow) =>
  row.description
    .split(',')
    .slice(1)
    .some((seg) => /^(input|input image|image input|cached input|cache writes)\b/i.test(seg.trim()))

/** Everything before the last comma: the model and operation, without the variant. */
const prefixOf = (desc: string) => {
  const segs = desc.split(',')
  return canon(segs.length > 1 ? segs.slice(0, -1).join(',') : desc)
}
const familyOf = (desc: string) => canon(desc.split(',')[0])

/* ---------- finding a model's rows ---------- */

/**
 * Catalogue ids Kie lists under another name. `assume` fills in what the model fixes without a field
 * (Veo generates 720p; 1080p and 4K are the separate upgrade jobs).
 */
const ALIASES: Record<string, { to: string; assume?: Record<string, unknown> }> = {
  'veo/generate': { to: 'veo-3-1', assume: { resolution: '720p' } },
  'veo/1080p': { to: 'veo/get-1080p-video' },
  'veo/4k': { to: 'veo/get-4k-video' },
  'runway/generate': { to: 'runway-api' },
  'runway/extend': { to: 'runway/extend-ai-video' },
  'suno/music': { to: 'ai-music-api/generate' },
  'suno/extend': { to: 'ai-music-api/extend' },
  'suno/upload-extend': { to: 'ai-music-api/extend' },
  'suno/upload-cover': { to: 'ai-music-api/upload-and-cover-audio' },
  'suno/lyrics': { to: 'ai-music-api/generate-lyrics' },
  'suno/replace-section': { to: 'ai-music-api/replace-section' },
  'kling/ai-avatar-pro': { to: 'kling/ai-avatar-v1-pro' },
  'kling/ai-avatar-standard': { to: 'kling/v1-avatar-standard' },
  'market/volcengine-lip-sync': { to: 'volcengine-video-to-video-lip-sync' },
  // Kie prices both under one row: "pixverse-v6, Text /Image to Video".
  'pixverse-v6/text-to-video': { to: 'pixverse-v6/image-to-video' },
}

const OP_TOKENS = new Set(OPS.flatMap(([, ops]) => ops))
const KINDS: Record<string, string> = { image: 'image', video: 'video', music: 'audio' }

const STOP = new Set(['to', 'v', '0', 'api', 'google', 'bytedance', 'black', 'forest', 'labs', 'openai', 'market', 'ai', 'meigen', 'the', 'video', 'image', 'generate', 'generation'])

function tokensOf(s: string): Set<string> {
  let t = s.toLowerCase()
  for (const [re, ops] of OPS) t = t.replace(new RegExp(re.source, 'g'), ` ${ops[0]} `)
  return new Set(
    canon(t)
      .split('-')
      .map((x) => (/^\d+$/.test(x) ? String(Number(x)) : x))
      .filter((x) => x && !STOP.has(x)),
  )
}

const digits = (s: Set<string>) => [...s].filter((x) => /^\d+$/.test(x))
/** "google/nano-banana" is listed as "nano-banana"; "qwen2/image-edit" keeps its "qwen2". */
const stripVendor = (id: string) => id.replace(/^(google|bytedance|market|openai|black-forest-labs)\//, '')

/**
 * Last resort for a model no row names exactly: among the rows that only link a model page, the best-named
 * group — if its version numbers, tiers and operation agree with the model's and no other group scores the same.
 */
function fuzzyRows(model: ModelDefinition, rows: PriceRow[]): PriceRow[] {
  const want = new Set([...tokensOf(model.id), ...tokensOf(model.model)])
  const base = [...tokensOf(model.id)][0]
  if (!base) return []
  const groups = new Map<string, PriceRow[]>()
  for (const row of rows) {
    if (row.modelId || isAddOn(row)) continue
    if (row.kind && KINDS[row.kind] && KINDS[row.kind] !== model.category) continue
    const id = row.page ? `page:${row.page}` : `family:${familyOf(row.description)}`
    groups.set(id, [...(groups.get(id) ?? []), row])
  }
  const modelOps = opsOf(model.id)
  const modelTiers = tiersOf(model.id)
  let best: { score: number; rows: PriceRow[] }[] = []
  for (const [id, group] of groups) {
    const nameTokens = new Set([...tokensOf(id.replace(/^\w+:/, '')), ...group.flatMap((r) => [...tokensOf(r.description.split(',')[0])])])
    const all = new Set([...nameTokens, ...group.flatMap((r) => [...tokensOf(r.description)])])
    if (!all.has(base)) continue
    // Every word of the model's name must be there ("runway/aleph" is not Runway's text-to-video).
    if ([...want].some((t) => /^[a-z]+$/.test(t) && !OP_TOKENS.has(t) && !all.has(t))) continue
    const wd = digits(want)
    if (wd.some((d) => !all.has(d))) continue
    if (wd.length && digits(nameTokens).some((d) => !want.has(d))) continue
    if ([...modelTiers].some((t) => !all.has(t))) continue
    if ([...tiersOf(id.replace(/^\w+:/, ''))].some((t) => !modelTiers.has(t))) continue
    const groupOps = new Set(group.flatMap((r) => [...opsOf(r.description)]))
    if (modelOps.size && groupOps.size && ![...modelOps].some((o) => groupOps.has(o))) continue
    const inter = [...want].filter((t) => all.has(t)).length
    const score = inter / new Set([...want, ...nameTokens]).size
    if (score < 0.4) continue
    if (!best.length || score > best[0].score + 1e-9) best = [{ score, rows: group }]
    else if (Math.abs(score - best[0].score) < 1e-9) best.push({ score, rows: group })
  }
  return best.length === 1 ? best[0].rows : []
}

/** The model's own rows plus unlinked rows that share their "model, operation" prefix. */
export function rowsForModel(model: ModelDefinition, rows: PriceRow[]): PriceRow[] {
  const alias = ALIASES[model.id]?.to
  const ids = new Set([model.id, model.model, alias].filter((x): x is string => !!x))
  const names = new Set([...ids].flatMap((id) => [canon(id), canon(stripVendor(id))]))
  let found = rows.filter((r) => !isAddOn(r) && (r.modelId ? ids.has(r.modelId) : !!alias && r.page === alias))
  if (!found.length) {
    found = rows.filter(
      (r) =>
        !r.modelId &&
        !isAddOn(r) &&
        ((r.page && names.has(canon(r.page))) || names.has(familyOf(r.description)) || names.has(prefixOf(r.description))),
    )
  }
  if (!found.length) found = fuzzyRows(model, rows)
  if (!found.length) return []
  // "kling 2.6, image-to-video" is specific enough to adopt strays; "Suno" alone is not.
  const prefixes = new Set(found.map((r) => prefixOf(r.description)).filter((p) => p.split('-').length >= 3))
  const extra = rows.filter((r) => !r.modelId && !found.includes(r) && !isAddOn(r) && prefixes.has(prefixOf(r.description)))
  return [...found, ...extra]
}

/* ---------- reading the input ---------- */

const RES_FIELDS = ['resolution', 'quality', 'size', 'image_resolution', 'output_resolution', 'mode']
const AUDIO_FIELDS = ['generate_audio', 'generate_audio_switch', 'sound', 'audio']
const DURATION_FIELDS = ['duration', 'extend_times', 'length', 'seconds']
const COUNT_FIELDS = ['num_images', 'num_outputs', 'n', 'max_images', 'batch_size']
const TIER_FIELDS = ['quality', 'mode', 'model', 'rendering_speed', 'speed']

interface Wanted {
  res: string | null
  resLabel: string | null
  duration: number | null
  audio: boolean | null
  video: boolean
  factor: string | null
  tiers: Set<string>
  ops: Set<string>
  /** Alphabetic name tokens of the model id (digits would favour "2K" rows for "nano-banana-2"). */
  name: Set<string>
  images: number
}

const fieldOf = (model: ModelDefinition, name: string) => model.fields.find((f) => f.name === name)

function numberOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number.parseFloat(v) : Number.NaN
  return Number.isFinite(n) && n > 0 ? n : null
}

function isVideoField(f: FieldSchema): boolean {
  if (f.mentionStyle === 'at-video') return true
  if (f.type === 'reference' && (f.accept ?? '').startsWith('video')) return true
  return /video|clip/i.test(f.name)
}

function readInput(model: ModelDefinition, input: Record<string, unknown>): Wanted {
  const assume = ALIASES[model.id]?.assume ?? {}
  const value = (name: string) => input[name] ?? assume[name]
  let res: string | null = null
  let resLabel: string | null = null
  for (const name of RES_FIELDS) {
    const v = value(name)
    const r = normRes(v)
    if (r) {
      res = r
      resLabel = String(v)
      break
    }
  }
  let duration: number | null = null
  for (const name of DURATION_FIELDS) {
    if (!fieldOf(model, name)) continue
    duration = numberOf(value(name))
    if (duration) break
  }
  let audio: boolean | null = null
  for (const name of AUDIO_FIELDS) {
    if (fieldOf(model, name) && typeof value(name) === 'boolean') {
      audio = value(name) as boolean
      break
    }
  }
  const video = hasVideoInput(input) || model.fields.some((f) => isVideoField(f) && filled(input[f.name]))
  const factorField = value('upscale_factor')
  const tiers = tiersOf(model.id)
  for (const name of TIER_FIELDS) {
    const v = value(name)
    if (typeof v !== 'string' || !v) continue
    tiersOf(v).forEach((t) => tiers.add(t))
    const implied = VALUE_TIERS[v.toLowerCase()]
    if (implied) tiers.add(implied)
  }
  let images = 1
  for (const name of COUNT_FIELDS) {
    if (!fieldOf(model, name)) continue
    const n = numberOf(value(name))
    if (n) {
      images = Math.floor(n)
      break
    }
  }
  return {
    res,
    resLabel,
    duration,
    audio,
    video,
    factor: factorField === undefined || factorField === null ? null : String(factorField),
    tiers,
    ops: opsOf(model.id),
    name: new Set([...tokensOf(model.id)].filter((t) => /^[a-z]+$/.test(t))),
    images,
  }
}

/* ---------- picking the variant ---------- */

/** How well a row's wording agrees with the input; null when it contradicts it. */
function scoreRow(row: PriceRow, w: Wanted): number | null {
  const d = row.description
  let score = 0
  const ops = opsOf(d)
  if (w.ops.size && ops.size) {
    if (![...w.ops].some((o) => ops.has(o))) return null
    score += 2
  }
  const res = resOf(d)
  if (res.size && w.res) {
    if (!res.has(w.res)) return null
    score += 3
  }
  if (row.unit === 'video') {
    const dur = durationOf(d)
    if (dur !== null && w.duration !== null) {
      if (Math.abs(dur - w.duration) > 0.01) return null
      score += 3
    }
  }
  const audio = audioOf(d)
  if (audio !== null && w.audio !== null) {
    if (audio !== w.audio) return null
    score += 3
  }
  const video = videoOf(d)
  if (video !== null) {
    if (video !== w.video) return null
    score += 3
  }
  const factors = factorsOf(d)
  if (factors.size && w.factor) {
    if (!factors.has(w.factor)) return null
    score += 3
  }
  for (const t of tiersOf(d)) score += w.tiers.has(t) ? 2 : -4
  // Words of the model's own name tell "Animate Move" from "Animate Replace" under one page.
  const words = tokensOf(d)
  for (const t of w.name) if (words.has(t)) score += 0.5
  return score
}

const fmt = (n: number) => String(Math.round(n * 100) / 100)

function textLength(input: Record<string, unknown>): number {
  let n = 0
  const walk = (v: unknown, key: string) => {
    if (typeof v === 'string' && /^(text|prompt|script|dialogue)$/i.test(key)) n += v.length
    else if (Array.isArray(v)) v.forEach((x) => walk(x, key))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  for (const [k, v] of Object.entries(input)) {
    if (k === 'text' || k === 'dialogue') walk(v, k)
  }
  return n
}

function variantLabel(w: Wanted, row: PriceRow): string {
  const parts: string[] = []
  const tiers = [...tiersOf(row.description)].filter((t) => w.tiers.has(t) && !tiersOf(row.description.split(',')[0]).has(t))
  if (tiers.length) parts.push(tiers.join(' '))
  if (w.resLabel && resOf(row.description).size) parts.push(w.resLabel)
  const audio = audioOf(row.description)
  if (audio !== null) parts.push(audio ? 'with audio' : 'no audio')
  if (videoOf(row.description) === true) parts.push('with video input')
  if (factorsOf(row.description).size && w.factor) parts.push(`${w.factor}x`)
  return parts.join(' ')
}

/**
 * Credits one Generate press will cost: `count` separate jobs of this model with this input (images per job
 * come from the input's own num_images / n field). Learned charges first, then Kie's list. null = unsure.
 */
export function estimateCredits(
  model: ModelDefinition,
  input: Record<string, unknown>,
  prices: { rows: PriceRow[]; learned: LearnedPrice[] },
  count = 1,
): Estimate | null {
  const runs = Math.max(1, Math.floor(count))
  const full = effectiveInput(model, input)
  const times = runs > 1 ? ` × ${runs}` : ''

  const key = learnedKey(full)
  const learned = (prices.learned ?? []).find((l) => (l.modelId === model.id || l.modelId === model.model) && l.key === key)
  if (learned) {
    return { credits: Math.round(learned.credits * runs * 100) / 100, basis: 'learned', detail: `last charged ${fmt(learned.credits)}${times}` }
  }

  const candidates = rowsForModel(model, prices.rows ?? [])
  if (!candidates.length) return null
  const w = readInput(model, full)
  let top: { row: PriceRow; score: number }[] = []
  for (const row of candidates) {
    const score = scoreRow(row, w)
    if (score === null) continue
    if (!top.length || score > top[0].score) top = [{ row, score }]
    else if (score === top[0].score) top.push({ row, score })
  }
  if (!top.length) return null
  const priced = new Set(top.map((t) => `${t.row.credits}|${t.row.unit}|${t.row.unitText.toLowerCase()}`))
  if (priced.size > 1) return null
  const row = top[0].row

  let perJob: number
  let how: string
  if (row.unit === 'second') {
    if (!w.duration) return null
    perJob = row.credits * w.duration
    how = `${fmt(row.credits)}/s × ${fmt(w.duration)}s`
  } else if (row.unit === 'image') {
    perJob = row.credits * w.images
    how = w.images > 1 ? `${fmt(row.credits)}/image × ${w.images}` : `${fmt(row.credits)}/image`
  } else if (row.unit === 'video') {
    perJob = row.credits
    how = `${fmt(row.credits)}/video`
  } else if (row.unit === 'call') {
    perJob = row.credits
    how = `${fmt(row.credits)}/run`
  } else if (/1000\s*char/i.test(row.unitText)) {
    const chars = textLength(full)
    if (!chars) return null
    perJob = (row.credits * chars) / 1000
    how = `${fmt(row.credits)}/1k chars × ${chars} chars`
  } else {
    return null
  }
  const label = variantLabel(w, row)
  return {
    credits: Math.round(perJob * runs * 100) / 100,
    basis: 'price-list',
    detail: `${how}${times}${label ? `, ${label}` : ''}`,
  }
}
