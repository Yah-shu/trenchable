/**
 * Genjutsu as data: which Kie models each of its jobs runs on, how many of your pictures a
 * model can take, how `@image1` citations are written for it, the prompt a job sends, and
 * which history items are Genjutsu's (its own lane and History since 2026-10-19, apart from Video).
 *
 * Theirs is one model doing three things; on Kie it is three sets of models:
 *   motion — Motion transfer: a driving clip moves your character (Kling 3.0 / 2.6 Motion
 *            Control, Wan Animate Move). One character picture each.
 *   swap   — Objects swap: something in the clip becomes your picture. HappyHorse Video Edit
 *            opens: it takes the clip, up to 5 reference pictures and an instruction, and its
 *            own field names "local replacement"; Kling 3.0 Omni Transformation (4 pictures,
 *            cites @image1 natively, but 3–15.5 s clips of ≥700 px and a fixed 16:9 / 9:16 /
 *            1:1 frame once pictures are attached), Wan 2.7 Video Edit (one picture) and Wan
 *            Animate Replace (a person, one picture, no prompt) are on offer.
 *   style  — a Style applied: every frame redrawn in a look, motion kept. The same edit
 *            models, plus Runway Aleph (prompt only — no picture, so no Custom style).
 *
 * Kept pure so the routing is tested without the network.
 */
import type { HistoryItem, ModelDefinition } from '../../../api.ts'
import { isDone } from '../../../api.ts'
import type { Draft } from '../../../draft.ts'
import { GUIDED_MODEL_ID } from '../localtools.ts'
import { CUSTOM, KEEP, STYLE_TAG_PREFIX, styleOf } from './styles.ts'

/** The switch: Motion transfer, Objects swap, or Guided swap (depth + mask + face guide → Seedance 2.5, GuidedSwap.tsx). */
export type GenjutsuMode = 'transfer' | 'swap' | 'guided'
export type Route = 'motion' | 'swap' | 'style'

/** Theirs takes up to 30 pictures; each model gets as many as it reads, in order. */
export const MAX_IMAGES = 30

export const ROUTE_MODELS: Record<Route, string[]> = {
  motion: ['kling-3.0/motion-control', 'kling-2.6/motion-control', 'wan/2-2-animate-move'],
  swap: ['happyhorse/video-edit', 'kling-3.0-omni/transformation', 'wan/2-7-videoedit', 'wan/2-2-animate-replace'],
  style: ['happyhorse/video-edit', 'kling-3.0-omni/transformation', 'wan/2-7-videoedit', 'runway/aleph'],
}

/** Module constants, so the generator doesn't regroup the catalogue on every render. */
export const ROUTE_FILTER: Record<Route, (m: ModelDefinition) => boolean> = {
  motion: (m) => ROUTE_MODELS.motion.includes(m.id),
  swap: (m) => ROUTE_MODELS.swap.includes(m.id),
  style: (m) => ROUTE_MODELS.style.includes(m.id),
}

/** A Style redraws the clip, so it wins over the switch; otherwise the switch decides. */
export const routeOf = (mode: GenjutsuMode, style: string | null): Route => (style ? 'style' : mode === 'swap' ? 'swap' : 'motion')

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')

/** The model a route opens on: the one you last used there, else its first. */
export function preferFor(route: Route, memory: Partial<Record<Route, string>>): RegExp {
  const id = memory[route] && ROUTE_MODELS[route].includes(memory[route]!) ? memory[route]! : ROUTE_MODELS[route][0]
  return new RegExp(`^${escape(id)}$`)
}

/* ---------- the slots' fields ---------- */

export const VIDEO_FIELD = /^(video_urls|video_url|videoUrl)$/
/** Kling's input_urls / image_urls, Wan's image_url, HappyHorse's and Wan 2.7's reference_image. */
export const IMAGE_FIELD = /^(input_urls|image_url|image_urls|reference_image)$/

export const imageFieldOf = (m: ModelDefinition | null) => m?.fields.find((f) => (f.type === 'reference' || f.type === 'string') && IMAGE_FIELD.test(f.name))

