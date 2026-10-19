// Audio's payload builders and rules: the JSON ElevenLabs Dialogue and Gemini TTS want,
// Suno's custom-mode rules, and which Suno tracks can be extended. Shapes follow Kie's docs
// (docs.kie.ai/market/elevenlabs/text-to-dialogue-v3, …/google/gemini-*-tts).
import { describe, expect, it } from 'vitest'
import type { HistoryItem, ModelDefinition } from '../../api.ts'
import { buildInput } from '../../api.ts'
import {
  SONG_DEFAULT,
  carriesText,
  defined,
  dialogueJson,
  dialogueProblem,
  extendValues,
  geminiProblem,
  geminiSpeakers,
  geminiTurns,
  inTab,
  isElevenTts,
  isGemini38Tts,
  isGeminiTts,
  isSpeech,
  scriptProblem,
  scriptToTurns,
  songCheck,
  speechEngineOf,
  languageName,
  songProblems,
  songValues,
  sunoPromptLimit,
  sunoTracks,
  speakersFrom,
  turnsFrom,
  turnsToScript,
  dialogueRowsFrom,
  musicKindOf,
} from './logic.ts'

const audioModel = (id: string): ModelDefinition => ({ id, model: id, title: id, category: 'audio', provider: 'market', fields: [] }) as unknown as ModelDefinition

describe('speech engines', () => {
  it('splits the TTS models by what their payload looks like', () => {
    const all = ['market/elevenlabs-tts', 'elevenlabs/text-to-speech-turbo-2-5', 'google/gemini-2-5-pro-tts', 'google/gemini-3-1-flash-tts', 'google/gemini-3-8-flash-lite-tts', 'google/gemini-3-8-flash-tts', 'market/elevenlabs-dialogue'].map(audioModel)
    expect(all.filter(isElevenTts).map((m) => m.id)).toEqual(['market/elevenlabs-tts', 'elevenlabs/text-to-speech-turbo-2-5'])
    expect(all.filter(isGeminiTts).map((m) => m.id)).toEqual(['google/gemini-2-5-pro-tts', 'google/gemini-3-1-flash-tts'])
    expect(all.filter(isGemini38Tts).map((m) => m.id)).toEqual(['google/gemini-3-8-flash-lite-tts', 'google/gemini-3-8-flash-tts'])
    expect(all.filter(isSpeech)).toHaveLength(6)
    expect(all.map(speechEngineOf)).toEqual(['eleven', 'eleven', 'gemini', 'gemini', 'gemini38', 'gemini38', null])
  })

  it('Narration reads 5,000 characters per segment; other models by the field limit', () => {
    const narration = audioModel('market/elevenlabs-tts')
    expect(scriptProblem(narration, `${'a'.repeat(4000)}

${'b'.repeat(4000)}`)).toBeNull()
    expect(scriptProblem(narration, 'a'.repeat(5001))).toMatch(/^One segment is 5,001 characters/)
    const turbo = { ...audioModel('elevenlabs/text-to-speech-turbo-2-5'), fields: [{ name: 'text', type: 'textarea', label: 'Text', maxLength: 5000 }] } as unknown as ModelDefinition
    expect(scriptProblem(turbo, 'a'.repeat(5001))).toBe('The script is 5,001 characters; this model takes 5,000.')
  })
})

describe('dialogue', () => {
  it('builds [{ text, voice }] and drops blank lines', () => {
    expect(dialogueJson([{ voice: 'a', text: ' Hi ' }, { voice: 'b', text: '  ' }, { voice: 'b', text: 'Hey' }])).toEqual([
      { text: 'Hi', voice: 'a' },
      { text: 'Hey', voice: 'b' },
    ])
  })

  it('holds the 5,000 character cap across all lines', () => {
    expect(dialogueProblem([{ voice: 'a', text: '' }])).toBe('Write at least one line.')
    expect(dialogueProblem([{ voice: 'a', text: 'x'.repeat(2600) }, { voice: 'b', text: 'y'.repeat(2600) }])).toMatch(/5,200 characters/)
    expect(dialogueProblem([{ voice: 'a', text: 'Hello' }])).toBeNull()
  })

  it('names language codes', () => {
    expect(languageName('fil')).toBe('Filipino')
    expect(languageName('')).toBe('Detect')
  })
})

