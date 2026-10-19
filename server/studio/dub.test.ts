import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '../../src/lib/models/types.ts'
import {
  TEMPO_MAX,
  TEMPO_MIN,
  assemblyPlan,
  clampTempo,
  FALLBACK_NOTE,
  cleanSegments,
  duckExpression,
  fallbackVoicing,
  firstVoicing,
  fitClip,
  geminiTtsInput,
  lineFile,
  lineJob,
  lineBudget,
  lipSyncInput,
  mixArgs,
  mixGraph,
  muxArgs,
  parseTranslation,
  requestProblem,
  shouldFallBack,
  speedFor,
  runDub,
  translationPrompt,
  ttsInput,
  type DubDeps,
  type DubRequest,
  type DubRun,
  type Segment,
} from './dub.ts'

describe('fitting a voiced line', () => {
  it('clamps the tempo to 0.75–1.35', () => {
    expect(clampTempo(2)).toBe(TEMPO_MAX)
    expect(clampTempo(0.3)).toBe(TEMPO_MIN)
    expect(clampTempo(1.1)).toBe(1.1)
    expect(clampTempo(NaN)).toBe(1)
  })

  it('leaves a near fit alone, speeds a long line up and slows a short one down', () => {
    expect(fitClip(2.05, 2)).toEqual({ tempo: 1, length: 2.05, pad: 0, over: 0.05 })
    expect(fitClip(2.4, 2)).toMatchObject({ tempo: 1.2, length: 2, pad: 0, over: 0 })
    expect(fitClip(1.6, 2)).toMatchObject({ tempo: 0.8, length: 2, pad: 0 })
  })

  it('pads what the clamp cannot fill and reports what still runs long', () => {
    expect(fitClip(1, 2)).toMatchObject({ tempo: 0.75, length: 1.333, pad: 0.667, over: 0 })
    expect(fitClip(4, 2)).toMatchObject({ tempo: 1.35, length: 2.963, pad: 0, over: 0.963 })
  })
})

describe('segments', () => {
  it('drops blanks, keeps times in the clip and folds tiny lines into their neighbour', () => {
    const out = cleanSegments(
      [
        { start: 0, end: 2, text: ' Hello there ' },
        { start: 2.1, end: 2.5, text: 'so,' },
        { start: 3.5, end: 3.6, text: '   ' },
        { start: 4, end: 9, text: 'a longer line that runs past the end' },
      ],
      8,
    )
    expect(out).toEqual([
      { start: 0, end: 2.5, text: 'Hello there so,' },
      { start: 4, end: 8, text: 'a longer line that runs past the end' },
    ])
  })

  it('never lets two segments overlap', () => {
    const out = cleanSegments([{ start: 0, end: 3, text: 'one' }, { start: 2.5, end: 5, text: 'two' }], 10)
    expect(out[1]!.start).toBe(3)
  })
})

describe('assembly plan', () => {
  const segs: Segment[] = [
    { start: 0, end: 2, text: 'a' },
    { start: 3, end: 5, text: 'b' },
    { start: 5.1, end: 6, text: 'c' },
  ]

  it('puts each line at its segment, fitted to it', () => {
    const { entries, end, notes } = assemblyPlan(segs, [2, 2.2, 0.9], 8)
    expect(entries.map((e) => [e.start, e.tempo])).toEqual([
      [0, 1],
      [3, 1.1],
      [5.1, 1],
    ])
    expect(end).toBe(8)
    expect(notes).toEqual([])
  })

  it('lets a long line borrow the pause before the next one at a gentler speed', () => {
    // 3 s of speech for a 2 s segment with 1 s of pause after it: 1.0× fits the 3 s of room.
    const { entries } = assemblyPlan(segs, [3, 2, 0.9], 8)
    expect(entries[0]).toMatchObject({ start: 0, tempo: 1, length: 3 })
    expect(entries[1]!.start).toBe(3)
  })

  it('makes the next line wait rather than talk over it, and says so', () => {
    const { entries, notes } = assemblyPlan(segs, [2, 4, 0.9], 8)
    expect(entries[1]).toMatchObject({ tempo: TEMPO_MAX })
    expect(entries[2]!.start).toBeGreaterThan(5.1)
    expect(notes.join(' ')).toMatch(/longer than its slot/)
    expect(notes.join(' ')).toMatch(/starts a little late/)
  })

  it('skips lines with no audio and grows past the clip when the voice runs on', () => {
    const { entries, end } = assemblyPlan([{ start: 0, end: 1, text: 'x' }], [3], 1)
    expect(entries[0]!.tempo).toBe(TEMPO_MAX)
    expect(end).toBeCloseTo(3 / TEMPO_MAX, 2)
    expect(assemblyPlan(segs, [0, 0, 0], 8).entries).toEqual([])
  })
})

