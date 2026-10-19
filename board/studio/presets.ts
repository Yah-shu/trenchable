/**
 * Preset recipes — our own, not theirs.
 *
 * On the reference app an "effect" or a "template" is a cover over a fixed recipe: a prompt
 * skeleton, a model class and a few locked parameters. Effects, Presets and Marketing
 * all read this catalogue.
 *
 * A recipe names a model *class*, never a model id, so it keeps working as Kie's
 * catalogue changes; api.ts picks the best current model for the class.
 *
 * There are no stock covers. A recipe's cover is the user's own latest result from it:
 * when a job started from a recipe gets its Kie task id, it is recorded under
 * `presetTag(id)` (surfaces/track.ts), and `presetCover` finds the newest one that
 * finished. Until then the card shows a typographic placeholder.
 */
import { firstMedia, isDone, type HistoryItem, type ModelCategory } from './api.ts'

export type ModelClass = 'image' | 'image-edit' | 'video' | 'video-ref' | 'audio'

/** Inputs a recipe asks for. `frame` is a start frame (image-to-video), `end` a last frame. */
export type PresetSlot = 'character' | 'location' | 'product' | 'video' | 'frame' | 'end'

export interface Preset {
  id: string
  title: string
  group: PresetGroup
  modelClass: ModelClass
  /** `{prompt}` is replaced by what the user typed; the rest is the recipe. */
  template: string
  /** Locked parameters merged into the job, by exact field name (api.ts `buildInput`). */
  params?: Record<string, string | number>
  /** Which input slots the rail should show. */
  slots?: PresetSlot[]
  /** One line for the card and the rail. */
  note?: string
  /** What it does, in a sentence or two: the effect page's paragraph (`aboutOf`). */
  about?: string
}

export type PresetGroup = 'camera' | 'vfx' | 'motion' | 'style' | 'product' | 'ugc' | 'portrait' | 'ads' | 'poster'

export const PRESET_GROUPS: { id: PresetGroup | 'all'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'camera', label: 'Camera moves' },
  { id: 'vfx', label: 'Effects' },
  { id: 'motion', label: 'Motion' },
  { id: 'style', label: 'Styles' },
  { id: 'product', label: 'Product shot' },
  { id: 'ugc', label: 'UGC' },
  { id: 'portrait', label: 'Portrait' },
  { id: 'ads', label: 'Ads' },
  { id: 'poster', label: 'Posters' },
]

export type PresetType = 'all' | 'image' | 'video'

export const PRESET_TYPES: { id: PresetType; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'image', label: 'Images' },
  { id: 'video', label: 'Videos' },
]

/** Lock an aspect on whichever spelling the model uses (snapped to its options). */
const aspect = (r: string) => ({ aspect_ratio: r, aspectRatio: r, ratio: r })
const secs = (n: number) => ({ duration: n })

const cam = (id: string, title: string, note: string, move: string, duration = 5): Preset => ({
  id,
  title,
  group: 'camera',
  modelClass: 'video',
  note,
  about: move,
  template: `${move} Subject: {prompt}. One continuous shot, no cuts, the subject stays recognisable throughout, realistic motion blur and parallax.`,
  params: secs(duration),
  slots: ['frame'],
})

const vfx = (id: string, title: string, note: string, effect: string, duration = 5): Preset => ({
  id,
  title,
  group: 'vfx',
  modelClass: 'video',
  note,
  about: effect,
  template: `{prompt}. ${effect} Photoreal, one continuous shot, the camera holds steady so the effect reads clearly.`,
  params: secs(duration),
  slots: ['frame'],
})

const style = (id: string, title: string, note: string, look: string): Preset => ({
  id,
  title,
  group: 'style',
  modelClass: 'image',
  note,
  about: look,
  template: `{prompt}. ${look}`,
  slots: ['character'],
})

