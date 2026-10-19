/**
 * Audio — their archetype B with the Audio page's tabs: Text to speech, Dialogue, Music,
 * Isolate voice, Voice change, Translate.
 *
 * Every working tab is a RailStudio over its own models. The speech and dialogue models
 * take things a prompt box can't hold — an ElevenLabs voice id, a list of lines with a voice
 * each, Gemini's speakers and turns — so those tabs carry an editor in the rail header and
 * hand its values to the rail through `locked` (audio/logic.ts builds the exact JSON).
 * Voice change and Translate are not catalogue models — Kie has no speech-to-speech or
 * dubbing model — so they run Trenchable's own dub pipeline on the server (server/studio/dub.ts)
 * from their own rail (audio/DubTab.tsx).
 *
 * The right pane is Audio's own (audio/AudioFeed.tsx): the reference app's slim rows with a
 * waveform instead of RailStudio's tile grid, handed to RailStudio as its `canvas`.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AudioLines, Languages, MessagesSquare, Mic, Music, NotebookPen, Repeat, Speech, type LucideIcon } from 'lucide-react'
import { useHistory, useModels, type ModelDefinition } from '../api.ts'
import { loadDraft, loadMode, saveMode } from '../draft.ts'
import { takeHandoff, useHandoff, type Handoff } from '../handoff.ts'
import { RailStudio, type RailStudioProps, type SlotSpec } from '../RailStudio.tsx'
import { ELEVEN_VOICES, GEMINI_38_VOICES, GEMINI_VOICES, voiceLabels } from '../voices.ts'
import { AudioFeed } from './audio/AudioFeed.tsx'
import { DubTab } from './audio/DubTab.tsx'
import { DialogueEditor, SongFormView, SpeakerEditor, TrackPicker, VoicePicker } from './audio/editors.tsx'
import {
  SONG_DEFAULT,
  carriesText,
  defined,
  dialogueJson,
  dialogueProblem,
  dialogueRowsFrom,
  extendValues,
  geminiProblem,
  geminiSpeakers,
  geminiTurns,
  isSpeech,
  isAudioTab,
  isDialogue,
  isIsolation,
  isSunoCover,
  isSunoExtend,
  isSunoLyrics,
  isSunoSong,
  isSunoUploadExtend,
  musicKindOf,
  scriptProblem,
  scriptToTurns,
  songCheck,
  songFormOf,
  songValues,
  speakersFrom,
  speechEngineOf,
  sunoTracks,
  turnsFrom,
  turnsToScript,
  type AudioTab,
  type DialogueRow,
  type GeminiSpeaker,
  type GeminiTurn,
  type SongForm,
  type SpeechEngine,
} from './audio/logic.ts'
import { stop } from './audio/player.ts'
import { How, Hint, ModeBar, SubSwitch, type ModeSpec } from './video/ModeBar.tsx'
import './audio/audio.css'

const TABS: ModeSpec<AudioTab>[] = [
  { id: 'tts', label: 'Speech', icon: Speech },
  { id: 'dialogue', label: 'Dialogue', icon: MessagesSquare },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'isolate', label: 'Isolate', icon: Mic },
  { id: 'change', label: 'Voice change', icon: Repeat },
  { id: 'translate', label: 'Translate', icon: Languages },
]

const common = { surface: 'audio', category: 'audio' as const, klass: 'audio' as const }

/**
 * One tab: RailStudio for the rail, Audio's feed as its whole right pane (`canvas`). The feed
 * takes over the rail's empty copy and "How it works".
 */
function AudioRail({ tab, icon, emptyTitle = 'Nothing here yet', emptySub, explain, ...rail }: RailStudioProps & { tab: AudioTab; icon: LucideIcon }) {
  return <RailStudio {...rail} canvas={<AudioFeed tab={tab} empty={{ icon, title: emptyTitle, sub: emptySub }} explain={explain} />} />
}

/** A rail choice that outlives a reload (the speech voice), in this browser only. */
function useRemembered(key: string): [string | null, (v: string | null) => void] {
  const [value, setValue] = useState<string | null>(() => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  })
  const put = (v: string | null) => {
    setValue(v)
    try {
      if (v) localStorage.setItem(key, v)
      else localStorage.removeItem(key)
    } catch {
      // Private mode or storage off: the choice lasts for this visit.
    }
  }
  return [value, put]
}

