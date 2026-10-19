/**
 * Which Kie models each Edit tool runs, and the words each tool adds to the prompt.
 *
 * The catalogue has no "inpaint" or "relight" category — those are things a model can be
 * asked to do. So a tool is a filter over the catalogue (the models that can do it), an
 * opening pick (the one that does it best), and for the prompt-driven tools a recipe that
 * turns a few clicks into an instruction the model follows. History is told apart the
 * same way: by model, and for prompt-driven tools by how the recipe starts.
 */
import { isTool } from '../../families.ts'
import type { HistoryItem, ModelDefinition } from '../../api.ts'

export type EditMode = 'prompt' | 'upscale' | 'background' | 'inpaint' | 'reframe' | 'relight' | 'angles'

export const EDIT_MODES: { id: EditMode; label: string }[] = [
  { id: 'prompt', label: 'Edit' },
  { id: 'inpaint', label: 'Inpaint' },
  { id: 'reframe', label: 'Reframe' },
  { id: 'relight', label: 'Relight' },
  { id: 'angles', label: 'Angles' },
  { id: 'upscale', label: 'Upscale' },
  { id: 'background', label: 'Remove BG' },
]

export const asMode = (m: string | undefined): EditMode | null => (EDIT_MODES.some((x) => x.id === m) ? (m as EditMode) : m === 'edit' ? 'prompt' : null)

export const UPSCALE_IDS = ['topaz/image-upscale', 'recraft/crisp-upscale']
export const BACKGROUND_IDS = ['recraft/remove-background']
/** Models that take a mask: repaint only the area you mark. */
export const MASK_IDS = ['ideogram/v3-edit', 'qwen2-1/image-to-image', 'ideogram/character-edit']
export const LAYER_IDS = ['seedream/5-flash-layer-decomposition', 'seedream/5-pro-layer-decomposition']

/** The field a general editor reads the picture from, across the catalogue's spellings. */
export const EDITOR_IMAGE_FIELD = /^(image_urls?|input_urls|image_input|image)$/

const hay = (m: ModelDefinition) => `${m.id} ${m.title}`

/**
 * Any image model that changes a picture from a prompt: has a picture field, is not a
 * post-processor, and does not insist on a mask or a character sheet.
 */
export function isImageEditor(m: ModelDefinition): boolean {
  if (m.category !== 'image' || isTool(m) || /character|transition/i.test(hay(m))) return false
  if (m.fields.some((f) => /mask/i.test(f.name) && f.required)) return false
  return m.fields.some((f) => f.type === 'reference' && EDITOR_IMAGE_FIELD.test(f.name))
}

/**
 * Reframe: the general editors plus Ideogram V3 Edit, which outpaints a masked border.
 * Ideogram's Remix shares the "Ideogram V3" name with Edit and would be picked over it
 * when no mask is asked for; a restyle is not an outpaint, so it stays out.
 */
export const isReframeModel = (m: ModelDefinition) => (isImageEditor(m) && !/remix/i.test(m.id)) || m.id === 'ideogram/v3-edit'

/** Best general editors first, for the opening pick. */
export const EDITOR_PREFER = ['nano-banana-pro', 'nano-banana-2', 'gpt-image-2-image-to-image', 'seedream/5-pro-image-to-image', 'flux-2/pro-image-to-image']

/**
 * The editors that keep a subject's identity best, for the tools that must not change who
 * or what is in the picture (Angles, the viewer's Edit tab). Read off the fields:
 *   Nano Banana Pro — `image_input` up to 8 pictures, aspect `auto` (keeps the frame),
 *                     1K–4K; Gemini's image model holds faces and products across views best.
 *   GPT Image 2 i2i  — up to 16 pictures, `auto` aspect, 1K–4K; strong, but redraws more.
 *   Nano Banana 2    — the same fields as Pro, a step lower on likeness.
 *   Seedream 5 Pro   — 10 pictures but a required fixed aspect (no `auto`), so it reframes.
 *   Qwen 2.1         — 10 pictures, `auto`; tends to restyle.
 * Qwen Image Edit (one picture, preset sizes only) and Seedream 4.5 (fixed aspect) are left out.
 */