describe('the ffmpeg side', () => {
  const plan = [
    { index: 0, start: 0, tempo: 1, length: 2 },
    { index: 1, start: 3.25, tempo: 1.2, length: 2 },
  ]
  const segs: Segment[] = [
    { start: 0, end: 2, text: 'a' },
    { start: 3.25, end: 5, text: 'b' },
  ]

  it('ducks the original only under speech, merging ducks that touch', () => {
    expect(duckExpression([])).toBe('1')
    expect(duckExpression([{ start: 1, end: 2 }, { start: 2.1, end: 3 }], 0.1, 0.1)).toBe('if(gt(between(t,0.900,3.100),0),0.1,1)')
  })

  it('delays and stretches each line and mixes them over the bed', () => {
    const g = mixGraph(plan, segs, { end: 6, bed: true })
    expect(g).toContain("[0:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,volume='if(")
    expect(g).toContain('[1:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,adelay=0:all=1[v0]')
    expect(g).toContain('[2:a]aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo,atempo=1.2,adelay=3250:all=1[v1]')
    expect(g).toContain('[bed][v0][v1]amix=inputs=3:normalize=0:duration=longest,apad,atrim=0:6.000[out]')
  })

  it('leaves the bed out when background sound is off', () => {
    const g = mixGraph(plan, segs, { end: 6, bed: false })
    expect(g).not.toContain('[bed]')
    expect(g).toContain('[v0][v1]amix=inputs=2:')
  })

  it('builds the mix and mux commands', () => {
    expect(mixArgs('o.wav', ['a.mp3', 'b.mp3'], 'g.txt', 't.mp3')).toEqual(['-y', '-v', 'error', '-i', 'o.wav', '-i', 'a.mp3', '-i', 'b.mp3', '-/filter_complex', 'g.txt', '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', 't.mp3'])
    expect(mixArgs('o.wav', [], 'g.txt', 't.m4a')).toContain('aac')
    expect(muxArgs('v.mp4', 't.m4a', 'o.mp4')).toEqual(['-y', '-v', 'error', '-i', 'v.mp4', '-i', 't.m4a', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'o.mp4'])
  })
})

describe('Kie inputs', () => {
  it('sends the language code to Turbo only (Multilingual v2 reads it from the text)', () => {
    expect(ttsInput('Hola', 'abcdefABCDEF', 'market/elevenlabs-tts', 'es')).toEqual({ text: 'Hola', voice: 'abcdefABCDEF', stability: 0.5, similarity_boost: 0.75, style: 0, speed: 1 })
    expect(ttsInput('Hola', 'abcdefABCDEF', 'elevenlabs/text-to-speech-turbo-2-5', 'es')).toMatchObject({ language_code: 'es' })
  })

  it('asks ElevenLabs to speak faster only when a line looks too long for its slot', () => {
    expect(speedFor('Hi', 2)).toBe(1)
    expect(speedFor('x'.repeat(33), 2)).toBe(1.1)
    expect(speedFor('x'.repeat(90), 2)).toBe(1.2)
    expect(speedFor('anything', 0)).toBe(1)
  })

  it('voices a line on Gemini 3.1 Flash with one speaker and one turn (the shape that worked on 2026-10-16)', () => {
    expect(geminiTtsInput('Hola', 'Kore')).toEqual({
      temperature: 1,
      speakers: [{ speaker_id: 'Speaker 1', voice_name: 'Kore', accent: 'Neutral' }],
      dialogue_turns: [{ speaker_id: 'Speaker 1', text: 'Hola' }],
    })
    const seg = { start: 0, end: 2, text: 'Hello', line: 'Hola' }
    expect(lineJob({ model: 'google/gemini-3-1-flash-tts', voice: 'Puck' }, seg, 'es')).toEqual({ model: 'google/gemini-3-1-flash-tts', input: geminiTtsInput('Hola', 'Puck') })
    expect(lineJob({ model: 'market/elevenlabs-tts', voice: 'EkK5I93UQWFDigLMpZcX' }, seg, 'es')).toEqual({ model: 'elevenlabs/text-to-speech-multilingual-v2', input: ttsInput('Hola', 'EkK5I93UQWFDigLMpZcX', 'market/elevenlabs-tts', 'es') })
  })

  it('names each voiced line after its engine and the file type Kie sent', () => {
    expect(lineFile(2, { model: 'google/gemini-3-1-flash-tts', voice: 'Kore' }, 'https://file.aiquickdraw.com/as/x_1.wav')).toBe('line-2-gemini.wav')
    expect(lineFile(0, { model: 'market/elevenlabs-tts', voice: 'x' }, 'https://x/y.mp3?sig=1')).toBe('line-0-eleven.mp3')
    expect(lineFile(0, { model: 'market/elevenlabs-tts', voice: 'x' }, 'https://x/y')).toBe('line-0-eleven.mp3')
  })

  it('asks Volcengine to lip-sync the dubbed video to its new track', () => {
    expect(lipSyncInput('https://v', 'https://a')).toEqual({ mode: 'lite', video_url: 'https://v', audio_url: 'https://a', align_audio: true })
  })
})