describe('gemini', () => {
  it('2.5 / 3.1 speakers carry accent (required) and the optional extras', () => {
    expect(geminiSpeakers([{ voice: 'Fenrir', accent: 'British (RP)', style: 'Deadpan', profile: ' A weary gatekeeper ' }, { voice: 'Puck' }], false)).toEqual([
      { speaker_id: 'Speaker 1', voice_name: 'Fenrir', accent: 'British (RP)', style: 'Deadpan', audio_profile: 'A weary gatekeeper' },
      { speaker_id: 'Speaker 2', voice_name: 'Puck', accent: 'Neutral' },
    ])
  })

  it('3.8 speakers are id and voice only, two at most', () => {
    expect(geminiSpeakers([{ voice: 'Fola', accent: 'Neutral' }, { voice: 'Kore' }, { voice: 'Puck' }], true)).toEqual([
      { speaker_id: 'Speaker 1', voice_name: 'Fola' },
      { speaker_id: 'Speaker 2', voice_name: 'Kore' },
    ])
  })

  it('turns point at a speaker that exists', () => {
    expect(geminiTurns([{ speaker: 1, text: 'Halt!' }, { speaker: 0, text: ' ' }, { speaker: 0, text: 'Why?' }], 1)).toEqual([
      { speaker_id: 'Speaker 1', text: 'Halt!' },
      { speaker_id: 'Speaker 1', text: 'Why?' },
    ])
    expect(geminiProblem([{ voice: 'Kore' }], [{ speaker: 0, text: '' }])).toBe('Write at least one line.')
    expect(geminiProblem([{ voice: 'Kore' }], [{ speaker: 0, text: 'Hi' }])).toBeNull()
  })

  it('JSON values reach the model through locked, as arrays', () => {
    const gemini = {
      ...audioModel('google/gemini-3-8-flash-tts'),
      fields: [
        { name: 'speakers', type: 'json', label: 'Speakers', required: true },
        { name: 'dialogue_turns', type: 'json', label: 'Turns', required: true },
      ],
    } as unknown as ModelDefinition
    const speakers = geminiSpeakers([{ voice: 'Fola' }], true)
    const turns = geminiTurns([{ speaker: 0, text: 'Hello' }], 1)
    expect(buildInput(gemini, { prompt: '', locked: defined({ speakers, dialogue_turns: turns, ignored: undefined }) })).toEqual({ speakers, dialogue_turns: turns })
  })
})

describe('suno', () => {
  it('custom mode needs style and title; simple mode needs a short brief', () => {
    expect(songProblems({ ...SONG_DEFAULT })).toEqual(['Custom mode needs a style — genre, tempo, instruments, voice.', 'Custom mode needs a title.'])
    expect(songProblems({ ...SONG_DEFAULT, custom: false }, '')).toEqual(['Describe the song you want.'])
    expect(songProblems({ ...SONG_DEFAULT, custom: false }, 'x'.repeat(501))).toEqual(['The description can be 500 characters at most.'])
    expect(songProblems({ ...SONG_DEFAULT, style: 'folk', title: 'T', instrumental: true }, '')).toEqual([])
    expect(songProblems({ ...SONG_DEFAULT, style: 'folk', title: 'T' }, '')).toEqual(['Write the lyrics, or switch on Instrumental.'])
  })

  it('the Generate check reads the form from the input it will send', () => {
    const music = audioModel('suno/music')
    expect(songCheck(music, { customMode: true, instrumental: false, style: 'folk', title: 'T', model: 'V5' }, '')).toBe('Write the lyrics, or switch on Instrumental.')
    expect(songCheck(music, { customMode: false, model: 'V5' }, 'a song')).toBeNull()
    expect(songCheck(music, { customMode: true, model: 'V5' }, 'la la')).toBe('Custom mode needs a style — genre, tempo, instruments, voice.')
  })

  it('limits follow the version', () => {
    expect(sunoPromptLimit({ custom: true, version: 'V4' })).toBe(3000)
    expect(sunoPromptLimit({ custom: true, version: 'V5' })).toBe(5000)
    expect(songProblems({ ...SONG_DEFAULT, version: 'V4', style: 's'.repeat(201), title: 'T' })[0]).toMatch(/V4 takes 200/)
  })

  it('simple mode leaves style and title out of the payload', () => {
    const suno = {
      ...audioModel('suno/music'),
      provider: 'suno',
      fields: [
        { name: 'customMode', type: 'boolean', label: 'Custom', default: true },
        { name: 'instrumental', type: 'boolean', label: 'Instrumental', default: false },
        { name: 'prompt', type: 'textarea', label: 'Prompt' },
        { name: 'style', type: 'textarea', label: 'Style' },
        { name: 'title', type: 'string', label: 'Title' },
        { name: 'model', type: 'enum', label: 'Model', enum: ['V5', 'V4_5PLUS', 'V4_5', 'V4'], default: 'V5' },
        { name: 'negativeTags', type: 'string', label: 'Avoid' },
      ],
    } as unknown as ModelDefinition
    const simple = buildInput(suno, { prompt: 'a road trip song', values: { style: 'stale', negativeTags: 'x' }, locked: defined(songValues({ ...SONG_DEFAULT, custom: false, style: 'folk', title: 'T', version: 'V4_5' })) })
    expect(simple).toEqual({ customMode: false, instrumental: false, prompt: 'a road trip song', model: 'V4_5' })
    const custom = buildInput(suno, { prompt: '[Verse]', locked: defined(songValues({ ...SONG_DEFAULT, style: 'folk', title: 'T' })) })
    expect(custom).toMatchObject({ customMode: true, style: 'folk', title: 'T', model: 'V5' })
  })

  const song = (over: Partial<HistoryItem>): HistoryItem => ({
    taskId: 's1',
    model: 'suno',
    category: 'audio',
    state: 'success',
    createdAt: 1,
    provider: 'suno',
    operation: 'generate',
    modelId: 'suno/music',
    media: [
      { kind: 'audio', url: 'a', providerAssetId: 'au-1', duration: 120.6, title: 'Road', metadata: { tags: 'folk', modelName: 'V4_5' } },
      { kind: 'audio', url: 'b', providerAssetId: 'au-2' },
    ],
    ...over,
  })

  it('every finished Suno track can be extended by task and audio id', () => {
    const tracks = sunoTracks([song({}), song({ taskId: 'lyr', operation: 'lyrics', modelId: 'suno/lyrics' }), song({ taskId: 'f', state: 'fail' })])
    expect(tracks.map((t) => t.audioId)).toEqual(['au-1', 'au-2'])
    expect(extendValues(tracks[0]!)).toEqual({ taskId: 's1', audioId: 'au-1', continueAt: 119, style: 'folk', title: 'Road', model: 'V4_5' })
    expect(extendValues(tracks[1]!, 30)).toEqual({ taskId: 's1', audioId: 'au-2', continueAt: 30 })
  })

  it('music history is every Suno job', () => {
    expect(inTab('music', song({}))).toBe(true)
    expect(inTab('tts', song({}))).toBe(false)
  })
})

