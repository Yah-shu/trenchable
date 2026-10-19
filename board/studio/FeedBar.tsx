/**
 * the reference app's two buttons over a feed: Filter and View.
 *
 * Filter narrows what the feed draws — the models this feed has made things with (each with
 * its count), a date range, Hide failed, Liked only — and shows a count on the button while
 * anything is on, with a Clear. View sets the card size and, on the rail surfaces, List or
 * Grid. The choices are pure (feed.ts) and remembered per surface.
 *
 * One component for both homes: floating top-right over the Image masonry, and in a rail
 * surface's canvas bar next to History / How it works.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Check, LayoutGrid, ListFilter, Rows3, SlidersHorizontal } from 'lucide-react'
import { useCatalog, type HistoryItem } from './api.ts'
import { RANGES, SIZE_MAX, SIZE_MIN, activeFilters, clearFilters, modelChoices, readPrefs, toggleModel, writePrefs, type FeedDefaults, type FeedPrefs } from './feed.ts'

/** A surface's feed prefs, read once and written back on every change. */
export function useFeedPrefs(surface: string, defaults: FeedDefaults): [FeedPrefs, (next: Partial<FeedPrefs>) => void] {
  const [prefs, setPrefs] = useState(() => readPrefs(surface, defaults))
  // A RailStudio can be handed another surface id (Influencer's tabs); follow it.
  const seen = useRef(surface)
  useEffect(() => {
    if (seen.current === surface) return
    seen.current = surface
    setPrefs(readPrefs(surface, defaults))
    // Only a new surface re-reads; the defaults object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surface])
  const change = useCallback(
    (next: Partial<FeedPrefs>) =>
      setPrefs((p) => {
        const merged = { ...p, ...next }
        writePrefs(surface, merged)
        return merged
      }),
    [surface],
  )
  return [prefs, change]
}

/** Close a popover on an outside click or Escape. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        close()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [ref, open, close])
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button type="button" className="vw-toggle" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span>{label}</span>
      <span className={`vw-switch ${on ? 'is-on' : ''}`} aria-hidden="true" />
    </button>
  )
}

export interface FeedBarProps {
  prefs: FeedPrefs
  onChange: (next: Partial<FeedPrefs>) => void
  /** This feed's history (before filtering): where the model list and its counts come from. */
  items: HistoryItem[]
  /** Offer List / Grid (the rail surfaces). */
  layouts?: boolean
  /** Offer the card size (off where cards have a fixed shape, like audio rows). */
  sizable?: boolean
  /** Float over the feed instead of sitting in a bar (the Image masonry). */
  floating?: boolean
}

export function FeedBar({ prefs, onChange, items, layouts, sizable = true, floating }: FeedBarProps) {
  const { models } = useCatalog()
  const [open, setOpen] = useState<'filter' | 'view' | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setOpen(null), [])
  useDismiss(box, open !== null, close)
  const titleOf = useCallback((id: string) => models?.find((m) => m.id === id)?.title, [models])
  const choices = useMemo(() => modelChoices(items, titleOf), [items, titleOf])
  const active = activeFilters(prefs)
  const hasView = sizable || layouts
  return (
    <div className={`st-feedbar ${floating ? 'is-floating' : ''}`} ref={box}>
      <span className="vw-pop-anchor">
        <button
          type="button"
          className={`vw-btn is-sm ${open === 'filter' || active ? 'is-on' : ''}`}
          aria-expanded={open === 'filter'}
          aria-haspopup="dialog"
          onClick={() => setOpen(open === 'filter' ? null : 'filter')}
        >
          <ListFilter size={14} />
          Filter
          {active > 0 && (
            <span className="st-feedbar-count" aria-label={`${active} on`}>
              {active}
            </span>
          )}
        </button>
        {open === 'filter' && (
          <div className="vw-pop is-right st-feedpop" role="dialog" aria-label="Filter">
            <p className="vw-sec-title">
              <span>Model</span>
              {prefs.models.length > 0 && (
                <button type="button" className="vw-link" onClick={() => onChange({ models: [] })}>
                  All models
                </button>
              )}
            </p>
            {choices.length ? (
              <div className="vw-list" role="group" aria-label="Models">
                {choices.map((c) => {
                  const on = prefs.models.includes(c.id)
                  return (
                    <button key={c.id} type="button" role="checkbox" aria-checked={on} className={`vw-list-item ${on ? 'is-on' : ''}`} onClick={() => onChange({ models: toggleModel(prefs, c.id) })}>
                      <span>{c.label}</span>
                      <span className="vw-list-sub">{c.count}</span>
                      {on && <Check size={13} />}
                    </button>
                  )
                })}
              </div>
            ) : (
              <p className="vw-empty-line">Nothing made here yet.</p>
            )}
            <p className="vw-sec-title" style={{ marginTop: 12 }}>
              Date range
            </p>
            <div className="vw-seg" role="radiogroup" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r.id} type="button" role="radio" aria-checked={prefs.range === r.id} className={prefs.range === r.id ? 'is-on' : ''} onClick={() => onChange({ range: r.id })}>
                  {r.label}
                </button>
              ))}
            </div>
            <Toggle label="Hide failed" on={prefs.hideFailed} onChange={(on) => onChange({ hideFailed: on })} />
            <Toggle label="Liked only" on={prefs.liked} onChange={(on) => onChange({ liked: on })} />
            {active > 0 && (
              <div className="vw-row-end" style={{ marginTop: 10 }}>
                <button type="button" className="vw-btn is-sm" onClick={() => onChange(clearFilters(prefs))}>
                  Clear
                </button>
              </div>
            )}
          </div>
        )}
      </span>
      {hasView && (
        <span className="vw-pop-anchor">
          <button type="button" className={`vw-btn is-sm ${open === 'view' ? 'is-on' : ''}`} aria-expanded={open === 'view'} aria-haspopup="dialog" onClick={() => setOpen(open === 'view' ? null : 'view')}>
            <SlidersHorizontal size={14} />
            View
          </button>
          {open === 'view' && (
            <div className="vw-pop is-right st-feedpop" role="dialog" aria-label="View">
              {layouts && (
                <>
                  <p className="vw-sec-title">Layout</p>
                  <div className="vw-seg" role="radiogroup" aria-label="Layout">
                    {(
                      [
                        ['list', 'List', Rows3],
                        ['grid', 'Grid', LayoutGrid],
                      ] as const
                    ).map(([id, label, Icon]) => (
                      <button key={id} type="button" role="radio" aria-checked={prefs.layout === id} className={prefs.layout === id ? 'is-on' : ''} onClick={() => onChange({ layout: id })}>
                        <Icon size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {sizable && (
                <>
                  <label className="vw-sec-title" style={{ marginTop: layouts ? 12 : 0 }}>
                    <span>Card size</span>
                  </label>
                  <input
                    type="range"
                    className="vw-range"
                    min={SIZE_MIN}
                    max={SIZE_MAX}
                    step={10}
                    value={prefs.size}
                    aria-label="Card size"
                    onChange={(e) => onChange({ size: Number(e.target.value) })}
                  />
                </>
              )}
            </div>
          )}
        </span>
      )}
    </div>
  )
}
