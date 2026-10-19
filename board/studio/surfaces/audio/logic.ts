/**
 * Audio's rules as data: which models each tab offers, the JSON the dialogue and Gemini
 * speech models want, and Suno's song rules in plain English.
 *
 * ElevenLabs Dialogue and Gemini TTS have no prompt — they take arrays of lines and
 * speakers — and Suno rejects a custom-mode song without a style and title. The editors
 * in this folder hold friendly rows; these functions turn rows into exactly the payload
 * Kie documents (docs.kie.ai/market/…), and say what is wrong before a job is wasted.
 */
import type { HistoryItem, MediaAsset, ModelDefinition } from '../../api.ts'
import { isDone } from '../../api.ts'

export type AudioTab = 'tts' | 'dialogue' | 'music' | 'isolate' | 'change' | 'translate'
export const AUDIO_TABS: AudioTab[] = ['tts', 'dialogue', 'music', 'isolate', 'change', 'translate']
export const isAudioTab = (s: unknown): s is AudioTab => typeof s === 'string' && (AUDIO_TABS as string[]).includes(s)

/* ---------- which models each tab offers ---------- */

export type SpeechEngine = 'eleven' | 'gemini' | 'gemini38'

const ELEVEN_TTS = /^(market\/elevenlabs-tts|elevenlabs\/text-to-speech)/
const GEMINI_TTS = /^google\/gemini-(2-5-pro|3-1-flash)-tts$/
const GEMINI_38_TTS = /^google\/gemini-3-8-flash(-lite)?-tts$/

export const isElevenTts = (m: ModelDefinition) => ELEVEN_TTS.test(m.id)
export const isGeminiTts = (m: ModelDefinition) => GEMINI_TTS.test(m.id)
export const isGemini38Tts = (m: ModelDefinition) => GEMINI_38_TTS.test(m.id)
export const isDialogue = (m: ModelDefinition) => /elevenlabs-dialogue|text-to-dialogue/.test(m.id)
export const isIsolation = (m: ModelDefinition) => /audio-isolation/.test(m.id)
export const isSunoSong = (m: ModelDefinition) => m.id === 'suno/music'
export const isSunoExtend = (m: ModelDefinition) => m.id === 'suno/extend'
export const isSunoUploadExtend = (m: ModelDefinition) => m.id === 'suno/upload-extend'
export const isSunoCover = (m: ModelDefinition) => m.id === 'suno/upload-cover'
export const isSunoLyrics = (m: ModelDefinition) => m.id === 'suno/lyrics'

/** Every text-to-speech model, for the one Speech rail. */
export const isSpeech = (m: ModelDefinition) => isElevenTts(m) || isGeminiTts(m) || isGemini38Tts(m)

/** Which editor a speech model needs: a voice id, or Gemini speakers (two generations). */
export function speechEngineOf(m: ModelDefinition | null): SpeechEngine | null {
  if (!m) return null
  if (isElevenTts(m)) return 'eleven'
  if (isGemini38Tts(m)) return 'gemini38'
  if (isGeminiTts(m)) return 'gemini'
  return null
}

/** Which results a tab's History shows, by the model that made them. */
export function inTab(tab: AudioTab, item: HistoryItem): boolean {
  const id = item.modelId ?? ''
  switch (tab) {
    case 'tts':
      return ELEVEN_TTS.test(id) || GEMINI_TTS.test(id) || GEMINI_38_TTS.test(id)
    case 'dialogue':
      return /elevenlabs-dialogue|text-to-dialogue/.test(id)
    case 'music':
      return item.provider === 'suno' || id.startsWith('suno/')
    case 'isolate':
      return /audio-isolation/.test(id)
    // The dub pipeline's rows (server/studio/dub.ts); a dubbed video is filed under video.
    case 'change':
      return id === 'studio/voice-change'
    case 'translate':
      return id === 'studio/translate'
    default:
      return false
  }
}

/* ---------- ElevenLabs dialogue ---------- */

export interface DialogueRow {
  voice: string
  text: string
}

/** ElevenLabs caps the whole dialogue, not each line. */
export const DIALOGUE_LIMIT = 5000

/** Rows → the `dialogue` array: `[{ text, voice }]`, blank lines dropped. */
export const dialogueJson = (rows: DialogueRow[]) => rows.filter((r) => r.text.trim() && r.voice).map((r) => ({ text: r.text.trim(), voice: r.voice }))

