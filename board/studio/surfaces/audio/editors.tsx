/**
 * The rail editors Audio needs that a model's raw fields can't give: a voice picker with
 * names and a play button, the dialogue line editor, Gemini's speaker/turn editor, the
 * Suno song form and the past-track picker.
 *
 * Each is controlled — the tab holds the rows and turns them into field values
 * (audio/logic.ts), so what is on screen is exactly what gets sent.
 */
import { useMemo, useState } from 'react'
import { ChevronDown, Pause, Play, Plus, Trash2, X } from 'lucide-react'
import { mediaUrl } from '../../api.ts'
import { GEMINI_38_VOICES, GEMINI_ACCENTS, GEMINI_PACES, GEMINI_STYLES, GEMINI_VOICES, elevenOptions, geminiOptions, swatchOf, voiceLabel, voiceName, voicePreviewUrl } from '../../voices.ts'
import { toggle as togglePlayer, usePlayingUrl, useProgress } from './player.ts'
import { VoiceModal, VoiceSwatch } from './VoiceModal.tsx'
import { Hint, SubSwitch } from '../video/ModeBar.tsx'
import {
  DIALOGUE_LIMIT,
  GEMINI_MAX_SPEAKERS,
  STABILITY,
  SUNO_VERSIONS,
  dialogueLength,
  languageName,
  songProblems,
  sunoPromptLimit,
  sunoStyleLimit,
  type DialogueRow,
  type GeminiSpeaker,
  type GeminiTurn,
  type SongForm,
  type Track,
} from './logic.ts'
import '../media.css'

/* ---------- preview player ---------- */

/** One clip at a time across Audio (player.ts): starting a preview stops a feed row too. */
function usePreview() {
  return { playing: usePlayingUrl(), toggle: togglePlayer }
}

function PlayButton({ url, playing, onToggle, label }: { url: string; playing: string | null; onToggle: (url: string) => void; label: string }) {
  const on = playing === url
  return (
    <button type="button" className={`st-play ${on ? 'is-on' : ''}`} title={on ? 'Stop' : `Play ${label}`} aria-label={on ? 'Stop' : `Play ${label}`} onClick={() => onToggle(url)}>
      {on ? <Pause size={12} /> : <Play size={12} />}
    </button>
  )
}

/* ---------- ElevenLabs voice picker ---------- */

/** Gemini's default voice in the pickers (the dub server's GEMINI_DEFAULT_VOICE too). */
export const GEMINI_DEFAULT = 'Kore'

/**
 * Their "Pick a voice": the chosen voice as a card — swatch with ▶, name, note, a progress
 * line while the sample plays — with ✕ (back to the default voice) and Change, which opens
 * the voice grid. The value is still one id in the `voice` field. With `gemini` it offers Gemini
 * 3.1 Flash's voices by name instead (the dub tabs' Speech model decides); Google hosts no samples.
 */
