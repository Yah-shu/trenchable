/**
 * the reference app's "Select or add a voice": a modal grid of voice cards — swatch, name, the
 * note, ▶ with the clip's waveform filling in as it plays — a search box and filter chips
 * (the uses voices.ts reads off each voice's note). The current voice is ringed; a pick
 * closes the modal. Kie has no voice cloning, so there is no "add" half.
 */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, Pause, Play, Search } from 'lucide-react'
import { Modal } from '../cinema/CameraModals.tsx'
import { findVoices, swatchOf, voiceChips, type VoiceOption } from '../../voices.ts'
import { toggle, usePlaying, useProgress } from './player.ts'
import { usePeaks, Waveform } from './waveform.tsx'
import './audio.css'

/** The square swatch with ▶ / ❚❚ — the same on a card, in the rail and on a feed row. */
export function VoiceSwatch({ name, url, size = 40 }: { name: string; url?: string; size?: number }) {
  const on = usePlaying(url)
  return (
    <button
      type="button"
      className={`au-swatch ${on ? 'is-on' : ''}`}
      style={{ background: swatchOf(name), width: size, height: size }}
      disabled={!url}
      aria-label={on ? `Pause ${name}` : `Play ${name}`}
      title={url ? (on ? 'Pause' : 'Play a sample') : 'No sample for this voice'}
      onClick={(e) => {
        e.stopPropagation()
        if (url) toggle(url)
      }}
    >
      {url ? on ? <Pause size={size > 32 ? 16 : 13} /> : <Play size={size > 32 ? 16 : 13} /> : null}
    </button>
  )
}

function VoiceCard({ v, on, onPick }: { v: VoiceOption; on: boolean; onPick: () => void }) {
  const playing = usePlaying(v.preview)
  const progress = useProgress(v.preview)
  // A preview's bars are fetched only once it has been played, not for all 67 cards.
  const [heard, setHeard] = useState(false)
  if (playing && !heard) setHeard(true)
  const peaks = usePeaks(v.preview, heard)
  return (
    <div className={`au-vcard ${on ? 'is-on' : ''}`}>
      <VoiceSwatch name={v.name} url={v.preview} />
      <button type="button" className="au-vcard-pick" onClick={onPick} aria-pressed={on} title={`Use ${v.name}`}>
        <span className="au-vcard-name">
          {v.name}
          {on && <Check size={13} />}
        </span>
        {/* A voice with no note shows its chips in the note's place, once. */}
        <span className="au-vcard-note">{v.note || v.tags.join(' · ') || 'No description from Kie'}</span>
        {heard ? (
          <Waveform peaks={peaks} progress={progress} small />
        ) : (
          v.note &&
          v.tags.length > 0 && (
            <span className="au-vcard-tags">
              {v.tags.slice(0, 3).map((t) => (
                <span key={t} className="pl-badge pl-badge--quiet">
                  {t}
                </span>
              ))}
            </span>
          )
        )}
      </button>
    </div>
  )
}

export function VoiceModal({ title = 'Select a voice', voices, value, onPick, onClose }: { title?: string; voices: VoiceOption[]; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const chips = useMemo(() => voiceChips(voices), [voices])
  const shown = findVoices(voices, q, tag)
  return createPortal(
    <Modal title={title} onClose={onClose} wide>
      <div className="au-vmodal-tools">
        <label className="au-vsearch">
          <Search size={14} />
          <input placeholder={`Search ${voices.length} voices…`} value={q} autoFocus onChange={(e) => setQ(e.target.value)} aria-label="Search voices" />
        </label>
        {chips.length > 0 && (
          <div className="st-chips" role="group" aria-label="Filter voices">
            <button type="button" className={`st-chip ${tag === null ? 'is-active' : ''}`} onClick={() => setTag(null)}>
              All
            </button>
            {chips.map((c) => (
              <button key={c.tag} type="button" className={`st-chip ${tag === c.tag ? 'is-active' : ''}`} onClick={() => setTag(tag === c.tag ? null : c.tag)}>
                {c.tag} <span className="au-chip-n">{c.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {shown.length ? (
        <div className="au-vgrid">
          {shown.map((v) => (
            <VoiceCard
              key={v.id}
              v={v}
              on={v.id === value}
              onPick={() => {
                onPick(v.id)
                onClose()
              }}
            />
          ))}
        </div>
      ) : (
        <p className="st-hint">No voice matches. Clear the search or pick another chip.</p>
      )}
    </Modal>,
    document.body,
  )
}
