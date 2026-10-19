/**
 * Voice change and Translate — the reference app's two re-voicing tabs, on Trenchable's dub pipeline
 * (server/studio/dub.ts: local Whisper → ElevenLabs or Gemini per line on Kie → ffmpeg fit + mix →
 * optional Kie lip-sync). Not a catalogue model, so this rail is its own, in RailStudio's
 * shape: the voice card, `Add your clip`, the Language row (Translate), two switches, the
 * speech model, and Generate with what the run should cost.
 *
 * The voice card follows the Speech model: ElevenLabs voices for Multilingual v2 / Turbo 2.5,
 * Gemini's named voices for Gemini 3.1 Flash (each engine remembers its own pick). An ElevenLabs
 * run also carries a Gemini backup voice: if Kie's ElevenLabs fails mid-run, the server re-voices
 * the run with it and the row says so.
 *
 * The right pane is Audio's feed for this tab (AudioFeed.tsx), which shows the running dub
 * with its phase and lands the result as an ordinary history row.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Film, Loader2, X, type LucideIcon } from 'lucide-react'
import { useModels } from '../../api.ts'
import { uploadMedia } from '../../library.ts'
import { useHandoff } from '../../handoff.ts'
import { GoButton, RowPick, SlotTile } from '../../parts.tsx'
import { usePricing } from '../../pricing.ts'
import { AudioFeed } from './AudioFeed.tsx'
import { GEMINI_VOICES, GEMINI_TRAITS, geminiStandIn } from '../../voices.ts'
import { addDub, dubApi, dubPrices, DUB_TTS_MODELS, estimateDub, isGeminiDub, LANGUAGES, type DubMode } from './dub.ts'
import { GEMINI_DEFAULT, Switch, VoicePicker } from './editors.tsx'
import { Hint, How } from '../video/ModeBar.tsx'

const GEMINI_NAMES = GEMINI_VOICES.map((v) => v.name)
const BACKUP_CHOICES = GEMINI_NAMES.map((n) => ({ value: n, label: n, sub: GEMINI_TRAITS[n] }))

/** A choice that outlives a reload, in this browser only. */
function useStored(key: string, fallback: string): [string, (v: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  })
  const put = (v: string) => {
    setValue(v)
    try {
      localStorage.setItem(key, v)
    } catch {
      // Storage off: it lasts for this visit.
    }
  }
  return [value, put]
}

interface Clip {
  url: string
  kind: 'video' | 'audio'
  name: string
  /** Seconds, once the browser has read the file's header. */
  seconds: number | null
}