export function VoicePicker({ ids, value, onChange, label = 'Voice', gemini = false }: { ids: string[]; value: string; onChange: (id: string) => void; label?: string; gemini?: boolean }) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => (gemini ? geminiOptions(GEMINI_VOICES) : elevenOptions(ids)), [ids, gemini])
  const url = gemini ? undefined : voicePreviewUrl(value)
  const progress = useProgress(url)
  const name = gemini ? value : voiceName(value, ids)
  const note = options.find((o) => o.id === value)?.note
  const fallback = gemini ? GEMINI_DEFAULT : ids[0]
  return (
    <div className="au-voice">
      <span className="st-field-label">{label}</span>
      <div className="au-voice-card">
        <VoiceSwatch name={name} url={url} size={44} />
        <button type="button" className="au-voice-main" onClick={() => setOpen(true)} title="Change voice" aria-haspopup="dialog">
          <span className="au-voice-name">{name}</span>
          <span className="au-voice-note">{note ? (gemini ? `${note} · Gemini voice` : note) : gemini ? 'Gemini voice' : 'ElevenLabs voice'}</span>
          <span className="au-voice-bar" aria-hidden>
            <span style={{ width: `${Math.round(progress * 100)}%` }} />
          </span>
        </button>
        <span className="au-voice-tools">
          {fallback && value !== fallback && (
            <button type="button" className="pl-iconbtn is-quiet au-mini" title={`Back to ${gemini ? fallback : voiceName(fallback, ids)} (the default)`} aria-label="Back to the default voice" onClick={() => onChange(fallback)}>
              <X size={13} />
            </button>
          )}
          <button type="button" className="st-src-change" onClick={() => setOpen(true)}>
            Change
          </button>
        </span>
      </div>
      {open && <VoiceModal title="Select a voice" voices={options} value={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** A dialogue line's voice: a small swatch-and-name button that opens the same grid. */
function LineVoice({ ids, value, onChange, line }: { ids: string[]; value: string; onChange: (id: string) => void; line: number }) {
  const [open, setOpen] = useState(false)
  const options = useMemo(() => elevenOptions(ids), [ids])
  const name = voiceName(value, ids)
  return (
    <>
      <button type="button" className="au-linevoice" onClick={() => setOpen(true)} aria-label={`Voice for line ${line}: ${voiceLabel(value, ids)}`} title={voiceLabel(value, ids)}>
        <span className="au-linevoice-dot" style={{ background: swatchOf(name) }} />
        <span className="au-linevoice-name">{name}</span>
        <ChevronDown size={12} />
      </button>
      {open && <VoiceModal title={`Voice for line ${line}`} voices={options} value={value} onPick={onChange} onClose={() => setOpen(false)} />}
    </>
  )
}

/* ---------- ElevenLabs dialogue ---------- */

export function DialogueEditor({
  rows,
  onChange,
  voices,
  stability,
  onStability,
  language,
  onLanguage,
  languages,
}: {
  rows: DialogueRow[]
  onChange: (rows: DialogueRow[]) => void
  voices: string[]
  stability: number
  onStability: (v: number) => void
  language: string
  onLanguage: (code: string) => void
  languages: string[]
}) {
  const { playing, toggle } = usePreview()
  const total = dialogueLength(rows)
  const set = (i: number, patch: Partial<DialogueRow>) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)))
  const add = () => {
    // Back and forth, the way a conversation goes: the voice from two lines up, else a new one.
    const last = rows[rows.length - 1]?.voice
    const voice = rows[rows.length - 2]?.voice ?? voices.find((v) => v !== last) ?? voices[0] ?? ''
    onChange([...rows, { voice, text: '' }])
  }
  const sortedLanguages = useMemo(() => [...languages].sort((a, b) => languageName(a).localeCompare(languageName(b))), [languages])
  return (
    <div className="st-lines">
      <span className="st-field-label">Lines</span>
      {rows.map((r, i) => (
        <div key={i} className="st-line">
          <div className="st-line-head">
            <PlayButton url={voicePreviewUrl(r.voice)} playing={playing} onToggle={toggle} label={voiceName(r.voice, voices)} />
            <LineVoice ids={voices} value={r.voice} onChange={(voice) => set(i, { voice })} line={i + 1} />
            <button type="button" className="st-slot-tool" title="Remove line" aria-label="Remove line" disabled={rows.length <= 1} onClick={() => onChange(rows.filter((_, n) => n !== i))}>
              <Trash2 size={12} />
            </button>
          </div>
          <textarea className="st-line-text" rows={2} placeholder={i === 0 ? '[excited] You will not believe what I found…' : 'The reply…'} value={r.text} onChange={(e) => set(i, { text: e.target.value })} />
        </div>
      ))}
      <div className="st-lines-foot">
        <button type="button" className="st-src-more" onClick={add}>
          <Plus size={12} /> Add line
        </button>
        <span className={`st-field-count ${total > DIALOGUE_LIMIT ? 'is-over' : ''}`}>
          {total.toLocaleString()} / {DIALOGUE_LIMIT.toLocaleString()}
        </span>
      </div>
      <span className="st-field-label">Delivery</span>
      <SubSwitch options={STABILITY.map((s) => ({ id: String(s.value), label: s.label }))} value={String(stability)} onPick={(v) => onStability(Number(v))} />
      <label className="st-inline-select">
        <span className="st-field-label">Language</span>
        <select className="st-select" value={language} onChange={(e) => onLanguage(e.target.value)}>
          <option value="">Detect from the text</option>
          {sortedLanguages.map((c) => (
            <option key={c} value={c}>
              {languageName(c)}
            </option>
          ))}
        </select>
      </label>
      <Hint>Audio tags in square brackets — [laughs], [whispers], [sighs] — set how a line is said.</Hint>
    </div>
  )
}

/* ---------- Gemini speakers and turns ---------- */

/** the reference app's cap on the voice description. */
export const VOICE_DETAILS_LIMIT = 500

/**
 * Their "Voice details" box for a model that takes a described voice: free text, 0/500. For
 * Gemini 2.5 Pro / 3.1 Flash it is the speaker's `audio_profile` — the slot Gemini's own
 * prompt guide uses to say who is speaking and how (logic.ts `geminiSpeakers`).
 */
export function VoiceDetails({ value, onChange, speaker }: { value: string; onChange: (v: string) => void; speaker: number | null }) {
  return (
    <label className="st-field">
      <span className="st-field-label">
        {speaker ? `Voice details · S${speaker}` : 'Voice details'}
        <span className={`st-field-count ${value.length > VOICE_DETAILS_LIMIT ? 'is-over' : ''}`}>
          {value.length}/{VOICE_DETAILS_LIMIT}
        </span>
      </span>
      <textarea rows={3} maxLength={VOICE_DETAILS_LIMIT} placeholder="Young female voice with british accent, soft and loud. Excited, giggling" value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  )
}

