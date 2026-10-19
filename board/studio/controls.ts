/**
 * The composer's fixed pills, read off whichever model is behind them.
 *
 * the reference app's aspect, quality, duration and count pills only ever offer what the model
 * in the picker accepts, and vanish when it has no such setting. Kie models each spell
 * those settings their own way — `aspect_ratio`, `aspectRatio`, `ratio`, or an
 * `image_size` of "portrait_16_9" — so `controlsFor` finds the field behind each pill
 * and turns its options into choices. Values are then held per field name, which is what
 * lets Advanced settings and the pills edit one shared set of values.
 */
import type { FieldSchema, ModelDefinition } from './api.ts'
import type { Choice } from './parts.tsx'

export type PillKey = 'aspect' | 'resolution' | 'duration' | 'count'

export interface Pill {
  key: PillKey
  field: FieldSchema
  choices: Choice[]
}

export interface Controls {
  aspect?: Pill
  resolution?: Pill
  duration?: Pill
  /** The model's own count field; when absent, a batch is sent as separate jobs. */
  count?: Pill
  /** Field names the pills own, so Advanced settings leaves them out. */
  owned: string[]
}

/** Their size names, read as the ratio they mean. */
const SIZE_WORDS: Record<string, string> = {
  square: '1:1',
  square_hd: '1:1 HD',
  portrait_4_3: '3:4',
  portrait_3_2: '2:3',
  portrait_16_9: '9:16',
  landscape_4_3: '4:3',
  landscape_3_2: '3:2',
  landscape_16_9: '16:9',
  landscape_21_9: '21:9',
}

const isRatio = (v: string) => /^\d+(\.\d+)?:\d+(\.\d+)?$/.test(v) || v in SIZE_WORDS || /^(auto|adaptive)$/i.test(v)

/** "basic" → "Basic", "720p" stays "720p", size names read as ratios. */
const label = (v: string) => SIZE_WORDS[v] ?? (/^[a-z][a-z ]*$/.test(v) ? v.charAt(0).toUpperCase() + v.slice(1) : v)

const enumChoices = (f: FieldSchema): Choice[] => (f.enum ?? []).filter((v) => v !== '').map((v) => ({ value: v, label: label(v) }))

const byName = (fields: FieldSchema[], re: RegExp, ok: (f: FieldSchema) => boolean = () => true) => fields.find((f) => re.test(f.name) && ok(f))

/**
 * A number field as a list of whole values a pill can offer. Short spans list every step;
 * `limit` lets a duration range list every second (Seedance 2.5's 4–30s), since the rail
 * shows it as a slider rather than a list.
 */
function numberChoices(f: FieldSchema, unit: string, fallback: number[], limit = 12): Choice[] {
  const min = f.min ?? fallback[0]
  const max = f.max ?? fallback[fallback.length - 1]
  const step = f.step && f.step >= 1 ? f.step : 1
  const span = Math.floor((max - min) / step) + 1
  const values = span <= limit ? Array.from({ length: span }, (_, i) => min + i * step) : fallback.filter((v) => v >= min && v <= max)
  if (typeof f.default === 'number' && !values.includes(f.default)) values.push(f.default)
  return values.sort((a, b) => a - b).map((v) => ({ value: String(v), label: `${v}${unit}` }))
}

/** Up to this many whole seconds, a duration range lists every one of them. */
const DURATION_STEPS = 31

export function controlsFor(model: ModelDefinition | null): Controls {
  if (!model) return { owned: [] }
  const f = model.fields
  const out: Controls = { owned: [] }

  const aspect =
    byName(f, /^(aspect_?ratio|aspectRatio|ratio)$/i, (x) => x.type === 'enum') ??
    byName(f, /^image_size$/i, (x) => x.type === 'enum' && (x.enum ?? []).some(isRatio))
  if (aspect && aspect.enum?.length) out.aspect = { key: 'aspect', field: aspect, choices: enumChoices(aspect) }

  const resolution = byName(
    f,
    /^(resolution|quality|image_resolution|output_resolution|size|image_size|mode)$/i,
    (x) => x.type === 'enum' && x !== aspect && (x.enum ?? []).some((v) => /^\d+(\.\d+)?(p|k)$|^\d{3,4}$|^(basic|high|medium|ultra|standard|low)$/i.test(v)),
  )
  if (resolution) out.resolution = { key: 'resolution', field: resolution, choices: enumChoices(resolution) }

  const duration = byName(f, /^(duration|length|seconds|video_length)$/i)
  if (duration) {
    if (duration.type === 'enum' && duration.enum?.length) out.duration = { key: 'duration', field: duration, choices: duration.enum.map((v) => ({ value: v, label: `${v}s` })) }
    else if (duration.type === 'number' || duration.type === 'string') out.duration = { key: 'duration', field: duration, choices: numberChoices(duration, 's', [3, 4, 5, 6, 8, 10, 12, 15], DURATION_STEPS) }
  }

  const count = byName(f, /^(num_images|num_outputs|n|max_images|batch_size|samples|count)$/i, (x) => x.type === 'number' || x.type === 'enum')
  if (count) {
    out.count = {
      key: 'count',
      field: count,
      choices: count.type === 'enum' ? enumChoices(count) : numberChoices(count, '', [1, 2, 3, 4]),
    }
  }

  out.owned = [out.aspect, out.resolution, out.duration, out.count].filter(Boolean).map((p) => p!.field.name)
  return out
}