/** How many pictures this model reads: 0 when it takes none (Runway Aleph). */
export function imageCapacity(m: ModelDefinition | null): number {
  const f = imageFieldOf(m)
  if (!f) return 0
  if (f.scalar || f.type === 'string') return 1
  return f.maxItems ?? MAX_IMAGES
}

/**
 * One plain line when some pictures won't be sent, or null. `style` is the Custom style
 * picture, which goes first and so takes one of the model's places.
 */
export function imageNote(m: ModelDefinition | null, pictures: number, style = false): string | null {
  if (!m) return null
  const cap = imageCapacity(m)
  const total = pictures + (style ? 1 : 0)
  if (total <= cap) return null
  const name = m.title
  if (cap === 0) return `${name} takes no pictures, so ${total === 1 ? 'yours is' : `your ${total} are`} not sent — it works from the prompt alone.`
  const room = Math.max(0, cap - (style ? 1 : 0))
  if (room === 0) return `${name} takes ${cap === 1 ? 'one picture' : `${cap} pictures`} — the style image — so your other pictures are not sent.`
  const first = room === 1 ? 'the first' : `the first ${room}`
  const verb = style ? (room === 1 ? 'goes with the style image' : 'go with the style image') : room === 1 ? 'is sent' : 'are sent'
  return `${name} takes ${cap === 1 ? 'one picture' : `up to ${cap} pictures`}, so only ${first} of your ${pictures} ${verb}; the rest stay here for another model.`
}

/* ---------- the reference video ---------- */

/** What a clip is, read off its file before anything is sent. */
export interface ClipInfo {
  seconds: number
  width: number
  height: number
}

/**
 * The clip each model takes. Theirs wants 4–30 s; Kling 3.0 Omni Transformation is stricter
 * on Kie: at most 15.5 s, and 700–4,553 px on each side.
 */
export function clipLimits(modelId: string | undefined): { min: number; max: number; minSide?: number; maxSide?: number } {
  if (modelId === 'kling-3.0-omni/transformation') return { min: 4, max: 15.5, minSide: 700, maxSide: 4553 }
  return { min: 4, max: 30 }
}

const secs = (n: number) => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1))

/**
 * Why this clip won't do for this model, in plain words, or null. Said before Generate, so a
 * clip Kie would refuse never becomes a failed job. A clip whose length can't be read passes:
 * Kie has the last word on it.
 */
export function clipLengthProblem(model: ModelDefinition | null, info: ClipInfo | null): string | null {
  if (!model || !info) return null
  const lim = clipLimits(model.id)
  const s = info.seconds
  // Containers round: a 30 s clip often reads 30.03 s.
  if (Number.isFinite(s) && s > 0) {
    if (s < lim.min - 0.1) return `Your reference video is ${secs(s)} s; ${model.title} needs one of at least ${lim.min} s. Use a longer clip.`
    if (s > lim.max + 0.25) {
      const other = lim.max < 30 ? ' — or pick another model, which takes up to 30 s' : ''
      return `Your reference video is ${secs(s)} s; ${model.title} takes up to ${lim.max} s. Trim it${other}.`
    }
  }
  const { width: w, height: h } = info
  if (lim.minSide && w > 0 && h > 0 && Math.min(w, h) < lim.minSide) return `Your reference video is ${w}×${h}; ${model.title} needs at least ${lim.minSide} px on each side. Use a larger clip or another model.`
  if (lim.maxSide && w > 0 && h > 0 && Math.max(w, h) > lim.maxSide) return `Your reference video is ${w}×${h}; ${model.title} takes at most ${lim.maxSide} px a side. Use a smaller clip or another model.`
  return null
}

/* ---------- Quality starts at 720p ---------- */

export const DRAFT_KEY = 'video.genjutsu'
export const START_QUALITY = '720p'

