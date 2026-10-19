/**
 * Voice change and Translate, client side: the dub runs the server is working on (server/studio/dub.ts),
 * what one costs before it runs, and the languages ElevenLabs Multilingual v2 speaks.
 *
 * A dub is not one Kie task, so it isn't in jobs.ts: the server runs it and keeps its phase, and this
 * module polls GET /api/studio/dub while any run is going (2.5 s), then refreshes history once a run
 * lands so its result row takes the pending row's place.
 */
import { useEffect, useSyncExternalStore } from 'react'
import { refreshHistory, type ModelDefinition } from '../../api.ts'
import { rowsForModel, type PriceRow } from '../../pricing.ts'

export type DubMode = 'change' | 'translate'

/** The speech models a dub can voice with (server/studio/dub.ts DUB_TTS_MODELS), as the Speech model row lists them. */
export const DUB_TTS_MODELS = [
  { value: 'market/elevenlabs-tts', label: 'ElevenLabs Multilingual v2', sub: 'Best voices, 29 languages' },
  { value: 'elevenlabs/text-to-speech-turbo-2-5', label: 'ElevenLabs Turbo 2.5', sub: 'Half the price, faster' },
  { value: 'google/gemini-3-1-flash-tts', label: 'Gemini 3.1 Flash', sub: 'Google voices, many languages, cheapest' },
]
export const GEMINI_DUB_MODEL = 'google/gemini-3-1-flash-tts'
export const isGeminiDub = (model?: string) => model === GEMINI_DUB_MODEL

/** What a row says when a run switched engines (the server's FALLBACK_NOTE). */
export const FALLBACK_NOTE = 'Voiced with Gemini — ElevenLabs was failing.'

export interface DubRequest {
  mode: DubMode
  clipUrl: string
  /** An ElevenLabs voice id, or a Gemini voice name when `model` is Gemini. */
  voice: string
  /** The Gemini voice an ElevenLabs run switches to if ElevenLabs fails. */
  fallbackVoice?: string
  language?: string
  keepBackground: boolean
  lipSync: boolean
  model?: string
  name?: string
}

/** What the server says about a run (server/studio/dub.ts `DubRun`, the fields the feed reads). */
export interface DubRun {
  id: string
  request: DubRequest
  status: 'running' | 'done' | 'failed'
  phase: string
  step: string
  createdAt: number
  updatedAt: number
  error?: string
  taskId?: string
  credits: number
  duration?: number
  hasVideo?: boolean
  segments?: { start: number; end: number; text: string; line?: string }[]
  notes?: string[]
  /** The model and voice that voiced it; differs from the request after a fallback. */
  voicedWith?: { model: string; voice: string }
  /** Set once ElevenLabs failed and the run switched to Gemini: the error that caused it. */
  fallback?: string
}

export const DUB_MODEL_ID: Record<DubMode, string> = { change: 'studio/voice-change', translate: 'studio/translate' }

/** ElevenLabs Multilingual v2's 29 languages — the server checks against its own copy (dub.ts LANGUAGES). */
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

export const languageLabel = (code?: string) => {
  const l = LANGUAGES.find((x) => x.code === code)
  return l ? `${l.flag} ${l.name}` : (code ?? '')
}

/* ---------- what a dub costs ---------- */

/** About how fast people talk in a clip; the real count comes from the transcript. */
export const SPOKEN_CHARS_PER_SECOND = 15

export interface DubPrices {
  /** Credits per 1,000 characters of speech. */
  perThousandChars: number | null
  /** Credits per second of lip-synced video. */
  lipPerSecond: number | null
}

/**
 * Gemini TTS is priced per million tokens — text in, audio out — and Google counts 25 audio tokens a
 * second; speech comes out at about 14 characters a second.
 */
export const GEMINI_AUDIO_TOKENS_PER_SECOND = 25
/** About four characters to a text token. */
export const CHARS_PER_TOKEN = 4

/** Gemini's two token prices as credits per 1,000 characters of speech, so it compares with ElevenLabs'. */
export function geminiPerThousandChars(inputPerMillion: number | null, outputPerMillion: number): number {
  const seconds = 1000 / SPOKEN_CHARS_PER_SECOND
  const out = (seconds * GEMINI_AUDIO_TOKENS_PER_SECOND * outputPerMillion) / 1e6
  const inp = ((1000 / CHARS_PER_TOKEN) * (inputPerMillion ?? 0)) / 1e6
  return Math.round((out + inp) * 100) / 100
}