export function SpeakerEditor({
  v38,
  speakers,
  onSpeakers,
  turns,
  onTurns,
}: {
  v38: boolean
  speakers: GeminiSpeaker[]
  onSpeakers: (s: GeminiSpeaker[]) => void
  turns: GeminiTurn[]
  onTurns: (t: GeminiTurn[]) => void
}) {
  const voices = v38 ? GEMINI_38_VOICES : GEMINI_VOICES
  const groups = useMemo(() => {
    const out = new Map<string, string[]>()
    for (const v of voices) out.set(v.note || 'Voices', [...(out.get(v.note || 'Voices') ?? []), v.name])
    return [...out]
  }, [voices])
  const setSpeaker = (i: number, patch: Partial<GeminiSpeaker>) => onSpeakers(speakers.map((s, n) => (n === i ? { ...s, ...patch } : s)))
  const setTurn = (i: number, patch: Partial<GeminiTurn>) => onTurns(turns.map((t, n) => (n === i ? { ...t, ...patch } : t)))
  const removeSpeaker = (i: number) => {
    onSpeakers(speakers.filter((_, n) => n !== i))
    onTurns(turns.map((t) => ({ ...t, speaker: 0 })))
  }
  return (
    <div className="st-lines">
      <span className="st-field-label">Speakers</span>
      {speakers.map((s, i) => (
        <div key={i} className="st-line">
          <div className="st-line-head">
            <span className="st-speaker-tag">S{i + 1}</span>
            <select className="st-select" value={s.voice} onChange={(e) => setSpeaker(i, { voice: e.target.value })} aria-label={`Voice for speaker ${i + 1}`}>
              {groups.map(([group, names]) =>
                groups.length > 1 ? (
                  <optgroup key={group} label={group}>
                    {names.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  names.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))
                ),
              )}
            </select>
            {speakers.length > 1 && (
              <button type="button" className="st-slot-tool" title="Remove speaker" aria-label="Remove speaker" onClick={() => removeSpeaker(i)}>
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {!v38 && (
            <>
              <VoiceDetails value={s.profile ?? ''} onChange={(profile) => setSpeaker(i, { profile })} speaker={speakers.length > 1 ? i + 1 : null} />
              <div className="st-speaker-grid">
                <select className="st-select" value={s.accent ?? 'Neutral'} onChange={(e) => setSpeaker(i, { accent: e.target.value })} aria-label="Accent">
                  {GEMINI_ACCENTS.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <select className="st-select" value={s.style ?? ''} onChange={(e) => setSpeaker(i, { style: e.target.value || undefined })} aria-label="Style">
                  <option value="">Any style</option>
                  {GEMINI_STYLES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
                <select className="st-select" value={s.pace ?? ''} onChange={(e) => setSpeaker(i, { pace: e.target.value || undefined })} aria-label="Pace">
                  <option value="">Any pace</option>
                  {GEMINI_PACES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
        </div>
      ))}
      {speakers.length < GEMINI_MAX_SPEAKERS && (
        <button type="button" className="st-src-more" onClick={() => onSpeakers([...speakers, { voice: voices[1]?.name ?? voices[0]!.name, accent: 'Neutral' }])}>
          <Plus size={12} /> Add a second speaker
        </button>
      )}

      <span className="st-field-label">Lines</span>
      {turns.map((t, i) => (
        <div key={i} className="st-line">
          <div className="st-line-head">
            {speakers.length > 1 ? (
              <SubSwitch options={speakers.map((_, n) => ({ id: String(n), label: `S${n + 1}` }))} value={String(Math.min(t.speaker, speakers.length - 1))} onPick={(v) => setTurn(i, { speaker: Number(v) })} />
            ) : (
              <span className="st-speaker-tag">S1</span>
            )}
            <span style={{ flex: 1 }} />
            <button type="button" className="st-slot-tool" title="Remove line" aria-label="Remove line" disabled={turns.length <= 1} onClick={() => onTurns(turns.filter((_, n) => n !== i))}>
              <Trash2 size={12} />
            </button>
          </div>
          <textarea className="st-line-text" rows={2} placeholder={v38 ? 'Hello there. <laugh> That works.' : '[whispers] Once upon a time…'} value={t.text} onChange={(e) => setTurn(i, { text: e.target.value })} />
        </div>
      ))}
      <button type="button" className="st-src-more" onClick={() => onTurns([...turns, { speaker: speakers.length > 1 ? (turns[turns.length - 1]?.speaker === 0 ? 1 : 0) : 0, text: '' }])}>
        <Plus size={12} /> Add line
      </button>
      <Hint>{v38 ? 'Tags in angle brackets — <laugh>, <sigh>, <whispers>, <short pause> — go inside a line.' : 'Tags in square brackets — [whispers], [shouting], [pensive] — set how a line is said.'}</Hint>
    </div>
  )
}

/* ---------- Suno song form ---------- */

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="st-toggle-row">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={`st-switch ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
        <span />
      </button>
    </label>
  )
}

export function SongFormView({ value, onChange, allowSimple = true }: { value: SongForm; onChange: (f: SongForm) => void; allowSimple?: boolean }) {
  const set = (patch: Partial<SongForm>) => onChange({ ...value, ...patch })
  const problems = songProblems(value)
  return (
    <div className="st-lines">
      {allowSimple && (
        <SubSwitch
          options={[
            { id: 'custom', label: 'Custom lyrics' },
            { id: 'simple', label: 'Just describe it' },
          ]}
          value={value.custom ? 'custom' : 'simple'}
          onPick={(v) => set({ custom: v === 'custom' })}
        />
      )}
      <Switch on={value.instrumental} onChange={(instrumental) => set({ instrumental })} label="Instrumental (no vocals)" />
      {value.custom && (
        <>
          <label className="st-field">
            <span className="st-field-label">
              Style
              <span className={`st-field-count ${value.style.length > sunoStyleLimit(value.version) ? 'is-over' : ''}`}>
                {value.style.length} / {sunoStyleLimit(value.version)}
              </span>
            </span>
            <textarea rows={2} placeholder="Warm indie folk, fingerpicked guitar, soft female vocal, 90 bpm" value={value.style} onChange={(e) => set({ style: e.target.value })} />
          </label>
          <label className="st-field">
            <span className="st-field-label">Title</span>
            <input placeholder="Song title" maxLength={100} value={value.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
        </>
      )}
      <span className="st-field-label">Version</span>
      <SubSwitch options={SUNO_VERSIONS.map((v) => ({ id: v.value, label: v.label }))} value={value.version} onPick={(version) => set({ version })} />
      <Hint>
        {value.custom
          ? value.instrumental
            ? `The box below is optional direction for the track (up to ${sunoPromptLimit(value)} characters).`
            : `The box below holds the lyrics — up to ${sunoPromptLimit(value)} characters. Section tags like [Verse] and [Chorus] help.`
          : `Describe the song in the box below, up to ${sunoPromptLimit(value)} characters; Suno writes the lyrics, style and title.`}
      </Hint>
      {problems.map((p) => (
        <Hint key={p} warn>
          {p}
        </Hint>
      ))}
    </div>
  )
}

/* ---------- past Suno tracks ---------- */

const mmss = (s?: number) => (s && s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '')

export function TrackPicker({ tracks, value, onPick }: { tracks: Track[]; value: Track | null; onPick: (t: Track | null) => void }) {
  const { playing, toggle } = usePreview()
  const [shown, setShown] = useState(8)
  const [browsing, setBrowsing] = useState(false)
  const open = browsing || !value
  const row = (t: Track, pick?: boolean) => {
    const url = mediaUrl(t.media)
    return (
      <div key={`${t.item.taskId}:${t.audioId}`} className={`st-voice-row ${value?.audioId === t.audioId ? 'is-on' : ''}`}>
        {url && <PlayButton url={url} playing={playing} onToggle={toggle} label={t.media.title ?? 'track'} />}
        <button
          type="button"
          className="st-voice-pick"
          onClick={() => {
            if (!pick) return
            onPick(t)
            setBrowsing(false)
          }}
        >
          <span>{t.media.title || t.item.prompt?.slice(0, 40) || 'Untitled'}</span>
          <span className="st-pop-sub">{mmss(t.media.duration)}</span>
        </button>
      </div>
    )
  }
  return (
    <div className="st-src">
      <div className="st-src-head">
        <span className="st-field-label">Song to continue (optional)</span>
        {value && (
          <button type="button" className="st-src-change" onClick={() => setBrowsing((v) => !v)}>
            {browsing ? 'Done' : 'Change'}
          </button>
        )}
        {value && (
          <button type="button" className="st-src-change" onClick={() => onPick(null)}>
            Clear
          </button>
        )}
      </div>
      {value && <div className="st-src-card is-track">{row(value)}</div>}
      {open &&
        (tracks.length ? (
          <div className="st-voice-list is-flat">
            {tracks.slice(0, shown).map((t) => row(t, true))}
            {tracks.length > shown && (
              <button type="button" className="st-src-more" onClick={() => setShown((n) => n + 8)}>
                Show more ({tracks.length - shown})
              </button>
            )}
          </div>
        ) : (
          <Hint>No Suno songs yet — make one in Create song, or upload a track below.</Hint>
        ))}
    </div>
  )
}