export const IDENTITY_PREFER = ['nano-banana-pro', 'gpt-image-2-image-to-image', 'nano-banana-2', 'seedream/5-pro-image-to-image', 'qwen2-1/image-to-image']

/** The identity-keeping editor to open on: the first of IDENTITY_PREFER on offer, else any editor. */
export function identityEditor(models: ModelDefinition[] | null | undefined): ModelDefinition | null {
  const list = (models ?? []).filter(isImageEditor)
  for (const id of IDENTITY_PREFER) {
    const hit = list.find((m) => m.id === id)
    if (hit) return hit
  }
  return list[0] ?? null
}

export const takesMask = (m: ModelDefinition | null) => Boolean(m?.fields.some((f) => /^mask_url$/.test(f.name)))

export const byIds = (ids: string[]) => (m: ModelDefinition) => ids.includes(m.id)

/** History rows made by one of these models (catalogue id, or Kie's model string). */
export const madeBy = (ids: string[]) => (i: HistoryItem) => ids.includes(i.modelId ?? '') || ids.includes(i.model)

/* ---------- Relight ---------- */

export const LIGHT_PRESETS: { id: string; label: string; words: string }[] = [
  { id: 'golden', label: 'Golden hour', words: 'warm, low golden-hour sunlight with long soft shadows' },
  { id: 'softbox', label: 'Studio softbox', words: 'clean, soft studio light from a large softbox with gentle falloff' },
  { id: 'window', label: 'Window light', words: 'natural daylight falling through a nearby window' },
  { id: 'overcast', label: 'Overcast', words: 'soft, even overcast daylight with almost no hard shadows' },
  { id: 'noon', label: 'Hard sun', words: 'hard midday sunlight with crisp, defined shadows' },
  { id: 'blue', label: 'Blue hour', words: 'cool blue-hour twilight with a soft ambient glow' },
  { id: 'neon', label: 'Neon night', words: 'night-time neon signs spilling magenta and cyan light' },
  { id: 'candle', label: 'Candlelight', words: 'warm, flickering candlelight with deep shadows' },
  { id: 'rim', label: 'Rim light', words: 'a strong backlight that rims the subject against a darker background' },
  { id: 'lowkey', label: 'Low-key', words: 'moody low-key light from one narrow source, most of the frame in shadow' },
  { id: 'highkey', label: 'High-key', words: 'bright, airy high-key light, nearly shadowless' },
]

export const LIGHT_DIRECTIONS = ['top left', 'above', 'top right', 'the left', 'the front', 'the right', 'bottom left', 'below', 'bottom right'] as const
export type LightDirection = (typeof LIGHT_DIRECTIONS)[number]

export const LIGHT_TEMPS = [
  { id: 'keep', label: 'As preset', words: '' },
  { id: 'warm', label: 'Warm', words: 'Warm colour temperature (around 3200K).' },
  { id: 'neutral', label: 'Neutral', words: 'Neutral white light (around 5500K).' },
  { id: 'cool', label: 'Cool', words: 'Cool colour temperature (around 7000K).' },
] as const

export const LIGHT_STRENGTHS = [
  { id: 'subtle', label: 'Subtle', words: 'Keep the change subtle and natural.' },
  { id: 'balanced', label: 'Balanced', words: '' },
  { id: 'dramatic', label: 'Dramatic', words: 'Make it dramatic, with strong contrast between light and shadow.' },
] as const

export const RELIGHT_MARK = 'Relight this photo'

