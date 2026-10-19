/**
 * Presets — filter chips over an even grid of recipe cards, for
 * images and video alike.
 *
 * Picking a card does not navigate anywhere. A composer opens above the grid with the
 * whole recipe in the box — here you see and edit the recipe itself, unlike Effects,
 * which hides it — and that recipe's own results collect under it. Each card's cover
 * is your latest result from it (presets.ts).
 */
import { useMemo, useRef, useState } from 'react'
import { LayoutTemplate, Search, X } from 'lucide-react'
import { Composer } from '../Composer.tsx'
import { useHistory } from '../api.ts'
import { useJobs } from '../jobs.ts'
import { Chips, Empty, IconPill, SectionHead } from '../parts.tsx'
import { PRESETS, PRESET_TYPES, applyPreset, categoryOf, filterPresets, groupLabel, groupsFor, lockedLabels, presetKind, presetTag, recipeResults, taskRecipes, type Preset, type PresetGroup, type PresetType } from '../presets.ts'
import { PresetGrid, ResultsGrid } from './pageParts.tsx'
import { trackJobs, useAllTracked } from './track.ts'
import './studio-pages.css'

export function PresetsSurface() {
  const [group, setGroup] = useState<PresetGroup | 'all'>('all')
  const [type, setType] = useState<PresetType>('all')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Preset | null>(null)
  const top = useRef<HTMLDivElement>(null)

  const groups = groupsFor(PRESETS, type)
  const safeGroup = groups.some((g) => g.id === group) ? group : 'all'
  const shown = filterPresets(PRESETS, { group: safeGroup, type, q })

  return (
    <div className="st-page">
      <div ref={top} className="sp-head">
        <div>
          <h2 className="sp-title">Presets</h2>
          <p className="sp-sub">{PRESETS.length} recipes for stills and clips. Pick one to load it into the composer, edit it, and generate.</p>
        </div>
        <label className="st-mention-search sp-search">
          <Search size={13} />
          <input placeholder="Search presets…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {open && <OpenPreset key={open.id} preset={open} onClose={() => setOpen(null)} />}

      <div className="sp-filter-bar">
        <Chips options={groups} value={safeGroup} onPick={setGroup} />
        <Chips options={PRESET_TYPES} value={type} onPick={setType} />
      </div>
      {shown.length ? (
        <PresetGrid
          presets={shown}
          active={open?.id}
          onOpen={(p) => {
            setOpen(p)
            window.requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
          }}
        />
      ) : (
        <Empty icon={LayoutTemplate} title="Nothing matches" sub="Try another category or type, or clear the search." />
      )}
    </div>
  )
}

function OpenPreset({ preset, onClose }: { preset: Preset; onClose: () => void }) {
  // This recipe's results wherever they were run from (Effects, Video's preset card, here):
  // the tracker's tags, and the recipe's own words in the prompt (presets.ts `recipeOfItem`).
  const tracked = useAllTracked()
  const { items } = useHistory()
  const byTask = useMemo(() => taskRecipes(tracked), [tracked])
  const results = useMemo(() => recipeResults(items, preset.id, byTask), [items, preset.id, byTask])
  const jobs = useJobs().filter((j) => j.meta.surface === 'presets' && j.meta.label === preset.title && j.status !== 'done')
  const locks = lockedLabels(preset.params)

  return (
    <div className="st-section sp-open-preset" style={{ marginTop: 0 }}>
      <SectionHead
        title={preset.title}
        right={
          <>
            <span className="sp-hint">
              {groupLabel(preset.group)} · {presetKind(preset) === 'video' ? 'Video' : 'Image'}
              {locks.length ? ` · ${locks.join(', ')}` : ''}
            </span>
            <IconPill icon={X} title="Close preset" onClick={onClose} />
          </>
        }
      />
      {preset.note && <p className="sp-hint">{preset.note}. Replace “the subject” with yours, or describe it with the + and @ references.</p>}
      <Composer
        surface="presets"
        inline
        category={categoryOf(preset)}
        klass={preset.modelClass}
        seed={applyPreset(preset, '')}
        locked={preset.params}
        meta={{ label: preset.title }}
        onSubmitted={(ids) => trackJobs(ids, presetTag(preset.id))}
        placeholder="Describe the subject…"
      />
      <ResultsGrid jobs={jobs} items={results} />
    </div>
  )
}
