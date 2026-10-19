/**
 * Assets — their library: a left rail of views, projects and types, and everything you have
 * made grouped by the day you made it.
 *
 * One history call feeds the whole page and every filter runs in the browser (type, model,
 * date range, and a search over prompts *and* dates), so nothing goes back to the server. The
 * View menu picks Square or Masonry, split by date or not, and the card size. The grid draws
 * 120 tiles at a time and adds more as you scroll; selection works over the whole list.
 *
 * Like the reference app's, it is also where results are handled in bulk: tick a box (shift-click
 * for a run, or a day's box for the whole day) and a bar offers Download, Favourite, Add to
 * project and Delete. Everything acts on what is ticked *and* on screen, so a filter never
 * hides what a button is about to touch. A click opens the viewer, stepping in grid order.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { Check, Download, Film, FolderOpen, FolderPlus, Heart, Images, LayoutDashboard, LayoutGrid, Loader2, Mic, Minus, Plus, Search, Shapes, SlidersHorizontal, Sparkles, Trash2, X, type LucideIcon } from 'lucide-react'
import { isDone, useCatalog, useHistory, type HistoryItem } from '../api.ts'
import { addToProject, deleteItems, downloadItems, inDateRange, matchesSearch, matchesType, selectRange, setFavourites, type AssetType, type DateRange } from '../actions.ts'
import { ElementsPanel } from '../elements/ElementsPanel.tsx'
import { libraryApi, useElements, useProjects, type Project } from '../library.ts'
import { Empty } from '../parts.tsx'
import { ResultTile } from '../tiles.tsx'
import { openViewer, useViewer } from '../viewer.ts'
import '../viewer.css'

/** 'all' | 'favourites' | 'elements' | 'project:<id>' */
type View = string
type Type = AssetType

const TYPES: { id: Exclude<AssetType, 'all'>; label: string; icon: LucideIcon }[] = [
  { id: 'image', label: 'Images', icon: Images },
  { id: 'video', label: 'Video', icon: Film },
  { id: 'audio', label: 'Audio', icon: Mic },
  { id: 'enhanced', label: 'Enhanced', icon: Sparkles },
]

/**
 * Their "View" menu: Square or Masonry, split by date or one run, and the card size. Remembered
 * per browser; storage can be off (private window), so every read and write is guarded.
 */
interface ViewPrefs {
  layout: 'square' | 'masonry'
  split: boolean
  /** Smallest card width in px; the grid fits as many as the row holds. */
  size: number
}
const PREFS_KEY = 'st-assets-view'
const SIZE_MIN = 110
const SIZE_MAX = 360
const DEFAULT_PREFS: ViewPrefs = { layout: 'square', split: true, size: 180 }
const readPrefs = (): ViewPrefs => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<ViewPrefs>
    return {
      layout: raw.layout === 'masonry' ? 'masonry' : 'square',
      split: raw.split !== false,
      size: typeof raw.size === 'number' ? Math.min(SIZE_MAX, Math.max(SIZE_MIN, raw.size)) : DEFAULT_PREFS.size,
    }
  } catch {
    return DEFAULT_PREFS
  }
}
const writePrefs = (p: ViewPrefs) => {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    // Storage off: the choice lasts until the page closes.
  }
}

const RANGES: { id: DateRange['kind']; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
  { id: 'custom', label: 'Custom range…' },
]

/**
 * Tiles drawn per step. A full library is ~400 results and ~2000 buttons; drawing them all at
 * once stalls the page (their own picker hung on a big library), so the grid grows as you
 * scroll. Selection and the viewer still work over the whole filtered list.
 */
const PAGE = 120

