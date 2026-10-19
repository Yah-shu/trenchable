/**
 * One effect's page, as the reference app's `/effects/examples/<slug>`: Back, the big title, what it
 * does, Generate (opens the form), then every result you have made with it — in the same
 * justified feed as the rest of Studio, running jobs first, any tile opens the viewer.
 */
import { useMemo } from 'react'
import { ArrowLeft, Sparkles, Wand2 } from 'lucide-react'
import { isDone } from '../../api.ts'
import { useJobs, isActive } from '../../jobs.ts'
import { JustifiedFeed } from '../../JustifiedFeed.tsx'
import { feedOrder } from '../../justified.ts'
import { Empty } from '../../parts.tsx'
import { aboutOf, applyPreset, groupLabel, jobOfRecipe, lockedLabels, presetKind, recipeResults, type Preset } from '../../presets.ts'
import { openViewer } from '../../viewer.ts'
import { EffectCover } from './EffectCover.tsx'
import { useEffectIndex } from './data.ts'
import { goEffect } from './route.ts'

export function EffectPage({ preset }: { preset: Preset }) {
  const { items, byTask, covers } = useEffectIndex()
  const jobs = useJobs()
  const done = useMemo(() => recipeResults(items, preset.id, byTask).filter(isDone), [items, preset.id, byTask])
  const running = jobs.filter((j) => isActive(j) && jobOfRecipe(j, preset))
  const kind = presetKind(preset)
  const locks = lockedLabels(preset.params)
  const cover = covers.get(preset.id) ?? null
  const use = () => goEffect({ level: 'use', id: preset.id })

  return (
    <div className="st-page ef-page">
      <button type="button" className="sp-back" onClick={() => goEffect({ level: 'home' })}>
        <ArrowLeft size={14} />
        Back
      </button>

      <header className="ef-page-head">
        <div className="ef-page-text">
          <span className="ef-kicker">
            {groupLabel(preset.group)} · {kind === 'video' ? 'Video' : 'Image'}
            {locks.length ? ` · ${locks.join(' · ')}` : ''}
          </span>
          <h1 className="ef-page-title">{preset.title}</h1>
          <p className="ef-page-about">{aboutOf(preset)}</p>
          <div className="ef-page-actions">
            <button type="button" className="plinth-btn plinth-btn--sm ef-generate" onClick={use}>
              <span className="plinth-btn__face">
                <Wand2 size={14} />
                <span className="plinth-btn__label">Generate</span>
              </span>
            </button>
            <details className="sp-recipe ef-recipe">
              <summary>See the recipe</summary>
              <p>{applyPreset(preset, '[your subject]')}</p>
            </details>
          </div>
        </div>
        <button type="button" className="ef-page-cover" onClick={use} title="Generate with this effect">
          <EffectCover id={preset.id} title={preset.title} kicker={groupLabel(preset.group)} note={preset.note} cover={cover} play="always" />
        </button>
      </header>

      <div className="ef-examples-head">
        <h3 className="sp-panel-title">Your results with {preset.title}</h3>
        <span className="sp-hint">{done.length ? `${done.length} so far` : ''}</span>
      </div>
      {done.length || running.length ? (
        <JustifiedFeed {...feedOrder({ jobs: running, failed: [], done })} size={230} onOpen={(it) => openViewer(it, done)} />
      ) : (
        <Empty
          icon={Sparkles}
          title="No results yet"
          sub="Everything you make with this effect collects here, and your newest result becomes its cover."
          cta={
            <button type="button" className="vw-btn is-sm" onClick={use}>
              Try it
            </button>
          }
        />
      )}
    </div>
  )
}