describe('Recreate: a past input back into the editors', () => {
  it('reads Gemini speakers and turns back, the inverse of what was sent', () => {
    const speakers = [
      { voice: 'Vindemiatrix', accent: 'British (RP)', pace: 'Natural' },
      { voice: 'Kore', accent: 'Neutral', style: 'Whisper', profile: 'a warm narrator' },
    ]
    const turns = [
      { speaker: 0, text: 'Hello.' },
      { speaker: 1, text: 'Hi there.' },
    ]
    expect(speakersFrom(geminiSpeakers(speakers, false))).toEqual(speakers)
    expect(turnsFrom(geminiTurns(turns, 2))).toEqual(turns)
    expect(speakersFrom(geminiSpeakers([{ voice: 'Fola' }], true))).toEqual([{ voice: 'Fola', accent: 'Neutral' }])
    expect(speakersFrom(undefined)).toBeNull()
    expect(turnsFrom([])).toBeNull()
  })

  it('reads ElevenLabs dialogue lines back', () => {
    const rows = [
      { voice: 'a', text: 'Hi' },
      { voice: 'b', text: 'Hey' },
    ]
    expect(dialogueRowsFrom(dialogueJson(rows))).toEqual(rows)
    expect(dialogueRowsFrom('nope')).toBeNull()
  })

  it('opens the Music sub-tab the Suno model belongs to', () => {
    expect(['suno/music', 'suno/extend', 'suno/upload-extend', 'suno/upload-cover', 'suno/lyrics', 'market/elevenlabs-tts', undefined].map(musicKindOf)).toEqual(['create', 'extend', 'extend', 'cover', 'lyrics', null, null])
  })
})

describe('the text across a Speech model switch', () => {
  it('turns an ElevenLabs script into Gemini lines, one per blank-line paragraph, all S1', () => {
    expect(scriptToTurns('Hello there.\n\nGeneral Kenobi!\n  \n\nYou are a bold one.')).toEqual([
      { speaker: 0, text: 'Hello there.' },
      { speaker: 0, text: 'General Kenobi!' },
      { speaker: 0, text: 'You are a bold one.' },
    ])
    expect(scriptToTurns('One line\nwith a soft break')).toEqual([{ speaker: 0, text: 'One line\nwith a soft break' }])
    expect(scriptToTurns('   ')).toEqual([])
  })

  it('joins Gemini lines into a script with blank lines, and the round trip holds', () => {
    expect(turnsToScript([{ speaker: 0, text: ' Hi ' }, { speaker: 1, text: '' }, { speaker: 1, text: 'Hello' }])).toBe('Hi\n\nHello')
    const script = 'Hi.\n\nHello.'
    expect(turnsToScript(scriptToTurns(script))).toBe(script)
  })

  it('moves text only between ElevenLabs and Gemini, never on the first pick', () => {
    expect(carriesText('eleven', 'gemini')).toBe(true)
    expect(carriesText('gemini38', 'eleven')).toBe(true)
    expect(carriesText('gemini', 'gemini38')).toBe(false)
    expect(carriesText('eleven', 'eleven')).toBe(false)
    expect(carriesText(null, 'gemini')).toBe(false)
    expect(carriesText('eleven', null)).toBe(false)
  })
})
