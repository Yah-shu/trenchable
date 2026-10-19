// The Audio feed's rules: what a row is called and says, the date groups and order, the model
// tag, Kie's failure reasons in plain words, which tab a queued job belongs to, and the peaks.
// Inputs are shaped like history rows: Gemini 2.5 Pro speakers/turns, ElevenLabs `text` + `voice` id
// with an empty `prompt`.
import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '../../api.ts'
import type { Job } from '../../jobs.ts'
import { byDay, clockOf, dayLabel, feedEntries, jobInTab, joinNames, modeName, modelTag, peaksOf, plainReason, rowTitle, scriptOf, tagOf, voicesOf } from './feed.ts'

const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({ taskId: 't', model: 'M', category: 'audio', state: 'success', createdAt: 0, ...over })
const job = (over: Partial<Job> = {}): Job =>
  ({ id: 'j', taskId: null, modelId: 'market/elevenlabs-tts', modelTitle: 'ElevenLabs', category: 'audio', provider: 'market', operation: 'generate', input: {}, prompt: '', meta: { surface: 'audio' }, status: 'running', startedAt: 0, ...over }) as Job

const gemini = {
  speakers: [{ speaker_id: 'Speaker 1', voice_name: 'Vindemiatrix', pace: 'Natural' }],
  dialogue_turns: [{ speaker_id: 'Speaker 1', text: 'The kettle is on.' }, { speaker_id: 'Speaker 1', text: 'Tea is ready.' }],
}
const eleven = { text: 'The kettle is on.\n\nTea is  ready.', voice: 'hpp4J3VqNfWAUOO0d1Us', speed: 1.05 }

describe('what a row says', () => {
  it('names the voices: ElevenLabs ids, Gemini speakers, Dialogue lines (once each)', () => {
    expect(voicesOf(eleven)).toEqual(['Bella'])
    expect(voicesOf(gemini)).toEqual(['Vindemiatrix'])
    expect(voicesOf({ dialogue: [{ voice: 'EkK5I93UQWFDigLMpZcX', text: 'a' }, { voice: 'hpp4J3VqNfWAUOO0d1Us', text: 'b' }, { voice: 'EkK5I93UQWFDigLMpZcX', text: 'c' }] })).toEqual(['James', 'Bella'])
    expect(voicesOf(undefined)).toEqual([])
    expect(joinNames(['A'])).toBe('A')
    expect(joinNames(['A', 'B'])).toBe('A & B')
    expect(joinNames(['A', 'B', 'C', 'D'])).toBe('A, B +2')
  })

  it('falls back to the track title, then the mode', () => {
    const song = item({ modelId: 'suno/music', provider: 'suno', media: [{ kind: 'audio', url: 'x', title: 'Night Train' }, { kind: 'audio', url: 'y', title: 'Night Train (2)' }] })
    expect(rowTitle(song.input, song)).toBe('Night Train')
    expect(rowTitle(song.input, song, song.media![1])).toBe('Night Train (2)')
    expect(rowTitle(undefined, item({ modelId: 'elevenlabs/audio-isolation' }))).toBe('Isolated voice')
    expect(rowTitle(undefined, item({ modelId: 'suno/lyrics', provider: 'suno' }))).toBe('Lyrics')
    expect(modeName({ modelId: 'google/gemini-2-5-pro-tts' })).toBe('Speech')
    expect(modeName({ modelId: 'elevenlabs/text-to-dialogue-v3' })).toBe('Dialogue')
    expect(modeName({ modelId: 'something/else' })).toBe('Audio')
  })

  it('shows one line of script: the prompt, else the text, else the lines', () => {
    expect(scriptOf(eleven, '')).toBe('The kettle is on. Tea is ready.')
    expect(scriptOf(gemini)).toBe('The kettle is on. / Tea is ready.')
    expect(scriptOf({ text: 'ignored' }, '  A prompt  ')).toBe('A prompt')
    expect(scriptOf({ dialogue: [{ text: 'Hi', voice: 'x' }, { text: 'Hello', voice: 'y' }] })).toBe('Hi / Hello')
    expect(scriptOf(undefined)).toBe('')
  })

  it('shortens the model tag', () => {
    expect(modelTag('Gemini 2.5 Pro Text to Speech')).toBe('Gemini 2.5 Pro')
    expect(modelTag('ElevenLabs - Text-to-Speech')).toBe('ElevenLabs')
    expect(modelTag('Gemini 3.8 Flash TTS')).toBe('Gemini 3.8 Flash')
    expect(modelTag('Suno — Create a song')).toBe('Suno — Create a song')
    expect(modelTag('Text to Speech')).toBe('Text to Speech')
  })

  it('names the model by its own name when the title is a slug or a tool’s label', () => {
    const catalogue = [
      { id: 'market/elevenlabs-tts', title: 'ElevenLabs — Narration' },
      { id: 'elevenlabs/text-to-speech-turbo-2-5', title: 'elevenlabs/text-to-speech-turbo-2-5' },
    ]
    // A pending Turbo job: its catalogue title is the bare id (seen 2026-10-16).
    expect(tagOf('elevenlabs/text-to-speech-turbo-2-5', 'elevenlabs/text-to-speech-turbo-2-5', catalogue)).toEqual({ tag: 'ElevenLabs Turbo 2.5', tip: 'ElevenLabs Turbo 2.5' })
    // Another tool's rows carry its own label as the model; the tag reads the model, the tooltip keeps the label.
    const label = 'Planner · Spring promo · 1. Opening line'
    expect(tagOf('market/elevenlabs-tts', label, catalogue)).toEqual({ tag: 'ElevenLabs — Narration', tip: label })
    expect(tagOf('elevenlabs/text-to-speech-multilingual-v2', label, null)).toEqual({ tag: 'ElevenLabs Multilingual v2', tip: label })
    // Ordinary titles stay as they were, shortened.
    expect(tagOf('google/gemini-2-5-pro-tts', 'Gemini 2.5 Pro Text to Speech', catalogue)).toEqual({ tag: 'Gemini 2.5 Pro', tip: 'Gemini 2.5 Pro Text to Speech' })
    expect(tagOf('studio/voice-change', 'Voice change', catalogue).tag).toBe('Voice change')
    expect(tagOf(undefined, 'Translate', null).tag).toBe('Translate')
    // Nothing better known: the id read as words.
    expect(tagOf('acme/some-new-voice', 'acme/some-new-voice', catalogue).tag).toBe('Some new voice')
    expect(tagOf(undefined, undefined, null).tag).toBe('')
  })

  it('says Kie’s failures in plain words', () => {
    expect(plainReason('Internal Error, Please try again later.')).toMatch(/internal error — nothing wrong with your settings/)
    expect(plainReason("We’re so sorry, but the prompt may violate OpenAI's guardrails")).toMatch(/content filter/)
    expect(plainReason('image fetch failed. Check access settings or use our File Upload API instead.')).toMatch(/could not open the attached file/)
    expect(plainReason('')).toBe('Kie gave no reason.')
    expect(plainReason('voice id unknown')).toBe('Voice id unknown')
  })
})