export const PRESETS: Preset[] = [
  /* ---------- camera moves (video) ---------- */
  cam('cam-dolly-in', 'Dolly in', 'Slow push towards the subject', 'Slow, smooth dolly push-in towards the subject, locked horizon, gentle parallax in the background.'),
  cam('cam-dolly-out', 'Dolly out', 'Pull back to reveal the scene', 'Steady dolly pull-back away from the subject, slowly revealing the wider surroundings.'),
  cam('cam-dolly-zoom', 'Dolly zoom', 'The vertigo effect', 'Dolly zoom (vertigo effect): the camera moves in while the lens zooms out, so the subject stays the same size while the background stretches away.'),
  cam('cam-crash-zoom', 'Crash zoom', 'Sudden snap zoom onto the subject', 'Sudden fast crash zoom from a wide view straight onto the subject’s face, slight overshoot and settle, punchy and dramatic.', 4),
  cam('cam-orbit', 'Orbit 360', 'Full circle around the subject', 'The camera orbits a full 360 degrees around the subject at a constant height and speed, subject centred and sharp the whole way round.', 6),
  cam('cam-arc', 'Arc shot', 'Half-circle move around the subject', 'Smooth 180-degree arc around the subject from one side to the other, constant distance, subject stays centred.'),
  cam('cam-fpv', 'FPV drone dive', 'Fast drone fly-through', 'FPV drone shot: fast, agile flight diving down and weaving towards the subject, banking turns, wide lens, exhilarating speed.'),
  cam('cam-drone-reveal', 'Drone reveal', 'Rise up and over to reveal', 'Aerial drone shot rising up and forward over the foreground to reveal the subject and the landscape around it, slow and majestic.', 6),
  cam('cam-crane-up', 'Crane up', 'Lift from ground level to high above', 'Crane shot rising smoothly from ground level to high above the subject, ending on a high wide view.'),
  cam('cam-crane-down', 'Crane down', 'Descend into the scene', 'Crane shot descending from high above down to eye level with the subject, settling into a medium shot.'),
  cam('cam-bullet-time', 'Bullet time', 'Frozen moment, camera sweeps around', 'Bullet time: the action freezes mid-moment while the camera sweeps in a smooth arc around the subject, particles and hair suspended in the air.'),
  cam('cam-whip-pan', 'Whip pan', 'Fast pan with motion blur', 'Fast whip pan from the side that lands on the subject with heavy directional motion blur, then holds steady.', 4),
  cam('cam-handheld', 'Handheld', 'Documentary sway and breathing', 'Handheld camera with natural sway and breathing, slight focus hunting, documentary feel, staying close on the subject.'),
  cam('cam-steadicam', 'Steadicam follow', 'Glide behind a moving subject', 'Steadicam shot gliding behind and slightly beside the subject as they walk forward, smooth floating motion.', 6),
  cam('cam-tracking', 'Side tracking', 'Move alongside the subject', 'Lateral tracking shot moving alongside the subject at their pace, background sliding past with strong parallax.'),
  cam('cam-low-push', 'Low-angle push', 'Heroic push from below', 'Low-angle camera pushing slowly towards the subject from below, making them look powerful and heroic against the sky.'),
  cam('cam-top-down', 'Top-down rise', 'Overhead view rising away', 'Directly overhead top-down shot rising straight up and away from the subject, the scene shrinking into a pattern.'),
  cam('cam-rack-focus', 'Rack focus', 'Shift focus foreground to subject', 'Static shot with a rack focus: a blurred foreground object comes into focus first, then focus shifts smoothly onto the subject.'),
  cam('cam-snorricam', 'Body cam', 'Camera locked to the subject', 'Snorricam body-mounted shot: the camera is locked to the subject’s chest facing them as they move, the world swinging around behind them.'),
  cam('cam-tilt-reveal', 'Tilt up reveal', 'Start low, tilt up to the subject', 'The camera starts on the ground and tilts up slowly to reveal the subject standing tall.'),

  /* ---------- effects (video) ---------- */
  vfx('fx-disintegrate', 'Disintegrate', 'Crumbles into drifting dust', 'The subject slowly disintegrates into fine particles of dust that drift away on the wind, starting from the edges.'),
  vfx('fx-freeze', 'Freeze time', 'Everything stops but the camera', 'Time freezes completely: people, water and dust stop mid-air while only the camera drifts slowly through the frozen moment.'),
  vfx('fx-levitate', 'Levitate', 'Rises gently off the ground', 'The subject gently lifts off the ground and floats in mid-air, loose objects around them rising too, calm and weightless.'),
  vfx('fx-petals', 'Burst into petals', 'Explodes into flower petals', 'The subject bursts softly into thousands of flower petals that swirl around the frame and settle.'),
  vfx('fx-melt', 'Melt', 'Liquefies and drips away', 'The subject slowly melts like warm wax, dripping and pooling on the ground while keeping its colours.'),
  vfx('fx-stone', 'Turn to stone', 'Becomes a stone statue', 'A wave of grey stone spreads over the subject until they become a weathered stone statue, fine cracks and dust.'),
  vfx('fx-fire', 'Flame aura', 'Wrapped in rising flames', 'Bright flames rise around the subject without burning them, heat haze shimmering, embers floating upwards.'),
  vfx('fx-glitch', 'Digital glitch', 'Datamosh and RGB split', 'The image breaks into a digital glitch: RGB channel splitting, datamosh smears and scanline jitter, then snaps back clean.', 4),
  vfx('fx-hologram', 'Hologram', 'Becomes a flickering hologram', 'The subject turns into a translucent blue hologram with scanlines and flicker, projected from a small light below.'),
  vfx('fx-earth-zoom', 'Earth zoom out', 'Zoom out from street to space', 'The camera zooms out continuously from the subject, past the rooftops, the city and the clouds, until the whole Earth is visible from space.', 6),
  vfx('fx-morph', 'Morph into', 'Smooth transformation into something else', 'The subject smoothly morphs and transforms, its shape flowing seamlessly into the new form described, no cut.'),
  vfx('fx-paint', 'Paint splash reveal', 'Colour splashes paint the scene in', 'Bursts of thick colourful paint splash across the frame and paint the scene into existence, ending on the finished image.'),
  vfx('fx-slowmo', 'Super slow motion', 'High-speed camera, 1000 fps feel', 'Extreme slow motion as if shot at 1000 frames per second, every droplet and strand of hair visible.'),
  vfx('fx-neon', 'Neon light trails', 'Glowing trails follow the motion', 'Glowing neon light trails follow every movement of the subject, leaving streaks of colour in a dark scene.'),
  vfx('fx-vanish', 'Vanish', 'Body disappears, clothes drop', 'The person suddenly vanishes and their empty clothes collapse and fall flat to the ground where they stood.', 4),
  vfx('fx-eye-dive', 'Into the eye', 'Dive through the pupil to a new scene', 'The camera pushes into the subject’s eye and passes through the dark pupil, emerging into an entirely new scene on the other side.'),
  vfx('fx-clones', 'Clones', 'Copies mirror the subject', 'Identical copies of the subject appear around the scene, mirroring their every move as the original steps towards the camera.'),
  vfx('fx-giant', 'Giant in the city', 'Towering over the streets', 'The subject grows into a towering giant standing among city buildings, cars and people tiny at their feet, seamlessly matched in light and scale.', 6),
  vfx('fx-world-fold', 'World folds up', 'The landscape bends around them', 'The landscape behind the still subject lifts and folds up and over them like a page, bending the world into a vast curved enclosure.', 6),
  vfx('fx-high-flip', 'Overhead flip', 'Flip over the top into a new place', 'The camera rises above the subject and flips over the top, revealing a new place on the other side in one continuous move.'),

  /* ---------- motion (video, from a picture) ---------- */
  {
    id: 'motion-talking',
    title: 'Talking to camera',
    group: 'motion',
    modelClass: 'video-ref',
    note: 'The person in the photo speaks to camera',
    template: 'The person in the reference talks straight to camera about {prompt}. Natural head movement and blinks, eyeline held, upper body framed, no cuts.',
    params: secs(8),
    slots: ['character'],
  },
  {
    id: 'motion-orbit',
    title: 'Orbit the product',
    group: 'motion',
    modelClass: 'video-ref',
    note: 'Turntable move around a product',
    template: 'Smooth 180-degree orbit around {prompt}, fixed height, constant speed, product stays centred and in focus throughout.',
    params: secs(5),
    slots: ['product'],
  },
  {
    id: 'motion-walkup',
    title: 'Handheld walk-up',
    group: 'motion',
    modelClass: 'video-ref',
    note: 'Walk up to a person in their setting',
    template: 'Handheld camera walking up to {prompt}, natural sway and breathing, slight focus hunt, ends on a steady medium shot.',
    params: secs(6),
    slots: ['character', 'location'],
  },
  {
    id: 'motion-hair-wind',
    title: 'Wind in the hair',
    group: 'motion',
    modelClass: 'video-ref',
    note: 'A breeze brings a still portrait to life',
    template: 'A soft breeze moves through the hair and clothes of {prompt}; they breathe, blink and glance towards the camera with a slight smile.',
    params: secs(5),
    slots: ['character'],
  },
  {
    id: 'motion-unbox',
    title: 'Hands unboxing',
    group: 'motion',
    modelClass: 'video-ref',
    note: 'Hands open the box and lift the product',
    template: 'Close-up of hands opening the packaging of {prompt} on a table and lifting the product out towards the camera, natural daylight.',
    params: secs(6),
    slots: ['product'],
  },

  /* ---------- styles (image) ---------- */
  style('style-35mm', '35mm film still', 'Grainy cinema frame', 'A still frame from a 35mm feature film: anamorphic lens, natural film grain, soft halation, cinematic colour grade, 2.39:1 framing feel.'),
  style('style-disposable', 'Disposable flash', '90s point-and-shoot snapshot', 'Shot on a cheap disposable camera with direct flash: harsh flash falloff, red-eye risk, date stamp in the corner, slightly soft, nostalgic 1990s colours.'),
  style('style-polaroid', 'Instant photo', 'Polaroid with a white border', 'An instant photo with a white border: faded, slightly overexposed colours, soft focus, chemical edge marks.'),
  style('style-anime', 'Hand-drawn anime', 'Cel-shaded animation frame', 'A hand-drawn anime frame: clean line art, cel shading, painted background, expressive eyes, soft afternoon light.'),
  style('style-clay', '3D clay render', 'Soft claymation look', 'A cute 3D clay render: soft rounded shapes, matte plasticine texture with fingerprints, pastel studio lighting, miniature diorama.'),
  style('style-watercolour', 'Watercolour', 'Loose wet-on-wet painting', 'A loose watercolour painting: wet-on-wet blooms, visible paper texture, soft bleeding edges, limited palette.'),
  style('style-oil', 'Oil painting', 'Classical brushwork', 'A classical oil painting: rich impasto brushstrokes, chiaroscuro lighting, warm varnished tones, museum-quality canvas texture.'),
  style('style-comic', 'Comic ink', 'Bold ink and halftone', 'A comic-book panel: bold black ink lines, halftone dot shading, flat saturated colours, dramatic angle.'),
  style('style-noir', 'Film noir', 'High-contrast black and white', 'Black-and-white film noir: hard low-key light, deep shadows, venetian-blind light stripes, smoke in the air.'),
  style('style-neon', 'Neon night', 'Rain, neon and reflections', 'Night scene in the rain under neon signs: magenta and cyan light, wet reflective streets, shallow depth of field.'),
  style('style-sketch', 'Pencil sketch', 'Graphite on paper', 'A detailed graphite pencil sketch on textured paper: cross-hatching, smudged shading, a few loose construction lines.'),
  style('style-iso', 'Isometric 3D', 'Tiny isometric world', 'An isometric 3D illustration: tiny detailed world on a floating square base, soft global illumination, clean pastel palette.'),

  /* ---------- product (image) ---------- */
  {
    id: 'product-clean',
    title: 'Clean studio shot',
    group: 'product',
    modelClass: 'image-edit',
    note: 'Seamless sweep, soft key light',
    template:
      'Studio product photograph of {prompt}. Seamless light-grey sweep, soft large key from the left, gentle fill, crisp contact shadow under the product. Sharp label text, no props, no hands. Square composition, product centred, generous margin.',
    slots: ['product'],
  },
  {
    id: 'product-hand',
    title: 'In hand, daylight',
    group: 'product',
    modelClass: 'image-edit',
    note: 'Looks like a customer took it',
    template:
      'A hand holding {prompt}, shot on a phone in ordinary daylight near a window. Slight motion blur, real skin texture, unstyled background of a normal home. Looks like a photo a customer took, not an advert.',
    slots: ['product'],
  },
  {
    id: 'product-flatlay',
    title: 'Flat lay with ingredients',
    group: 'product',
    modelClass: 'image-edit',
    note: 'Overhead, surrounded by what is inside',
    template: 'Overhead flat lay of {prompt} surrounded by its raw ingredients, arranged loosely on a warm stone surface. Daylight from one side, soft shadows, muted natural palette.',
    slots: ['product'],
  },
  {
    id: 'product-levitate',
    title: 'Floating product',
    group: 'product',
    modelClass: 'image-edit',
    note: 'Hovers mid-air with a soft shadow',
    template: '{prompt} floating in mid-air at a slight angle above a pastel surface, soft shadow below, a few related elements floating around it, bright clean studio light.',
    slots: ['product'],
  },
  {
    id: 'product-splash',
    title: 'Splash shot',
    group: 'product',
    modelClass: 'image-edit',
    note: 'Frozen liquid splash around the product',
    template: '{prompt} hit by a frozen splash of water, droplets suspended in the air around it, high-speed flash photography, dark gradient background.',
    slots: ['product'],
  },
  {
    id: 'product-podium',
    title: 'Podium display',
    group: 'product',
    modelClass: 'image-edit',
    note: 'On a pedestal with props',
    template: '{prompt} standing on a round stone podium, minimal set with soft shadows from a window, a few natural props, premium editorial look.',
    slots: ['product'],
  },
  {
    id: 'product-macro',
    title: 'Macro detail',
    group: 'product',
    modelClass: 'image-edit',
    note: 'Extreme close-up of the texture',
    template: 'Extreme macro close-up of {prompt}, showing surface texture and fine detail, very shallow depth of field, soft directional light.',
    slots: ['product'],
  },

  /* ---------- UGC (image) ---------- */
  {
    id: 'ugc-selfie',
    title: 'Selfie review',
    group: 'ugc',
    modelClass: 'image-edit',
    note: 'Front-camera photo holding the product',
    template: 'Front-camera selfie of {prompt}, arm visible at the edge of frame, slightly off-centre, indoor lighting, mild lens distortion, imperfect framing. Unretouched phone photo.',
    slots: ['character', 'product'],
  },
  {
    id: 'ugc-mirror',
    title: 'Mirror selfie',
    group: 'ugc',
    modelClass: 'image-edit',
    note: 'Phone in hand, bathroom mirror',
    template: 'Mirror selfie of {prompt} in an ordinary bathroom, phone covering part of the face, slightly smudged mirror, warm overhead light, casual and real.',
    slots: ['character', 'product'],
  },
  {
    id: 'ugc-desk',
    title: 'Desk clutter',
    group: 'ugc',
    modelClass: 'image-edit',
    note: 'Casual phone photo on a messy desk',
    template: 'Casual phone photo of {prompt} on a cluttered desk — mug, papers, a laptop edge. Overhead ceiling light, slightly underexposed, no styling.',
    slots: ['product'],
  },
  {
    id: 'ugc-car',
    title: 'Car seat review',
    group: 'ugc',
    modelClass: 'image-edit',
    note: 'Talking in the parked car',
    template: 'Phone photo of {prompt} sitting in the driver’s seat of a parked car, daylight through the windscreen, seatbelt visible, candid mid-sentence expression.',
    slots: ['character', 'product'],
  },

  /* ---------- portrait (image) ---------- */
  {
    id: 'portrait-studio',
    title: 'Studio portrait',
    group: 'portrait',
    modelClass: 'image-edit',
    note: 'Head and shoulders, grey backdrop',
    template: 'Head-and-shoulders portrait of {prompt}. Soft key at 45 degrees, plain mid-grey backdrop, shallow depth of field, natural skin, calm expression, eyes to camera.',
    slots: ['character'],
  },
  {
    id: 'portrait-headshot',
    title: 'Business headshot',
    group: 'portrait',
    modelClass: 'image-edit',
    note: 'Clean, friendly, professional',
    template: 'Professional business headshot of {prompt}: smart casual clothes, friendly confident smile, softly blurred office background, flattering even light.',
    slots: ['character'],
  },
  {
    id: 'portrait-golden',
    title: 'Golden hour',
    group: 'portrait',
    modelClass: 'image-edit',
    note: 'Warm backlight outdoors',
    template: 'Outdoor portrait of {prompt} at golden hour, warm sun behind them creating a rim light in the hair, soft lens flare, relaxed natural pose.',
    slots: ['character'],
  },
  {
    id: 'portrait-age',
    title: 'Same person, older',
    group: 'portrait',
    modelClass: 'image-edit',
    note: 'Ages the face, keeps the likeness',
    template: 'The same person as the reference, {prompt}. Keep the face, bone structure and hairline recognisable; age only the skin, hair colour and posture. Same lighting and framing.',
    slots: ['character'],
  },

  /* ---------- ads and posters (image) ---------- */
  {
    id: 'ads-before-after',
    title: 'Before / after split',
    group: 'ads',
    modelClass: 'image-edit',
    note: 'Two halves, same framing',
    template:
      'Split-frame comparison for {prompt}. Left half the problem state, right half the improved state, identical framing and lighting across both halves, thin divider, short label on each side.',
    slots: ['product'],
  },
  {
    id: 'ads-native',
    title: 'Native article still',
    group: 'ads',
    modelClass: 'image',
    note: 'Documentary photo, no advertising gloss',
    template: 'Documentary-style photograph illustrating {prompt}, as it would run at the top of a news article. Real people, ordinary setting, no product, no text, no advertising gloss.',
  },
  {
    id: 'ads-sale',
    title: 'Sale banner',
    group: 'ads',
    modelClass: 'image-edit',
    note: 'Product, offer, one headline',
    template: 'A clean sale banner for {prompt}: product on the right, a short bold headline and the offer on the left, two brand colours, lots of space, crisp legible type.',
    params: aspect('16:9'),
    slots: ['product'],
  },
  {
    id: 'poster-type',
    title: 'Type-led poster',
    group: 'poster',
    modelClass: 'image',
    note: 'One huge headline, two colours',
    template: 'Bold editorial poster about {prompt}. One enormous headline in a heavy grotesque, tight tracking, two accent colours only, generous negative space, printed paper texture.',
    params: aspect('3:4'),
  },
  {
    id: 'poster-movie',
    title: 'Film poster',
    group: 'poster',
    modelClass: 'image-edit',
    note: 'Dramatic one-sheet with a title',
    template: 'A dramatic film poster for {prompt}: the main character large and lit from the side, a small figure in the landscape below, title in elegant serif capitals, credits block at the bottom.',
    params: aspect('2:3'),
    slots: ['character'],
  },
]