describe('translation', () => {
  const segs: Segment[] = [
    { start: 0, end: 2, text: 'Hello' },
    { start: 2, end: 6, text: 'How are you today?' },
  ]

  it('gives every line a character budget for its slot', () => {
    expect(lineBudget(0.2)).toBe(12)
    expect(lineBudget(4)).toBe(69)
    const p = translationPrompt(segs, 'Spanish')
    expect(p).toContain('into Spanish')
    expect(p).toContain('"max_chars":35')
    expect(p).toContain('"max_chars":69')
  })

  it('reads the answer as exactly one line per segment, falling back to the original', () => {
    const originals = segs.map((s) => s.text)
    expect(parseTranslation({ lines: ['Hola', '¿Cómo estás hoy?'] }, originals)).toEqual(['Hola', '¿Cómo estás hoy?'])
    expect(parseTranslation('Sure! {"lines": ["Hola"]}', originals)).toEqual(['Hola', 'How are you today?'])
    expect(parseTranslation(['Hola', '  '], originals)).toEqual(['Hola', 'How are you today?'])
    expect(() => parseTranslation('no json here', originals)).toThrow(/could not be read/)
  })
})

describe('requests', () => {
  const ok: DubRequest = { mode: 'change', clipUrl: 'https://tempfile.redpandaai.co/x.mp4', voice: 'EkK5I93UQWFDigLMpZcX', keepBackground: true, lipSync: false }

  it('says what is missing in plain words', () => {
    expect(requestProblem(ok)).toBeNull()
    expect(requestProblem({ ...ok, clipUrl: '' })).toMatch(/Add your clip/)
    expect(requestProblem({ ...ok, clipUrl: 'file:///C:/x.mp4' })).toMatch(/Add your clip/)
    expect(requestProblem({ ...ok, clipUrl: '/media/../data/studio.db' })).toMatch(/not allowed/)
    expect(requestProblem({ ...ok, voice: '' })).toMatch(/voice/)
    expect(requestProblem({ ...ok, mode: 'translate' })).toMatch(/language/)
    expect(requestProblem({ ...ok, mode: 'translate', language: 'es' })).toBeNull()
    expect(requestProblem({ ...ok, clipUrl: '/media/abc/0.mp4' })).toBeNull()
  })

  it('takes a Gemini voice by name when the model is Gemini, and a Gemini backup voice only', () => {
    expect(requestProblem({ ...ok, model: 'google/gemini-3-1-flash-tts', voice: 'Kore' })).toBeNull()
    expect(requestProblem({ ...ok, model: 'google/gemini-3-1-flash-tts', voice: 'EkK5I93UQWFDigLMpZcX' })).toMatch(/voice/)
    expect(requestProblem({ ...ok, voice: 'Kore' })).toMatch(/voice/)
    expect(requestProblem({ ...ok, fallbackVoice: 'Puck' })).toBeNull()
    expect(requestProblem({ ...ok, fallbackVoice: 'EkK5I93UQWFDigLMpZcX' })).toMatch(/backup voice/)
    expect(requestProblem({ ...ok, model: 'google/gemini-2-5-pro-tts' as DubRequest['model'], voice: 'Kore' })).toMatch(/cannot voice/)
  })
})

