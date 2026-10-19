/**
 * Create Video's preset card, as theirs: "GENERAL · Seedance 2.5" with a `Change` that
 * opens the preset catalogue. General means no recipe; a preset is a prompt recipe plus a
 * few locked settings (presets.ts), loaded the way the Presets page loads one — the
 * recipe goes into the prompt box, its settings are locked onto the job, and jobs from it
 * are tracked so its card gets your latest result as the cover.
 *
 * The catalogue opens as a modal over the page, filtered to video recipes, reusing the
 * Presets page's grid and filter chips.
 */
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftRight, Clapperboard, Search, X } from 'lucide-react'
import { useHistory, type ModelDefinition } from '../../api.ts'
import { familyTitle } from '../../families.ts'
import { Chips, Empty } from '../../parts.tsx'
import { PRESETS, filterPresets, groupsFor, indexHistory, lockedLabels, presetCover, presetTag, type Preset, type PresetGroup } from '../../presets.ts'
import { PresetGrid } from '../pageParts.tsx'
import { useAllTracked } from '../track.ts'
import '../studio-pages.css'
import './video.css'

const KEY = 'studio.video.preset'

/** Video recipes only: the Create tab makes clips. */
export const VIDEO_PRESETS = PRESETS.filter((p) => p.modelClass === 'video' || p.modelClass === 'video-ref')

export function loadPreset(): Preset | null {
  try {
    const id = window.localStorage.getItem(KEY)
    return VIDEO_PRESETS.find((p) => p.id === id) ?? null
  } catch {
    return null
  }
}

export function savePreset(p: Preset | null) {
  try {
    if (p) window.localStorage.setItem(KEY, p.id)
    else window.localStorage.removeItem(KEY)
  } catch {
    // Storage off: the preset just isn't remembered.
  }
}

export function PresetCard({ preset, model, onChange }: { preset: Preset | null; model: ModelDefinition | null; onChange: () => void }) {
  const tracked = useAllTracked()
  const { items } = useHistory()
  const cover = useMemo(() => (preset ? presetCover(tracked[presetTag(preset.id)], indexHistory(items)) : null), [preset, tracked, items])
  const locks = preset ? lockedLabels(preset.params) : []
  return (
    <div className="st-vcard" data-preset={preset?.id ?? 'general'}>
      <span className={`st-vcard-thumb ${cover ? 'has-cover' : ''}`}>
        {cover ? cover.video ? <video src={cover.src} muted playsInline preload="metadata" /> : <img src={cover.src} alt="" /> : <Clapperboard size={18} />}
      </span>
      <span className="st-vcard-text">
        <span className="st-vcard-kicker">{preset ? preset.title : 'General'}</span>
        <span className="st-vcard-title">{model ? familyTitle(model) || model.title : 'Loading…'}</span>
        {locks.length > 0 && <span className="st-vcard-sub">{locks.join(' · ')}</span>}
      </span>
      <button type="button" className="vw-btn is-sm st-vcard-change" onClick={onChange}>
        <ArrowLeftRight size={12} /> Change
      </button>
    </div>
  )
}

/**
 * The video preset catalogue in a modal; General (no recipe) comes first. Genjutsu is not in
 * it: since 2026-10-19 it is its own lane (GenjutsuSurface.tsx).
 */
export function PresetPicker({ current, onPick, onClose }: { current: Preset | null; onPick: (p: Preset | null) => void; onClose: () => void }) {
  const [group, setGroup] = useState<PresetGroup | 'all'>('all')
  const [q, setQ] = useState('')
  const groups = groupsFor(VIDEO_PRESETS, 'video')
  const safe = groups.some((g) => g.id === group) ? group : 'all'
  const shown = filterPresets(VIDEO_PRESETS, { group: safe, type: 'video', q })
  return createPortal(
    <div className="st-vmodal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="st-vmodal pl-panel" role="dialog" aria-label="Choose a preset">
        <div className="st-vmodal-head">
          <div>
            <h3 className="st-vmodal-title">Presets</h3>
            <p className="sp-sub">{VIDEO_PRESETS.length} video recipes. Picking one loads its prompt and settings into Create Video.</p>
          </div>
          <label className="st-mention-search sp-search">
            <Search size={13} />
            <input placeholder="Search presets…" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />
          </label>
          <button type="button" className="st-vmodal-x" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="sp-filter-bar">
          <Chips options={groups} value={safe} onPick={setGroup} />
          <button type="button" className={`st-chip ${current ? '' : 'is-active'}`} onClick={() => onPick(null)}>
            General — no recipe
          </button>
        </div>
        <div className="st-vmodal-body">
          {shown.length ? <PresetGrid presets={shown} active={current?.id} onOpen={onPick} /> : <Empty icon={Clapperboard} title="Nothing matches" sub="Try another category, or clear the search." />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