export function relightPrompt(o: { preset: string; direction: LightDirection; temp: string; strength: string; extra: string }): string {
  const preset = LIGHT_PRESETS.find((p) => p.id === o.preset) ?? LIGHT_PRESETS[0]!
  const temp = LIGHT_TEMPS.find((t) => t.id === o.temp)?.words ?? ''
  const strength = LIGHT_STRENGTHS.find((s) => s.id === o.strength)?.words ?? ''
  return [
    `${RELIGHT_MARK} with ${preset.words}.`,
    `The key light comes from ${o.direction}.`,
    temp,
    strength,
    'Keep the people, faces, pose, composition, objects and every detail exactly the same; change only the lighting, the shadows and the colour of the light.',
    o.extra.trim(),
  ]
    .filter(Boolean)
    .join(' ')
}

/* ---------- Reframe ---------- */

export const REFRAME_MARK = 'Reframe this picture'

export const REFRAME_ASPECTS = ['1:1', '4:5', '3:4', '2:3', '9:16', '4:3', '3:2', '16:9', '21:9']

export function reframePrompt(o: { aspect: string; padded: boolean; masked: boolean; extra: string }): string {
  const extra = o.extra.trim()
  const scene = extra ? ` In the new area: ${extra}.` : ''
  if (o.masked)
    return `${REFRAME_MARK} to ${o.aspect} by extending the scene into the masked border.${scene} Continue the background, lighting, perspective and style seamlessly; leave the original part unchanged.`
  if (o.padded)
    return `${REFRAME_MARK} to ${o.aspect}. The flat grey border around the photo is empty canvas: replace all of it by extending the scene beyond the original edges.${scene} Keep the original part exactly as it is, match lighting, perspective and style, and leave no grey, frame or border.`
  return `${REFRAME_MARK} to ${o.aspect} by extending the scene beyond the original edges.${scene} Keep everything already in the picture exactly as it is, at the same size, and match lighting, perspective and style.`
}

/* ---------- Angles ---------- */

export const ANGLES_MARK = 'Show the same subject and scene from a new camera angle'

/**
 * the reference app's Angles: the same picture seen from somewhere else. Each angle is where the
 * camera goes, said the way an image model follows best — a move of the camera, not of the
 * subject — and one job runs per angle picked.
 */
export const ANGLES: { id: string; label: string; camera: string }[] = [
  { id: 'front', label: 'Front', camera: 'the camera is straight in front of the subject at eye level, looking directly at them' },
  { id: 'left45', label: 'Left 45°', camera: "the camera has moved 45 degrees around to the subject's left, at eye level: a three-quarter view of their left side" },
  { id: 'right45', label: 'Right 45°', camera: "the camera has moved 45 degrees around to the subject's right, at eye level: a three-quarter view of their right side" },
  { id: 'left', label: 'Left profile', camera: "the camera has moved 90 degrees to the subject's left, at eye level: a true side profile of their left side" },
  { id: 'right', label: 'Right profile', camera: "the camera has moved 90 degrees to the subject's right, at eye level: a true side profile of their right side" },
  { id: 'back', label: 'Back', camera: 'the camera has moved all the way behind the subject, at eye level: we see them from the back' },
  { id: 'high', label: 'High angle', camera: 'the camera is raised well above the subject and tilted down at them: a high-angle view from above' },
  { id: 'low', label: 'Low angle', camera: 'the camera is lowered close to the ground and tilted up at the subject: a low-angle view from below' },
]

export const angleOf = (id: string) => ANGLES.find((a) => a.id === id)

/** The recipe for one angle: where the camera went, then everything that must not change. */
export function anglePrompt(id: string, extra = ''): string {
  const a = angleOf(id) ?? ANGLES[0]!
  return [
    `${ANGLES_MARK}: ${a.camera}.`,
    'Only the camera position changes. Keep the subject identical — the same face and identity, hair, body, expression, clothing, colours, materials and any text or logos on them — and the same setting, props, lighting and time of day, as one continuous photo shoot.',
    'Show the parts that come into view consistently with what the original shows; add nothing new and keep the same photographic style.',
    extra.trim(),
  ]
    .filter(Boolean)
    .join(' ')
}

/** The angles picked, in the list's order, with unknown ids dropped. */
export const pickedAngles = (ids: string[]): string[] => ANGLES.filter((a) => ids.includes(a.id)).map((a) => a.id)
