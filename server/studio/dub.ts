/**
 * Voice change and Translate — Audio's dub pipeline, run here on the server because Kie has no
 * speech-to-speech, voice-changer or dubbing model to call. It chains what exists:
 *
 *   clip ─ffmpeg→ 16 kHz wav ─faster-whisper (local, CPU)→ segments with timestamps
 *        ─(Translate) an LLM, one line per segment, short enough for its slot→
 *        ─TTS on Kie (ElevenLabs or Gemini 3.1 Flash), one call per segment, in the chosen voice→ one clip per segment
 *        ─ffmpeg atempo (0.75–1.35) + silence→ each clip fitted to its segment's slot
 *        ─ffmpeg adelay + amix, over the original with the speech ducked out ("Keep background sound")→ new track
 *        ─(video) ffmpeg mux over the original picture ─(Translate + Lip-sync) Volcengine lip-sync on Kie→
 *   one history row (`dub-<id>`, model `studio/voice-change` / `studio/translate`), like any other job's, so the
 *   result shows in Audio, Video and Assets.
 *
 * While it runs, a run is a small JSON file in its work folder (<studioDir>/dub/<id>/run.json, paths.ts) and an
 * entry in `runs`; the Audio feed polls GET /api/studio/dub for the phase ("Transcribing", "Voicing 3/8",
 * "Lip-sync", "Mixing"). A failed run stays there (Retry, Dismiss) — it never becomes a history row, because
 * the segments it already voiced were charged and history's failed row would say "Credits refunded".
 *
 * Kie's ElevenLabs has had days of answering every job "Internal Error, Please try again later." (2026-10-15/16,
 * refunded). So when an ElevenLabs line fails that way, the run switches once to Gemini 3.1 Flash and voices
 * every line again there (one voice for the whole clip), says so in its notes, and still finishes.
 *
 * The maths (fitting, assembly, the ffmpeg graph, the Kie inputs) are pure functions, tested in dub.test.ts
 * against fakes; `runDub` takes every outside effect as a dependency (`DubDeps`), and `realDeps()` wires the
 * real ones (ffmpeg on PATH, the voice extra's Python, Kie's market API, history's own upsert).
 */