/** Kie's price rows for the speech model and the lip-sync model, as the two numbers a dub needs. */
export function dubPrices(rows: PriceRow[], tts: ModelDefinition | null, lip: ModelDefinition | null): DubPrices {
  const ttsRows = tts ? rowsForModel(tts, rows) : []
  const ttsRow = ttsRows.find((r) => /1,?000\s*char|per\s*1k|characters?/i.test(`${r.unitText} ${r.description}`))
  let perThousandChars = ttsRow?.credits ?? null
  if (perThousandChars == null) {
    const tokens = ttsRows.filter((r) => /million tokens/i.test(r.unitText))
    const output = tokens.find((r) => /output/i.test(r.description))
    // The matcher can leave the input row out; it sits on the same price page as the output one.
    const input = tokens.find((r) => /input/i.test(r.description)) ?? rows.find((r) => output && r.page === output.page && /million tokens/i.test(r.unitText) && /input/i.test(r.description))
    if (output) perThousandChars = geminiPerThousandChars(input?.credits ?? null, output.credits)
  }
  const lipRow = lip ? rowsForModel(lip, rows).find((r) => r.unit === 'second') : undefined
  return { perThousandChars, lipPerSecond: lipRow?.credits ?? null }
}

/**
 * Credits one dub will take, from the clip's length: its speech (about 15 characters a second) at the
 * TTS price, plus lip-sync per second when on. null until the clip's length and the prices are known.
 */
export function estimateDub(seconds: number | null, prices: DubPrices, lipSync: boolean): { credits: number; detail: string } | null {
  if (!seconds || seconds <= 0 || prices.perThousandChars == null) return null
  const chars = Math.round(seconds * SPOKEN_CHARS_PER_SECOND)
  const speech = (chars / 1000) * prices.perThousandChars
  const parts = [`speech ≈ ${chars.toLocaleString()} characters × ${prices.perThousandChars}/1,000`]
  let credits = speech
  if (lipSync) {
    if (prices.lipPerSecond == null) return null
    credits += seconds * prices.lipPerSecond
    parts.push(`lip-sync ${prices.lipPerSecond}/s × ${Math.round(seconds)} s`)
  }
  const rounded = Math.max(0.1, Math.round(credits * 10) / 10)
  return { credits: rounded, detail: `About ${rounded} credits — ${parts.join(' + ')} (Kie price list; the transcript sets the real count). Transcribing and mixing run on this computer, free.` }
}

/* ---------- talking to the server ---------- */

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok || body.data === undefined) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.data
}

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })

export const dubApi = {
  start: (r: DubRequest) => call<DubRun>('/api/studio/dub', json('POST', r)),
  list: () => call<{ runs: DubRun[] }>('/api/studio/dub'),
  retry: (id: string) => call<DubRun>(`/api/studio/dub/${encodeURIComponent(id)}/retry`, json('POST')),
  dismiss: (id: string) => call<{ ok: boolean }>(`/api/studio/dub/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

/* ---------- the runs, shared by every Audio tab ---------- */

let runs: DubRun[] = []
const listeners = new Set<() => void>()
let timer: number | null = null
let users = 0

function emit(next: DubRun[]) {
  const landed = runs.some((r) => r.status === 'running' && next.some((n) => n.id === r.id && n.status === 'done'))
  runs = next
  for (const l of listeners) l()
  if (landed) void refreshHistory()
}

/** Ask the server again; while anything runs, keep asking every 2.5 s. */
export async function pollDubs() {
  if (timer !== null) window.clearTimeout(timer)
  timer = null
  try {
    emit((await dubApi.list()).runs)
  } catch {
    // The server restarting is not a failed dub; try again shortly.
  }
  if (users > 0 && runs.some((r) => r.status === 'running')) timer = window.setTimeout(() => void pollDubs(), 2_500)
}

/** Put a run the server just accepted straight in, then keep polling. */
export function addDub(run: DubRun) {
  emit([run, ...runs.filter((r) => r.id !== run.id)])
  void pollDubs()
}

export function dropDub(id: string) {
  emit(runs.filter((r) => r.id !== id))
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** The server's dub runs (running and recent failures), polled while a tab that shows them is open. */
export function useDubRuns(on = true): DubRun[] {
  useEffect(() => {
    if (!on) return
    users++
    void pollDubs()
    return () => {
      users--
    }
  }, [on])
  return useSyncExternalStore(subscribe, () => runs, () => runs)
}