/* ---------- reading the catalogue ---------- */

export const presetKind = (p: Pick<Preset, 'modelClass'>): 'image' | 'video' | 'audio' =>
  p.modelClass === 'video' || p.modelClass === 'video-ref' ? 'video' : p.modelClass === 'audio' ? 'audio' : 'image'

export const categoryOf = (p: Pick<Preset, 'modelClass'>): ModelCategory => presetKind(p)

export const presetsIn = (group: PresetGroup | 'all') => (group === 'all' ? PRESETS : PRESETS.filter((p) => p.group === group))

export const groupLabel = (group: PresetGroup) => PRESET_GROUPS.find((g) => g.id === group)?.label ?? group

/** The catalogue's filters: category chips, type chips, and a search over title and note. */
export function filterPresets(list: Preset[], { group = 'all', type = 'all', q = '' }: { group?: PresetGroup | 'all'; type?: PresetType; q?: string }): Preset[] {
  const needle = q.trim().toLowerCase()
  return list.filter(
    (p) =>
      (group === 'all' || p.group === group) &&
      (type === 'all' || presetKind(p) === type) &&
      (!needle || `${p.title} ${p.note ?? ''} ${groupLabel(p.group)}`.toLowerCase().includes(needle)),
  )
}

/** Groups that have at least one recipe of this type, so a filter never offers an empty view. */
export const groupsFor = (list: Preset[], type: PresetType) =>
  PRESET_GROUPS.filter((g) => g.id === 'all' || list.some((p) => p.group === g.id && (type === 'all' || presetKind(p) === type)))