import { execFile, spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { HistoryItem, MediaAsset } from '../../src/lib/models/types.ts'
import { dubPython, studioDir, whisperCache } from './paths.ts'
import { translateWithCli } from './dub-cli.ts'

const HERE = dirname(fileURLToPath(import.meta.url))

/* ---------- the request and the run ---------- */

export type DubMode = 'change' | 'translate'

/**
 * The speech models a dub can voice with, catalogue id → Kie model: ElevenLabs Narration (multilingual v2,
 * the default) and Turbo 2.5, and Gemini 3.1 Flash (multilingual too; it reads the language from the text).
 */
export const DUB_TTS_MODELS = {
  'market/elevenlabs-tts': 'elevenlabs/text-to-speech-multilingual-v2',
  'elevenlabs/text-to-speech-turbo-2-5': 'elevenlabs/text-to-speech-turbo-2-5',
  'google/gemini-3-1-flash-tts': 'google/gemini-3-1-flash-tts',
} as const
export type DubTtsModel = keyof typeof DUB_TTS_MODELS

export const GEMINI_DUB_MODEL = 'google/gemini-3-1-flash-tts' satisfies DubTtsModel
export const isGeminiModel = (m?: string) => m === GEMINI_DUB_MODEL

/** Gemini 2.5 Pro / 3.1 Flash's 30 prebuilt voices, by name (board/studio/voices.ts has the picker's copy). */
export const GEMINI_VOICES = [
  'Achernar', 'Achird', 'Algenib', 'Algieba', 'Alnilam', 'Aoede', 'Autonoe', 'Callirrhoe', 'Charon', 'Despina',
  'Enceladus', 'Erinome', 'Fenrir', 'Gacrux', 'Iapetus', 'Kore', 'Laomedeia', 'Leda', 'Orus', 'Puck',
  'Pulcherrima', 'Rasalgethi', 'Sadachbia', 'Sadaltager', 'Schedar', 'Sulafat', 'Umbriel', 'Vindemiatrix', 'Zephyr', 'Zubenelgenubi',
]
/** Who stands in when an ElevenLabs run falls back and the request named no backup voice. */
export const GEMINI_DEFAULT_VOICE = 'Kore'

/** What the row and the run's notes say when a run switched engines. */
export const FALLBACK_NOTE = 'Voiced with Gemini — ElevenLabs was failing.'

export const LIPSYNC_MODEL = 'volcengine/video-to-video-lip-sync'
/** Volcengine takes 240 s of audio at most (210 in basic mode). */
export const LIPSYNC_MAX_SECONDS = 240

export interface DubRequest {
  mode: DubMode
  /** The clip: an https URL (a Kie upload) or a `/media/...` path of an archived result. */
  clipUrl: string
  /** ElevenLabs voice id, or a Gemini voice name when `model` is Gemini. */
  voice: string
  /** The Gemini voice an ElevenLabs run switches to if ElevenLabs fails (else GEMINI_DEFAULT_VOICE). */
  fallbackVoice?: string
  /** Translate: the target language code ("es"). */
  language?: string
  /** Mix the new voice over the original sound with the speech ducked out; off = the new voice alone. */
  keepBackground: boolean
  /** Translate + a video: lip-sync the dubbed video on Kie. */
  lipSync: boolean
  model?: DubTtsModel
  /** The clip's file name, for the row's title. */
  name?: string
}

export type DubPhase = 'queued' | 'preparing' | 'transcribing' | 'translating' | 'voicing' | 'mixing' | 'lipsync' | 'saving' | 'done' | 'failed'

export interface Segment {
  start: number
  end: number
  /** What was said. */
  text: string
  /** What the new voice says: the same line, or its translation. */
  line?: string
}

export interface DubRun {
  id: string
  request: DubRequest
  status: 'running' | 'done' | 'failed'
  phase: DubPhase
  /** The phase as the feed says it: "Voicing 3/8". */
  step: string
  createdAt: number
  updatedAt: number
  error?: string
  /** The history row it became. */
  taskId?: string
  /** Credits Kie reported for the calls made so far. */
  credits: number
  duration?: number
  hasVideo?: boolean
  segments?: Segment[]
  /** Fitting notes ("2 lines ran long and were sped up to the limit"), and the engine switch if there was one. */
  notes?: string[]
  /** The speech model and voice that actually voiced it (differs from the request after a fallback). */
  voicedWith?: Voicing
  /** ElevenLabs failed and Gemini voiced the run instead: the error that caused the switch. */
  fallback?: string
  dismissed?: boolean
}

export interface Voicing {
  model: DubTtsModel
  voice: string
}

export const DUB_MODEL_ID: Record<DubMode, string> = { change: 'studio/voice-change', translate: 'studio/translate' }
export const DUB_TITLE: Record<DubMode, string> = { change: 'Voice change', translate: 'Translate' }

/** Plain-words problems with a request, before anything runs. */
export function requestProblem(r: Partial<DubRequest>): string | null {
  if (r.mode !== 'change' && r.mode !== 'translate') return 'Pick Voice change or Translate.'
  if (r.clipUrl?.includes('..') || r.clipUrl?.includes('\0')) return 'That clip path is not allowed.'
  if (!r.clipUrl || !(/^https:\/\//.test(r.clipUrl) || /^\/?media\/[^/]+\/[^/]+$/.test(r.clipUrl))) return 'Add your clip first.'
  if (r.model && !(r.model in DUB_TTS_MODELS)) return 'That speech model cannot voice a dub.'
  if (isGeminiModel(r.model) ? !GEMINI_VOICES.includes(r.voice ?? '') : !r.voice || !/^[A-Za-z0-9]{6,40}$/.test(r.voice)) return 'Pick a voice.'
  if (r.fallbackVoice && !GEMINI_VOICES.includes(r.fallbackVoice)) return 'That backup voice is not a Gemini voice.'
  if (r.mode === 'translate' && !(r.language && LANGUAGES.some((l) => l.code === r.language))) return 'Pick the language to translate into.'
  return null
}

/* ---------- which engine voices it ---------- */

/** The model and voice a run starts with: the request's, Narration by default. */
export const firstVoicing = (r: DubRequest): Voicing => ({ model: r.model ?? 'market/elevenlabs-tts', voice: r.voice })

/** Gemini's stand-in for an ElevenLabs run: the request's backup voice, else Kore. */
export const fallbackVoicing = (r: DubRequest): Voicing => ({ model: GEMINI_DUB_MODEL, voice: r.fallbackVoice && GEMINI_VOICES.includes(r.fallbackVoice) ? r.fallbackVoice : GEMINI_DEFAULT_VOICE })

/**
 * Whether a failed line is worth switching engines for: an ElevenLabs line, failed with Kie's own
 * "Internal Error, Please try again later." (what Kie answered every ElevenLabs job on 2026-10-15/16).
 * Anything else (no credits, a bad clip, a timeout) would fail on Gemini too, so it stops the run.
 */
export const shouldFallBack = (v: Voicing, message: string) => !isGeminiModel(v.model) && /internal error|try again later|server error/i.test(message)

/* ---------- languages ---------- */

/** ElevenLabs Multilingual v2's 29 languages (Turbo 2.5 and Gemini 3.1 Flash read them all too). */
export const LANGUAGES: { code: string; name: string; flag: string }[] = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'es', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr', name: 'French', flag: '🇫🇷' },
  { code: 'de', name: 'German', flag: '🇩🇪' },
  { code: 'it', name: 'Italian', flag: '🇮🇹' },
  { code: 'pt', name: 'Portuguese', flag: '🇵🇹' },
  { code: 'pl', name: 'Polish', flag: '🇵🇱' },
  { code: 'nl', name: 'Dutch', flag: '🇳🇱' },
  { code: 'sv', name: 'Swedish', flag: '🇸🇪' },
  { code: 'da', name: 'Danish', flag: '🇩🇰' },
  { code: 'fi', name: 'Finnish', flag: '🇫🇮' },
  { code: 'cs', name: 'Czech', flag: '🇨🇿' },
  { code: 'sk', name: 'Slovak', flag: '🇸🇰' },
  { code: 'hr', name: 'Croatian', flag: '🇭🇷' },
  { code: 'ro', name: 'Romanian', flag: '🇷🇴' },
  { code: 'bg', name: 'Bulgarian', flag: '🇧🇬' },
  { code: 'el', name: 'Greek', flag: '🇬🇷' },
  { code: 'uk', name: 'Ukrainian', flag: '🇺🇦' },
  { code: 'ru', name: 'Russian', flag: '🇷🇺' },
  { code: 'tr', name: 'Turkish', flag: '🇹🇷' },
  { code: 'ar', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi', name: 'Hindi', flag: '🇮🇳' },
  { code: 'ta', name: 'Tamil', flag: '🇮🇳' },
  { code: 'id', name: 'Indonesian', flag: '🇮🇩' },
  { code: 'ms', name: 'Malay', flag: '🇲🇾' },
  { code: 'fil', name: 'Filipino', flag: '🇵🇭' },
  { code: 'ja', name: 'Japanese', flag: '🇯🇵' },
  { code: 'ko', name: 'Korean', flag: '🇰🇷' },
  { code: 'zh', name: 'Chinese', flag: '🇨🇳' },
]
export const languageOf = (code?: string) => LANGUAGES.find((l) => l.code === code)

/* ---------- segments ---------- */

export interface RawTranscript {
  language?: string
  duration?: number
  segments: { start: number; end: number; text: string }[]
}

/** Lines shorter than this are folded into a neighbour: a 0.3 s "So," voiced alone sounds clipped. */
export const MIN_SEGMENT = 0.8
/** …when the pause between them is under this. */
export const JOIN_GAP = 0.35

/**
 * Whisper's segments → the lines to voice: blank ones dropped, times kept inside the clip and in order,
 * and very short lines joined to the one before (or after) when they nearly touch.
 */
export function cleanSegments(raw: RawTranscript['segments'], duration: number): Segment[] {
  const max = duration > 0 ? duration : Infinity
  const list = raw
    .map((s) => ({ start: Math.max(0, Math.min(max, Number(s.start) || 0)), end: Math.max(0, Math.min(max, Number(s.end) || 0)), text: String(s.text ?? '').replace(/\s+/g, ' ').trim() }))
    .filter((s) => s.text && s.end > s.start)
    .sort((a, b) => a.start - b.start)
  const out: Segment[] = []
  for (const s of list) {
    const last = out[out.length - 1]
    if (last && s.start < last.end) s.start = last.end
    if (s.end <= s.start) {
      if (last) last.text = `${last.text} ${s.text}`
      continue
    }
    const short = s.end - s.start < MIN_SEGMENT || (last && last.end - last.start < MIN_SEGMENT)
    if (last && short && s.start - last.end < JOIN_GAP) {
      last.end = s.end
      last.text = `${last.text} ${s.text}`
      continue
    }
    out.push({ ...s })
  }
  return out
}

/* ---------- fitting a voiced line into its slot ---------- */

export const TEMPO_MIN = 0.75
export const TEMPO_MAX = 1.35
/** Within this of the slot a clip plays as it came: no stretch at all. */
export const TEMPO_SLACK = 0.04

export const clampTempo = (t: number) => (Number.isFinite(t) && t > 0 ? Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, t)) : 1)

/**
 * How to play a clip of `clip` seconds in a slot of `slot` seconds: the atempo factor (faster > 1),
 * how long it then lasts, and the silence that pads it out (0 when it still runs long).
 */
export function fitClip(clip: number, slot: number): { tempo: number; length: number; pad: number; over: number } {
  if (!(clip > 0)) return { tempo: 1, length: 0, pad: Math.max(0, slot), over: 0 }
  const want = slot > 0 ? clip / slot : 1
  const tempo = Math.abs(want - 1) <= TEMPO_SLACK ? 1 : round3(clampTempo(want))
  const length = clip / tempo
  return { tempo, length: round3(length), pad: round3(Math.max(0, slot - length)), over: round3(Math.max(0, length - slot)) }
}

const round3 = (n: number) => Math.round(n * 1000) / 1000

export interface PlanEntry {
  index: number
  /** Seconds into the clip where the voiced line starts. */
  start: number
  tempo: number
  /** Seconds it lasts once fitted. */
  length: number
}

/**
 * Where each voiced line goes on the original timeline. A line is fitted to its own segment, but may
 * borrow the pause before the next one; if it still runs long the next line waits for it (lines never
 * talk over each other), and the run's notes say so.
 */
export function assemblyPlan(segments: Segment[], clipSeconds: number[], duration: number): { entries: PlanEntry[]; end: number; notes: string[] } {
  const entries: PlanEntry[] = []
  let cursor = 0
  let late = 0
  let capped = 0
  segments.forEach((seg, i) => {
    const clip = clipSeconds[i] ?? 0
    if (!(clip > 0)) return
    const target = seg.end - seg.start
    const next = segments[i + 1]?.start ?? Math.max(duration, seg.end)
    const room = Math.max(target, next - seg.start)
    // Aim for the segment itself. A line too long for it borrows the pause before the next one,
    // at the gentlest speed-up that fits there (never slowed down, it already runs long).
    let { tempo, length } = fitClip(clip, target)
    if (length > target + 0.001 && room > target) {
      tempo = round3(Math.max(1, clampTempo(clip / room)))
      length = round3(clip / tempo)
    }
    if (clip / TEMPO_MAX > room + 0.05) capped++
    const start = round3(Math.max(seg.start, cursor))
    if (start > seg.start + 0.05) late++
    entries.push({ index: i, start, tempo, length })
    cursor = start + length
  })
  const notes: string[] = []
  if (capped) notes.push(`${capped} ${capped === 1 ? 'line was' : 'lines were'} longer than ${capped === 1 ? 'its' : 'their'} slot even at ${TEMPO_MAX}× speed.`)
  if (late) notes.push(`${late} ${late === 1 ? 'line starts' : 'lines start'} a little late to make room.`)
  return { entries, end: round3(Math.max(duration, cursor)), notes }
}

/* ---------- the ffmpeg graph ---------- */

/** How loud the original stays while a line is spoken over it ("Keep background sound"). */
export const DUCK_GAIN = 0.06
/** The duck opens this much before a line and closes this much after it. */
export const DUCK_PAD = 0.12

/**
 * The volume expression that ducks the original under every spoken segment, for ffmpeg's
 * `volume=...:eval=frame`. Segments are merged when their ducks would touch.
 */
export function duckExpression(segments: Pick<Segment, 'start' | 'end'>[], gain = DUCK_GAIN, pad = DUCK_PAD): string {
  const spans: [number, number][] = []
  for (const s of [...segments].sort((a, b) => a.start - b.start)) {
    const a = Math.max(0, s.start - pad)
    const b = s.end + pad
    const last = spans[spans.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else spans.push([a, b])
  }
  if (!spans.length) return '1'
  const inside = spans.map(([a, b]) => `between(t,${a.toFixed(3)},${b.toFixed(3)})`).join('+')
  return `if(gt(${inside},0),${gain},1)`
}

/**
 * The filter graph that lays the fitted lines on the timeline. Input 0 is the original audio (used only
 * with `bed`), inputs 1..n the voiced lines in plan order. Output label: [out].
 */
export function mixGraph(plan: PlanEntry[], segments: Segment[], opts: { end: number; bed: boolean }): string {
  const parts: string[] = []
  const labels: string[] = []
  const fmt = 'aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo'
  if (opts.bed) {
    parts.push(`[0:a]${fmt},volume='${duckExpression(segments)}':eval=frame[bed]`)
    labels.push('[bed]')
  }
  plan.forEach((p, i) => {
    const tempo = p.tempo === 1 ? '' : `atempo=${p.tempo},`
    const delay = Math.round(p.start * 1000)
    parts.push(`[${i + 1}:a]${fmt},${tempo}adelay=${delay}:all=1[v${i}]`)
    labels.push(`[v${i}]`)
  })
  if (!labels.length) return `anullsrc=r=44100:cl=stereo,atrim=0:${opts.end}[out]`
  const end = opts.end.toFixed(3)
  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=longest,apad,atrim=0:${end}[out]`)
  return parts.join(';\n')
}

/** ffmpeg arguments for the mix: inputs, the graph from a script file, an mp3 or m4a out. */
export function mixArgs(original: string, clips: string[], graphFile: string, out: string): string[] {
  const args = ['-y', '-v', 'error']
  // Input 0 is always there (used or not) so the graph's numbering doesn't change with the toggle.
  args.push('-i', original)
  for (const c of clips) args.push('-i', c)
  // The graph comes from a file: a long clip's graph would pass Windows' command-line limit.
  args.push('-/filter_complex', graphFile, '-map', '[out]')
  if (out.endsWith('.mp3')) args.push('-c:a', 'libmp3lame', '-b:a', '192k')
  else args.push('-c:a', 'aac', '-b:a', '192k')
  args.push(out)
  return args
}

/** The new track over the original picture. */
export const muxArgs = (video: string, audio: string, out: string): string[] => ['-y', '-v', 'error', '-i', video, '-i', audio, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]

/** The clip's sound as 16 kHz mono for Whisper, and as 44.1 kHz stereo for the mix's bed. */
export const extractArgs = (input: string, out: string, whisper: boolean): string[] => ['-y', '-v', 'error', '-i', input, '-vn', ...(whisper ? ['-ac', '1', '-ar', '16000'] : ['-ac', '2', '-ar', '44100']), out]

/* ---------- Kie inputs ---------- */

/**
 * One line for ElevenLabs. Multilingual v2 reads the language from the text itself (ElevenLabs only
 * enforces `language_code` on Turbo 2.5), so the code is sent to Turbo only.
 */
export function ttsInput(line: string, voice: string, model: DubTtsModel, language?: string, speed = 1): Record<string, unknown> {
  const input: Record<string, unknown> = { text: line, voice, stability: 0.5, similarity_boost: 0.75, style: 0, speed }
  if (language && model === 'elevenlabs/text-to-speech-turbo-2-5') input.language_code = language
  return input
}

/**
 * One line for Gemini 3.1 Flash: one speaker, one turn — the exact shape of the Studio job that succeeded on
 * 2026-10-16 (accent is required on 2.5 Pro / 3.1 Flash). Gemini reads the language from the text.
 */
export const geminiTtsInput = (line: string, voice: string): Record<string, unknown> => ({
  temperature: 1,
  speakers: [{ speaker_id: 'Speaker 1', voice_name: voice, accent: 'Neutral' }],
  dialogue_turns: [{ speaker_id: 'Speaker 1', text: line }],
})

/** The Kie job that voices one line, for whichever engine the run is on. */
export function lineJob(v: Voicing, seg: Segment, language?: string): { model: string; input: Record<string, unknown> } {
  const line = seg.line ?? seg.text
  if (isGeminiModel(v.model)) return { model: DUB_TTS_MODELS[v.model], input: geminiTtsInput(line, v.voice) }
  return { model: DUB_TTS_MODELS[v.model], input: ttsInput(line, v.voice, v.model, language, speedFor(line, seg.end - seg.start)) }
}

/** The file a voiced line is saved as: Gemini answers .wav, ElevenLabs .mp3 — ffmpeg reads them by name. */
export const lineFile = (i: number, v: Voicing, url: string) => `line-${i}-${isGeminiModel(v.model) ? 'gemini' : 'eleven'}.${/\.(mp3|wav|m4a|aac|ogg|flac)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase() ?? 'mp3'}`

/**
 * ElevenLabs' own speed (0.7–1.2, steps of 0.1) for a line that looks too long for its slot: speaking
 * faster at the source sounds better than atempo afterwards, which then only trims what is left.
 */
export function speedFor(line: string, seconds: number): number {
  if (!(seconds > 0)) return 1
  const want = line.trim().length / (CHARS_PER_SECOND * seconds)
  return Math.round(Math.min(1.2, Math.max(1, want)) * 10) / 10
}

/** Volcengine lip-sync: the dubbed video and its new track. */
export const lipSyncInput = (videoUrl: string, audioUrl: string): Record<string, unknown> => ({ mode: 'lite', video_url: videoUrl, audio_url: audioUrl, align_audio: true })

/* ---------- translation ---------- */

/** About how many characters of speech fit in a second (ElevenLabs at speed 1 reads ~14-16). */
export const CHARS_PER_SECOND = 15

/** A line's character budget: what fits its slot at the fastest allowed tempo, never under 12. */
export const lineBudget = (seconds: number) => Math.max(12, Math.round(seconds * CHARS_PER_SECOND * 1.15))

export function translationPrompt(segments: Segment[], language: string): string {
  const lines = segments.map((s, i) => ({ n: i + 1, seconds: round3(s.end - s.start), max_chars: lineBudget(s.end - s.start), text: s.text }))
  return [
    `Translate these spoken lines from a video into ${language}, for a dub read aloud in time with the original.`,
    'Rules: one translated line per input line, same order, same count (never merge or split lines).',
    'Keep each line within its max_chars so it can be spoken in the same seconds; shorten wording rather than run long.',
    'Natural spoken language, the same tone and meaning; keep names, numbers and brand names as they are. No notes, no quotes.',
    'Answer with JSON: {"lines": ["…", "…"]}.',
    '',
    JSON.stringify(lines),
  ].join('\n')
}

/** The model's answer → exactly `n` lines; a missing line falls back to the original so timing holds. */
export function parseTranslation(raw: unknown, originals: string[]): string[] {
  let value = raw
  if (typeof value === 'string') {
    const m = /\{[\s\S]*\}|\[[\s\S]*\]/.exec(value)
    try {
      value = m ? JSON.parse(m[0]) : null
    } catch {
      value = null
    }
  }
  const list = Array.isArray(value) ? value : value && typeof value === 'object' && Array.isArray((value as { lines?: unknown }).lines) ? (value as { lines: unknown[] }).lines : null
  if (!list) throw new Error('The translation came back in a shape that could not be read.')
  return originals.map((o, i) => {
    const t = list[i]
    return typeof t === 'string' && t.trim() ? t.trim() : o
  })
}

/* ---------- the pipeline ---------- */

export interface Probe {
  duration: number
  hasVideo: boolean
  hasAudio: boolean
}

export interface DubDeps {
  /** A fresh, empty folder for this run's files. */
  workDir: (id: string) => string
  /** Bring the clip here (download, or copy an archived result). */
  fetchTo: (url: string, path: string) => Promise<void>
  ffmpeg: (args: string[]) => Promise<void>
  probe: (path: string) => Promise<Probe>
  transcribe: (wav: string, outJson: string) => Promise<RawTranscript>
  translate: (prompt: string) => Promise<unknown>
  /** One Kie market job, created and waited for; the result's file URLs and what Kie charged. */
  kie: (model: string, input: Record<string, unknown>, timeoutMs: number) => Promise<{ urls: string[]; credits: number }>
  /** A local file → a URL Kie can fetch. */
  upload: (path: string) => Promise<string>
  /** Where a finished row's files live: an absolute folder and its `media/...` prefix. */
  mediaDir: (taskId: string) => Promise<{ abs: string; rel: string }>
  publish: (item: HistoryItem) => Promise<void>
  save: (run: DubRun) => void
  now: () => number
}

export const TTS_TIMEOUT = 4 * 60_000
export const LIPSYNC_TIMEOUT = 20 * 60_000
/** Segments voiced at once; Kie answers 429 to bigger bursts. */
export const TTS_PARALLEL = 3

const STEP: Record<DubPhase, string> = {
  queued: 'Queued',
  preparing: 'Preparing',
  transcribing: 'Transcribing',
  translating: 'Translating',
  voicing: 'Voicing',
  mixing: 'Mixing',
  lipsync: 'Lip-sync',
  saving: 'Saving',
  done: 'Done',
  failed: 'Failed',
}

function set(run: DubRun, deps: DubDeps, phase: DubPhase, step = STEP[phase]) {
  run.phase = phase
  run.step = step
  run.updatedAt = deps.now()
  deps.save(run)
}

/** Run the whole pipeline for one run; it ends `done` (with a history row) or `failed` (with a reason). */
export async function runDub(run: DubRun, deps: DubDeps): Promise<DubRun> {
  const r = run.request
  const dir = deps.workDir(run.id)
  try {
    set(run, deps, 'preparing')
    const ext = /\.(mp4|mov|webm|mkv|m4v|mp3|wav|m4a|aac|ogg|flac)(?:$|\?)/i.exec(r.clipUrl)?.[1]?.toLowerCase() ?? 'bin'
    const source = join(dir, `source.${ext}`)
    await deps.fetchTo(r.clipUrl, source)
    const probe = await deps.probe(source)
    if (!probe.hasAudio) throw new Error('That clip has no sound to change.')
    if (!(probe.duration > 0)) throw new Error('Could not read how long that clip is.')
    run.duration = round3(probe.duration)
    run.hasVideo = probe.hasVideo
    const lipSync = r.mode === 'translate' && r.lipSync && probe.hasVideo
    if (lipSync && probe.duration > LIPSYNC_MAX_SECONDS) throw new Error(`Lip-sync takes clips up to ${LIPSYNC_MAX_SECONDS / 60} minutes; this one is ${Math.round(probe.duration)} s. Switch Lip-sync off or trim it.`)
    const wav = join(dir, 'speech.wav')
    const bedWav = join(dir, 'original.wav')
    await deps.ffmpeg(extractArgs(source, wav, true))
    await deps.ffmpeg(extractArgs(source, bedWav, false))

    set(run, deps, 'transcribing')
    const transcript = await deps.transcribe(wav, join(dir, 'transcript.json'))
    const segments = cleanSegments(transcript.segments, probe.duration)
    if (!segments.length) throw new Error('No speech was found in that clip.')
    run.segments = segments

    if (r.mode === 'translate') {
      set(run, deps, 'translating')
      const language = languageOf(r.language)?.name ?? r.language ?? 'English'
      const lines = parseTranslation(await deps.translate(translationPrompt(segments, language)), segments.map((s) => s.text))
      segments.forEach((s, i) => (s.line = lines[i]))
    } else {
      for (const s of segments) s.line = s.text
    }
    deps.save(run)

    // One TTS call per line, a few at a time. ElevenLabs failing with Kie's internal error switches the
    // run to Gemini once, and every line is voiced again there so the clip keeps one voice.
    let voicing = firstVoicing(r)
    let clips: string[]
    try {
      clips = await voiceLines(run, deps, dir, segments, voicing)
    } catch (e) {
      const message = (e as Error).message ?? ''
      if (!shouldFallBack(voicing, message)) throw e
      voicing = fallbackVoicing(r)
      run.fallback = message
      try {
        clips = await voiceLines(run, deps, dir, segments, voicing)
      } catch (again) {
        throw new Error(`ElevenLabs was failing and Gemini failed too: ${(again as Error).message}`)
      }
    }
    run.voicedWith = voicing

    set(run, deps, 'mixing')
    const seconds = await Promise.all(clips.map(async (c) => (await deps.probe(c)).duration))
    const plan = assemblyPlan(segments, seconds, probe.duration)
    run.notes = [...(run.fallback ? [FALLBACK_NOTE] : []), ...plan.notes]
    const graph = join(dir, 'mix.txt')
    writeFileSync(graph, mixGraph(plan.entries, segments, { end: probe.hasVideo ? probe.duration : plan.end, bed: r.keepBackground }))
    const track = join(dir, probe.hasVideo ? 'track.m4a' : 'track.mp3')
    await deps.ffmpeg(mixArgs(bedWav, plan.entries.map((p) => clips[p.index]!), graph, track))

    let video: string | null = null
    if (probe.hasVideo) {
      video = join(dir, 'dubbed.mp4')
      await deps.ffmpeg(muxArgs(source, track, video))
    }

    if (lipSync && video) {
      set(run, deps, 'lipsync')
      const [videoUrl, audioUrl] = [await deps.upload(video), await deps.upload(track)]
      const synced = await deps.kie(LIPSYNC_MODEL, lipSyncInput(videoUrl, audioUrl), LIPSYNC_TIMEOUT)
      run.credits = round3(run.credits + synced.credits)
      if (!synced.urls[0]) throw new Error('Lip-sync returned no video.')
      const out = join(dir, 'lipsynced.mp4')
      await deps.fetchTo(synced.urls[0], out)
      video = out
    }

    set(run, deps, 'saving')
    const taskId = `dub-${run.id}`
    const media = await deps.mediaDir(taskId)
    mkdirSync(media.abs, { recursive: true })
    const files: MediaAsset[] = []
    const title = rowTitle(r)
    if (video) {
      copyFileSync(video, join(media.abs, '0.mp4'))
      files.push({ kind: 'video', mimeType: 'video/mp4', localPath: `${media.rel}/0.mp4`, duration: run.duration, title })
    }
    const trackName = track.endsWith('.mp3') ? 'track.mp3' : 'track.m4a'
    copyFileSync(track, join(media.abs, trackName))
    files.push({ kind: 'audio', mimeType: trackName.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4', localPath: `${media.rel}/${trackName}`, duration: run.duration, title })
    await deps.publish(historyRow(run, taskId, files))
    run.taskId = taskId
    run.status = 'done'
    set(run, deps, 'done')
  } catch (e) {
    run.status = 'failed'
    run.error = (e as Error).message || 'The dub stopped with no reason given.'
    set(run, deps, 'failed')
  }
  return run
}

/**
 * Every line in one voice, a few at a time (TTS_PARALLEL); each file lands as line-<i>-<engine>.<ext>.
 * One failed line stops the rest after the line they are on, so no more credits go, and throws.
 */
async function voiceLines(run: DubRun, deps: DubDeps, dir: string, segments: Segment[], voicing: Voicing): Promise<string[]> {
  const clips: string[] = new Array(segments.length)
  const engine = isGeminiModel(voicing.model) ? 'Gemini' : 'ElevenLabs'
  const total = segments.length
  let voiced = 0
  const step = () => `Voicing ${voiced}/${total}${run.fallback ? ' with Gemini' : ''}`
  set(run, deps, 'voicing', step())
  const queue = segments.map((_, i) => i)
  const worker = async () => {
    try {
      for (let i = queue.shift(); i !== undefined; i = queue.shift()) {
        const job = lineJob(voicing, segments[i]!, run.request.language)
        const result = await deps.kie(job.model, job.input, TTS_TIMEOUT)
        run.credits = round3(run.credits + result.credits)
        const url = result.urls[0]
        if (!url) throw new Error(`${engine} returned no audio for line ${i + 1}.`)
        const file = join(dir, lineFile(i, voicing, url))
        await deps.fetchTo(url, file)
        clips[i] = file
        voiced++
        set(run, deps, 'voicing', step())
      }
    } catch (e) {
      queue.length = 0
      throw e
    }
  }
  // allSettled, not all: a fallback must not start while a sibling worker is still voicing on ElevenLabs.
  const results = await Promise.allSettled(Array.from({ length: Math.min(TTS_PARALLEL, total) }, worker))
  const failed = results.find((x): x is PromiseRejectedResult => x.status === 'rejected')
  if (failed) throw failed.reason
  return clips
}

/** "Voice change · clip.mp4", "Translate → Spanish". */
export function rowTitle(r: DubRequest): string {
  if (r.mode === 'translate') return `Translate → ${languageOf(r.language)?.name ?? r.language ?? ''}`.trim()
  return r.name ? `Voice change · ${r.name}` : 'Voice change'
}

/** The finished run as a history row, the shape every other job's result has. */
export function historyRow(run: DubRun, taskId: string, media: MediaAsset[]): HistoryItem {
  const r = run.request
  const script = (run.segments ?? []).map((s) => s.line ?? s.text).join(' ')
  const voiced = run.voicedWith ?? firstVoicing(r)
  return {
    taskId,
    model: DUB_TITLE[r.mode],
    modelId: DUB_MODEL_ID[r.mode],
    category: run.hasVideo ? 'video' : 'audio',
    state: 'success',
    createdAt: run.createdAt,
    operation: 'generate',
    prompt: script,
    media,
    resultUrls: [],
    creditsConsumed: run.credits || undefined,
    input: {
      // The voice and model that actually spoke it; after a fallback, what was asked for stays alongside.
      voice: voiced.voice,
      clip_url: r.clipUrl,
      ...(r.language ? { language: r.language } : {}),
      keep_background: r.keepBackground,
      lip_sync: r.mode === 'translate' && r.lipSync && Boolean(run.hasVideo),
      tts_model: voiced.model,
      ...(run.fallback ? { tts_fallback: true, requested_tts_model: r.model ?? 'market/elevenlabs-tts', requested_voice: r.voice } : {}),
      ...(run.notes?.length ? { notes: run.notes } : {}),
      segments: (run.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text, line: s.line })),
    },
  }
}

/* ---------- the runs this server knows ---------- */

const runs = new Map<string, DubRun>()
let deps: DubDeps | null = null
let loaded = false

export const dubRoot = () => join(studioDir(), 'dub')

/** Runs on disk from before this process: a run still marked running was cut off by a restart. */
function load() {
  if (loaded) return
  loaded = true
  const root = dubRoot()
  if (!existsSync(root)) return
  for (const id of readdirSync(root)) {
    const file = join(root, id, 'run.json')
    if (!existsSync(file)) continue
    try {
      const run = JSON.parse(readFileSync(file, 'utf8')) as DubRun
      if (run.status === 'running') {
        run.status = 'failed'
        run.phase = 'failed'
        run.step = 'Failed'
        run.error = 'Trenchable restarted while this was running. Press Retry to run it again.'
        writeFileSync(file, JSON.stringify(run, null, 1))
      }
      runs.set(run.id, run)
    } catch {
      // A half-written file from a crash: skip it.
    }
  }
}

/** Swap in fakes (tests). */
export function setDubDeps(d: DubDeps | null) {
  deps = d
}

const RECENT_MS = 3 * 24 * 60 * 60 * 1000

/** Running runs and recent failures not dismissed, newest first (what the feed draws). */
export function listRuns(now = Date.now()): DubRun[] {
  load()
  return [...runs.values()].filter((r) => !r.dismissed && (r.status === 'running' || now - r.createdAt < RECENT_MS)).sort((a, b) => b.createdAt - a.createdAt)
}

export const getRun = (id: string) => (load(), runs.get(id))

export function startRun(request: DubRequest, d: DubDeps = deps ?? realDeps()): DubRun {
  load()
  const now = d.now()
  const id = `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`
  const run: DubRun = { id, request, status: 'running', phase: 'queued', step: 'Queued', createdAt: now, updatedAt: now, credits: 0 }
  runs.set(id, run)
  d.save(run)
  void runDub(run, d)
  return run
}

export function dismissRun(id: string, d: DubDeps = deps ?? realDeps()): boolean {
  const run = getRun(id)
  if (!run || run.status === 'running') return false
  run.dismissed = true
  d.save(run)
  return true
}

/* ---------- the real world ---------- */


function exec(cmd: string, args: string[], env?: Record<string, string>, timeoutMs = 15 * 60_000): Promise<string> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { shell: false, windowsHide: true, env: env ? { ...process.env, ...env } : process.env })
    let out = ''
    let err = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stdout.on('data', (b) => (out += String(b)))
    child.stderr.on('data', (b) => (err += String(b)))
    child.on('error', (e) => (clearTimeout(timer), fail(e)))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) ok(out)
      else fail(new Error(`${cmd.split(/[\\/]/).pop()} failed: ${(err || out).trim().split('\n').slice(-3).join(' ').slice(0, 400)}`))
    })
  })
}

function probeFile(path: string): Promise<Probe> {
  return new Promise((ok, fail) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path], { windowsHide: true }, (e, stdout) => {
      if (e) return fail(new Error(`ffprobe could not read the clip: ${e.message.slice(0, 200)}`))
      try {
        const j = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string }[] }
        const types = (j.streams ?? []).map((s) => s.codec_type)
        ok({ duration: Number(j.format?.duration) || 0, hasVideo: types.includes('video'), hasAudio: types.includes('audio') })
      } catch (err) {
        fail(err as Error)
      }
    })
  })
}

async function download(url: string, path: string) {
  if (/^\/?media\//.test(url)) {
    // An archived result: only a real file inside the media root (results-routes' own check).
    const { mediaFile } = await import('./results-routes.ts')
    const abs = mediaFile(`/${url.replace(/^\//, '')}`)
    if (!abs) throw new Error('That clip is no longer on disk.')
    copyFileSync(abs, path)
    return
  }
  let res = await fetch(url)
  if (!res.ok) {
    // Kie's own file links sometimes need its download-url step first.
    const { getDownloadUrl } = await import('../kie/common.ts')
    res = await fetch(await getDownloadUrl(url))
  }
  if (!res.ok) throw new Error(`Could not download ${new URL(url).hostname} (${res.status}).`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
}

async function kieJob(model: string, input: Record<string, unknown>, timeoutMs: number) {
  const { createTask, getTaskDetail } = await import('../kie/market.ts')
  let taskId: string | null = null
  for (let attempt = 0; !taskId; attempt++) {
    try {
      taskId = await createTask({ model, input })
    } catch (e) {
      if (attempt < 4 && /429|rate limit|too many/i.test((e as Error).message)) {
        await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
  const started = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, Date.now() - started > 60_000 ? 5_000 : 2_500))
    let task
    try {
      task = await getTaskDetail(taskId)
    } catch {
      if (Date.now() - started > timeoutMs) throw new Error('Kie stopped answering about this job.')
      continue
    }
    if (task.state === 'success' || task.state === 'partial') return { urls: task.resultUrls, credits: task.creditsConsumed ?? 0 }
    if (task.state === 'fail' || task.state === 'expired') throw new Error(task.failMsg || `Kie reported the job ${task.state}.`)
    if (Date.now() - started > timeoutMs) throw new Error('It took too long on Kie’s side and was stopped.')
  }
}

async function uploadFile(path: string): Promise<string> {
  const { uploadFileStream } = await import('../kie/upload.ts')
  const name = path.split(/[\\/]/).pop()!
  const blob = new Blob([readFileSync(path)], { type: name.endsWith('.mp4') ? 'video/mp4' : name.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4' })
  return (await uploadFileStream(blob, { fileName: name, uploadPath: 'studio-dub' })).fileUrl
}

/**
 * Translation: the LLM set as the default (Settings → AI) when it has a key, else dub-cli.ts, which says
 * how to add one.
 */
async function translateText(prompt: string): Promise<unknown> {
  const { getDefaultLlmModel } = await import('../settings/llmKeys.ts')
  const preferred = getDefaultLlmModel()
  if (preferred) {
    try {
      const { resolveLanguageModel } = await import('../agent/resolveModel.ts')
      const { generateText } = await import('ai')
      const { text } = await generateText({ model: resolveLanguageModel(preferred.provider, preferred.model), prompt })
      return text
    } catch {
      // No key or a failed call: fall through to the CLI.
    }
  }
  return translateWithCli(prompt, join(HERE, 'dub'))
}

export function realDeps(): DubDeps {
  return {
    workDir: (id) => {
      const dir = join(dubRoot(), id)
      mkdirSync(dir, { recursive: true })
      return dir
    },
    fetchTo: download,
    ffmpeg: (args) => exec('ffmpeg', args).then(() => undefined),
    probe: probeFile,
    transcribe: async (wav, outJson) => {
      await exec(dubPython(), ['-I', join(HERE, 'dub', 'transcribe.py'), wav, outJson], { HF_HOME: whisperCache(), HF_HUB_CACHE: join(whisperCache(), 'hub'), HF_HUB_OFFLINE: '1' }, 20 * 60_000)
      return JSON.parse(readFileSync(outJson, 'utf8')) as RawTranscript
    },
    translate: translateText,
    kie: kieJob,
    upload: uploadFile,
    mediaDir: async (taskId) => {
      // Same place archived results live, so /media/<taskId>/... serves them.
      const { getMediaRoot } = await import('../media/archiver.ts')
      return { abs: join(getMediaRoot(), taskId), rel: `media/${taskId}` }
    },
    publish: async (item) => {
      const { upsertHistoryItem } = await import('../db/history.ts')
      upsertHistoryItem(item)
    },
    save: (run) => {
      const dir = join(dubRoot(), run.id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 1))
    },
    now: () => Date.now(),
  }
}