const AUDIO_SLOT = (title: string, sub: string, field: RegExp): SlotSpec => ({ id: 'audio', icon: AudioLines, title, sub, wide: true, kind: 'audio', field })

/** The voice ids the catalogue currently offers for ElevenLabs, falling back to the named list. */
function useElevenVoices(): string[] {
  const { models } = useModels('audio')
  return useMemo(() => {
    const field = models?.find((m) => m.id === 'market/elevenlabs-tts')?.fields.find((f) => f.name === 'voice')
    return field?.enum?.length ? field.enum : ELEVEN_VOICES.map((v) => v.id)
  }, [models])
}

/* ---------- Text to speech ---------- */

const VOICE_LISTS = { gemini: GEMINI_VOICES.map((v) => v.name), gemini38: GEMINI_38_VOICES.map((v) => v.name) }

const TTS_DRAFT = 'audio.tts'

/**
 * One rail for every speech model. The Model row decides; `onModel` tells the header which
 * editor that model needs — ElevenLabs a voice id, Gemini its speakers and lines.
 *
 * The text follows a switch between ElevenLabs and Gemini: the rail's prompt box is the Script
 * for ElevenLabs but Gemini's optional "Overall tone", and Gemini's words live in the Lines here.
 * So ElevenLabs → Gemini turns the script into Lines (a line per paragraph, S1) and empties the
 * tone; Gemini → ElevenLabs joins the Lines into the script. The rail owns its prompt, so the
 * script is read from its draft and written back through `seed` (set once, then let go).
 */
function SpeechTab({ header }: { header: ReactNode }) {
  const [current, setCurrent] = useState<ModelDefinition | null>(null)
  const engine = speechEngineOf(current)
  const [seed, setSeed] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (seed !== undefined) setSeed(undefined)
  }, [seed])
  const lastEngine = useRef<SpeechEngine | null>(null)
  // A Recreate brings its own model, prompt and lines; the switch it causes must not move them.
  const recreatedAt = useRef(0)
  const voices = useElevenVoices()
  const labels = useMemo(() => ({ voice: voiceLabels(voices) }), [voices])
  const [voice, setVoice] = useRemembered('studio.audio.voice')
  const chosen = voice && voices.includes(voice) ? voice : (voices[0] ?? '')

  const [picked, setSpeakers] = useState<GeminiSpeaker[]>([{ voice: 'Kore', accent: 'Neutral' }])
  const [turns, setTurns] = useState<GeminiTurn[]>([{ speaker: 0, text: '' }])
  // Recreate: the rail restores the model and settings; the voice and lines live here.
  useHandoff('audio', (h) => {
    recreatedAt.current = Date.now()
    const v = h.values
    if (!v) return
    if (typeof v.voice === 'string') setVoice(v.voice)
    const s = speakersFrom(v.speakers)
    if (s) setSpeakers(s)
    const t = turnsFrom(v.dialogue_turns)
    if (t) setTurns(t)
  })
  const v38 = engine === 'gemini38'
  // The two Gemini generations offer different voices; a pick the other one lacks reads as its first.
  const names = VOICE_LISTS[v38 ? 'gemini38' : 'gemini']
  const speakers = picked.map((x, i) => (names.includes(x.voice) ? x : { ...x, voice: names[i] ?? names[0]! }))
  const problem = engine === 'gemini' || engine === 'gemini38' ? geminiProblem(speakers, turns) : null
  const locked =
    engine === 'eleven'
      ? { voice: chosen }
      : engine
        ? { speakers: geminiSpeakers(speakers, v38), dialogue_turns: geminiTurns(turns, speakers.length) }
        : undefined

  const onModel = (m: ModelDefinition | null) => {
    setCurrent(m)
    const next = speechEngineOf(m)
    const prev = lastEngine.current
    if (next) lastEngine.current = next
    if (!carriesText(prev, next) || Date.now() - recreatedAt.current < 2_000) return
    if (next === 'eleven') {
      setSeed(turnsToScript(turns))
      return
    }
    const carried = scriptToTurns(loadDraft(TTS_DRAFT).prompt ?? '')
    if (carried.length) setTurns(carried)
    setSeed('')
  }

  const head = (
    <>
      {header}
      {engine === 'eleven' && <VoicePicker ids={voices} value={chosen} onChange={setVoice} />}
      {(engine === 'gemini' || engine === 'gemini38') && (
        <>
          <SpeakerEditor v38={v38} speakers={speakers} onSpeakers={setSpeakers} turns={turns} onTurns={setTurns} />
          {problem && turns.some((t) => t.text.trim()) && <Hint warn>{problem}</Hint>}
        </>
      )}
    </>
  )
  return (
    <AudioRail
      key="tts"
      tab="tts"
      icon={Speech}
      {...common}
      draftKey={TTS_DRAFT}
      filter={isSpeech}
      onModel={onModel}
      seed={seed}
      header={head}
      locked={locked}
      optionLabels={labels}
      check={(m, _input, prompt) => (speechEngineOf(m) === 'eleven' ? scriptProblem(m, prompt) : problem)}
      promptLabel={engine === 'eleven' || !engine ? 'Script' : 'Overall tone (optional)'}
      promptPlaceholder={engine === 'eleven' ? 'Exactly what the voice should read out. A blank line starts a new segment.' : 'Audiobook narration, gentle and inviting…'}
      goLabel="Speak"
      emptyTitle="Turn text into speech"
      emptySub="Lifelike speech from any script — pick a voice, write it, press Speak. Takes land here and in Assets."
      explain={
        <How
          title="Text to speech"
          steps={[
            'Pick the model. ElevenLabs: choose one of 67 voices (▶ plays a sample) and paste the script — Narration takes 20,000 characters in 5,000-character segments; Turbo 2.5 is faster and takes 5,000.',
            'Gemini: one or two speakers, each with a voice (2.5 Pro and 3.1 Flash add accent, style and pace), then the lines in order. The rail changes with the model.',
            'Stability, speed and the rest are under Advanced settings.',
          ]}
        />
      }
    />
  )
}