/** Fill a recipe with what the user typed. An empty prompt leaves the skeleton readable. */
export const applyPreset = (preset: Pick<Preset, 'template'>, prompt: string) => preset.template.replace('{prompt}', prompt.trim() || 'the subject')

/**
 * A recipe's text with the subject left for the user to write, used to wrap the prompt at
 * send time: the box holds only the subject, the recipe is added on the way out.
 */
export const dressWith = (preset: Pick<Preset, 'template'>) => (prompt: string) => applyPreset(preset, prompt)

/** What a locked parameter looks like on a card ("16:9", "5s"). One label per kind of value. */
export function lockedLabels(params: Preset['params']): string[] {
  if (!params) return []
  const out: string[] = []
  const a = params.aspect_ratio ?? params.aspectRatio ?? params.ratio
  if (a !== undefined) out.push(String(a))
  if (params.duration !== undefined) out.push(`${params.duration}s`)
  return out
}

/* ---------- covers ---------- */

/** The tag a recipe's task ids are recorded under (surfaces/track.ts). */
export const presetTag = (id: string) => `preset:${id}`

export interface Cover {
  src: string
  video: boolean
}

/**
 * The newest finished result made from a recipe, or null. `tracked` is newest first; a
 * task that failed or has no media yet is skipped for the one before it.
 */