describe('the feed’s order', () => {
  const day = (d: number, h = 12) => new Date(2026, 9, d, h).getTime()

  it('puts jobs, failures and results in one newest-first list', () => {
    const list = feedEntries([job({ id: 'j1', startedAt: day(16, 14) })], [item({ taskId: 'f1', state: 'fail', createdAt: day(16, 9) })], [item({ taskId: 'd1', createdAt: day(16, 10) }), item({ taskId: 'd0', createdAt: day(15) })])
    expect(list.map((e) => e.key)).toEqual(['j1', 'd1', 'f1', 'd0'])
    expect(list.map((e) => e.kind)).toEqual(['job', 'done', 'failed', 'done'])
  })

  it('groups by day under "October 16, 2026"', () => {
    expect(dayLabel(day(16))).toBe('October 16, 2026')
    const groups = byDay([day(16, 20), day(16, 1), day(15, 23), day(3)], (t) => t)
    expect(groups.map((g) => [g.day, g.items.length])).toEqual([
      ['October 16, 2026', 2],
      ['October 15, 2026', 1],
      ['October 3, 2026', 1],
    ])
  })

  it('keeps each queued job in its own tab', () => {
    expect(jobInTab('tts', job({ modelId: 'market/elevenlabs-tts' }))).toBe(true)
    expect(jobInTab('dialogue', job({ modelId: 'market/elevenlabs-tts' }))).toBe(false)
    expect(jobInTab('music', job({ modelId: 'suno/music', provider: 'suno' }))).toBe(true)
    expect(jobInTab('isolate', job({ modelId: 'elevenlabs/audio-isolation' }))).toBe(true)
  })
})

describe('the waveform', () => {
  it('turns samples into n bars scaled to the loudest, with a floor for quiet ones', () => {
    const samples = Float32Array.from({ length: 1200 }, (_, i) => (i < 600 ? 0.5 : -1) * (i % 2 ? 1 : 0.2))
    const bars = peaksOf([samples], 12)
    expect(bars).toHaveLength(12)
    expect(bars.slice(0, 6).every((b) => b === 0.5)).toBe(true)
    expect(bars.slice(6).every((b) => b === 1)).toBe(true)
    expect(peaksOf([Float32Array.from([0, 0.001, 0, 1])], 4)).toEqual([0.04, 0.04, 0.04, 1])
  })

  it('takes the loudest of every channel, and draws silence flat', () => {
    expect(peaksOf([Float32Array.from([0.2, 0.2]), Float32Array.from([0.1, 0.8])], 2)).toEqual([0.25, 1])
    expect(peaksOf([new Float32Array(8)], 4)).toEqual([0, 0, 0, 0])
    expect(peaksOf([], 3)).toEqual([0, 0, 0])
  })

  it('stretches a short curve (a provider’s own waveform) to n bars', () => {
    expect(peaksOf([[0.5, 1]], 4)).toEqual([0.5, 0.5, 1, 1])
  })

  it('reads clock times', () => {
    expect(clockOf(7.9)).toBe('0:07')
    expect(clockOf(192)).toBe('3:12')
    expect(clockOf(undefined)).toBe('')
    expect(clockOf(Number.NaN)).toBe('')
  })
})