/**
 * Theirs opens every Genjutsu model on 720p. The rail remembers each model's settings
 * (draft.ts), and a model seen for the first time starts from the draft's top-level pills,
 * so a Quality you never picked is written in as 720p — on the start and on every model
 * that has none. One you picked stays. Null when nothing needs writing.
 */
export function seedQuality(d: Draft): Draft | null {
  let changed = false
  const pills = { ...(d.pills ?? {}) }
  if (!pills.resolution) {
    pills.resolution = START_QUALITY
    changed = true
  }
  const byFamily = { ...(d.byFamily ?? {}) }
  for (const [key, s] of Object.entries(byFamily)) {
    if (s?.pills?.resolution) continue
    byFamily[key] = { values: s?.values ?? {}, pills: { ...(s?.pills ?? {}), resolution: START_QUALITY } }
    changed = true
  }
  return changed ? { ...d, pills, byFamily } : null
}

/* ---------- citations ---------- */

/** `@image1` (theirs), `@Image 1` (our tiles) or `[Image 1]`. */
const CITE = /@image\s?(\d+)|\[image\s(\d+)\]/gi

/** Your `@image1` means your first picture; with a style image in front it is sent second. */
export const shiftCitations = (prompt: string, by: number): string => (by ? prompt.replace(CITE, (_, a, b) => `@image${Number(a ?? b) + by}`) : prompt)

/**
 * Citations written the way this model reads them: Kling's `@image1`, HappyHorse's
 * `[Image 1]`, Wan's `Image 1`, nothing for a model that takes no picture.
 */
export function citeFor(m: ModelDefinition | null, prompt: string): string {
  const f = imageFieldOf(m)
  const form = (n: number): string => {
    if (!f) return ''
    if (f.mentionStyle === 'at-image') return `@image${n}`
    if (f.mentionStyle === 'bracket-image' || /^happyhorse\//.test(m!.id)) return `[Image ${n}]`
    if (imageCapacity(m) === 1) return 'the reference image'
    return `Image ${n}`
  }
  return prompt
    .replace(CITE, (_, a, b) => form(Number(a ?? b)))
    .replace(/ {2,}/g, ' ')
    .replace(/ ([.,;])/g, '$1')
    .trim()
}

/* ---------- the prompt a job sends ---------- */

export interface PromptParts {
  route: Route
  mode: GenjutsuMode
  style: string | null
  /** What the user typed, sent only when the Prompt switch is on. */
  prompt: string
  promptOn: boolean
  /** Pictures attached (not counting a Custom style image). */
  pictures: number
}

/**
 * Theirs works with the prompt off: the references carry the detail. Here an edit model
 * needs words, so an empty prompt becomes the instruction for the job — swap this for
 * @image1, or redraw in this look — and what you type is added after it.
 */
export function composePrompt(p: PromptParts, model: ModelDefinition | null): string {
  const custom = p.style === CUSTOM
  const offset = custom ? 1 : 0
  const typed = p.promptOn ? shiftCitations(p.prompt.trim(), offset) : ''
  const parts: string[] = []
  if (p.route === 'style') {
    const look = styleOf(p.style)
    parts.push(custom ? 'Redraw every frame in the exact visual style of @image1: its medium, palette, line, texture and lighting.' : look?.prompt ?? '')
    parts.push(KEEP)
    // What you type says what your pictures are for; without it, the switch does.
    if (p.pictures > 0 && !typed) {
      const ref = `@image${1 + offset}`
      parts.push(p.mode === 'swap' ? `Replace the matching object, product or garment with the one in ${ref}.` : `The person in the clip becomes the character in ${ref}, drawn in the same style.`)
    }
  } else if (p.route === 'swap' && p.pictures > 0 && !typed) {
    parts.push('Replace the matching person, product or garment in the video with the one in @image1. Keep the motion, camera, framing, lighting and everything else exactly as filmed.')
  }
  if (typed) parts.push(typed)
  return citeFor(model, parts.filter(Boolean).join(' '))
}

/* ---------- what's remembered ---------- */

export interface GenjutsuState {
  mode: GenjutsuMode
  style: string | null
  promptOn: boolean
  /** The model last used on each route. */
  models: Partial<Record<Route, string>>
}

const KEY = 'studio.video.genjutsu'

export const DEFAULT_STATE: GenjutsuState = { mode: 'transfer', style: null, promptOn: false, models: {} }

export function readState(raw: string | null): GenjutsuState {
  try {
    const v = raw ? (JSON.parse(raw) as Partial<GenjutsuState>) : {}
    return {
      mode: v.mode === 'swap' || v.mode === 'guided' ? v.mode : 'transfer',
      style: typeof v.style === 'string' && (v.style === CUSTOM || styleOf(v.style)) ? v.style : null,
      promptOn: v.promptOn === true,
      models: v.models && typeof v.models === 'object' ? v.models : {},
    }
  } catch {
    return DEFAULT_STATE
  }
}

export function loadState(): GenjutsuState {
  try {
    return readState(window.localStorage.getItem(KEY))
  } catch {
    return DEFAULT_STATE
  }
}

export function saveState(s: GenjutsuState) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // Storage off: Genjutsu opens on its defaults next time.
  }
}