describe('which engine voices it', () => {
  const ok: DubRequest = { mode: 'change', clipUrl: 'https://x/clip.mp4', voice: 'EkK5I93UQWFDigLMpZcX', keepBackground: true, lipSync: false }

  it("starts on the request's model, Narration by default", () => {
    expect(firstVoicing(ok)).toEqual({ model: 'market/elevenlabs-tts', voice: 'EkK5I93UQWFDigLMpZcX' })
    expect(firstVoicing({ ...ok, model: 'google/gemini-3-1-flash-tts', voice: 'Puck' })).toEqual({ model: 'google/gemini-3-1-flash-tts', voice: 'Puck' })
  })

  it('falls back to the backup voice on Gemini, else Kore', () => {
    expect(fallbackVoicing({ ...ok, fallbackVoice: 'Charon' })).toEqual({ model: 'google/gemini-3-1-flash-tts', voice: 'Charon' })
    expect(fallbackVoicing(ok)).toEqual({ model: 'google/gemini-3-1-flash-tts', voice: 'Kore' })
  })

  it("switches only for ElevenLabs failing with Kie's internal error", () => {
    const eleven = firstVoicing(ok)
    expect(shouldFallBack(eleven, 'Internal Error, Please try again later.')).toBe(true)
    expect(shouldFallBack({ model: 'elevenlabs/text-to-speech-turbo-2-5', voice: 'x' }, 'internal error')).toBe(true)
    expect(shouldFallBack(eleven, 'Insufficient balance')).toBe(false)
    expect(shouldFallBack(eleven, 'It took too long on Kie’s side and was stopped.')).toBe(false)
    expect(shouldFallBack({ model: 'google/gemini-3-1-flash-tts', voice: 'Kore' }, 'Internal Error, Please try again later.')).toBe(false)
  })
})

/* ---------- the pipeline, end to end on fakes ---------- */

