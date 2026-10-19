/**
 * Model families: one name in the picker, the right variant underneath.
 *
 * Kie lists each direction as its own model — "Flux-2 - Text to Image" beside "Flux-2 -
 * Image to Image", "Wan 2.6 - Text to Video" beside "Wan 2.6 - Image to Video". On
 * the reference app you pick "Flux-2" and adding a reference quietly switches it to the
 * image-to-image variant. `familiesOf` groups the catalogue the same way, and
 * `variantFor` picks the member that fits what is attached right now.
 *
 * Post-processing models (upscalers, extenders, lip-sync, background removal…) are not
 * generators; `isTool` keeps them out of the generic pickers so "make an image" can never
 * land on an upscaler. The surfaces that need them ask for them by name.
 */
import type { ModelCategory, ModelDefinition, RefKind } from './api.ts'
import { refFieldKind } from './api.ts'

/** What a member of a family does with references. */
export type Direction = 'text' | 'image' | 'reference' | 'edit' | 'any'

export interface Family {
  key: string
  title: string
  category: ModelCategory
  members: ModelDefinition[]
}

const TOOL =
  /upscal|remove.?background|segment|layer.?decomposition|extend|extension|lip.?sync|motion.?control|ai.?avatar|isolation|identification|subject.?detection|animate.?(move|replace)|transformation|video.?edit|video.?to.?video|convert to|draft|speech.?to.?video|infinitalk|omnihuman|aleph|dialogue|lyrics|regenerate a section|cover audio|extend uploaded/i

/** True for models that change an existing result rather than make a new one. */
export const isTool = (m: ModelDefinition): boolean => TOOL.test(`${m.id} ${m.title}`)

const hay = (m: ModelDefinition) => `${m.id} ${m.title}`

export function directionOf(m: ModelDefinition): Direction {
  const h = hay(m)
  if (/text.?to.?(image|video)|\bt2[iv]\b/i.test(h)) return 'text'
  if (/reference.?to|\br2v\b|fusion/i.test(h)) return 'reference'
  if (/image.?to.?(image|video)|\bi2[iv]\b|first.*last|transition/i.test(h)) return 'image'
  if (/\bedit\b|remix|kontext/i.test(h)) return 'edit'
  return 'any'
}

/** Catalogue entries whose title is a bare slug that doesn't read as a name even once split into words. */
const NAMED: Record<string, string> = {
  'elevenlabs/text-to-speech-turbo-2-5': 'ElevenLabs Turbo 2.5',
  'elevenlabs/audio-isolation': 'ElevenLabs Audio Isolation',
}