/* ---------- Dialogue ---------- */

function DialogueTab({ header }: { header: ReactNode }) {
  const voices = useElevenVoices()
  const { models } = useModels('audio')
  const languages = useMemo(() => models?.find(isDialogue)?.fields.find((f) => f.name === 'language_code')?.enum ?? [], [models])
  const [rows, setRows] = useState<DialogueRow[]>(() => [
    { voice: voices[0] ?? '', text: '' },
    { voice: voices[1] ?? voices[0] ?? '', text: '' },
  ])
  const [stability, setStability] = useState(0.5)
  const [language, setLanguage] = useState('')
  useHandoff('audio', (h) => {
    const v = h.values
    if (!v) return
    const r = dialogueRowsFrom(v.dialogue)
    if (r) setRows(r)
    if (typeof v.stability === 'number') setStability(v.stability)
    if (typeof v.language_code === 'string') setLanguage(v.language_code)
  })
  const problem = dialogueProblem(rows)
  // An empty dialogue is a missing required field (the rail's own blocker); too long is `check`.
  const locked = defined({ dialogue: dialogueJson(rows), stability, language_code: language || undefined })
  const head = (
    <>
      {header}
      <DialogueEditor rows={rows} onChange={setRows} voices={voices} stability={stability} onStability={setStability} language={language} onLanguage={setLanguage} languages={languages} />
      {problem && rows.some((r) => r.text.trim()) && <Hint warn>{problem}</Hint>}
    </>
  )
  return (
    <AudioRail
      key="dialogue"
      tab="dialogue"
      icon={MessagesSquare}
      {...common}
      draftKey="audio.dialogue"
      filter={isDialogue}
      header={head}
      locked={locked}
      check={() => problem}
      goLabel="Make dialogue"
      emptyTitle="Turn lines into a conversation"
      emptySub="Write the lines on the left, one voice each — ElevenLabs v3 performs them as one scene."
      explain={<How title="Dialogue" steps={['Give each line a voice — ▶ plays a sample.', 'Add as many lines as the scene needs (5,000 characters in all).', 'ElevenLabs v3 performs them as one conversation, timing and all.']} />}
    />
  )
}

/* ---------- Music ---------- */

type MusicKind = 'create' | 'extend' | 'cover' | 'lyrics'

