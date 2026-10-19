/**
 * Pieces the Studio pages built on the library share: a Plinth button, an element
 * chooser (Marketing's product and avatar, Influencer's character), the recipe card grid
 * with its own-result covers, and a results grid that opens the shared viewer.
 *
 * They sit beside the surfaces rather than in parts.tsx because they know about the
 * library and the tracker; parts.tsx stays plain layout.
 */
import type { ReactNode } from 'react'
import { Check, Clapperboard, Image as ImageIcon, Plus, type LucideIcon } from 'lucide-react'
import { isDone, useHistory, type HistoryItem } from '../api.ts'
import { useElements, type Element, type ElementKind } from '../library.ts'
import { elementThumb } from '../elements/model.ts'
import { groupLabel, indexHistory, lockedLabels, presetCover, presetKind, presetTag, type Preset } from '../presets.ts'
import { JobTile, ResultTile } from '../tiles.tsx'
import { openViewer } from '../viewer.ts'
import type { Job } from '../jobs.ts'
import { useAllTracked } from './track.ts'
import './studio-pages.css'

/* ---------- buttons ---------- */

export function Btn({
  children,
  onClick,
  ghost,
  icon: Icon,
  disabled,
  title,
  block,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  ghost?: boolean
  icon?: LucideIcon
  disabled?: boolean
  title?: string
  block?: boolean
  type?: 'button' | 'submit'
}) {
  return (
    <button type={type} className={`plinth-btn plinth-btn--sm ${ghost ? 'plinth-btn--ghost' : ''} ${block ? 'plinth-btn--block' : ''}`} onClick={onClick} disabled={disabled} title={title}>
      <span className="plinth-btn__face">
        {Icon && <Icon size={14} />}
        <span className="plinth-btn__label">{children}</span>
      </span>
    </button>
  )
}

/** A small quiet button for rows and cards. */
export function QuietBtn({ children, onClick, icon: Icon, disabled, title, danger }: { children?: ReactNode; onClick: () => void; icon?: LucideIcon; disabled?: boolean; title?: string; danger?: boolean }) {
  return (
    // The visible words name the button; an icon-only one is named by its title.
    <button type="button" className={`sp-quiet ${danger ? 'is-danger' : ''}`} onClick={onClick} disabled={disabled} title={title} aria-label={children ? undefined : title}>
      {Icon && <Icon size={13} />}
      {children}
    </button>
  )
}

/* ---------- choosing an element ---------- */

const NOUN: Record<ElementKind, string> = { character: 'character', product: 'product', location: 'location', style: 'style', other: 'element' }

/**
 * A strip of saved elements of one kind to choose from, plus "None" when it is optional.
 * `extra` sits at the end (an upload tile, say).
 */
export function ElementChooser({
  kind,
  value,
  onPick,
  optional,
  extra,
  empty,
}: {
  kind: ElementKind
  value: string | null
  onPick: (el: Element | null) => void
  optional?: boolean
  extra?: ReactNode
  /** What to say when there are none of this kind yet. */
  empty?: ReactNode
}) {
  const { items, loading, error } = useElements()
  const mine = items.filter((el) => el.kind === kind && el.images.length > 0)
  return (
    <div className="sp-chooser">
      {optional && (
        <button type="button" className={`sp-choice ${value === null ? 'is-on' : ''}`} onClick={() => onPick(null)}>
          <span className="sp-choice-cover is-none">None</span>
          <span className="sp-choice-name">No {NOUN[kind]}</span>
        </button>
      )}
      {mine.map((el) => {
        const thumb = elementThumb(el)
        return (
          <button key={el.id} type="button" className={`sp-choice ${value === el.id ? 'is-on' : ''}`} onClick={() => onPick(el)} title={el.description || el.name}>
            <span className="sp-choice-cover">
              {thumb ? <img src={thumb} alt="" loading="lazy" /> : null}
              {value === el.id && (
                <span className="sp-choice-tick">
                  <Check size={11} />
                </span>
              )}
            </span>
            <span className="sp-choice-name">{el.name}</span>
          </button>
        )
      })}
      {extra}
      {!mine.length && !extra && <p className="sp-hint">{loading ? 'Loading…' : error ? `Elements unavailable: ${error}` : (empty ?? `No saved ${NOUN[kind]}s yet.`)}</p>}
    </div>
  )
}