/** The value a pill shows for a model before anything is picked. */
export function pillDefault(pill: Pill): string {
  const d = pill.field.default
  if (d !== undefined && d !== null && pill.choices.some((c) => c.value === String(d))) return String(d)
  return pill.choices[0]?.value ?? ''
}

/** Store a pill's string back in the type the field wants. */
export function pillValue(pill: Pill, value: string): unknown {
  if (pill.field.type === 'number') return Number(value)
  return value
}

/**
 * Carry a value across a model switch: the same string if the new model offers it,
 * else the nearest match (exact → case-insensitive → "1080p" inside "1080P"), else the
 * new model's own default.
 */
export function carryOver(pill: Pill, previous: unknown): string {
  if (previous === undefined || previous === null || previous === '') return pillDefault(pill)
  const want = String(previous)
  const exact = pill.choices.find((c) => c.value === want)
  if (exact) return exact.value
  const loose = pill.choices.find((c) => c.value.toLowerCase() === want.toLowerCase() || c.label === label(want))
  if (loose) return loose.value
  if (pill.key === 'duration') {
    // Nearest length rather than the first one on the list.
    const n = Number(want)
    const nums = pill.choices.map((c) => Number(c.value)).filter(Number.isFinite)
    if (Number.isFinite(n) && nums.length) return String(nums.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a)))
  }
  return pillDefault(pill)
}

/**
 * The duration pill as a range, for the rail's slider ("Duration [5s ▮———]" in a popover,
 * as theirs is): a number field with both ends known. Enum lengths (Kling's 5 / 10) and
 * open-ended fields stay a list.
 */
export function durationRange(pill: Pill | undefined): { min: number; max: number; step: number } | null {
  if (!pill || pill.key !== 'duration' || pill.field.type !== 'number') return null
  const { min, max } = pill.field
  if (typeof min !== 'number' || typeof max !== 'number' || max <= min) return null
  const step = pill.field.step && pill.field.step >= 1 ? pill.field.step : 1
  const nums = pill.choices.map((c) => Number(c.value)).filter(Number.isFinite)
  // Only when the pill holds every step of the range: a slider must never offer a value
  // the pill would then snap to something else.
  if (nums.length < 2 || nums.length < Math.floor((max - min) / step) + 1) return null
  return { min: Math.min(...nums), max: Math.max(...nums), step }
}

/** The on/off sound switch a video model has under one of its spellings, for the prompt's Audio chip. */
const AUDIO_FIELD = /^(generate_audio|sound|audio|generate_audio_switch|enable_audio|with_audio)$/i
export const audioFieldOf = (model: ModelDefinition | null): FieldSchema | undefined => model?.fields.find((f) => f.type === 'boolean' && AUDIO_FIELD.test(f.name))

/**
 * How a slot's role finds its field across the catalogue's various spellings, best reading
 * first: Gemini Omni has both `image_urls` and `first_frame_url`, and the frame field is
 * the one a first frame means.
 */
export const ROLE_FIELD: Record<'first' | 'last', RegExp[]> = {
  first: [/^first_?frame/i, /^(first|start)/i, /^image_?urls?$|^input|^image_url$|^imageUrl$/i],
  last: [/^last_?frame/i, /last|end|tail/i],
}

/** The model's field for a first or last frame, if it has one. */
export function roleField(model: ModelDefinition, role: 'first' | 'last'): FieldSchema | undefined {
  const refs = model.fields.filter((f) => f.type === 'reference')
  for (const re of ROLE_FIELD[role]) {
    const hit = refs.find((f) => re.test(f.name))
    if (hit) return hit
  }
  return undefined
}