function fakes(opts: { video?: boolean; failLine?: number; failMessage?: string; elevenDown?: boolean; geminiDown?: boolean; translation?: string[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dub-test-'))
  const calls = { kie: [] as { model: string; input: Record<string, unknown> }[], ffmpeg: [] as string[][], uploads: [] as string[], published: [] as HistoryItem[], steps: [] as string[] }
  const deps: DubDeps = {
    workDir: () => dir,
    fetchTo: async (_url, path) => writeFileSync(path, 'x'),
    ffmpeg: async (args) => (calls.ffmpeg.push(args), writeFileSync(args.at(-1)!, 'x')),
    probe: async (path) => (/line-/.test(path) ? { duration: 1.5, hasVideo: false, hasAudio: true } : { duration: 6, hasVideo: Boolean(opts.video), hasAudio: true }),
    transcribe: async () => ({ language: 'en', segments: [{ start: 0, end: 2, text: 'Hello there' }, { start: 3, end: 5, text: 'General Kenobi' }] }),
    translate: async () => ({ lines: opts.translation ?? ['Hola', 'General Kenobi'] }),
    kie: async (model, input) => {
      calls.kie.push({ model, input })
      if (opts.failLine !== undefined && input.text && calls.kie.length - 1 === opts.failLine) throw new Error(opts.failMessage ?? 'Kie had an internal error')
      if (opts.elevenDown && model.startsWith('elevenlabs/')) throw new Error('Internal Error, Please try again later.')
      if (model.startsWith('google/')) {
        if (opts.geminiDown) throw new Error('Insufficient balance')
        return { urls: [`https://fake/${calls.kie.length}.wav`], credits: 0.1 }
      }
      return { urls: [`https://fake/${calls.kie.length}.mp3`], credits: 0.5 }
    },
    upload: async (path) => (calls.uploads.push(path), `https://fake/${path.split(/[\\/]/).pop()}`),
    mediaDir: async (taskId) => ({ abs: join(dir, 'media', taskId), rel: `media/${taskId}` }),
    publish: async (item) => void calls.published.push(item),
    save: (run) => void calls.steps.push(run.step),
    now: () => 1_700_000_000_000,
  }
  const run = (request: Partial<DubRequest>): DubRun => ({ id: 't1', request: { mode: 'change', clipUrl: 'https://x/clip.mp4', voice: 'EkK5I93UQWFDigLMpZcX', keepBackground: true, lipSync: true, ...request }, status: 'running', phase: 'queued', step: 'Queued', createdAt: 1, updatedAt: 1, credits: 0 })
  return { deps, calls, run }
}

describe('runDub', () => {
  it('voice change on audio: one TTS call per line, mixed, published as an audio row', async () => {
    const f = fakes()
    const done = await runDub(f.run({ clipUrl: 'https://x/clip.mp3' }), f.deps)
    expect(done.status).toBe('done')
    expect(f.calls.kie.map((c) => c.model)).toEqual(['elevenlabs/text-to-speech-multilingual-v2', 'elevenlabs/text-to-speech-multilingual-v2'])
    expect(f.calls.kie.map((c) => c.input.text).sort()).toEqual(['General Kenobi', 'Hello there'])
    expect(f.calls.steps).toEqual(expect.arrayContaining(['Preparing', 'Transcribing', 'Voicing 0/2', 'Voicing 2/2', 'Mixing', 'Saving', 'Done']))
    expect(f.calls.steps).not.toContain('Translating')
    const row = f.calls.published[0]!
    expect(row).toMatchObject({ taskId: 'dub-t1', modelId: 'studio/voice-change', category: 'audio', state: 'success', creditsConsumed: 1, prompt: 'Hello there General Kenobi' })
    expect(row.media).toEqual([expect.objectContaining({ kind: 'audio', localPath: 'media/dub-t1/track.mp3' })])
    expect(f.calls.ffmpeg.some((a) => a.includes('-map') && a.includes('0:v:0'))).toBe(false)
  })

  it('translate on video: translates, voices the translation, muxes and lip-syncs', async () => {
    const f = fakes({ video: true })
    const done = await runDub(f.run({ mode: 'translate', language: 'es' }), f.deps)
    expect(done.status).toBe('done')
    expect(f.calls.steps).toContain('Translating')
    expect(f.calls.steps).toContain('Lip-sync')
    expect(f.calls.kie.filter((c) => c.input.text).map((c) => c.input.text).sort()).toEqual(['General Kenobi', 'Hola'])
    expect(f.calls.kie.at(-1)).toEqual({ model: 'volcengine/video-to-video-lip-sync', input: { mode: 'lite', video_url: 'https://fake/dubbed.mp4', audio_url: 'https://fake/track.m4a', align_audio: true } })
    expect(f.calls.ffmpeg.some((a) => a.includes('0:v:0'))).toBe(true)
    const row = f.calls.published[0]!
    expect(row).toMatchObject({ modelId: 'studio/translate', category: 'video', model: 'Translate' })
    expect(row.media?.map((m) => m.kind)).toEqual(['video', 'audio'])
    expect(row.input).toMatchObject({ language: 'es', lip_sync: true })
  })

  it('skips lip-sync when it is off', async () => {
    const f = fakes({ video: true })
    await runDub(f.run({ mode: 'translate', language: 'es', lipSync: false }), f.deps)
    expect(f.calls.kie.some((c) => c.model.includes('lip-sync'))).toBe(false)
    expect(f.calls.uploads).toEqual([])
  })

  it('fails in plain words, stops voicing and publishes nothing', async () => {
    const f = fakes({ failLine: 0, failMessage: 'Insufficient balance' })
    const done = await runDub(f.run({}), f.deps)
    expect(done).toMatchObject({ status: 'failed', phase: 'failed', error: 'Insufficient balance' })
    expect(f.calls.kie.every((c) => c.model.startsWith('elevenlabs/'))).toBe(true)
    expect(f.calls.published).toEqual([])
  })

  it('voices every line on Gemini when that is the model picked', async () => {
    const f = fakes()
    const done = await runDub(f.run({ clipUrl: 'https://x/clip.mp3', model: 'google/gemini-3-1-flash-tts', voice: 'Puck' }), f.deps)
    expect(done.status).toBe('done')
    expect(f.calls.kie.map((c) => c.model)).toEqual(['google/gemini-3-1-flash-tts', 'google/gemini-3-1-flash-tts'])
    expect(f.calls.kie.map((c) => (c.input.dialogue_turns as { text: string }[])[0]!.text).sort()).toEqual(['General Kenobi', 'Hello there'])
    // Gemini's .wav takes go into the mix as .wav.
    expect(f.calls.ffmpeg.find((a) => a.includes('-/filter_complex'))!.filter((a) => /line-\d-gemini\.wav$/.test(a))).toHaveLength(2)
    expect(done.fallback).toBeUndefined()
    expect(f.calls.published[0]!.input).toMatchObject({ voice: 'Puck', tts_model: 'google/gemini-3-1-flash-tts' })
    expect(f.calls.published[0]!.input).not.toHaveProperty('tts_fallback')
  })

  it("switches to Gemini once when ElevenLabs fails with Kie's internal error on line 1, and still finishes", async () => {
    const f = fakes({ failLine: 0, failMessage: 'Internal Error, Please try again later.' })
    const done = await runDub(f.run({ clipUrl: 'https://x/clip.mp3', fallbackVoice: 'Charon' }), f.deps)
    expect(done.status).toBe('done')
    const models = f.calls.kie.map((c) => c.model)
    // ElevenLabs first (line 1 fails, the other worker's line may finish), then every line again on Gemini.
    expect(models[0]).toBe('elevenlabs/text-to-speech-multilingual-v2')
    expect(models.filter((m) => m === 'google/gemini-3-1-flash-tts')).toHaveLength(2)
    expect(models.lastIndexOf('elevenlabs/text-to-speech-multilingual-v2')).toBeLessThan(models.indexOf('google/gemini-3-1-flash-tts'))
    expect(f.calls.kie.filter((c) => c.model.startsWith('google/')).every((c) => (c.input.speakers as { voice_name: string }[])[0]!.voice_name === 'Charon')).toBe(true)
    expect(done).toMatchObject({ fallback: 'Internal Error, Please try again later.', voicedWith: { model: 'google/gemini-3-1-flash-tts', voice: 'Charon' } })
    expect(done.notes?.[0]).toBe(FALLBACK_NOTE)
    expect(f.calls.steps).toContain('Voicing 2/2 with Gemini')
    expect(f.calls.ffmpeg.find((a) => a.includes('-/filter_complex'))!.filter((a) => /line-\d-/.test(a)).every((a) => a.endsWith('-gemini.wav'))).toBe(true)
    const row = f.calls.published[0]!
    expect(row.input).toMatchObject({ voice: 'Charon', tts_model: 'google/gemini-3-1-flash-tts', tts_fallback: true, requested_tts_model: 'market/elevenlabs-tts', requested_voice: 'EkK5I93UQWFDigLMpZcX', notes: [FALLBACK_NOTE] })
  })

  it('falls back with Kore when no backup voice was given, for Turbo too', async () => {
    const f = fakes({ elevenDown: true })
    const done = await runDub(f.run({ clipUrl: 'https://x/clip.mp3', model: 'elevenlabs/text-to-speech-turbo-2-5' }), f.deps)
    expect(done.status).toBe('done')
    expect(done.voicedWith).toEqual({ model: 'google/gemini-3-1-flash-tts', voice: 'Kore' })
  })

  it('says so when Gemini fails too, and publishes nothing', async () => {
    const f = fakes({ elevenDown: true, geminiDown: true })
    const done = await runDub(f.run({ clipUrl: 'https://x/clip.mp3' }), f.deps)
    expect(done.status).toBe('failed')
    expect(done.error).toBe('ElevenLabs was failing and Gemini failed too: Insufficient balance')
    expect(f.calls.published).toEqual([])
  })

  it('never switches a Gemini run (there is nothing to switch to)', async () => {
    const f = fakes({ geminiDown: true })
    const done = await runDub(f.run({ clipUrl: 'https://x/clip.mp3', model: 'google/gemini-3-1-flash-tts', voice: 'Kore' }), f.deps)
    expect(done).toMatchObject({ status: 'failed', error: 'Insufficient balance' })
    expect(f.calls.kie.every((c) => c.model.startsWith('google/'))).toBe(true)
  })
})