/* ---------- whose jobs: Genjutsu's History, not Video's ---------- */

/** Every Genjutsu job is tracked under this tag; a styled one under its style's tag too. */
export const GENJUTSU_TAG = 'genjutsu'

/**
 * Task ids of Genjutsu's jobs, from the tracked tags: its own and every style's (a styled
 * job from before the lane had its own tag carries only that). Guided swaps are known by
 * their model instead (`isGenjutsuItem`).
 */
export function genjutsuTasks(tracked: Record<string, string[]>): Set<string> {
  const out = new Set<string>()
  for (const [tag, ids] of Object.entries(tracked)) if (tag === GENJUTSU_TAG || tag.startsWith(STYLE_TAG_PREFIX)) for (const id of ids) out.add(id)
  return out
}

/** Whether a history item belongs to Genjutsu (its History) rather than Video. */
export const isGenjutsuItem = (item: Pick<HistoryItem, 'taskId' | 'modelId'>, tasks: Set<string>): boolean => item.modelId === GUIDED_MODEL_ID || tasks.has(item.taskId)

/** Which switch a past job ran on, by its model: the guided pipeline, a motion model, else Objects swap. */
export function modeForModel(modelId: string | undefined): GenjutsuMode {
  if (modelId === GUIDED_MODEL_ID) return 'guided'
  return modelId && ROUTE_MODELS.motion.includes(modelId) ? 'transfer' : 'swap'
}

/**
 * What a handoff to Genjutsu switches. The viewer's Use the motion asks for Motion transfer;
 * a Reuse names its job's switch and model, so a style is cleared (the model must be on the
 * switch's own list). A Motion Library pick names no switch and keeps them all.
 */
export function handoffPatch(h: { mode?: string; modelId?: string }): Partial<GenjutsuState> | null {
  const mode = h.mode === 'transfer' || h.mode === 'swap' || h.mode === 'guided' ? h.mode : null
  if (!mode) return null
  return h.modelId ? { mode, style: null } : { mode }
}

/* ---------- the Motion Library ---------- */

export const videoOf = (item: HistoryItem) => item.media?.find((m) => m.kind === 'video') ?? null

/** Finished clips that can drive a motion, newest first. */
export function motionClips(items: HistoryItem[] | null | undefined): HistoryItem[] {
  return (items ?? []).filter((i) => i.category === 'video' && isDone(i) && videoOf(i)).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}

/** Saved motions in the order they were saved (newest first), only those still in history. */
export function savedClips(saved: string[], items: HistoryItem[] | null | undefined): HistoryItem[] {
  const byId = new Map(motionClips(items).map((i) => [i.taskId, i]))
  return saved.map((id) => byId.get(id)).filter((i): i is HistoryItem => Boolean(i))
}

export const toggleSaved = (saved: string[], taskId: string): string[] => (saved.includes(taskId) ? saved.filter((id) => id !== taskId) : [taskId, ...saved])
