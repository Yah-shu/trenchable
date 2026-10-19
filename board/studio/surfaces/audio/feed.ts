/**
 * The Audio feed's rules as data: what a row is called (the voice, else the song's title,
 * else the mode), the one line of script it shows, the date groups, the model tag, Kie's
 * failure reasons in plain words, and the waveform's peaks.
 *
 * the reference app lists audio as slim rows — swatch, voice, script, waveform, actions — newest
 * first under a date header, and running and failed jobs take the same row shape. These
 * functions are what AudioFeed.tsx renders; they are tested in feed.test.ts.
 */
import type { HistoryItem, MediaAsset } from '../../api.ts'
import type { Job } from '../../jobs.ts'
import type { DubRun } from './dub.ts'
import { voiceName } from '../../voices.ts'
import { inTab, type AudioTab } from './logic.ts'

type Input = Record<string, unknown> | undefined

const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object') : [])

/** The voices a job used, by name: ElevenLabs `voice` ids, Dialogue's lines, Gemini's speakers. */
export function voicesOf(input: Input): string[] {
  const out: string[] = []
  const add = (v: unknown) => {
    const id = text(v)
    if (!id) return
    const name = voiceName(id)
    if (!out.includes(name)) out.push(name)
  }
  if (!input) return out
  add(input.voice)
  add(input.voice_id)
  for (const line of records(input.dialogue)) add(line.voice)
  for (const s of records(input.speakers)) add(s.voice_name)
  return out
}