export const dialogueLength = (rows: DialogueRow[]) => rows.reduce((n, r) => n + r.text.trim().length, 0)

export function dialogueProblem(rows: DialogueRow[]): string | null {
  if (!dialogueJson(rows).length) return 'Write at least one line.'
  const n = dialogueLength(rows)
  if (n > DIALOGUE_LIMIT) return `The lines add up to ${n.toLocaleString()} characters; ElevenLabs takes ${DIALOGUE_LIMIT.toLocaleString()} at most. Split it into two takes.`
  return null
}

/** Dialogue v3 only accepts these three stability values. */
export const STABILITY = [
  { value: 0, label: 'Creative' },
  { value: 0.5, label: 'Natural' },
  { value: 1, label: 'Robust' },
]

/** A language code as its English name ("fil" → "Filipino"); '' means let it detect. */
export function languageName(code: string): string {
  if (!code) return 'Detect'
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

/* ---------- Gemini speech ---------- */

export interface GeminiSpeaker {
  voice: string
  /** 2.5 Pro / 3.1 Flash only. Accent is required there; the rest are optional. */
  accent?: string
  style?: string
  pace?: string
  profile?: string
}

export interface GeminiTurn {
  /** 0 or 1 — Gemini takes at most two speakers. */
  speaker: number
  text: string
}

export const GEMINI_MAX_SPEAKERS = 2
export const GEMINI_TURN_LIMIT = 10000

const speakerId = (n: number) => `Speaker ${n + 1}`

/**
 * Speakers → the `speakers` array. 3.8 takes `{ speaker_id, voice_name }` only; 2.5 Pro and
 * 3.1 Flash also take accent (required), style, pace and an audio profile.
 */
export function geminiSpeakers(speakers: GeminiSpeaker[], v38: boolean) {
  return speakers.slice(0, GEMINI_MAX_SPEAKERS).map((s, i) => {
    const base: Record<string, string> = { speaker_id: speakerId(i), voice_name: s.voice }
    if (v38) return base
    base.accent = s.accent || 'Neutral'
    if (s.style) base.style = s.style
    if (s.pace) base.pace = s.pace
    if (s.profile?.trim()) base.audio_profile = s.profile.trim()
    return base
  })
}

/** Turns → the `dialogue_turns` array, each tied to a speaker that exists. */
export function geminiTurns(turns: GeminiTurn[], speakerCount: number) {
  const last = Math.max(0, Math.min(speakerCount, GEMINI_MAX_SPEAKERS) - 1)
  return turns.filter((t) => t.text.trim()).map((t) => ({ speaker_id: speakerId(Math.min(Math.max(0, t.speaker), last)), text: t.text.trim() }))
}

/* ---------- carrying the text across a model switch ---------- */

/**
 * ElevenLabs' script → Gemini lines: one line per blank-line paragraph (ElevenLabs' own segment
 * break), all spoken by S1. Empty when the script is.
 */
export const scriptToTurns = (script: string): GeminiTurn[] =>
  script
    .split(/\n\s*\n/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((text) => ({ speaker: 0, text }))

/** Gemini lines → an ElevenLabs script, a blank line between them so each stays its own segment. */
export const turnsToScript = (turns: GeminiTurn[]): string =>
  turns
    .map((t) => t.text.trim())
    .filter(Boolean)
    .join('\n\n')

/** Whether a switch from one speech engine to another moves the text: ElevenLabs ↔ either Gemini. */
export const carriesText = (from: SpeechEngine | null, to: SpeechEngine | null): boolean => Boolean(from && to && (from === 'eleven') !== (to === 'eleven'))

/* ---------- a past job back into the editors (Recreate) ---------- */

const rec = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {})
const str = (v: unknown) => (typeof v === 'string' ? v : undefined)

/** A Gemini `speakers` array back into editor rows; null when the input has none. */
export function speakersFrom(list: unknown): GeminiSpeaker[] | null {
  if (!Array.isArray(list) || !list.length) return null
  const out = list.slice(0, GEMINI_MAX_SPEAKERS).map((x) => {
    const s = rec(x)
    const row: GeminiSpeaker = { voice: str(s.voice_name) ?? '', accent: str(s.accent) ?? 'Neutral' }
    if (str(s.style)) row.style = str(s.style)
    if (str(s.pace)) row.pace = str(s.pace)
    if (str(s.audio_profile)) row.profile = str(s.audio_profile)
    return row
  })
  return out.some((s) => s.voice) ? out : null
}

/** `dialogue_turns` back into turns ("Speaker 2" is speaker 1); null when there are none. */
export function turnsFrom(list: unknown): GeminiTurn[] | null {
  if (!Array.isArray(list) || !list.length) return null
  const out = list.map((x) => {
    const t = rec(x)
    const n = Number(/(\d+)/.exec(str(t.speaker_id) ?? '')?.[1] ?? 1)
    return { speaker: Math.min(GEMINI_MAX_SPEAKERS - 1, Math.max(0, n - 1)), text: str(t.text) ?? '' }
  })
  return out.some((t) => t.text) ? out : null
}

/** ElevenLabs Dialogue's `dialogue` array back into line rows. */
export function dialogueRowsFrom(list: unknown): DialogueRow[] | null {
  if (!Array.isArray(list) || !list.length) return null
  const out = list.map((x) => ({ voice: str(rec(x).voice) ?? '', text: str(rec(x).text) ?? '' }))
  return out.some((r) => r.text) ? out : null
}

/** Which Music sub-tab a Suno model belongs to, so Recreate opens the right one. */
export function musicKindOf(modelId?: string): 'create' | 'extend' | 'cover' | 'lyrics' | null {
  switch (modelId) {
    case 'suno/music':
      return 'create'
    case 'suno/extend':
    case 'suno/upload-extend':
      return 'extend'
    case 'suno/upload-cover':
      return 'cover'
    case 'suno/lyrics':
      return 'lyrics'
    default:
      return null
  }
}

export function geminiProblem(speakers: GeminiSpeaker[], turns: GeminiTurn[]): string | null {
  if (!speakers.length || speakers.some((s) => !s.voice)) return 'Give every speaker a voice.'
  if (!geminiTurns(turns, speakers.length).length) return 'Write at least one line.'
  const long = turns.find((t) => t.text.trim().length > GEMINI_TURN_LIMIT)
  if (long) return `One line is ${long.text.trim().length.toLocaleString()} characters; Gemini takes ${GEMINI_TURN_LIMIT.toLocaleString()} per line.`
  return null
}

/* ---------- Suno ---------- */

export const SUNO_VERSIONS = [
  { value: 'V5', label: 'V5' },
  { value: 'V4_5PLUS', label: 'V4.5+' },
  { value: 'V4_5', label: 'V4.5' },
  { value: 'V4', label: 'V4' },
]

export interface SongForm {
  custom: boolean
  instrumental: boolean
  style: string
  title: string
  version: string
}

export const SONG_DEFAULT: SongForm = { custom: true, instrumental: false, style: '', title: '', version: 'V5' }

/** How long the prompt may be: lyrics in custom mode (3000 on V4), a short brief otherwise. */
export const sunoPromptLimit = (f: Pick<SongForm, 'custom' | 'version'>) => (f.custom ? (f.version === 'V4' ? 3000 : 5000) : 500)
export const sunoStyleLimit = (version: string) => (version === 'V4' ? 200 : 1000)

/**
 * Suno's rules (src/lib/workflowValidation.ts) as plain sentences. `prompt` is optional:
 * the rail owns the prompt box, so the form checks what it holds and states the rest.
 */
export function songProblems(f: SongForm, prompt?: string): string[] {
  const out: string[] = []
  if (f.custom && !f.style.trim()) out.push('Custom mode needs a style — genre, tempo, instruments, voice.')
  if (f.custom && !f.title.trim()) out.push('Custom mode needs a title.')
  if (f.custom && f.style.length > sunoStyleLimit(f.version)) out.push(`Style is ${f.style.length} characters; ${f.version === 'V4' ? 'V4' : 'Suno'} takes ${sunoStyleLimit(f.version)}.`)
  if (f.title.length > 100) out.push('Title is over 100 characters.')
  if (prompt !== undefined) {
    const p = prompt.trim()
    if (!p && (!f.custom || !f.instrumental)) out.push(f.custom ? 'Write the lyrics, or switch on Instrumental.' : 'Describe the song you want.')
    if (p.length > sunoPromptLimit(f)) out.push(`${f.custom ? 'Lyrics' : 'The description'} can be ${sunoPromptLimit(f)} characters at most.`)
  }
  return out
}

/**
 * The song form as field values. Simple mode must not send style or title — Suno reads
 * them as custom mode — and an empty string here is dropped by buildInput, so it is how
 * "leave it out" is said.
 */
export function songValues(f: SongForm): Record<string, unknown> {
  return {
    customMode: f.custom,
    instrumental: f.instrumental,
    style: f.custom ? f.style.trim() : '',
    title: f.custom ? f.title.trim() : '',
    negativeTags: f.custom ? undefined : '',
    personaId: f.custom ? undefined : '',
    model: f.version,
  }
}

/* ---------- past Suno tracks, for Extend ---------- */

export interface Track {
  item: HistoryItem
  media: MediaAsset
  /** Suno's own id for this one track; a task makes two. */
  audioId: string
}

/** Every finished Suno track that Suno can extend by task + audio id. */
export function sunoTracks(items: HistoryItem[]): Track[] {
  const out: Track[] = []
  for (const item of items) {
    if (!isDone(item) || !(item.provider === 'suno' || (item.modelId ?? '').startsWith('suno/')) || item.operation === 'lyrics' || item.modelId === 'suno/lyrics') continue
    for (const media of item.media ?? []) {
      const audioId = media.providerAssetId ?? media.id
      if (media.kind === 'audio' && audioId) out.push({ item, media, audioId })
    }
  }
  return out
}

/** What suno/extend needs from a track, as the old form fills it (useQuickAction.ts). */
export function extendValues(t: Track, continueAt?: number | null): Record<string, string | number> {
  const meta = t.media.metadata ?? {}
  const out: Record<string, string | number> = {
    taskId: t.item.taskId,
    audioId: t.audioId,
    continueAt: continueAt ?? Math.max(0, Math.floor((t.media.duration ?? 1) - 1)),
  }
  if (typeof meta.tags === 'string' && meta.tags) out.style = meta.tags
  if (t.media.title) out.title = t.media.title
  if (typeof meta.modelName === 'string' && /^V\d/.test(meta.modelName)) out.model = meta.modelName
  return out
}

/* ---------- handing values to the rail ---------- */

/**
 * Values for the rail's `locked`, minus the undefined ones. Every locked key is also
 * taken out of Advanced settings, so a key with nothing behind it (Suno's negativeTags in
 * custom mode) must not be there at all — it would hide the field and blank it.
 */
export function defined(values: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) if (v !== undefined) out[k] = v
  return out
}

