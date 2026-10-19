/**
 * the reference app's model picker, inside the Popover a model pill or rail row opens: a search
 * box, Featured models, then All models with each model line once. Hovering a line with
 * several versions (Kling, Seedance, Wan…) opens a flyout of those versions with their
 * own chips; picking one picks that family. Every row has the family's one-line note
 * (families.ts `familyNote`), a NEW badge while it is new to the catalogue, and chips:
 * best resolution, length range and a sound icon. Search filters across every version.
 *
 * Keyboard: ↑ ↓ move, Enter picks, → opens a line's versions, ← or Escape goes back,
 * Escape again closes.
 *
 * The families are read off the catalogue (`familiesOf`) and matched to the choices by
 * key, so every model row that lists families gets this picker with no change where it
 * is used. Choices that aren't families (a tool list) show as plain rows.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { Check, ChevronRight, Volume2 } from 'lucide-react'
import { useCatalog } from './api.ts'
import { familiesOf, familyNote, familySpecs, isFeatured, isNew, lengthLabel, searchFamilies, seriesName, seriesOf, seriesSpecs, type Family, type FamilySpecs, type Series } from './families.ts'
import type { Choice } from './parts.tsx'

/**
 * The families behind these choices, keyed by choice value — or null when the choices
 * aren't families (voices, languages, variants), so the caller keeps its plain list.
 */
export function useChoiceFamilies(choices: Choice[], enabled: boolean): Map<string, Family> | null {
  const { models } = useCatalog()
  const byKey = useMemo(() => new Map(familiesOf(models ?? []).map((f) => [f.key, f])), [models])
  return useMemo(() => {
    if (!enabled) return null
    const hit = new Map<string, Family>()
    for (const c of choices) {
      const f = byKey.get(c.value)
      if (f) hit.set(c.value, f)
    }
    const real = choices.filter((c) => c.value).length
    return hit.size && hit.size * 2 >= real ? hit : null
  }, [byKey, choices, enabled])
}

type Row =
  | { kind: 'family'; id: string; family: Family; section: 'featured' | 'all' | 'results' }
  | { kind: 'series'; id: string; series: Series }
  | { kind: 'plain'; id: string; choice: Choice }

const SECTION: Record<string, string> = { featured: 'Featured models', all: 'All models', results: 'Results' }
const sectionOf = (r: Row) => (r.kind === 'family' ? r.section : 'all')

const FLY_WIDTH = 300