const MUSIC_KINDS = [
  { id: 'create' as const, label: 'Song' },
  { id: 'extend' as const, label: 'Extend' },
  { id: 'cover' as const, label: 'Cover' },
  { id: 'lyrics' as const, label: 'Lyrics' },
]

const UPLOAD_SLOT = (sub: string) => AUDIO_SLOT('Track', sub, /^uploadUrl$/)

function MusicTab({ header, kind, setKind }: { header: ReactNode; kind: MusicKind; setKind: (k: MusicKind) => void }) {
  const [song, setSong] = useState<SongForm>(SONG_DEFAULT)
  const { items } = useHistory('audio')
  const tracks = useMemo(() => sunoTracks(items ?? []), [items])
  const [trackKey, setTrackKey] = useState<string | null>(null)
  const track = tracks.find((t) => `${t.item.taskId}:${t.audioId}` === trackKey) ?? null
  const [from, setFrom] = useState<number | null>(null)
  // Recreate: the song form, or the track an extend continued and where from.
  useHandoff('audio', (h) => {
    const v = h.values
    if (!v) return
    const k = musicKindOf(h.modelId)
    if (k === 'create' || k === 'cover') setSong(songFormOf(v))
    if (k === 'extend') {
      if (typeof v.taskId === 'string' && typeof v.audioId === 'string') setTrackKey(`${v.taskId}:${v.audioId}`)
      if (typeof v.continueAt === 'number') setFrom(v.continueAt)
    }
  })

  const head = (extra: ReactNode) => (
    <>
      {header}
      <SubSwitch options={MUSIC_KINDS} value={kind} onPick={setKind} />
      {extra}
    </>
  )

  if (kind === 'lyrics') {
    return (
      <AudioRail
        key="music:lyrics"
        tab="music"
        icon={NotebookPen}
        {...common}
        draftKey="audio.music.lyrics"
        filter={isSunoLyrics}
        check={(m, _i, prompt) => scriptProblem(m, prompt)}
        header={head(<Hint>Suno writes lyrics from a brief. Use them in Song with Custom lyrics.</Hint>)}
        promptLabel="What the song is about"
        promptPlaceholder="A breakup song set on a night train, bittersweet, with a big singalong chorus…"
        goLabel="Write lyrics"
        emptyTitle="Write lyrics"
        emptySub="Describe the song in up to 2,000 characters; Suno writes the verses and chorus."
      />
    )
  }

  if (kind === 'extend') {
    const tool = track ? extendValues(track, from) : null
    const locked = track ? tool! : from != null ? { continueAt: from } : undefined
    const extra = (
      <>
        <TrackPicker
          tracks={tracks}
          value={track}
          onPick={(t) => {
            setTrackKey(t ? `${t.item.taskId}:${t.audioId}` : null)
            setFrom(null)
          }}
        />
        <label className="st-field st-inline-field">
          <span className="st-field-label">Continue from (seconds)</span>
          <input type="number" min={0} placeholder="e.g. 60" value={from ?? (tool ? Number(tool.continueAt) : '')} onChange={(e) => setFrom(e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
        </label>
        {!track && <Hint warn={from == null}>No song picked: upload a track below and set where the new part starts (up to 480 seconds in){from == null ? ' — left empty, Suno starts from the very beginning.' : '.'}</Hint>}
      </>
    )
    return (
      <AudioRail
        key={`music:extend:${track ? 'past' : 'upload'}`}
        tab="music"
        icon={Music}
        {...common}
        draftKey="audio.music.extend"
        filter={track ? isSunoExtend : isSunoUploadExtend}
        header={head(extra)}
        locked={locked}
        slots={track ? [] : [UPLOAD_SLOT('The song to continue')]}
        promptLabel="Lyrics for the new part"
        promptPlaceholder="[Verse 3] …"
        goLabel="Extend"
        emptyTitle="Carry a song on"
        emptySub="Pick one of your Suno songs, or upload a track, and write what comes next."
        explain={<How title="Extend a song" steps={['Pick a Suno song you made, or upload any track.', 'Set where the new part starts.', 'Write the lyrics for it; style and title carry over from the original.']} />}
      />
    )
  }

  const values = songValues(song)
  if (kind === 'cover') {
    return (
      <AudioRail
        key="music:cover"
        tab="music"
        icon={Music}
        {...common}
        draftKey="audio.music.cover"
        filter={isSunoCover}
        header={head(<SongFormView value={song} onChange={setSong} />)}
        locked={defined(values)}
        check={songCheck}
        slots={[UPLOAD_SLOT('The song to cover — Suno keeps the melody')]}
        promptLabel={song.custom ? (song.instrumental ? 'Direction (optional)' : 'Lyrics') : 'What the cover should be'}
        promptPlaceholder={song.custom ? '[Verse] …' : 'The same song as a slow piano ballad…'}
        goLabel="Make cover"
        emptyTitle="Sing it again, differently"
        emptySub="Upload a track and describe the new version — Suno keeps the melody."
      />
    )
  }

  return (
    <AudioRail
      key="music:create"
      tab="music"
      icon={Music}
      {...common}
      draftKey="audio.music.create"
      filter={isSunoSong}
      header={head(<SongFormView value={song} onChange={setSong} />)}
      locked={defined(values)}
      check={songCheck}
      promptLabel={song.custom ? (song.instrumental ? 'Direction (optional)' : 'Lyrics') : 'Song description'}
      promptPlaceholder={song.custom ? '[Verse]\nMorning light on an empty road…\n[Chorus]\n…' : 'An upbeat summer pop song about a road trip with friends'}
      goLabel="Create song"
      emptyTitle="Make a song"
      emptySub="Write lyrics and a style, or just describe the song. Suno makes two takes."
      explain={
        <How
          title="Create a song"
          steps={[
            'Custom lyrics: your words, a style (genre, tempo, instruments, voice) and a title — all three are needed.',
            'Just describe it: one line about the song; Suno writes the rest. Style and title are not sent in this mode.',
            'Instrumental drops the vocals. V5 is the newest model.',
          ]}
        />
      }
    />
  )
}

/* ---------- Isolate voice ---------- */

function IsolateTab({ header }: { header: ReactNode }) {
  return (
    <AudioRail
      key="isolate"
      tab="isolate"
      icon={Mic}
      {...common}
      draftKey="audio.isolate"
      filter={isIsolation}
      header={header}
      slots={[AUDIO_SLOT('Recording', 'Audio with a voice to pull out of the noise', /^audio_url$/)]}
      goLabel="Isolate voice"
      emptyTitle="Pull the voice out"
      emptySub="Add a recording; ElevenLabs strips the music and noise and keeps the voice."
    />
  )
}

/* ---------- surface ---------- */

function read(h: Handoff | null) {
  if (!h || !isAudioTab(h.mode)) return null
  // A track sent here becomes a cover; a Recreate opens the sub-tab its Suno model belongs to.
  const music = h.mode !== 'music' ? null : h.slots?.audio && !h.modelId ? ('cover' as const) : musicKindOf(h.modelId)
  // A video's "Change Voice" / "Translate" brings its clip along.
  const clip = h.mode === 'change' || h.mode === 'translate' ? (h.slots?.clip ?? h.slots?.video ?? h.slots?.audio) : undefined
  return { tab: h.mode, music, clip }
}

export function AudioSurface() {
  const [first] = useState(() => read(takeHandoff('audio')))
  const [tab, setTab] = useState<AudioTab>(() => first?.tab ?? loadMode('audio', TABS.map((t) => t.id)) ?? 'tts')
  useEffect(() => saveMode('audio', tab), [tab])
  // A clip playing in one tab's feed stops when the tab (or the surface) goes away.
  useEffect(() => stop, [tab])
  const [music, setMusic] = useState<MusicKind>(first?.music ?? 'create')
  useHandoff('audio', (h) => {
    const r = read(h)
    if (!r) return
    setTab(r.tab)
    if (r.music) setMusic(r.music)
  })
  const header = <ModeBar modes={TABS} value={tab} onPick={setTab} />
  const voices = useElevenVoices()

  switch (tab) {
    case 'tts':
      return <SpeechTab header={header} />
    case 'dialogue':
      return <DialogueTab header={header} />
    case 'music':
      return <MusicTab header={header} kind={music} setKind={setMusic} />
    case 'isolate':
      return <IsolateTab header={header} />
    case 'change':
    case 'translate':
      return <DubTab key={tab} mode={tab} header={header} icon={tab === 'change' ? Repeat : Languages} voices={voices} initialClip={first?.tab === tab ? first.clip : undefined} />
  }
}