/* ---------- extra checks for Generate (RailStudio `check`) ---------- */

/** A prompt over the field's own limit, said plainly. ElevenLabs Narration counts per segment. */
export function scriptProblem(model: ModelDefinition, prompt: string): string | null {
  if (model.id === 'market/elevenlabs-tts') {
    const long = prompt.split(/\n\s*\n/g).find((s) => s.trim().length > 5000)
    return long ? `One segment is ${long.trim().length.toLocaleString()} characters; Narration reads 5,000 at a time. Put a blank line in to split it.` : null
  }
  const field = model.fields.find((f) => /^prompt$|^text$/.test(f.name))
  if (field?.maxLength && prompt.length > field.maxLength) return `The ${field.name === 'text' ? 'script' : 'text'} is ${prompt.length.toLocaleString()} characters; this model takes ${field.maxLength.toLocaleString()}.`
  return null
}

/** The song form as it stands in a Suno input, so the rules can run on what will be sent. */
export const songFormOf = (input: Record<string, unknown>): SongForm => ({
  custom: input.customMode !== false,
  instrumental: input.instrumental === true,
  style: typeof input.style === 'string' ? input.style : '',
  title: typeof input.title === 'string' ? input.title : '',
  version: typeof input.model === 'string' ? input.model : 'V5',
})

/** Suno's song rules for Create and Cover; the first problem holds Generate back. */
export function songCheck(model: ModelDefinition, input: Record<string, unknown>, prompt: string): string | null {
  if (model.id !== 'suno/music' && model.id !== 'suno/upload-cover') return scriptProblem(model, prompt)
  return songProblems(songFormOf(input), prompt)[0] ?? null
}