/** Drop the direction words so every member of a family reads the same. */
export function familyTitle(m: ModelDefinition): string {
  if (NAMED[m.id]) return NAMED[m.id]
  // A few catalogue titles are bare slugs ("bytedance-seedance-2"); read them as words.
  const raw = /\s/.test(m.title.trim()) ? m.title : m.title.replace(/[-_/]+/g, ' ')
  const title = raw
    .replace(/\b(text|image|reference)[\s-]*to[\s-]*(image|video)\b/gi, '')
    .replace(/\b(first\s*&\s*last frame transition|fusion\s*\/?)\b/gi, '')
    .replace(/\bimage edit\b|\bedit\b|\bremix\b/gi, '')
    .replace(/^(google|bytedance)\b\s*[-–]?\s*/i, '')
    .replace(/\s*[-–—/]\s*$/g, '')
    .replace(/\s+-\s+(?=\S)/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return title.charAt(0).toUpperCase() + title.slice(1)
}

/** Spelling-insensitive key: "GPT Image 2" and "GPT Image-2" are one family. */
const keyOf = (title: string) =>
  title
    .toLowerCase()
    .replace(/[-_/.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The catalogue grouped into families, in catalogue order, tools left out. */
export function familiesOf(models: ModelDefinition[]): Family[] {
  const out = new Map<string, Family>()
  for (const m of models) {
    // A handful of catalogue entries came through with no fields at all; there is
    // nothing to send them, so they would only ever fail.
    if (isTool(m) || !m.fields.length) continue
    const title = familyTitle(m) || m.title
    const key = `${m.category}:${keyOf(title)}`
    const hit = out.get(key)
    if (hit) hit.members.push(m)
    else out.set(key, { key, title, category: m.category, members: [m] })
  }
  return [...out.values()]
}

export const familyOf = (families: Family[], modelId: string | null | undefined): Family | null =>
  (modelId && families.find((f) => f.members.some((m) => m.id === modelId))) || null

const refKinds = (m: ModelDefinition): Set<RefKind> => new Set(m.fields.filter((f) => f.type === 'reference').map(refFieldKind))

/** Whether a model can take a file of this kind at all. */
export const accepts = (m: ModelDefinition, kind: RefKind) => refKinds(m).has(kind)

/**
 * Whether any member of the family takes a file of this kind (or, with no kind, any file).
 * False for the text-only families (Z-Image, Imagen 4): the composer then drops its `+`,
 * `@` and reference strip, as theirs does, and sets the attached files aside.
 */
export const familyTakes = (family: Family, kind?: RefKind): boolean =>
  family.members.some((m) => (kind ? accepts(m, kind) : m.fields.some((f) => f.type === 'reference')))

/** True when the model will not run without an image (an image-to-video with no frame). */
export function needsImage(m: ModelDefinition): boolean {
  const dir = directionOf(m)
  if (dir === 'image' || dir === 'edit') return true
  return m.fields.some((f) => f.type === 'reference' && f.required && refFieldKind(f) === 'image')
}

/**
 * The member to run for what is attached. With images: something that reads them
 * (image-to-x first, then an editor, then reference-to-x, then anything with an image
 * field). Without: a text-to-x member, else one that does not insist on an image.
 * `prefer` keeps a member the user chose by hand whenever it still fits.
 */
export function variantFor(family: Family, attached: { image?: number; video?: number; audio?: number }, prefer?: string | null): ModelDefinition {
  const members = family.members
  const chosen = prefer ? members.find((m) => m.id === prefer) : undefined
  const images = attached.image ?? 0
  const fits = (m: ModelDefinition) => (images ? accepts(m, 'image') : !needsImage(m)) && (!attached.video || accepts(m, 'video')) && (!attached.audio || accepts(m, 'audio'))
  if (chosen && fits(chosen)) return chosen
  const order: Direction[] = images ? ['image', 'edit', 'reference', 'any', 'text'] : ['text', 'any', 'reference', 'image', 'edit']
  // An editor that takes a mask (Ideogram V3 Edit) means "repaint this area"; with no
  // mask drawn, its remix sibling is what an attached picture is asking for.
  const masked = (m: ModelDefinition) => m.fields.some((f) => /mask/i.test(f.name))
  for (const withMask of [false, true]) {
    for (const dir of order) {
      const hit = members.find((m) => directionOf(m) === dir && fits(m) && masked(m) === withMask)
      if (hit) return hit
    }
  }
  return chosen ?? members[0]
}

/**
 * Families listed first in the picker, in this order — the most used ones. Everything else follows in catalogue order.
 */
const FEATURED: RegExp[] = [
  /^gpt image 2$/i,
  /^nano banana pro$/i,
  /^nano banana 2(\.1)?$/i,
  /^seedream ?5\.0 pro$/i,
  /^gpt image 2\.5/i,
  /^flux-2 pro$/i,
  /^gemini omni 1\.1 flash$/i,
  /^seedance 2(\.5)?$/i,
  /^kling 3\.0 omni$|^kling v3 turbo$/i,
  /^veo/i,
  /^wan 3\.0 video$/i,
  /^minimax h3$/i,
  /^elevenlabs/i,
  /^suno/i,
]

const rank = (f: Family) => {
  const i = FEATURED.findIndex((re) => re.test(f.title))
  return i < 0 ? FEATURED.length : i
}

/** Featured families first (stable otherwise), for the pickers. */
export const featuredFirst = (families: Family[]): Family[] =>
  families
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map((x) => x.f)

export const isFeatured = (f: Family) => rank(f) < FEATURED.length

/** What a family's picker row says about it: inputs, best resolution, length range, sound. */
export interface FamilySpecs {
  ability: string
  /** "4K", "1080p"; null when the models don't say. */
  res: string | null
  /** Shortest and longest clip in seconds; null for stills or when the models don't say. */
  lo: number | null
  hi: number | null
  audio: boolean
}

/** "1080p" → 1080, "4K" → 4000, anything else → -1. */
const resScore = (v: string) => {
  const m = /^(\d+(?:\.\d+)?)\s*([kp])$/i.exec(v)
  if (!m) return -1
  return m[2].toLowerCase() === 'k' ? Number(m[1]) * 1000 : Number(m[1])
}

/**
 * A length range written only in a field's description: "(Minimum: 6, Maximum: 30)",
 * "the range is [2, 30]", "in whole seconds, 4–12". Some catalogue entries give no
 * min/max but say it there.
 */
export function rangeInText(text: string | undefined): [number, number] | null {
  if (!text) return null
  const m =
    /minimum:\s*(\d+(?:\.\d+)?)\D{1,12}maximum:\s*(\d+(?:\.\d+)?)/i.exec(text) ??
    /\[\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*\]/.exec(text) ??
    /\b(\d+(?:\.\d+)?)\s*(?:[–-]|to)\s*(\d+(?:\.\d+)?)\b/i.exec(text)
  if (!m) return null
  const lo = Number(m[1])
  const hi = Number(m[2])
  return lo > 0 && hi > lo && hi <= 120 ? [lo, hi] : null
}

/**
 * What is known about a family whose models carry no such fields. Veo's clips are a
 * fixed 8 seconds with sound; nothing in its fields says so.
 */
const KNOWN_SPECS: [RegExp, Partial<FamilySpecs>][] = [[/^veo\b/i, { lo: 8, hi: 8, audio: true }]]

export function familySpecs(family: Family): FamilySpecs {
  const res = new Set<string>()
  let lo = Infinity
  let hi = 0
  let audio = false
  for (const m of family.members) {
    for (const f of m.fields) {
      if (/^(resolution|quality|image_resolution|size|output_resolution)$/i.test(f.name)) for (const v of f.enum ?? []) res.add(v)
      if (/^(duration|length|seconds)$/i.test(f.name)) {
        const nums = (f.enum ?? []).map(Number).filter(Number.isFinite)
        if (f.min != null) nums.push(f.min)
        if (f.max != null) nums.push(f.max)
        if (!nums.length) nums.push(...(rangeInText(f.description) ?? []))
        for (const n of nums) {
          if (n > 0) lo = Math.min(lo, n)
          hi = Math.max(hi, n)
        }
      }
      if (f.type === 'boolean' && /^(generate_audio|sound|audio|generate_audio_switch)$/i.test(f.name)) audio = true
    }
  }
  const best = [...res].sort((a, b) => resScore(b) - resScore(a))[0]
  const out: FamilySpecs = {
    ability: familyAbility(family),
    res: best && resScore(best) > 0 ? best.toUpperCase().replace(/P$/, 'p') : null,
    lo: hi > 0 ? lo : null,
    hi: hi > 0 ? hi : null,
    audio,
  }
  // Hand-known facts only fill gaps; what the fields say wins.
  const known = KNOWN_SPECS.find(([re]) => re.test(family.title))?.[1]
  if (known) {
    out.res ??= known.res ?? null
    out.lo ??= known.lo ?? null
    out.hi ??= known.hi ?? null
    out.audio ||= Boolean(known.audio)
  }
  return out
}

/** "4–30s", "8s", or null. */
export const lengthLabel = (s: Pick<FamilySpecs, 'lo' | 'hi'>): string | null => (s.hi == null ? null : s.lo != null && s.lo < s.hi ? `${s.lo}–${s.hi}s` : `${s.hi}s`)

/**
 * What a family can do, the way their picker rows say it: inputs, then the best
 * resolution, the length range and whether it makes sound.
 */
export function familySummary(family: Family): string {
  const s = familySpecs(family)
  const length = lengthLabel(s)
  return [s.ability, s.res, length, s.audio ? 'audio' : null].filter(Boolean).join(' · ')
}

/** What a family can be fed, for the picker's subtitle. */
export function familyAbility(family: Family): string {
  const kinds = new Set<RefKind>()
  for (const m of family.members) for (const k of refKinds(m)) kinds.add(k)
  const textOnly = family.members.some((m) => !needsImage(m))
  const parts: string[] = []
  if (textOnly) parts.push('Text')
  if (kinds.has('image')) parts.push('Image')
  if (kinds.has('video')) parts.push('Video')
  if (kinds.has('audio')) parts.push('Audio')
  return parts.join(' + ')
}

/* ---------- the model picker: notes, badges, versions ---------- */

/**
 * The one line under a family's name in the model picker, as the reference app's rows have
 * ("Ultimate quality, text and diagrams"). Short, plain and true of what Kie runs:
 * the reference app's own description where the model is the same, else read off the fields.
 * Matched against the family title; `category` narrows a title both lists use.
 */
const FAMILY_NOTES: [RegExp, string, ModelCategory?][] = [
  // image
  [/^gpt image 2\.5 flare$/i, 'GPT Image 2.5, Flare variant: generation and precise edits up to 4K'],
  [/^gpt image 2\.5 sunburst$/i, 'GPT Image 2.5, Sunburst variant: generation and precise edits up to 4K'],
  [/^gpt image 2$/i, 'Sharp text rendering and edits, up to 4K'],
  [/^gpt image 1\.5$/i, 'Earlier GPT Image: good text and edits'],
  [/^nano banana pro$/i, 'Ultimate quality, text and diagrams'],
  [/^nano banana 2\.1$/i, 'Newest Nano Banana: fast, high quality, up to 4K'],
  [/^nano banana 2$/i, 'Fast, next-gen high-quality images'],
  [/^nano banana 2 lite$/i, 'Lite next-gen high-quality images'],
  [/^nano banana$/i, 'Realistic images, budget-friendly'],
  [/^seedream ?5\.0 pro$/i, 'Pro-tier visual reasoning, instruction-based editing'],
  [/^seedream ?5\.0 flash$/i, 'Fast generation and instruction-based edits, up to 2K'],
  [/^seedream ?5\.0 lite$/i, 'Visual reasoning, instruction-based editing'],
  [/^seedream ?4\.5$/i, 'Precise control and transformations'],
  [/^seedream ?4\.0$/i, 'Fast generation and edits, up to 4K'],
  [/^seedream ?3\.0$/i, 'Earlier Seedream, text to image only'],
  [/^flux 2 pro$/i, 'Precise prompt adherence, Pro variant'],
  [/^flux 2$/i, 'FLUX.2, Flex variant: precise prompt adherence'],
  [/^imagen ?4$/i, "Google's Imagen 4: clean, photoreal text to image"],
  [/^imagen ?4 fast$/i, 'Imagen 4, faster'],
  [/^imagen ?4 ultra$/i, 'Imagen 4 at its most detailed'],
  [/^grok imagine$/i, 'Expressive, high-contrast generation and editing', 'image'],
  [/^grok imagine image 2\.0$/i, 'Next-generation image creation and editing from xAI'],
  [/^ideogram character$/i, 'Keeps one character the same from a reference photo'],
  [/^ideogram v3$/i, 'Strong typography; generate, remix or edit'],
  [/^qwen$/i, "Alibaba's Qwen Image: good text, edits"],
  [/^z image$/i, 'Super fast, stylized text to image'],
  [/^pixverse v6$/i, 'A clip that moves between two frames', 'image'],
  // video
  [/^seedance 2\.5$/i, 'Multi-reference video with native audio, up to 30 s'],
  [/^seedance 2$/i, 'Image, video and audio references, consistent identity'],
  [/^seedance 2\.0 fast$/i, 'Seedance 2.0, faster, at 720p'],
  [/^seedance 2\.0 mini$/i, 'The lightest Seedance 2.0, at 720p'],
  [/^seedance 1\.5 pro$/i, 'Reliable motion, improved quality'],
  [/^v1 lite$/i, 'Seedance 1.0 Lite: quick 5 or 10 s clips'],
  [/^v1 pro$/i, 'Seedance 1.0 Pro: sharper motion, up to 1080p'],
  [/^v1 pro fast$/i, 'Seedance 1.0 Pro, faster, from a start image'],
  [/^gemini omni 1\.1 flash$/i, 'Keyframes, multi-reference and native audio, up to 4K'],
  [/^gemini omni video$/i, 'Reference-driven video with native audio'],
  [/^kling 3\.0 omni$/i, 'Multi-shot video with native audio, up to 4K'],
  [/^kling v3 turbo$/i, 'Fast text-to-video and start-frame animation'],
  [/^kling 2\.6$/i, 'Cinematic motion, advanced physics, native audio'],
  [/^kling v2\.5 turbo pro$/i, 'Kling 2.5 Turbo: quick, fluid motion'],
  [/^kling v2\.1 master$/i, "Kling 2.1's top tier"],
  [/^kling v2\.1 (pro|standard)$/i, 'Kling 2.1, from a start image'],
  [/^veo\b/i, 'Google Veo: cinematic 8 s clips with native audio'],
  [/^runway\b/i, 'Runway video from text or an image'],
  [/^wan 3\.0 video$/i, 'Text, first/last frame or multi-reference, native audio'],
  [/^wan 3\.0 video prime$/i, "Wan 3.0's top tier, same inputs"],
  [/^wan 2\.7$/i, 'Character-consistent video from text, images or references'],
  [/^wan 2\.7 image$/i, 'Wan 2.7 still images, up to 2K'],
  [/^wan 2\.7 image pro$/i, 'Wan 2.7 still images, up to 4K'],
  [/^wan 2\.6$/i, 'Open-weight, stylized, experimental creative'],
  [/^wan 2\.6 flash$/i, 'Wan 2.6, faster, from a start image, with sound'],
  [/^wan 2\.5$/i, 'Earlier Wan, text or image to video'],
  [/^wan 2\.2\b/i, 'Quick 720p clips'],
  [/^minimax h3$/i, 'Keyframes or image, video and audio references, up to 2K'],
  [/^hailuo 2\.3\b/i, 'Natural physics and facial emotion, from a start image'],
  [/^hailuo (pro|standard)$/i, 'Hailuo 02: natural physics'],
  [/^happyhorse 1 1$/i, 'HappyHorse 1.1: text, a start frame or references'],
  [/^happyhorse$/i, 'Text-to-video and start-frame animation'],
  [/^pixverse v6$/i, 'Stylized clips with sound, from text, an image or references', 'video'],
  [/^vidu q4$/i, 'From an image or references, with sound, up to 4K'],
  [/^grok imagine$/i, 'Text and image to video', 'video'],
  [/^grok imagine video 1\.5\b/i, 'Grok Video 1.5: text, a start image or references'],
  // audio
  [/^elevenlabs .*narration$/i, 'Natural narration in many voices'],
  [/^elevenlabs turbo/i, 'Faster ElevenLabs speech'],
  [/^suno\b/i, 'Full songs with vocals from a prompt or lyrics'],
]

/**
 * Model lines: the reference app's All models shows "Kling" once and its versions in a flyout.
 * A series is matched on the family title (Seedance 1.0 is in the catalogue as "V1 Lite"
 * / "V1 Pro", so also on ByteDance's ids). A family no series claims stands alone.
 */
const SERIES: { name: string; test: RegExp; ids?: RegExp; note: string }[] = [
  { name: 'GPT Image', test: /^gpt image/i, note: "OpenAI's image models: text rendering and precise edits" },
  { name: 'Nano Banana', test: /^nano banana/i, note: "Google's image models: realistic, fast, strong on text" },
  { name: 'Seedream', test: /^seedream/i, note: "ByteDance's image models: instruction-based editing" },
  { name: 'FLUX.2', test: /^flux/i, note: 'Black Forest Labs: precise prompt adherence' },
  { name: 'Imagen', test: /^imagen/i, note: "Google's Imagen 4: photoreal text to image" },
  { name: 'Grok Imagine', test: /^grok imagine/i, note: "xAI's Grok Imagine models" },
  { name: 'Ideogram', test: /^ideogram/i, note: 'Strong typography and one character kept the same' },
  { name: 'Qwen', test: /^qwen/i, note: "Alibaba's Qwen image models: text rendering and edits" },
  { name: 'Seedance', test: /^seedance/i, ids: /^bytedance\/v1-/, note: 'ByteDance video: references, consistent identity, native audio' },
  { name: 'Gemini Omni', test: /^gemini omni/i, note: 'Google video with native audio and references' },
  { name: 'Kling', test: /^kling/i, note: 'Cinematic motion and physics' },
  { name: 'Wan', test: /^wan/i, note: "Alibaba's Wan models: stylized; native audio on the newest" },
  { name: 'MiniMax Hailuo', test: /^(minimax|hailuo)/i, note: 'Natural physics and facial emotion' },
  { name: 'HappyHorse', test: /^happy ?horse/i, note: 'Text-to-video and start-frame animation' },
  { name: 'ElevenLabs', test: /^elevenlabs/i, note: 'Natural speech in many voices' },
  { name: 'Gemini TTS', test: /^gemini .*(speech|tts)/i, note: 'Google text to speech, steered by a style prompt' },
]

const seriesRule = (f: Family) => SERIES.find((s) => s.test.test(f.title) || (s.ids && f.members.some((m) => s.ids!.test(m.id))))

/** The model line a family belongs to ("Kling" for Kling 2.6), or its own title. */
export const seriesName = (f: Family): string => seriesRule(f)?.name ?? f.title

/** A title the note and date tables match on: lower case, "Flux-2" read as "flux 2", dots kept. */
const tableKey = (title: string) =>
  title
    .toLowerCase()
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

/** The picker's one line for a family: its own note, else its series', else what it takes. */
export function familyNote(f: Family): string {
  const k = tableKey(f.title)
  const own = FAMILY_NOTES.find(([re, , cat]) => (!cat || cat === f.category) && re.test(k))
  return own?.[1] ?? seriesRule(f)?.note ?? familyAbility(f)
}

/**
 * When each family first appeared in the catalogue. The catalogue carries no dates, so
 * this is read off the git history of src/data/catalog.json (2026-10-14 = in the working
 * copy synced that day, not yet committed). A family is NEW for 30 days after that.
 */
const FIRST_SEEN: [RegExp, string][] = [
  [/^gpt image 2\.5\b/i, '2026-09-17'],
  [/^grok imagine image 2\.0$/i, '2026-09-17'],
  [/^gemini omni 1\.1 flash$/i, '2026-09-17'],
  [/^kling 3\.0 omni$/i, '2026-09-17'],
  [/^wan 3\.0 video\b/i, '2026-09-17'],
  [/^qwen 2\.1$/i, '2026-09-22'],
  [/^nano banana 2\.1$/i, '2026-10-14'],
  [/^seedream ?5\.0 flash$/i, '2026-10-14'],
  [/^vidu q4$/i, '2026-10-14'],
  [/^gemini (2\.5 pro|3\.8 flash)/i, '2026-10-14'],
]

const NEW_FOR_MS = 30 * 24 * 60 * 60 * 1000

/** True while a family is under a month in the catalogue, for the NEW badge. */
export function isNew(f: Family, now = Date.now()): boolean {
  const k = tableKey(f.title)
  const seen = FIRST_SEEN.find(([re]) => re.test(k))?.[1]
  if (!seen) return false
  const age = now - Date.parse(`${seen}T00:00:00Z`)
  return age >= 0 && age < NEW_FOR_MS
}

/** The first version number in a title: "Kling V2.1 Master" → 2.1, "MiniMax H3" → 3; -1 for none. */
const versionOf = (title: string) => {
  const m = /(\d+(?:\.\d+)?)/.exec(title)
  return m ? Number(m[1]) : -1
}

/** A model line in All models: one row, its versions in the flyout. */
export interface Series {
  key: string
  name: string
  note: string
  /** Featured versions first, then newest first; the first is what a click on the row picks. */
  versions: Family[]
}

/**
 * The families as All models lists them: each series once, where its first family
 * would have stood (featured first), with its versions ordered for the flyout.
 */
export function seriesOf(families: Family[]): Series[] {
  const ordered = featuredFirst(families)
  const at = new Map(ordered.map((f, i) => [f, i]))
  const out = new Map<string, Series>()
  for (const f of ordered) {
    const rule = seriesRule(f)
    const key = `${f.category}:${rule ? rule.name : f.key}`
    const hit = out.get(key)
    if (hit) hit.versions.push(f)
    else out.set(key, { key, name: rule?.name ?? f.title, note: rule?.note ?? '', versions: [f] })
  }
  return [...out.values()].map((s) => {
    // A series of one is just that family: its own name and note.
    if (s.versions.length === 1) return { ...s, name: s.versions[0].title, note: familyNote(s.versions[0]) }
    const versions = [...s.versions].sort(
      (a, b) => Number(isFeatured(b)) - Number(isFeatured(a)) || versionOf(b.title) - versionOf(a.title) || (at.get(a) ?? 0) - (at.get(b) ?? 0),
    )
    return { ...s, versions }
  })
}

/** A series row's chips: its best resolution, the widest length range, sound if any version has it. */
export function seriesSpecs(s: Series): FamilySpecs {
  const all = s.versions.map(familySpecs)
  const los = all.flatMap((x) => (x.lo == null ? [] : [x.lo]))
  const his = all.flatMap((x) => (x.hi == null ? [] : [x.hi]))
  const res = all.flatMap((x) => (x.res ? [x.res] : [])).sort((a, b) => resScore(b) - resScore(a))[0] ?? null
  return {
    ability: [...new Set(all.flatMap((x) => x.ability.split(' + ').filter(Boolean)))].join(' + '),
    res,
    lo: los.length ? Math.min(...los) : null,
    hi: his.length ? Math.max(...his) : null,
    audio: all.some((x) => x.audio),
  }
}

/**
 * Search across every version: each word has to appear in the family's name, its
 * series, its note or its specs. Results keep the picker's order.
 */
export function searchFamilies(families: Family[], query: string): Family[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return featuredFirst(families)
  // A number has to start a number: "5" finds Seedream 5.0, not Seedream 4.5.
  const tests = words.map((w) => (/^\d/.test(w) ? new RegExp(`(?:^|[^\\d.])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) : null))
  return featuredFirst(families).filter((f) => {
    const text = `${f.title} ${tableKey(f.title)} ${seriesName(f)} ${familyNote(f)} ${familySummary(f)}`.toLowerCase()
    return words.every((w, i) => tests[i]?.test(text) ?? text.includes(w))
  })
}