export function presetCover(tracked: string[] | undefined, byTask: Map<string, HistoryItem>): Cover | null {
  for (const taskId of tracked ?? []) {
    const item = byTask.get(taskId)
    if (!item || !isDone(item)) continue
    const src = firstMedia(item)
    if (src) return { src, video: item.category === 'video' }
  }
  return null
}

/** History keyed by task id, for cover lookups. */
export const indexHistory = (items: HistoryItem[] | null | undefined) => new Map((items ?? []).map((i) => [i.taskId, i]))

/* ---------- which recipe a result came from ---------- */

/*
 * The tracker (surfaces/track.ts) only knows the runs this browser started, and only once
 * their task id came back. History itself never records the surface, but it does keep the
 * prompt exactly as sent — and a recipe wraps the user's words in fixed text — so a result
 * also names its recipe by the words its prompt starts and ends with (the way actions.ts
 * tells Relight and Reframe results apart). Both readings together find a recipe's results
 * from any browser, after a reload, and for runs made before the tracker existed.
 */

const SLOT = '{prompt}'

/** The fixed text before and after the user's words. */
export function recipeEnds(template: string): { head: string; tail: string } {
  const at = template.indexOf(SLOT)
  return at < 0 ? { head: template, tail: '' } : { head: template.slice(0, at), tail: template.slice(at + SLOT.length) }
}

