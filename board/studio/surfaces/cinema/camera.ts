/**
 * Cinema's camera, film look, colour palette and lighting — the attribute pills above
 * the prompt — and the words they add to it.
 *
 * The camera works as a cinema studio does: a
 * Setup tab with three wheels (camera, lens, aperture) and a Movement tab of 33 named
 * moves you put on the shot in order — several per shot, and the order is the order
 * they happen in. Film look is their Genre / Era / Tempo; palette and lighting are
 * preset pickers. Their option lists for those weren't captured, so ours are invented
 * to the same pattern.
 *
 * Kie's models have no such fields, so every choice travels as plain cinematography
 * language appended at send time (the composer's `dress`): the box keeps only what you
 * typed. Auto adds nothing; moves and tempo only apply to clips.
 */

export const AUTO = 'auto'

export interface LookOption {
  id: string
  label: string
  /** What goes into the prompt. */
  words: string
  /** One line for the picker. */
  note?: string
  /** A few colours for a palette tile. */
  swatch?: string[]
}

const auto = (label = 'Auto'): LookOption => ({ id: AUTO, label, words: '' })

/* ---------- setup wheels ---------- */

export const CAMERAS: LookOption[] = [
  auto(),
  { id: 'modern', label: 'Modern', words: 'shot on a modern digital cinema camera, clean and detailed', note: 'Clean digital cinema' },
  { id: '35mm', label: '35mm Film', words: 'shot on 35mm motion picture film with natural grain', note: 'Classic film grain' },
  { id: '8mm', label: '8mm Film', words: 'shot on 8mm film with heavy grain, flicker and soft faded colour', note: 'Home-movie texture' },
  { id: 'dv', label: 'DV Camcorder', words: 'recorded on an early-2000s DV camcorder, video look, slightly soft with blown highlights', note: 'Y2K tape look' },
]

export const LENSES: LookOption[] = [
  auto(),
  { id: 'clean', label: 'Clean Sharp', words: 'clean, sharp modern prime lens', note: 'Crisp, neutral' },
  { id: 'anamorphic', label: 'Anamorphic', words: 'anamorphic lens with oval bokeh and horizontal flares', note: 'Widescreen flares' },
  { id: 'vintage-anamorphic', label: 'Vintage Anamorphic', words: 'vintage anamorphic lens with blue streak flares and soft, breathing edges', note: '70s blockbuster' },
  { id: 'warm-vintage', label: 'Warm Vintage', words: 'warm vintage lens with a gentle glow and lower contrast', note: 'Soft and warm' },
  { id: 'halation', label: 'Halation Vintage', words: 'vintage lens with strong halation glowing around the highlights', note: 'Glowing highlights' },
]

export const APERTURES: LookOption[] = [
  auto(),
  { id: '1.4', label: 'f/1.4 Wide Open', words: 'f/1.4 wide open, very shallow depth of field', note: 'Background melts away' },
  { id: '4', label: 'f/4 Moderate', words: 'f/4, moderate depth of field', note: 'Subject and some context' },
  { id: '11', label: 'f/11 Deep Focus', words: 'f/11 deep focus, everything sharp front to back', note: 'All in focus' },
]

export type WheelKey = 'camera' | 'lens' | 'aperture'
export const WHEELS: { key: WheelKey; label: string; options: LookOption[] }[] = [
  { key: 'camera', label: 'Camera', options: CAMERAS },
  { key: 'lens', label: 'Lens', options: LENSES },
  { key: 'aperture', label: 'Aperture', options: APERTURES },
]

/* ---------- movement ---------- */