const startOfDay = (ms: number) => {
  const d = new Date(ms)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const dayLabel = (ms: number) => new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

const projectName = (p: Project) => p.title || 'Untitled project'

const modelKey = (i: HistoryItem) => i.modelId ?? i.model

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

export function AssetsSurface() {
  const [view, setViewRaw] = useState<View>('all')
  const [type, setType] = useState<Type>('all')
  const [model, setModel] = useState('')
  const [q, setQ] = useState('')
  const [range, setRange] = useState<DateRange>({ kind: 'all' })
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [prefs, setPrefsRaw] = useState<ViewPrefs>(readPrefs)
  const [limit, setLimit] = useState(PAGE)
  const anchor = useRef<string | null>(null)
  const body = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)

  const setPrefs = (patch: Partial<ViewPrefs>) =>
    setPrefsRaw((p) => {
      const next = { ...p, ...patch }
      writePrefs(next)
      return next
    })

  // The library is the one place that shows everything, not just the newest page.
  const { items } = useHistory()
  const { models } = useCatalog()
  const { items: projects } = useProjects()
  const { items: elements } = useElements()
  const viewer = useViewer()

  const setView = (v: View) => {
    setViewRaw(v)
    setSelected(new Set())
    anchor.current = null
  }

  const done = useMemo(() => (items ?? []).filter(isDone), [items])
  const projectId = view.startsWith('project:') ? view.slice('project:'.length) : null
  const project = projectId ? projects.find((p) => p.id === projectId) : undefined

  const inView = useMemo(() => {
    if (view === 'favourites') return done.filter((i) => i.pinned)
    if (projectId) {
      const ids = new Set(project?.taskIds ?? [])
      return done.filter((i) => ids.has(i.taskId))
    }
    return done
  }, [done, view, projectId, project])

  const counts = useMemo(() => Object.fromEntries(TYPES.map((t) => [t.id, inView.filter((i) => matchesType(i, t.id)).length])) as Record<Exclude<AssetType, 'all'>, number>, [inView])
  const doneIds = useMemo(() => new Set(done.map((i) => i.taskId)), [done])

  // The models this view actually holds, most used first, named as the catalogue names them.
  const modelChoices = useMemo(() => {
    const by = new Map<string, { id: string; label: string; count: number }>()
    for (const i of inView) {
      if (!matchesType(i, type)) continue
      const id = modelKey(i)
      const hit = by.get(id)
      if (hit) hit.count++
      else by.set(id, { id, label: models?.find((m) => m.id === i.modelId)?.title ?? i.model, count: 1 })
    }
    return [...by.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
  }, [inView, type, models])

  // A model filter that the current view no longer holds would show nothing; drop it.
  useEffect(() => {
    if (model && !modelChoices.some((c) => c.id === model)) setModel('')
  }, [model, modelChoices])

  const shown = useMemo(
    () =>
      inView
        .filter((i) => matchesType(i, type))
        .filter((i) => !model || modelKey(i) === model)
        .filter((i) => inDateRange(i.createdAt, range))
        .filter((i) => matchesSearch(i, q)),
    [inView, type, model, range, q],
  )

  // Newest day first, newest asset first inside each day.
  const days = useMemo(() => {
    const by = new Map<number, HistoryItem[]>()
    for (const i of shown) {
      const key = startOfDay(i.createdAt)
      const bucket = by.get(key)
      if (bucket) bucket.push(i)
      else by.set(key, [i])
    }
    return [...by.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([key, list]) => ({ key, list: [...list].sort((a, b) => b.createdAt - a.createdAt) }))
  }, [shown])

  const ordered = useMemo(() => days.flatMap((d) => d.list), [days])
  const order = useMemo(() => ordered.map((i) => i.taskId), [ordered])
  const picked = useMemo(() => ordered.filter((i) => selected.has(i.taskId)), [ordered, selected])
  const selecting = picked.length > 0

  // A new filter starts drawing from the top again.
  const filterKey = `${view}|${type}|${model}|${q}|${JSON.stringify(range)}`
  useEffect(() => {
    setLimit(PAGE)
  }, [filterKey])

  // Draw the next step as the end of the grid comes near (the button is the fallback).
  const more = limit < ordered.length
  useEffect(() => {
    const el = sentinel.current
    if (!more || !el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setLimit((l) => l + PAGE), { root: body.current, rootMargin: '800px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [more, limit])

  const select = (item: HistoryItem, e: { shiftKey: boolean }) => {
    // Read the anchor now: the updater runs later, after it has moved to this tile.
    const from = anchor.current
    setSelected((prev) => selectRange(order, prev, from, item.taskId, e.shiftKey))
    anchor.current = item.taskId
  }
  const selectDay = (list: HistoryItem[]) => {
    const all = list.every((i) => selected.has(i.taskId))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const i of list) {
        if (all) next.delete(i.taskId)
        else next.add(i.taskId)
      }
      return next
    })
  }
  const clear = () => {
    setSelected(new Set())
    anchor.current = null
  }

  // Esc clears the selection and Ctrl+A ticks everything shown — unless the viewer is open
  // or you are typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (viewer || view === 'elements') return
      const tag = (e.target as HTMLElement | null)?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape' && selected.size) {
        clear()
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && order.length) {
        e.preventDefault()
        setSelected(new Set(order))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewer, view, selected, order])

  const heading = view === 'favourites' ? 'Favourites' : project ? projectName(project) : 'All assets'
  const filtered = Boolean(q.trim() || model || range.kind !== 'all')

  const tile = (i: HistoryItem) => (
    <ResultTile key={i.taskId} item={i} fill={prefs.layout === 'square'} onOpen={(it) => openViewer(it, ordered)} onSelect={select} selected={selected.has(i.taskId)} selecting={selecting} />
  )
  const grid = (list: HistoryItem[]) =>
    prefs.layout === 'masonry' ? (
      <div className="vw-masonry" style={{ columnWidth: `${prefs.size}px` }}>
        {list.map(tile)}
      </div>
    ) : (
      <div className="st-daygrid" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${prefs.size}px, 1fr))` }}>
        {list.map(tile)}
      </div>
    )

  // Split by date: each day's head and box cover the whole day, even before all of it is drawn.
  let budget = limit
  const groups = prefs.split
    ? days.flatMap((d) => {
        if (budget <= 0) return []
        const drawn = d.list.slice(0, budget)
        budget -= drawn.length
        return [{ ...d, drawn }]
      })
    : []

  return (
    <div className="st-split">
      <aside className="st-side">
        <SideItem icon={Images} label="Assets" count={done.length} on={view === 'all'} onClick={() => setView('all')} />
        <SideItem icon={Heart} label="Favourites" count={done.filter((i) => i.pinned).length} on={view === 'favourites'} onClick={() => setView('favourites')} />
        <SideItem icon={Shapes} label="Elements" count={elements.length} on={view === 'elements'} onClick={() => setView('elements')} />

        <ProjectsRail projects={projects} doneIds={doneIds} view={view} onPick={setView} />

        {view !== 'elements' && (
          <>
            <p className="st-side-head">Types</p>
            <SideItem icon={Images} label="All types" count={inView.length} on={type === 'all'} onClick={() => setType('all')} />
            {TYPES.map((t) => (
              <SideItem key={t.id} icon={t.icon} label={t.label} count={counts[t.id]} on={type === t.id} onClick={() => setType(t.id)} />
            ))}
          </>
        )}

        <div className="st-side-foot">
          <p className="st-note">Archived results are served from disk; the rest point at Kie and expire with the job.</p>
        </div>
      </aside>

      {view === 'elements' ? (
        <section className="st-canvas">
          <div className="st-canvas-body">
            <ElementsPanel />
          </div>
        </section>
      ) : (
        <section className="st-canvas">
          {selecting ? (
            <SelectionBar picked={picked} total={ordered.length} projectId={projectId} onAll={() => setSelected(new Set(order))} onClear={clear} />
          ) : (
            <div className="st-canvas-bar vw-filterbar">
              <label className="vw-search" title="Search by prompt or by date — “October 7”, “2026-10-07”">
                <Search size={14} />
                <input placeholder="Search prompts or dates…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search prompts or dates" />
                {q && (
                  <button type="button" className="vw-mini" aria-label="Clear search" onClick={() => setQ('')} style={{ border: 0 }}>
                    <X size={12} />
                  </button>
                )}
              </label>
              <select className="vw-select" value={model} onChange={(e) => setModel(e.target.value)} aria-label="Model">
                <option value="">All models</option>
                {modelChoices.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label} ({c.count})
                  </option>
                ))}
              </select>
              <select
                className="vw-select"
                value={range.kind}
                aria-label="Date range"
                onChange={(e) => {
                  const kind = e.target.value as DateRange['kind']
                  setRange(kind === 'custom' ? { kind, from: range.kind === 'custom' ? range.from : undefined, to: range.kind === 'custom' ? range.to : undefined } : { kind })
                }}
              >
                {RANGES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              {range.kind === 'custom' && (
                <span className="vw-dates">
                  <input type="date" className="vw-input vw-date" aria-label="From" value={range.from ?? ''} max={range.to} onChange={(e) => setRange({ ...range, from: e.target.value || undefined })} />
                  <span className="vw-list-sub">to</span>
                  <input type="date" className="vw-input vw-date" aria-label="To" value={range.to ?? ''} min={range.from} onChange={(e) => setRange({ ...range, to: e.target.value || undefined })} />
                </span>
              )}
              <span className="st-pill-label" style={{ marginLeft: 'auto' }}>
                {heading} · {shown.length} {shown.length === 1 ? 'asset' : 'assets'}
              </span>
              <ViewMenu prefs={prefs} onChange={setPrefs} />
            </div>
          )}

          <div className="st-canvas-body" ref={body}>
            {!ordered.length ? (
              <Empty
                icon={view === 'favourites' ? Heart : projectId ? FolderOpen : Images}
                title={filtered ? 'Nothing matches that' : view === 'favourites' ? 'No favourites yet' : projectId ? 'This project is empty' : 'Nothing here yet'}
                sub={
                  q.trim()
                    ? 'Search looks at the prompt and the date (“October 7”, “2026-10-07”), so try a word you actually typed.'
                    : model || range.kind !== 'all'
                      ? 'Nothing from that model or those dates in this view. Widen the filters to see the rest.'
                      : view === 'favourites'
                        ? 'Press the heart on any result (or F in the viewer) and it collects here.'
                        : projectId
                          ? 'Add results from the viewer, or tick a few under Assets and press Add to project.'
                          : 'Every finished job across Image, Video, Audio and the preset surfaces collects here.'
                }
              />
            ) : prefs.split ? (
              groups.map((d) => {
                const on = d.list.filter((i) => selected.has(i.taskId)).length
                return (
                  <div key={d.key} className="st-daygroup">
                    <p className="st-dayhead">
                      <button
                        type="button"
                        className={`vw-daycheck ${on === d.list.length ? 'is-on' : on ? 'is-some' : ''}`}
                        role="checkbox"
                        aria-checked={on === d.list.length ? true : on ? 'mixed' : false}
                        aria-label={`Select everything from ${dayLabel(d.key)}`}
                        title="Select the whole day"
                        onClick={() => selectDay(d.list)}
                      >
                        {on === d.list.length ? <Check size={12} /> : on ? <Minus size={12} /> : null}
                      </button>
                      {dayLabel(d.key)}
                      <span className="st-pill-label">{d.list.length}</span>
                    </p>
                    {grid(d.drawn)}
                  </div>
                )
              })
            ) : (
              grid(ordered.slice(0, limit))
            )}
            {more && (
              <div ref={sentinel} className="vw-more">
                <span className="vw-list-sub">
                  Showing {Math.min(limit, ordered.length)} of {ordered.length}
                </span>
                <button type="button" className="vw-btn is-sm" onClick={() => setLimit((l) => l + PAGE)}>
                  Show more
                </button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

/** Layout, split by date, card size. */
function ViewMenu({ prefs, onChange }: { prefs: ViewPrefs; onChange: (p: Partial<ViewPrefs>) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  const close = useCallback(() => setOpen(false), [])
  useDismiss(box, open, close)
  return (
    <span className="vw-pop-anchor" ref={box}>
      <button type="button" className={`vw-btn is-sm ${open ? 'is-on' : ''}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
        <SlidersHorizontal size={14} />
        View
      </button>
      {open && (
        <div className="vw-pop is-right" role="dialog" aria-label="View">
          <p className="vw-sec-title">Layout</p>
          <div className="vw-seg" role="radiogroup" aria-label="Layout">
            {(
              [
                ['square', 'Square', LayoutGrid],
                ['masonry', 'Masonry', LayoutDashboard],
              ] as const
            ).map(([id, label, Icon]) => (
              <button key={id} type="button" role="radio" aria-checked={prefs.layout === id} className={prefs.layout === id ? 'is-on' : ''} onClick={() => onChange({ layout: id })}>
                <Icon size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />
                {label}
              </button>
            ))}
          </div>
          <button type="button" className="vw-toggle" role="switch" aria-checked={prefs.split} onClick={() => onChange({ split: !prefs.split })}>
            <span>Split by date</span>
            <span className={`vw-switch ${prefs.split ? 'is-on' : ''}`} aria-hidden="true" />
          </button>
          <label className="vw-sec-title" style={{ marginTop: 12 }}>
            <span>Card size</span>
            <span className="vw-list-sub">{prefs.size}px</span>
          </label>
          <input type="range" className="vw-range" min={SIZE_MIN} max={SIZE_MAX} step={10} value={prefs.size} aria-label="Card size" onChange={(e) => onChange({ size: Number(e.target.value) })} />
        </div>
      )}
    </span>
  )
}