/** Below this much fixed text a match would be a coincidence, not a recipe. */
const SIGNATURE_MIN = 16

const endsCache = new WeakMap<Preset, { head: string; tail: string }>()
const endsOf = (p: Preset) => {
  let e = endsCache.get(p)
  if (!e) endsCache.set(p, (e = recipeEnds(p.template)))
  return e
}

/** The recipe a prompt was sent from, or null. When two fit, the one with more fixed text wins. */
export function recipeOfPrompt(prompt: string | null | undefined, list: Preset[] = PRESETS): Preset | null {
  const text = prompt?.trim()
  if (!text) return null
  let best: Preset | null = null
  let bestFixed = 0
  for (const p of list) {
    const { head, tail } = endsOf(p)
    const fixed = head.length + tail.length
    if (fixed < SIGNATURE_MIN || fixed <= bestFixed || text.length < fixed) continue
    if (text.startsWith(head) && text.endsWith(tail)) {
      best = p
      bestFixed = fixed
    }
  }
  return best
}

/** Task id → recipe id, from the tracker's `preset:<id>` tags (only ids in `list`). */
export function taskRecipes(tracked: Record<string, string[]>, list: Preset[] = PRESETS): Map<string, string> {
  const known = new Set(list.map((p) => p.id))
  const out = new Map<string, string>()
  for (const [tag, tasks] of Object.entries(tracked)) {
    if (!tag.startsWith('preset:')) continue
    const id = tag.slice('preset:'.length)
    if (!known.has(id)) continue
    for (const t of tasks) if (!out.has(t)) out.set(t, id)
  }
  return out
}

