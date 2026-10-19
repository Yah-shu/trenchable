import { describe, expect, it } from 'vitest'
import type { HistoryItem, ModelDefinition } from '../../api.ts'
import type { PriceRow } from '../../pricing.ts'
import { dubPrices, estimateDub, geminiPerThousandChars, languageLabel, LANGUAGES, type DubRun } from './dub.ts'
import { feedEntries, modeName } from './feed.ts'
import { inTab } from './logic.ts'

const model = (id: string, kie: string): ModelDefinition => ({ id, model: kie, title: id, category: 'audio', provider: 'market', fields: [] }) as unknown as ModelDefinition

const rows: PriceRow[] = [
  { modelId: 'elevenlabs/text-to-speech-multilingual-v2', description: 'Elevenlabs Text to Speech, multilingual v2', credits: 12, unit: 'other', unitText: 'per 1000 characters' },
  { modelId: 'volcengine/video-to-video-lip-sync', description: 'Volcengine lip sync', credits: 8, unit: 'second', unitText: 'per second' },
]

describe('dub cost', () => {
  const prices = dubPrices(rows, model('market/elevenlabs-tts', 'elevenlabs/text-to-speech-multilingual-v2'), model('market/volcengine-lip-sync', 'volcengine/video-to-video-lip-sync'))

  it('reads the speech and lip-sync prices off Kie’s list', () => {
    expect(prices).toEqual({ perThousandChars: 12, lipPerSecond: 8 })
  })

  it('prices speech from the clip length and adds lip-sync per second', () => {
    // 10 s ≈ 150 characters → 1.8 credits; lip-sync 80 more.
    expect(estimateDub(10, prices, false)?.credits).toBe(1.8)
    expect(estimateDub(10, prices, true)?.credits).toBe(81.8)
    expect(estimateDub(10, prices, true)?.detail).toMatch(/lip-sync 8\/s × 10 s/)
  })

  it('turns Gemini’s per-million-token prices into credits per 1,000 characters', () => {
    // Kie's real rows for 3.1 Flash: 140 in, 2,800 audio out, per million tokens; no model id, only the page.
    const gemini: PriceRow[] = [
      { modelId: null, page: 'gemini-3.1-flash-tts', description: 'Gemini 3.1 Flash TTS, Text to Speech, Audio Output', credits: 2800, unit: 'other', unitText: 'per million tokens' },
      { modelId: null, page: 'gemini-3.1-flash-tts', description: 'Gemini 3.1 Flash TTS, Text to Speech, input', credits: 140, unit: 'other', unitText: 'per million tokens' },
    ] as PriceRow[]
    // 1,000 characters ≈ 66.7 s of speech × 25 tokens × 2,800/M = 4.67, plus 250 text tokens × 140/M.
    expect(geminiPerThousandChars(140, 2800)).toBe(4.7)
    expect(dubPrices(gemini, model('google/gemini-3-1-flash-tts', 'google/gemini-3-1-flash-tts'), null).perThousandChars).toBe(4.7)
    expect(estimateDub(10, { perThousandChars: 4.7, lipPerSecond: null }, false)?.credits).toBe(0.7)
  })

  it('has no number until the clip and prices are known', () => {
    expect(estimateDub(null, prices, false)).toBeNull()
    expect(estimateDub(5, { perThousandChars: null, lipPerSecond: 8 }, false)).toBeNull()
    expect(estimateDub(5, { perThousandChars: 12, lipPerSecond: null }, true)).toBeNull()
  })
})

describe('dub rows in the Audio feed', () => {
  const run = (id: string, status: DubRun['status'], createdAt: number): DubRun => ({ id, status, createdAt, updatedAt: createdAt, phase: status, step: 'Voicing 1/3', credits: 0, request: { mode: 'change', clipUrl: 'https://x/a.mp4', voice: 'abcdefgh', keepBackground: true, lipSync: false } })
  const item = (taskId: string, modelId: string, createdAt: number) => ({ taskId, modelId, model: modelId, category: 'video', state: 'success', createdAt }) as HistoryItem

  it('files results under their own tab, whatever category they landed in', () => {
    expect(inTab('change', item('dub-1', 'studio/voice-change', 1))).toBe(true)
    expect(inTab('translate', item('dub-1', 'studio/voice-change', 1))).toBe(false)
    expect(inTab('translate', item('dub-2', 'studio/translate', 1))).toBe(true)
    expect(modeName({ modelId: 'studio/translate' })).toBe('Translate')
  })

  it('shows running and failed runs among the results, newest first, but not finished ones', () => {
    const entries = feedEntries([], [], [item('dub-old', 'studio/voice-change', 10)], [run('a', 'running', 30), run('b', 'failed', 20), run('c', 'done', 40)])
    expect(entries.map((e) => e.key)).toEqual(['dub:a', 'dub:b', 'dub-old'])
  })
})

describe('languages', () => {
  it('lists the 29 Multilingual v2 languages with a flag', () => {
    expect(LANGUAGES).toHaveLength(29)
    expect(new Set(LANGUAGES.map((l) => l.code)).size).toBe(29)
    expect(languageLabel('es')).toBe('🇪🇸 Spanish')
    expect(languageLabel('xx')).toBe('xx')
  })
})