function SideItem({ icon: Icon, label, count, on, onClick }: { icon: LucideIcon; label: string; count?: number; on: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`st-side-item ${on ? 'is-active' : ''}`} onClick={onClick} title={label}>
      <Icon size={14} style={{ flex: 'none' }} />
      <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      {count !== undefined && (
        <span className="st-pill-label" style={{ marginLeft: 'auto' }}>
          {count}
        </span>
      )}
    </button>
  )
}

/** The rail's project list, with a quick way to start a new one. */
function ProjectsRail({ projects, doneIds, view, onPick }: { projects: Project[]; doneIds: Set<string>; view: View; onPick: (v: View) => void }) {
  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const create = async () => {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    try {
      const p = await libraryApi.createProject(t)
      setTitle('')
      setAdding(false)
      onPick(`project:${p.id}`)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <p className="st-side-head vw-side-head">
        Projects
        <button type="button" className="vw-mini" aria-label="New project" title="New project" onClick={() => setAdding(!adding)}>
          {adding ? <X size={11} /> : <Plus size={11} />}
        </button>
      </p>
      {adding && (
        <form
          className="vw-side-add"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <input className="vw-input" placeholder="Project name" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} aria-label="Project name" />
          <button type="submit" className="vw-mini" aria-label="Create" disabled={busy || !title.trim()} style={{ width: 30, height: 30 }}>
            {busy ? <Loader2 size={12} className="st-spin" /> : <Check size={12} />}
          </button>
        </form>
      )}
      {error && <p className="st-note">{error}</p>}
      {projects.length ? (
        projects.map((p) => (
          <SideItem
            key={p.id}
            icon={FolderOpen}
            label={projectName(p)}
            count={p.taskIds.filter((id) => doneIds.has(id)).length}
            on={view === `project:${p.id}`}
            onClick={() => onPick(`project:${p.id}`)}
          />
        ))
      ) : !adding ? (
        <p className="st-note" style={{ padding: '0 9px' }}>
          None yet. Group results with Add to project.
        </p>
      ) : null}
    </>
  )
}