/** The text a history row was sent with: the recorded prompt, else the input's own prompt field. */
const sentPrompt = (item: Pick<HistoryItem, 'prompt' | 'input'>): string | undefined => {
  if (item.prompt) return item.prompt
  for (const key of ['prompt', 'text', 'description']) {
    const v = item.input?.[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return undefined
}

/** The recipe id a history row came from: what the tracker recorded, else what its prompt says. */
export function recipeOfItem(item: Pick<HistoryItem, 'taskId' | 'prompt' | 'input'>, byTask: Map<string, string>, list: Preset[] = PRESETS): string | null {
  return byTask.get(item.taskId) ?? recipeOfPrompt(sentPrompt(item), list)?.id ?? null
}

/** Whether a live job is one of this recipe's: every recipe's jobs carry its title, and its words. */
export const jobOfRecipe = (job: { meta: { label?: string }; prompt: string }, preset: Preset, list: Preset[] = PRESETS): boolean =>
  job.meta.label === preset.title || recipeOfPrompt(job.prompt, list)?.id === preset.id

const newestFirst = (items: HistoryItem[]) => [...items].sort((a, b) => b.createdAt - a.createdAt)

/** Each recipe's newest finished result with media: the covers of the whole catalogue in one pass. */
export function recipeCovers(items: HistoryItem[] | null | undefined, byTask: Map<string, string>, list: Preset[] = PRESETS): Map<string, Cover> {
  const out = new Map<string, Cover>()
  for (const item of newestFirst(items ?? [])) {
    if (!isDone(item)) continue
    const id = recipeOfItem(item, byTask, list)
    if (!id || out.has(id)) continue
    const src = firstMedia(item)
    if (src) out.set(id, { src, video: item.category === 'video' })
  }
  return out
}

/** Every history row made from one recipe, newest first (failures included; the caller filters). */
export const recipeResults = (items: HistoryItem[] | null | undefined, id: string, byTask: Map<string, string>, list: Preset[] = PRESETS): HistoryItem[] =>
  newestFirst((items ?? []).filter((i) => recipeOfItem(i, byTask, list) === id))

/** The effect page's paragraph: the recipe's own description, else its text around "your subject". */
export function aboutOf(p: Pick<Preset, 'about' | 'template'>): string {
  if (p.about) return p.about
  const text = applyPreset(p, 'your subject')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export const presetById = (id: string | null | undefined): Preset | null => (id ? (PRESETS.find((p) => p.id === id) ?? null) : null)