export function ModelMenu({ choices, families, value, onPick }: { choices: Choice[]; families: Map<string, Family>; value: string; onPick: (v: string) => void }) {
  const [q, setQ] = useState('')
  const offered = useMemo(() => choices.flatMap((c) => families.get(c.value) ?? []), [choices, families])
  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase()
    const plain = choices
      .filter((c) => c.value && !families.has(c.value) && (!needle || c.label.toLowerCase().includes(needle)))
      .map((c): Row => ({ kind: 'plain', id: `p:${c.value}`, choice: c }))
    if (needle) return [...searchFamilies(offered, needle).map((f): Row => ({ kind: 'family', id: `r:${f.key}`, family: f, section: 'results' })), ...plain]
    const featured = searchFamilies(offered, '')
      .filter(isFeatured)
      .map((f): Row => ({ kind: 'family', id: `f:${f.key}`, family: f, section: 'featured' }))
    const all = seriesOf(offered).map((s): Row => (s.versions.length > 1 ? { kind: 'series', id: `s:${s.key}`, series: s } : { kind: 'family', id: `a:${s.versions[0].key}`, family: s.versions[0], section: 'all' }))
    return [...featured, ...all, ...plain]
  }, [q, offered, choices, families])

  // Open on the row that is picked now, as their list does.
  const [active, setActive] = useState(() => Math.max(0, rows.findIndex((r) => (r.kind === 'family' ? r.family.key === value : r.kind === 'series' ? r.series.versions.some((f) => f.key === value) : r.choice.value === value))))
  const [fly, setFly] = useState<{ series: Series; style: CSSProperties } | null>(null)
  /** Where the keyboard is inside the flyout; null while it is on the main list. */
  const [flyAt, setFlyAt] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const closing = useRef<number | undefined>(undefined)
  /** The row the flyout sits beside, so a scroll can move it along. */
  const anchor = useRef<{ series: Series; el: HTMLElement } | null>(null)
  /** True once the keyboard drives (the active row scrolls into view and opens its flyout). */
  const keyed = useRef(false)

  const rowEl = (i: number) => listRef.current?.querySelector<HTMLElement>(`[data-i="${i}"]`) ?? null

  /** Beside the popover, level with its row; on the left when the right has no room. */
  const place = (series: Series, el: HTMLElement): CSSProperties => {
    const r = el.getBoundingClientRect()
    const box = (el.closest('.st-pop') ?? el).getBoundingClientRect()
    const left = window.innerWidth - box.right >= FLY_WIDTH + 12 ? box.right + 6 : Math.max(8, box.left - FLY_WIDTH - 6)
    const height = Math.min(window.innerHeight - 16, series.versions.length * 54 + 34)
    const top = Math.max(8, Math.min(r.top - 6, window.innerHeight - height - 8))
    return { position: 'fixed', left, top, width: FLY_WIDTH, maxHeight: height }
  }
  const openFly = (series: Series, el: HTMLElement | null) => {
    window.clearTimeout(closing.current)
    if (!el) return
    anchor.current = { series, el }
    setFly({ series, style: place(series, el) })
  }
  const closeFly = () => {
    anchor.current = null
    setFly(null)
    setFlyAt(null)
  }
  const closeSoon = () => {
    window.clearTimeout(closing.current)
    closing.current = window.setTimeout(closeFly, 160)
  }
  useEffect(() => () => window.clearTimeout(closing.current), [])

  // Not `autoFocus`: the Popover is still hidden while it measures, and a hidden input
  // can't take focus. One frame later it is placed and showing.
  const searchRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const id = requestAnimationFrame(() => searchRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  // The list scrolling (wheel or the keyboard) carries the flyout along with its row.
  useEffect(() => {
    const onScroll = () => {
      const a = anchor.current
      if (a?.el.isConnected) setFly({ series: a.series, style: place(a.series, a.el) })
    }
    window.addEventListener('scroll', onScroll, true)
    return () => window.removeEventListener('scroll', onScroll, true)
  }, [])

  // A new search starts at the top.
  const lastQ = useRef(q)
  useEffect(() => {
    if (lastQ.current === q) return
    lastQ.current = q
    setActive(0)
    closeFly()
  }, [q])

  // It opens scrolled to the current pick, with no flyout.
  useLayoutEffect(() => {
    rowEl(active)?.scrollIntoView({ block: 'nearest' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Once the keyboard moves, its row stays in view and a model line shows its versions beside it.
  const activeId = rows[active]?.id
  useLayoutEffect(() => {
    if (!keyed.current) return
    const el = rowEl(active)
    el?.scrollIntoView({ block: 'nearest' })
    const row = rows[active]
    if (row?.kind === 'series') openFly(row.series, el)
    else closeFly()
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const pickRow = (row: Row | undefined) => {
    if (!row) return
    if (row.kind === 'family') onPick(row.family.key)
    else if (row.kind === 'plain') onPick(row.choice.value)
    // A line's own row keeps the version already picked from it, else takes its first.
    else onPick(row.series.versions.some((f) => f.key === value) ? value : row.series.versions[0].key)
  }

  const onKey = (e: KeyboardEvent) => {
    keyed.current = true
    const stop = () => {
      e.preventDefault()
      e.stopPropagation()
    }
    if (fly && flyAt != null) {
      const n = fly.series.versions.length
      if (e.key === 'ArrowDown') setFlyAt((flyAt + 1) % n)
      else if (e.key === 'ArrowUp') setFlyAt((flyAt - 1 + n) % n)
      else if (e.key === 'Enter') onPick(fly.series.versions[flyAt].key)
      else if (e.key === 'ArrowLeft' || e.key === 'Escape') setFlyAt(null)
      else return
      stop()
      return
    }
    const n = rows.length
    if (!n) return
    if (e.key === 'ArrowDown') setActive((a) => (a + 1) % n)
    else if (e.key === 'ArrowUp') setActive((a) => (a - 1 + n) % n)
    else if (e.key === 'Enter') pickRow(rows[active])
    else if (e.key === 'ArrowRight' && rows[active]?.kind === 'series' && fly) setFlyAt(0)
    else if (e.key === 'Escape' && fly) closeFly()
    else return
    stop()
  }

  return (
    <div className="st-mm" ref={listRef} onKeyDown={onKey}>
      <div className="st-mm-search">
        <input ref={searchRef} className="st-pop-search" placeholder="Search models…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search models" />
      </div>
      {!rows.length && <p className="st-pop-item">Nothing matches.</p>}
      {rows.map((row, i) => {
        const head = i === 0 || sectionOf(rows[i - 1]) !== sectionOf(row) ? SECTION[sectionOf(row)] : null
        const hover = (el: HTMLElement) => {
          keyed.current = false
          setActive(i)
          if (row.kind === 'series') openFly(row.series, el)
          else if (fly) closeSoon()
        }
        return (
          <div key={row.id}>
            {head && <p className="st-mm-head">{head}</p>}
            {row.kind === 'plain' ? (
              <button
                type="button"
                data-i={i}
                className={`st-pop-item ${row.choice.value === value ? 'is-on' : ''} ${i === active ? 'is-active' : ''}`}
                onMouseEnter={(e) => hover(e.currentTarget)}
                onClick={() => pickRow(row)}
              >
                {row.choice.value === value ? <Check size={13} /> : <span style={{ width: 13 }} />}
                <span>{row.choice.label}</span>
                {row.choice.sub && <span className="st-pop-sub">{row.choice.sub}</span>}
              </button>
            ) : row.kind === 'series' ? (
              <ModelRow
                i={i}
                title={row.series.name}
                initial={row.series.name}
                note={row.series.note}
                specs={seriesSpecs(row.series)}
                isNew={row.series.versions.some((f) => isNew(f))}
                on={row.series.versions.some((f) => f.key === value)}
                active={i === active}
                open={fly?.series.key === row.series.key}
                onHover={hover}
                onLeave={closeSoon}
                onClick={() => pickRow(row)}
                count={row.series.versions.length}
              />
            ) : (
              <ModelRow
                i={i}
                title={row.family.title}
                initial={seriesName(row.family)}
                note={familyNote(row.family)}
                specs={familySpecs(row.family)}
                isNew={isNew(row.family)}
                on={row.family.key === value}
                active={i === active}
                onHover={hover}
                onClick={() => pickRow(row)}
              />
            )}
          </div>
        )
      })}
      {fly && (
        <div
          className="st-mm-fly"
          style={fly.style}
          role="listbox"
          aria-label={`${fly.series.name} versions`}
          onMouseEnter={() => window.clearTimeout(closing.current)}
          onMouseLeave={closeSoon}
        >
          <p className="st-mm-head">{fly.series.name}</p>
          {fly.series.versions.map((f, j) => (
            <ModelRow
              key={f.key}
              title={f.title}
              initial={fly.series.name}
              note={familyNote(f)}
              specs={familySpecs(f)}
              isNew={isNew(f)}
              on={f.key === value}
              active={flyAt === j}
              onHover={() => {
                keyed.current = false
                setFlyAt(j)
              }}
              onClick={() => onPick(f.key)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/** One row: initial, name + NEW, the note under it, chips, then a check (picked) or › (has versions). */
function ModelRow({
  i,
  title,
  initial,
  note,
  specs,
  isNew: fresh,
  on,
  active,
  open,
  count,
  onHover,
  onLeave,
  onClick,
}: {
  i?: number
  title: string
  initial: string
  note: string
  specs: FamilySpecs
  isNew: boolean
  on: boolean
  active: boolean
  open?: boolean
  /** Set on a model line: how many versions its flyout lists. */
  count?: number
  onHover: (el: HTMLElement) => void
  onLeave?: () => void
  onClick: () => void
}) {
  const length = lengthLabel(specs)
  return (
    <button
      type="button"
      role="option"
      aria-selected={on}
      aria-haspopup={count ? 'listbox' : undefined}
      aria-expanded={count ? Boolean(open) : undefined}
      data-i={i}
      className={`st-mm-row ${on ? 'is-on' : ''} ${active ? 'is-active' : ''} ${open ? 'is-open' : ''}`}
      onMouseEnter={(e) => onHover(e.currentTarget)}
      onMouseLeave={onLeave}
      onClick={onClick}
      title={count ? `${title}: ${count} versions` : title}
    >
      <span className="st-mm-icon" aria-hidden>
        {initial.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 1).toUpperCase()}
      </span>
      <span className="st-mm-main">
        <span className="st-mm-name">
          <span className="st-mm-title">{title}</span>
          {fresh && <span className="st-mm-badge">New</span>}
        </span>
        <span className="st-mm-note">{note}</span>
      </span>
      {(specs.res || length || specs.audio) && (
        <span className="st-mm-chips">
          {specs.res && <span className="st-mm-chip">{specs.res}</span>}
          {length && <span className="st-mm-chip">{length}</span>}
          {specs.audio && (
            <span className="st-mm-chip is-icon" title="Makes sound">
              <Volume2 size={11} />
            </span>
          )}
        </span>
      )}
      <span className="st-mm-end">{count ? <ChevronRight size={14} /> : on ? <Check size={14} /> : null}</span>
    </button>
  )
}