const kindOfUrl = (url: string): 'video' | 'audio' => (/\.(mp3|wav|m4a|aac|ogg|flac)(?:$|\?)/i.test(url) ? 'audio' : 'video')
const nameOfUrl = (url: string) => decodeURIComponent(url.split(/[?#]/)[0]!.split('/').pop() ?? 'clip')

export interface DubTabProps {
  mode: DubMode
  header: ReactNode
  icon: LucideIcon
  voices: string[]
  /** A clip handed over from another surface (a video's "Change Voice" / "Translate"). */
  initialClip?: string
}

export function DubTab({ mode, header, icon, voices, initialClip }: DubTabProps) {
  const translate = mode === 'translate'
  const [modelKey, setModel] = useStored('studio.audio.dub.model', DUB_TTS_MODELS[0]!.value)
  const model = DUB_TTS_MODELS.some((m) => m.value === modelKey) ? modelKey : DUB_TTS_MODELS[0]!.value
  const gemini = isGeminiDub(model)
  // Each engine keeps its own voice: switching Speech model swaps the card, not the other pick.
  const [elevenKey, setElevenVoice] = useStored('studio.audio.dub.voice', voices[0] ?? '')
  const elevenVoice = voices.includes(elevenKey) ? elevenKey : (voices[0] ?? '')
  const [geminiKey, setGeminiVoice] = useStored('studio.audio.dub.geminiVoice', GEMINI_DEFAULT)
  const geminiVoice = GEMINI_NAMES.includes(geminiKey) ? geminiKey : GEMINI_DEFAULT
  const voice = gemini ? geminiVoice : elevenVoice
  // ElevenLabs' backup on Gemini: picked here, else a stand-in for the chosen voice.
  const [backupKey, setBackup] = useStored('studio.audio.dub.backupVoice', '')
  const backup = GEMINI_NAMES.includes(backupKey) ? backupKey : geminiStandIn(elevenVoice)
  const [language, setLanguage] = useStored('studio.audio.dub.language', 'es')
  const [keepBackground, setKeep] = useState(true)
  const [lipSync, setLipSync] = useState(true)
  const [clip, setClip] = useState<Clip | null>(() => (initialClip ? { url: initialClip, kind: kindOfUrl(initialClip), name: nameOfUrl(initialClip), seconds: null } : null))
  const [busy, setBusy] = useState<'upload' | 'send' | null>(null)
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null)
  const file = useRef<HTMLInputElement>(null)

  useHandoff('audio', (h) => {
    const url = h.slots?.clip ?? h.slots?.video ?? h.slots?.audio
    if (url && (h.mode === mode || !h.mode)) setClip({ url, kind: h.slots?.audio && !h.slots.video ? 'audio' : kindOfUrl(url), name: nameOfUrl(url), seconds: null })
  })

  // The clip's length, for the cost: the browser reads it from the file's header.
  useEffect(() => {
    if (!clip || clip.seconds !== null) return
    const el = document.createElement(clip.kind === 'video' ? 'video' : 'audio')
    el.preload = 'metadata'
    el.onloadedmetadata = () => setClip((c) => (c && c.url === clip.url ? { ...c, seconds: Number.isFinite(el.duration) ? el.duration : null } : c))
    el.src = clip.url
    return () => {
      el.onloadedmetadata = null
      el.removeAttribute('src')
    }
  }, [clip])

  const { models: audioModels } = useModels('audio')
  const { models: videoModels } = useModels('video')
  const prices = usePricing()
  const ttsModel = audioModels?.find((m) => m.id === model) ?? null
  const lipModel = videoModels?.find((m) => m.id === 'market/volcengine-lip-sync') ?? null
  const doLip = translate && lipSync && clip?.kind === 'video'
  const estimate = useMemo(() => (prices ? estimateDub(clip?.seconds ?? null, dubPrices(prices.rows, ttsModel, lipModel), doLip) : null), [prices, clip?.seconds, ttsModel, lipModel, doLip])

  const blocker = !clip ? 'Add your clip first.' : !voice ? 'Pick a voice.' : translate && !language ? 'Pick a language.' : doLip && clip.seconds && clip.seconds > 240 ? 'Lip-sync takes clips up to 4 minutes; switch it off or use a shorter clip.' : null

  const pick = async (f: File | undefined) => {
    if (!f) return
    if (!/^(video|audio)\//.test(f.type)) {
      setNote({ bad: true, text: 'That is not a video or audio file.' })
      return
    }
    setBusy('upload')
    setNote(null)
    try {
      const { fileUrl } = await uploadMedia(f)
      setClip({ url: fileUrl, kind: f.type.startsWith('audio') ? 'audio' : 'video', name: f.name, seconds: null })
    } catch (e) {
      setNote({ bad: true, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const go = async () => {
    if (!clip || blocker || busy) return
    setBusy('send')
    setNote(null)
    try {
      const run = await dubApi.start({ mode, clipUrl: clip.url, voice, fallbackVoice: gemini ? undefined : backup, language: translate ? language : undefined, keepBackground, lipSync: doLip, model, name: clip.name })
      addDub(run)
      setNote({ bad: false, text: 'Started — it shows on the right as it goes.' })
    } catch (e) {
      setNote({ bad: true, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const languageChoices = LANGUAGES.map((l) => ({ value: l.code, label: `${l.flag} ${l.name}` }))
  const goLabel = translate ? 'Translate' : 'Change voice'

  return (
    <div className="st-split au-split">
      <aside className="st-rail">
        {header}
        <VoicePicker ids={voices} value={voice} onChange={gemini ? setGeminiVoice : setElevenVoice} gemini={gemini} label={translate ? 'Voice (speaks the translation)' : 'New voice'} />

        <div className="st-slots">
          <div
            className="st-slot-wrap is-wide"
            onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
            onDrop={(e) => {
              const f = e.dataTransfer.files?.[0]
              if (!f) return
              e.preventDefault()
              void pick(f)
            }}
          >
            {clip ? (
              <div className="au-clip">
                {clip.kind === 'video' ? <video className="au-clip-media" src={clip.url} muted playsInline preload="metadata" controls /> : <audio className="au-clip-media is-audio" src={clip.url} preload="metadata" controls />}
                <div className="au-clip-meta">
                  <span className="au-clip-name" title={clip.name}>
                    {clip.name}
                  </span>
                  <span className="st-pop-sub">
                    {clip.kind === 'video' ? 'Video' : 'Audio'}
                    {clip.seconds ? ` · ${Math.round(clip.seconds)} s` : ''}
                  </span>
                </div>
                <button type="button" className="st-slot-tool" title="Remove the clip" aria-label="Remove the clip" onClick={() => setClip(null)}>
                  <X size={12} />
                </button>
              </div>
            ) : (
              <SlotTile icon={Film} title="Add your clip" sub={translate ? 'A video (or audio) with someone speaking — required' : 'A video or audio with the voice to change — required'} wide onPick={() => file.current?.click()} />
            )}
            {busy === 'upload' && <Loader2 size={14} className="st-spin st-slot-busy" />}
          </div>
        </div>
        <input
          ref={file}
          type="file"
          accept="video/*,audio/*"
          hidden
          onChange={(e) => {
            void pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {translate && <RowPick label="Language" value={language} choices={languageChoices} onPick={setLanguage} search />}
        <RowPick label="Speech model" value={model} choices={DUB_TTS_MODELS} onPick={setModel} />
        {!gemini && <RowPick label="Backup voice (Gemini)" value={backup} choices={BACKUP_CHOICES} onPick={setBackup} search />}
        <Switch on={keepBackground} onChange={setKeep} label="Keep background sound" />
        {translate && clip?.kind !== 'audio' && <Switch on={lipSync} onChange={setLipSync} label="Lip-sync the video" />}
        {translate && clip?.kind === 'audio' && <Hint>Lip-sync needs a video; an audio clip comes back as a dubbed track.</Hint>}

        <div className="st-rail-foot">
          {note ? <p className={`st-note ${note.bad ? '' : 'is-ok'}`}>{note.text}</p> : clip && blocker ? <p className="st-note">{blocker}</p> : null}
          <div className="st-rail-go">
            <GoButton label={goLabel} credits={estimate?.credits ?? null} title={estimate?.detail ?? 'The cost shows once the clip has loaded.'} disabled={Boolean(blocker)} busy={busy === 'send'} wide onClick={() => void go()} />
          </div>
        </div>
      </aside>
      <AudioFeed
        tab={mode}
        empty={{
          icon,
          title: translate ? 'Speak it in another language' : 'Same performance, new voice',
          sub: translate ? 'Add a clip and pick the language — every line is translated, voiced in time with the original and lip-synced.' : 'Add a clip and pick a voice — every line is re-voiced in time with the original, over its own background sound.',
        }}
        explain={
          <How
            title={translate ? 'Translate' : 'Voice change'}
            steps={[
              'The clip is transcribed on this computer (Whisper) — free — into lines with their timings.',
              translate ? 'Each line is translated, kept short enough to be said in its own slot.' : 'Each line keeps its words.',
              'ElevenLabs or Gemini voices every line in the chosen voice on Kie; each take is sped up or slowed (0.75–1.35×) to fit where the original line was.',
              'If Kie’s ElevenLabs fails with its internal error, the run switches once to Gemini 3.1 Flash in the backup voice and voices every line again there, so it still finishes — the row then says “Voiced with Gemini”.',
              'Keep background sound lays the new voice over the original with the old speech ducked out; off gives the new voice alone.',
              translate ? 'Lip-sync (video only) runs the dubbed video through Volcengine on Kie so the mouth matches the new words — about 8 credits a second.' : 'A video comes back with the new track muxed over its picture.',
            ]}
          />
        }
      />
    </div>
  )
}