const mv = (label: string, words: string): LookOption => ({ id: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'), label, words, note: words.charAt(0).toUpperCase() + words.slice(1) })

/** Their moves, in their order. */
export const MOVES: LookOption[] = [
  mv('Snorricam', 'a snorricam rig locked to the subject’s body, the world swinging around them'),
  mv('Robot arm', 'a fast, precise robot-arm camera move with a sudden change of angle'),
  mv('Tilt up', 'the camera tilts up'),
  mv('Rack focus', 'a rack focus from the foreground to the subject'),
  mv('Tilt down', 'the camera tilts down'),
  mv('POV', 'a first-person point-of-view shot'),
  mv('Pan left', 'the camera pans left'),
  mv('Crane up', 'a crane move rising up'),
  mv('Pan right', 'the camera pans right'),
  mv('Crane down', 'a crane move descending'),
  mv('Side tracking', 'a lateral tracking shot moving alongside the subject'),
  mv('Pedestal up', 'the camera rises straight up on a pedestal, staying level'),
  mv('Pedestal down', 'the camera lowers straight down on a pedestal, staying level'),
  mv('Handheld', 'a handheld camera with natural sway'),
  mv('Tracking', 'a tracking shot following the subject'),
  mv('Drone orbit', 'an aerial drone orbit around the subject'),
  mv('Dolly zoom', 'a dolly zoom: the camera moves in while the lens zooms out'),
  mv('Aerial pullback', 'an aerial pullback rising and moving away to reveal the landscape'),
  mv('Static shot', 'a locked-off static shot'),
  mv('Bullet time', 'bullet time: the moment freezes as the camera sweeps around it'),
  mv('Whip pan', 'a fast whip pan with motion blur'),
  mv('Slow zoom in', 'a slow zoom in'),
  mv('Arc left', 'the camera arcs to the left around the subject'),
  mv('Slow zoom out', 'a slow zoom out'),
  mv('Arc right', 'the camera arcs to the right around the subject'),
  mv('Truck right', 'the camera trucks right, parallel to the scene'),
  mv('Dolly in', 'a dolly push in towards the subject'),
  mv('Truck left', 'the camera trucks left, parallel to the scene'),
  mv('Dolly out', 'a dolly pull back from the subject'),
  mv('Slider right', 'a short, smooth slider move to the right'),
  mv('Crush zoom', 'a sudden crash zoom onto the subject'),
  mv('Slider left', 'a short, smooth slider move to the left'),
  mv('Helicopter shot', 'a sweeping helicopter shot high above the scene'),
]

/* ---------- film look ---------- */

export const GENRES: LookOption[] = [
  { id: 'general', label: 'General', words: '', note: 'No genre conventions' },
  { id: 'drama', label: 'Drama', words: 'grounded character drama, naturalistic performances', note: 'Grounded, human' },
  { id: 'thriller', label: 'Thriller', words: 'tense thriller, suspenseful framing and unease', note: 'Tension' },
  { id: 'horror', label: 'Horror', words: 'horror film, dread, deep shadows and unsettling stillness', note: 'Dread' },
  { id: 'comedy', label: 'Comedy', words: 'light comedy, bright and open framing', note: 'Light, bright' },
  { id: 'romance', label: 'Romance', words: 'romance, soft intimate framing and warmth', note: 'Warm, intimate' },
  { id: 'action', label: 'Action', words: 'action film, dynamic energy and big movement', note: 'Big energy' },
  { id: 'scifi', label: 'Sci-fi', words: 'science fiction, sleek production design and a sense of scale', note: 'Scale, tech' },
  { id: 'fantasy', label: 'Fantasy', words: 'epic fantasy, mythic and painterly', note: 'Mythic' },
  { id: 'western', label: 'Western', words: 'western, wide dusty landscapes and hard sun', note: 'Dust and sun' },
  { id: 'noir', label: 'Noir', words: 'film noir, hard shadows and moral ambiguity', note: 'Shadows' },
  { id: 'documentary', label: 'Documentary', words: 'observational documentary, unstaged and real', note: 'Real, unstaged' },
  { id: 'music-video', label: 'Music video', words: 'stylish music video, bold visual ideas', note: 'Bold, stylish' },
  { id: 'commercial', label: 'Commercial', words: 'polished commercial, clean and aspirational', note: 'Polished' },
]

export const ERAS: LookOption[] = [
  auto(),
  { id: '1920s', label: '1920s silent', words: '1920s silent-film era' },
  { id: '1950s', label: '1950s', words: '1950s Hollywood era' },
  { id: '1970s', label: '1970s', words: '1970s New Hollywood era' },
  { id: '1980s', label: '1980s', words: '1980s era' },
  { id: '1990s', label: '1990s', words: '1990s era' },
  { id: '2000s', label: '2000s', words: 'early-2000s era' },
  { id: 'today', label: 'Today', words: 'present-day setting' },
  { id: 'future', label: 'Near future', words: 'near-future setting' },
]

export const TEMPOS: LookOption[] = [
  auto(),
  { id: 'slow', label: 'Slow and still', words: 'slow, contemplative pacing with long held moments' },
  { id: 'measured', label: 'Measured', words: 'measured, steady pacing' },
  { id: 'brisk', label: 'Brisk', words: 'brisk, energetic pacing' },
  { id: 'frantic', label: 'Frantic', words: 'frantic, breathless pacing' },
  { id: 'slowmo', label: 'Slow motion', words: 'in slow motion' },
]

export type FilmKey = 'genre' | 'era' | 'tempo'
export const FILM_TABS: { key: FilmKey; label: string; options: LookOption[]; videoOnly?: boolean; note: string }[] = [
  { key: 'genre', label: 'Genre', options: GENRES, note: 'Story conventions the model should follow.' },
  { key: 'era', label: 'Era', options: ERAS, note: 'When it looks like it was made, or set.' },
  { key: 'tempo', label: 'Tempo', options: TEMPOS, videoOnly: true, note: 'How fast the shot feels.' },
]

/* ---------- palette and lighting ---------- */

export const PALETTES: LookOption[] = [
  auto(),
  { id: 'teal-orange', label: 'Teal and orange', words: 'teal-and-orange colour palette', swatch: ['#1f6f78', '#f28c38', '#16323a'] },
  { id: 'warm', label: 'Warm amber', words: 'warm amber and honey tones', swatch: ['#c9772b', '#f2c879', '#5a3216'] },
  { id: 'cool', label: 'Cool blue', words: 'cool blue and steel tones', swatch: ['#2f4f6f', '#8fb3cf', '#14202c'] },
  { id: 'pastel', label: 'Pastel', words: 'soft pastel palette', swatch: ['#f6c6d0', '#bfe3d8', '#f8e7b5'] },
  { id: 'earthy', label: 'Earthy', words: 'earthy olive, ochre and brown palette', swatch: ['#6b6b3a', '#b9893b', '#4a3626'] },
  { id: 'neon', label: 'Neon', words: 'neon magenta and cyan palette', swatch: ['#ff2fa6', '#18e0ff', '#1a0b2e'] },
  { id: 'vivid', label: 'Vivid', words: 'vivid, saturated primary colours', swatch: ['#e63946', '#1d6fe0', '#ffd23f'] },
  { id: 'muted', label: 'Desaturated', words: 'muted, desaturated palette', swatch: ['#8a8f8a', '#b8b2a7', '#4c4f4c'] },
  { id: 'sepia', label: 'Sepia', words: 'sepia-toned palette', swatch: ['#a67c52', '#e0c9a6', '#5b3f24'] },
  { id: 'mono', label: 'Black and white', words: 'black-and-white, rich monochrome', swatch: ['#111111', '#7a7a7a', '#f2f2f2'] },
  { id: 'technicolor', label: 'Technicolor', words: 'saturated three-strip Technicolor look', swatch: ['#c1121f', '#2a9d8f', '#f4d35e'] },
]

export const LIGHTS: LookOption[] = [
  auto(),
  { id: 'daylight', label: 'Natural daylight', words: 'soft natural daylight' },
  { id: 'golden', label: 'Golden hour', words: 'warm golden-hour sunlight' },
  { id: 'blue', label: 'Blue hour', words: 'cool blue-hour twilight' },
  { id: 'overcast', label: 'Overcast', words: 'soft overcast light, no hard shadows' },
  { id: 'noon', label: 'Hard noon sun', words: 'hard midday sun with crisp shadows' },
  { id: 'low-key', label: 'Low-key', words: 'low-key lighting, deep shadows' },
  { id: 'high-key', label: 'High-key', words: 'bright high-key lighting' },
  { id: 'rembrandt', label: 'Rembrandt', words: 'Rembrandt lighting with a triangle of light on the cheek' },
  { id: 'practical', label: 'Practical lamps', words: 'lit by practical lamps in the scene' },
  { id: 'candle', label: 'Candlelight', words: 'flickering candlelight' },
  { id: 'neon', label: 'Neon', words: 'coloured neon light' },
  { id: 'moon', label: 'Moonlight', words: 'cold moonlight' },
  { id: 'backlit', label: 'Backlit silhouette', words: 'strong backlight, subject in silhouette' },
  { id: 'volumetric', label: 'Volumetric haze', words: 'volumetric light beams through haze' },
]

/* ---------- the look and its words ---------- */

export interface CinemaLook {
  camera?: string
  lens?: string
  aperture?: string
  /** Move ids in the order they happen. */
  moves?: string[]
  genre?: string
  era?: string
  tempo?: string
  palette?: string
  lighting?: string
}

export type Mode = 'image' | 'video'

const pick = (list: LookOption[], id: string | undefined) => (id && id !== AUTO ? list.find((o) => o.id === id && o.words) : undefined)
export const optionLabel = (list: LookOption[], id: string | undefined) => pick(list, id)?.label

/** Put a move at the end of the shot; a move already on it is not added twice. */
export const addMove = (moves: string[] | undefined, id: string) => (moves?.includes(id) ? moves : [...(moves ?? []), id])
export const removeMove = (moves: string[] | undefined, id: string) => (moves ?? []).filter((m) => m !== id)
/** Swap a move with its neighbour (-1 earlier, +1 later). */
export function shiftMove(moves: string[] | undefined, id: string, by: -1 | 1): string[] {
  const list = [...(moves ?? [])]
  const i = list.indexOf(id)
  const j = i + by
  if (i < 0 || j < 0 || j >= list.length) return list
  const other = list[j]!
  list[j] = id
  list[i] = other
  return list
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The cinematography sentences for a look, or '' when everything is Auto. */
export function lookWords(look: CinemaLook, mode: Mode): string {
  const parts: string[] = []
  const kit = [pick(CAMERAS, look.camera), pick(LENSES, look.lens), pick(APERTURES, look.aperture)].flatMap((o) => (o ? [o.words] : []))
  if (kit.length) parts.push(kit.join(', '))
  if (mode === 'video') {
    const moves = (look.moves ?? []).flatMap((id) => MOVES.find((m) => m.id === id)?.words ?? [])
    if (moves.length === 1) parts.push(`Camera movement: ${moves[0]}`)
    else if (moves.length > 1) parts.push(`Camera movement, in this order: ${moves.map((m, i) => `${i + 1}) ${m}`).join(', then ')}`)
  }
  const film = [pick(GENRES, look.genre), pick(ERAS, look.era), mode === 'video' ? pick(TEMPOS, look.tempo) : undefined].flatMap((o) => (o ? [o.words] : []))
  if (film.length) parts.push(`Film look: ${film.join('; ')}`)
  const palette = pick(PALETTES, look.palette)
  if (palette) parts.push(`Colour palette: ${palette.words}`)
  const light = pick(LIGHTS, look.lighting)
  if (light) parts.push(`Lighting: ${light.words}`)
  return parts.map(cap).join('. ')
}

/** The prompt as it goes out: what you typed, then the look. */
export function dressPrompt(prompt: string, look: CinemaLook, mode: Mode): string {
  const words = lookWords(look, mode)
  const base = prompt.trim()
  if (!words) return prompt
  if (!base) return `${words}.`
  return `${base.replace(/[.\s]+$/, '')}. ${words}.`
}

/** How many choices are off Auto in each pill, for its label. */
export function lookCounts(look: CinemaLook, mode: Mode) {
  const camera = [pick(CAMERAS, look.camera), pick(LENSES, look.lens), pick(APERTURES, look.aperture)].filter(Boolean).length + (mode === 'video' ? (look.moves ?? []).length : 0)
  const film = [pick(GENRES, look.genre), pick(ERAS, look.era), mode === 'video' ? pick(TEMPOS, look.tempo) : undefined].filter(Boolean).length
  return { camera, film, palette: pick(PALETTES, look.palette) ? 1 : 0, lighting: pick(LIGHTS, look.lighting) ? 1 : 0 }
}
