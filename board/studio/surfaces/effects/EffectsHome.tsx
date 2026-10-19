/**
 * Effects' home, laid out as the reference app's `/effects`: a "Visual effects" hero, a cloud of
 * every effect's name (a click opens it), then the effects themselves as a masonry of
 * previews — each one your own newest result made with it (EffectCover). Trenchable's category
 * and type chips and the search stay above the masonry.
 */
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard, Image as ImageIcon, Search, Sparkles } from 'lucide-react'
import { Chips, Empty } from '../../parts.tsx'
import { PRESET_TYPES, filterPresets, groupLabel, groupsFor, lockedLabels, presetKind, type PresetGroup, type PresetType } from '../../presets.ts'
import { EffectCover } from './EffectCover.tsx'
import { EFFECTS, loadFilters, saveFilters, useEffectIndex } from './data.ts'
import { goEffect } from './route.ts'

/** Where the home was scrolled to, so Back from an effect lands on the same card. */
let homeScroll = 0

export function EffectsHome() {
  const [filters, setFilters] = useState(loadFilters)
  const [q, setQ] = useState('')
  const { covers } = useEffectIndex()
  const page = useRef<HTMLDivElement>(null)

  const type = (PRESET_TYPES.some((t) => t.id === filters.type) ? filters.type : 'all') as PresetType
  const groups = groupsFor(EFFECTS, type)
  const group = (groups.some((g) => g.id === filters.group) ? filters.group : 'all') as PresetGroup | 'all'
  const shown = filterPresets(EFFECTS, { group, type, q })
  // The cloud names every effect of the chosen type, whatever the category: it is the index.
  const cloud = useMemo(() => filterPresets(EFFECTS, { type }), [type])
  const made = EFFECTS.filter((p) => covers.has(p.id)).length

  const pick = (next: Partial<typeof filters>) => {
    const f = { ...filters, ...next }
    setFilters(f)
    saveFilters(f)
  }

  useLayoutEffect(() => {
    if (page.current) page.current.scrollTop = homeScroll
  }, [])

  return (
    <div ref={page} className="st-page ef-home" onScroll={(e) => (homeScroll = e.currentTarget.scrollTop)}>
      <header className="ef-hero">
        <span className="ef-kicker">
          {EFFECTS.length} effects{made ? ` · ${made} with your own preview` : ''}
        </span>
        <h2 className="ef-hero-title">Visual effects</h2>
        <p className="ef-hero-sub">Camera moves, effects and looks as one-click recipes. Open one, add a picture, and run it — the recipe wraps around it on the way out.</p>
      </header>

      <nav className="ef-cloud" aria-label="All effects">
        {cloud.map((p) => (
          <button key={p.id} type="button" className={`ef-cloud-chip ${covers.has(p.id) ? 'has-cover' : ''}`} onClick={() => goEffect({ level: 'page', id: p.id })}>
            {p.title}
          </button>
        ))}
      </nav>

      <div className="sp-filter-bar ef-filters">
        <Chips options={groups} value={group} onPick={(g) => pick({ group: g })} />
        <span className="ef-filters-end">
          <Chips options={PRESET_TYPES} value={type} onPick={(t) => pick({ type: t })} />
          <label className="st-mention-search sp-search">
            <Search size={13} />
            <input placeholder="Search effects…" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </span>
      </div>

      {shown.length ? (
        <div className="ef-masonry">
          {shown.map((p) => {
            const kind = presetKind(p)
            const Icon = kind === 'video' ? Clapperboard : ImageIcon
            const locks = lockedLabels(p.params)
            return (
              <button key={p.id} type="button" className="ef-card" onClick={() => goEffect({ level: 'page', id: p.id })} title={p.note}>
                <EffectCover id={p.id} title={p.title} kicker={groupLabel(p.group)} note={p.note} cover={covers.get(p.id) ?? null} />
                <span className="ef-card-kind">
                  <Icon size={11} />
                  {kind === 'video' ? 'Video' : 'Image'}
                  {locks.length ? ` · ${locks.join(' · ')}` : ''}
                </span>
              </button>
            )
          })}
        </div>
      ) : (
        <Empty icon={Sparkles} title="Nothing matches" sub="Try another category or type, or clear the search." />
      )}
    </div>
  )
}