/** "James", "James & Bella", "James, Bella +1". */
export const joinNames = (names: string[]): string => (names.length <= 2 ? names.join(' & ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`)

/** What each tab's work is called when nothing better names it. */
export function modeName(item: Pick<HistoryItem, 'modelId' | 'provider'>): string {
  if (item.modelId === 'suno/lyrics') return 'Lyrics'
  if (inTab('tts', item as HistoryItem)) return 'Speech'
  if (inTab('dialogue', item as HistoryItem)) return 'Dialogue'
  if (inTab('music', item as HistoryItem)) return 'Song'
  if (inTab('isolate', item as HistoryItem)) return 'Isolated voice'
  if (inTab('change', item as HistoryItem)) return 'Voice change'
  if (inTab('translate', item as HistoryItem)) return 'Translate'
  return 'Audio'
}

/** A row's name: the voice(s), else the track's own title (Suno makes two per job), else the mode. */
export function rowTitle(input: Input, item: Pick<HistoryItem, 'modelId' | 'provider'> & { media?: HistoryItem['media'] }, media?: MediaAsset): string {
  const voices = voicesOf(input)
  if (voices.length) return joinNames(voices)
  const title = text(media?.title) || text(item.media?.find((m) => m.kind === 'audio')?.title) || text(input?.title)
  return title || modeName(item)
}

/** One line of what was said or asked for: the prompt, else the script or lines in the input. */
export function scriptOf(input: Input, prompt?: string): string {
  const p = text(prompt)
  if (p) return p
  if (!input) return ''
  for (const key of ['text', 'prompt', 'script', 'lyrics']) {
    const v = text(input[key])
    if (v) return v
  }
  const lines = [...records(input.dialogue), ...records(input.dialogue_turns)].map((l) => text(l.text)).filter(Boolean)
  return lines.join(' / ')
}

/** "Gemini 2.5 Pro Text to Speech" → "Gemini 2.5 Pro"; the tab already says it is speech. */
export function modelTag(title?: string): string {
  const t = text(title)
  return t.replace(/\s*[-–—·:|]?\s*(text[\s-]+to[\s-]+speech|tts)\s*$/i, '').trim() || t
}

/** Audio models whose catalogue title is a bare slug ("elevenlabs/text-to-speech-turbo-2-5"), named as the rails name them. */
const AUDIO_TITLES: Record<string, string> = {
  'elevenlabs/text-to-speech-turbo-2-5': 'ElevenLabs Turbo 2.5',
  'elevenlabs/text-to-speech-multilingual-v2': 'ElevenLabs Multilingual v2',
  'elevenlabs/audio-isolation': 'ElevenLabs Isolation',
}

/** A title that is really an id: one word with a slash or dash in it. */
const isSlug = (t: string) => !/\s/.test(t) && /[/_-]/.test(t)

/** "elevenlabs/text-to-speech-turbo-2-5" → "Elevenlabs text to speech turbo 2 5", when nothing better is known. */
const slugWords = (id: string) => {
  const words = id.replace(/^[^/]+\//, '').replace(/[-_/]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * A row's model tag and its tooltip. Other tools that send jobs label them
 * "Tool · project · scene" — too long for a tag — and a few catalogue titles are bare slugs,
 * so both read as the model's own name, by id; a tool's label stays in the tooltip.
 */
export function tagOf(modelId: string | undefined, title: string | undefined, catalogue?: { id: string; title: string }[] | null): { tag: string; tip: string } {
  const label = text(title)
  const known = modelId ? AUDIO_TITLES[modelId] : undefined
  const fromCatalogue = text(catalogue?.find((m) => m.id === modelId)?.title)
  const named = known ?? (fromCatalogue && !isSlug(fromCatalogue) ? fromCatalogue : '')
  const tool = label.includes(' · ')
  if (label && !tool && !isSlug(label) && !known) return { tag: modelTag(label), tip: label }
  const tag = modelTag(named) || (modelId ? slugWords(modelId) : '') || modelTag(label)
  return { tag, tip: tool ? label : named || label || tag }
}

/** Kie's failure messages, said the way a person would. */
export function plainReason(msg?: string): string {
  const m = text(msg)
  if (!m) return 'Kie gave no reason.'
  if (/internal error|server error|try again later/i.test(m)) return 'Kie had an internal error — nothing wrong with your settings. Try again.'
  if (/sensitive|nsfw|content polic|guardrail|moderation|violat/i.test(m)) return "Kie's content filter stopped it. Reword the script and try again."
  if (/time[ds]?\s?out|timed out|took too long/i.test(m)) return 'It took too long on Kie’s side and was stopped.'
  if (/insufficient|balance|not enough credits/i.test(m)) return 'Not enough Kie credits for this one.'
  if (/fetch failed|download failed|access settings|file upload api/i.test(m)) return 'Kie could not open the attached file. Attach it again and retry.'
  return m[0]!.toUpperCase() + m.slice(1)
}

/* ---------- the feed's order ---------- */

export type Entry =
  | { kind: 'job'; job: Job; at: number; key: string }
  | { kind: 'failed' | 'done'; item: HistoryItem; at: number; key: string }
  | { kind: 'dub'; run: DubRun; at: number; key: string }

/**
 * Running and failed jobs, the server's dub runs still going or failed (Voice change, Translate),
 * recent failures and finished results as one list, newest first.
 */
export function feedEntries(jobs: Job[], failed: HistoryItem[], done: HistoryItem[], dubs: DubRun[] = []): Entry[] {
  const out: Entry[] = [
    ...jobs.map((job) => ({ kind: 'job' as const, job, at: job.startedAt, key: job.id })),
    ...dubs.filter((run) => run.status !== 'done').map((run) => ({ kind: 'dub' as const, run, at: run.createdAt, key: `dub:${run.id}` })),
    ...failed.map((item) => ({ kind: 'failed' as const, item, at: item.createdAt, key: item.taskId })),
    ...done.map((item) => ({ kind: 'done' as const, item, at: item.createdAt, key: item.taskId })),
  ]
  return out.sort((a, b) => b.at - a.at)
}

/** "October 16, 2026". */
export const dayLabel = (ms: number): string => new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

/** A newest-first list cut into its days, in order. */
export function byDay<T>(list: T[], at: (t: T) => number): { day: string; items: T[] }[] {
  const out: { day: string; items: T[] }[] = []
  for (const t of list) {
    const day = dayLabel(at(t))
    const last = out[out.length - 1]
    if (last?.day === day) last.items.push(t)
    else out.push({ day, items: [t] })
  }
  return out
}

/** A queued job belongs to the tab its model belongs to (every Audio tab shares one surface). */
export const jobInTab = (tab: AudioTab, job: Pick<Job, 'modelId' | 'provider'>): boolean => inTab(tab, { modelId: job.modelId, provider: job.provider } as HistoryItem)

/* ---------- the waveform ---------- */

export const PEAKS = 120

/**
 * Decoded samples → `n` bars between 0 and 1: the loudest sample in each slice across every
 * channel, scaled to the loudest bar, with a floor so silence still draws a hairline.
 */
export function peaksOf(channels: ArrayLike<number>[], n = PEAKS): number[] {
  const length = channels[0]?.length ?? 0
  if (!length || n <= 0) return Array.from({ length: Math.max(0, n) }, () => 0)
  const size = length / n
  const raw: number[] = []
  for (let i = 0; i < n; i++) {
    const from = Math.floor(i * size)
    const to = Math.max(from + 1, Math.floor((i + 1) * size))
    // Every sample of a long song is ~10M reads; a stride keeps it under a few ms.
    const step = Math.max(1, Math.floor((to - from) / 400))
    let peak = 0
    for (const ch of channels) {
      for (let j = from; j < to && j < length; j += step) {
        const v = Math.abs(ch[j] ?? 0)
        if (v > peak) peak = v
      }
    }
    raw.push(peak)
  }
  const top = Math.max(...raw)
  return raw.map((p) => (top > 0 ? Math.max(0.04, p / top) : 0))
}

/** "0:07", "3:12". */
export const clockOf = (s?: number | null): string => (s != null && Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '')