/** The bar that replaces the filters while anything is ticked. */
function SelectionBar({ picked, total, projectId, onAll, onClear }: { picked: HistoryItem[]; total: number; projectId: string | null; onAll: () => void; onClear: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [projOpen, setProjOpen] = useState(false)
  const allFav = picked.every((i) => i.pinned)
  const n = picked.length
  const things = `${n} ${n === 1 ? 'result' : 'results'}`

  const run = async (id: string, fn: () => Promise<string | void>) => {
    if (busy) return
    setBusy(id)
    setMsg(null)
    try {
      const text = await fn()
      if (text) setMsg({ bad: false, text })
    } catch (e) {
      setMsg({ bad: true, text: (e as Error).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="vw-selbar" role="toolbar" aria-label="Selected results">
      <span className="vw-selbar-count">{n} selected</span>
      {n < total && (
        <button type="button" className="vw-link" onClick={onAll}>
          Select all {total}
        </button>
      )}

      {confirm ? (
        <>
          <span style={{ fontWeight: 600 }}>Delete {things} for good? Their files on disk go too.</span>
          <button type="button" className="vw-btn is-sm" onClick={() => setConfirm(false)} disabled={busy === 'delete'}>
            Keep them
          </button>
          <button
            type="button"
            className="vw-btn is-sm is-danger"
            disabled={Boolean(busy)}
            onClick={() =>
              void run('delete', async () => {
                await deleteItems(picked.map((i) => i.taskId))
                setConfirm(false)
                onClear()
              })
            }
          >
            {busy === 'delete' ? <Loader2 size={14} className="st-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </>
      ) : (
        <>
          <button type="button" className="vw-btn" disabled={Boolean(busy)} onClick={() => void run('download', () => downloadItems(picked))}>
            {busy === 'download' ? <Loader2 size={14} className="st-spin" /> : <Download size={14} />}
            Download
          </button>
          <button type="button" className={`vw-btn ${allFav ? 'is-on' : ''}`} disabled={Boolean(busy)} onClick={() => void run('fav', () => setFavourites(picked, !allFav))}>
            {busy === 'fav' ? <Loader2 size={14} className="st-spin" /> : <Heart size={14} className="vw-heart" />}
            {allFav ? 'Unfavourite' : 'Favourite'}
          </button>
          <span className="vw-pop-anchor">
            <button type="button" className={`vw-btn ${projOpen ? 'is-on' : ''}`} disabled={Boolean(busy)} onClick={() => setProjOpen(!projOpen)} aria-expanded={projOpen}>
              <FolderPlus size={14} />
              Add to project
            </button>
            {projOpen && (
              <ProjectMenu
                onClose={() => setProjOpen(false)}
                onPick={(target, label) => {
                  setProjOpen(false)
                  void run('project', async () => {
                    await addToProject(target, picked)
                    return `Added ${things} to “${label}”.`
                  })
                }}
              />
            )}
          </span>
          {projectId && (
            <button
              type="button"
              className="vw-btn"
              disabled={Boolean(busy)}
              onClick={() =>
                void run('unproject', async () => {
                  for (const i of picked) await libraryApi.removeFromProject(projectId, i.taskId)
                  onClear()
                })
              }
            >
              {busy === 'unproject' ? <Loader2 size={14} className="st-spin" /> : <Minus size={14} />}
              Take out of project
            </button>
          )}
          <button type="button" className="vw-btn is-danger" disabled={Boolean(busy)} onClick={() => setConfirm(true)}>
            <Trash2 size={14} />
            Delete…
          </button>
        </>
      )}

      <span className="vw-selbar-end">
        {busy === 'project' && <Loader2 size={14} className="st-spin" />}
        {msg && (
          <span role={msg.bad ? 'alert' : 'status'} style={{ fontSize: 12.5, color: msg.bad ? 'var(--pl-bad)' : 'var(--pl-ink)' }}>
            {msg.text}
          </span>
        )}
        <button type="button" className="vw-btn is-icon" aria-label="Clear selection" title="Clear selection (Esc)" onClick={onClear}>
          <X size={15} />
        </button>
      </span>
    </div>
  )
}

/** Pick a project, or name a new one. Closes on an outside click or Escape. */
function ProjectMenu({ onPick, onClose }: { onPick: (target: { id: string } | { title: string }, label: string) => void; onClose: () => void }) {
  const { items: projects, loading } = useProjects()
  const [title, setTitle] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!box.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [onClose])
  return (
    <div ref={box} className="vw-pop">
      {loading && !projects.length ? (
        <p className="vw-empty-line">Loading projects…</p>
      ) : projects.length ? (
        <div className="vw-list">
          {projects.map((p) => (
            <button key={p.id} type="button" className="vw-list-item" onClick={() => onPick({ id: p.id }, projectName(p))}>
              <span>{projectName(p)}</span>
              <span className="vw-list-sub">{p.taskIds.length}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="vw-empty-line">No projects yet.</p>
      )}
      <form
        className="vw-copyline"
        style={{ marginTop: 8 }}
        onSubmit={(e) => {
          e.preventDefault()
          const t = title.trim()
          if (t) onPick({ title: t }, t)
        }}
      >
        <input className="vw-input" placeholder="New project name" value={title} autoFocus onChange={(e) => setTitle(e.target.value)} aria-label="New project name" />
        <button type="submit" className="vw-btn is-icon" aria-label="Create project" disabled={!title.trim()}>
          <Plus size={15} />
        </button>
      </form>
    </div>
  )
}