/** The tile at the end of a chooser that adds something new. */
export function AddTile({ label, onClick, busy }: { label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" className="sp-choice" onClick={onClick} disabled={busy}>
      <span className="sp-choice-cover is-add">
        <Plus size={16} />
      </span>
      <span className="sp-choice-name">{busy ? 'Adding…' : label}</span>
    </button>
  )
}

/* ---------- the recipe catalogue ---------- */

/**
 * Recipe cards. The cover is the newest result you made from that recipe; until there is
 * one, the card is typographic: the title large on paper, with what it makes.
 */
/** Anything the catalogue grid can show: a preset, or a Marketing template. */
export type CatalogueItem = Pick<Preset, 'id' | 'title' | 'note' | 'modelClass' | 'params'> & { group: string }

export function PresetGrid<T extends CatalogueItem>({
  presets,
  onOpen,
  active,
  labelOf = (g) => groupLabel(g as Preset['group']),
}: {
  presets: T[]
  onOpen: (p: T) => void
  active?: string | null
  labelOf?: (group: string) => string
}) {
  const tracked = useAllTracked()
  const { items } = useHistory()
  const byTask = indexHistory(items)
  return (
    <div className="sp-preset-grid">
      {presets.map((p) => {
        const cover = presetCover(tracked[presetTag(p.id)], byTask)
        const kind = presetKind(p)
        const Icon = kind === 'video' ? Clapperboard : ImageIcon
        const locks = lockedLabels(p.params)
        return (
          <button key={p.id} type="button" className={`pl-press sp-preset ${active === p.id ? 'is-active' : ''}`} onClick={() => onOpen(p)}>
            <span className="pl-panel sp-preset-face">
              <span className={`sp-preset-cover ${cover ? '' : 'is-type'}`}>
                {cover ? (
                  cover.video ? (
                    <video src={cover.src} muted loop playsInline preload="metadata" onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />
                  ) : (
                    <img src={cover.src} alt="" loading="lazy" />
                  )
                ) : (
                  <>
                    <span className="sp-preset-type-kicker">{labelOf(p.group)}</span>
                    <span className="sp-preset-type-title">{p.title}</span>
                  </>
                )}
                <span className="sp-preset-kind">
                  <Icon size={11} />
                  {kind === 'video' ? 'Video' : 'Image'}
                </span>
              </span>
              <span className="sp-preset-body">
                <span className="sp-preset-title">{p.title}</span>
                {p.note && <span className="sp-preset-note">{p.note}</span>}
                {locks.length > 0 && <span className="sp-preset-locks">{locks.join(' · ')}</span>}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ---------- results ---------- */

/** Running and failed jobs first, then finished results; any tile opens the shared viewer. */
export function ResultsGrid({ jobs, items, empty, actions }: { jobs: Job[]; items: HistoryItem[]; empty?: ReactNode; actions?: (item: HistoryItem) => ReactNode }) {
  const done = items.filter(isDone)
  if (!jobs.length && !done.length) return <>{empty ?? null}</>
  return (
    <div className="st-grid sp-results">
      {jobs.map((j) => (
        <JobTile key={j.id} job={j} />
      ))}
      {done.map((item) => (
        <div key={item.taskId} className="sp-result">
          <ResultTile item={item} onOpen={(it) => openViewer(it, done)} />
          {actions && <div className="sp-result-actions">{actions(item)}</div>}
        </div>
      ))}
    </div>
  )
}
