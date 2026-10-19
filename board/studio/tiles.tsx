/**
 * Tiles for the feeds: a job still on its way, and a finished result.
 *
 * the reference app drops a placeholder into the feed the moment you press Generate — the right
 * shape, a spinner and a clock — and turns it into the result in place. `JobTile` is
 * that placeholder (and the failed state, with Retry); `ResultTile` is a finished
 * history item with their hover overlay — like, download, copy prompt and "…" (the viewer)
 * in the corner, Reference / Animate ▾ (stills) or Extend / Upscale (clips) along the
 * bottom — and, where a grid allows it, a select box. `FailedTile` is a history item that
 * failed: it stays in the feed, marked, with Recreate, Retry and Remove.
 *
 * A pending tile carries the reference app's state chip top-left — Queued while Kie has it waiting,
 * Generating (accent, with a soft glow along the top edge) once it runs — and keeps the
 * clock and % in the middle.
 *
 * Like theirs, every finished tile has a select box (ticks go into the shared `selection`, and a
 * floating bulk bar acts on them: `FloatingSelectionBar`, mounted beside the viewer), Open in ▾ with
 * the edit tools on a still, a ⋯ menu in their order (`ResultMenu`, also the viewer's More), and a
 * "Last viewed" mark on the tile last opened in the viewer.
 *
 * The List view (rail surfaces; Video opens on it) has a card per job instead: the media
 * large, and a panel with the model, the prompt (reference tokens as chips), the files it
 * was given, resolution · duration · aspect, the date, and Rerun · copy · delete. `JobCard`,
 * `FailedCard` and `ResultCard` are those, for the same three states.
 */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MouseEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  AlertTriangle,
  AudioLines,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  FastForward,
  Film,
  FolderPlus,
  Heart,
  ImagePlus,
  Loader2,
  Maximize2,
  Plus,
  RefreshCw,
  RotateCcw,
  Shapes,
  Trash2,
  Undo2,
  UserRoundPlus,
  Wand2,
  X,
} from 'lucide-react'
import { deleteResult, firstMedia, useCatalog, useHistory, type HistoryItem, type ModelDefinition } from './api.ts'
import {
  addToProject,
  canSaveElement,
  copyText,
  deleteItems,
  downloadItems,
  ELEMENT_CHOICES,
  elementSource,
  itemOfJob,
  kindOf,
  mediaOf,
  prepareReuse,
  recreate,
  regenerate,
  retryFailed,
  runTool,
  saveAsElement,
  sendReuse,
  setFavourites,
  settingRows,
  toolsFor,
  urlKind,
  useRegenerate,
  type ToolId,
} from './actions.ts'
import { createLastViewed, createSelection, promptParts, specChips, surfaceKeyOf, whenLabel } from './feed.ts'
import { libraryApi, useElements, useProjects } from './library.ts'
import { nameFromPrompt } from './elements/model.ts'
import { dismissJob, elapsed, isActive, phaseOf, retryJob, type Job, type JobPhase } from './jobs.ts'
import { CostTag } from './parts.tsx'
import './viewer.css'

/** "16:9" → a CSS aspect-ratio; anything else squares off. */
export const ratioOf = (aspect?: string): string => {
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/.exec(aspect ?? '')
  if (m) return `${m[1]} / ${m[2]}`
  const words: Record<string, string> = { portrait_16_9: '9 / 16', portrait_4_3: '3 / 4', landscape_16_9: '16 / 9', landscape_4_3: '4 / 3' }
  return words[aspect ?? ''] ?? '1 / 1'
}

const clock = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`)

function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => set((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [on])
}

const PHASE_LABEL: Record<JobPhase, string> = { sending: 'Sending', queued: 'Queued', generating: 'Generating', done: 'Done', failed: 'Failed' }

/** The chips top-left of a job: its state, and for a failure whether the credits came back. */
function StateChips({ phase, refunded }: { phase: JobPhase; refunded?: boolean }) {
  return (
    <span className="st-state" aria-live="polite">
      <span className={`pl-badge st-state-chip is-${phase}`}>{PHASE_LABEL[phase]}</span>
      {phase === 'failed' && refunded && <span className="pl-badge pl-badge--ok">Credits refunded</span>}
    </span>
  )
}

/** The pending tile's middle: spinner, clock, and % when Kie gives one. */
function JobClock({ job }: { job: Job }) {
  return (
    <>
      <Loader2 size={18} className="st-spin" />
      <span className="st-job-clock">
        {clock(elapsed(job))}
        {typeof job.progress === 'number' && job.progress > 0 && job.progress < 1 ? ` · ${Math.round(job.progress * 100)}%` : ''}
      </span>
    </>
  )
}

const phaseClass = (phase: JobPhase) => (phase === 'generating' ? 'is-generating' : phase === 'failed' ? 'is-failed' : '')

/** A Kie failure charges nothing; a submit that never reached Kie charged nothing either. */
const jobRefunded = (job: Job) => !job.task?.creditsConsumed

export function JobTile({ job }: { job: Job }) {
  const live = isActive(job)
  useTick(live)
  const phase = phaseOf(job)
  const aspect = job.meta.aspect ?? (job.category === 'video' ? '16:9' : '1:1')
  return (
    <figure className={`st-tile st-job ${phaseClass(phase)}`} style={{ margin: 0, aspectRatio: job.category === 'audio' ? '4 / 1' : ratioOf(aspect) }}>
      {live && <StateChips phase={phase} />}
      <div className="st-job-body">
        {live ? (
          <JobClock job={job} />
        ) : (
          <>
            <AlertTriangle size={18} />
            <span className="st-job-state">Failed</span>
            <span className="st-job-err">{job.error}</span>
            <JobFailureActions job={job} />
          </>
        )}
      </div>
      <figcaption className="st-tile-meta">
        {job.meta.label ? `${job.meta.label} · ` : ''}
        {job.prompt.slice(0, 80) || job.modelTitle}
      </figcaption>
    </figure>
  )
}

/** A live failed job's ways out: Recreate (into the form), Retry (the same job again), Dismiss. */
function JobFailureActions({ job, note: showNote = true }: { job: Job; note?: boolean }) {
  const { models } = useCatalog()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const model = models?.find((m) => m.id === job.modelId) ?? null
  return (
    <>
      {showNote && note && (
        <span className="st-job-err" role="alert" style={{ fontWeight: 600 }}>
          {note}
        </span>
      )}
      <span className="st-job-actions">
        <button
          type="button"
          className="st-pill"
          title="Put this job's prompt, model and settings back in the form"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            setNote(null)
            recreate(itemOfJob(job), model)
              .catch((e: unknown) => setNote((e as Error).message || 'That did not work.'))
              .finally(() => setBusy(false))
          }}
        >
          {busy ? spin : <Undo2 size={13} />}
          Recreate
        </button>
        <button type="button" className="st-pill" title="Run the same job again" onClick={() => models && retryJob(job.id, models)} disabled={!models}>
          <RotateCcw size={13} />
          Retry
        </button>
        <button type="button" className="st-pill is-icon" title="Dismiss" aria-label="Dismiss" onClick={() => dismissJob(job.id)}>
          <X size={14} />
        </button>
      </span>
    </>
  )
}

/** One action at a time on a tile; a failure shows on the tile, not in an alert. */
function useTileAction() {
  const [busy, setBusy] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const act = (which: string, fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(which)
    setFailed(null)
    fn()
      .catch((e: unknown) => setFailed((e as Error).message || 'That did not work.'))
      .finally(() => setBusy(null))
  }
  return { busy, failed, act, clear: () => setFailed(null) }
}
type TileAction = ReturnType<typeof useTileAction>

const spin = <Loader2 size={13} className="st-spin" />

/* ---------- the shared selection and "Last viewed" ---------- */

/** Every feed's tiles tick into this one set (Assets runs its own); the bulk bar acts on it. */
export const selection = createSelection()
/** The tile last opened in the viewer, per surface; the viewer marks it (`markViewed`). */
const lastViewed = createLastViewed()
const surfaceNow = () => (typeof window === 'undefined' ? 'studio' : surfaceKeyOf(window.location.hash))
export const markViewed = (taskId: string) => lastViewed.mark(surfaceNow(), taskId)

if (typeof window !== 'undefined') window.addEventListener('hashchange', () => selection.clear())

/** The finished tiles on screen that use the shared selection, so a shift-click can fill in the run. */
const mounted = new Map<string, HistoryItem>()
const screenOrder = () => [...document.querySelectorAll<HTMLElement>('[data-sel-id]')].map((el) => el.dataset.selId ?? '').filter(Boolean)

/* ---------- the ⋯ menu ---------- */

type MenuView = 'main' | 'element' | 'assign' | 'more' | 'project' | 'delete'

/** Keeps a floating menu on screen: under the button, or above it when there's no room below. */
function useFloat(anchor: HTMLElement | null, menu: React.RefObject<HTMLDivElement | null>, deps: unknown[]) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  useLayoutEffect(() => {
    if (!anchor || !menu.current) return
    const r = anchor.getBoundingClientRect()
    const w = menu.current.offsetWidth
    const h = menu.current.offsetHeight
    const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8)
    const below = r.bottom + 6
    const top = below + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : below
    setPos({ top, left })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchor, ...deps])
  return pos
}

export interface ResultMenuProps {
  item: HistoryItem
  /** The ⋯ button it hangs off. */
  anchor: HTMLElement | null
  onClose: () => void
  /** "Open" (into the viewer); left out where it is already open. */
  onOpen?: (item: HistoryItem) => void
  /** After Delete: the viewer steps on to the next result. */
  onDeleted?: () => void
}

/**
 * Their ⋯ menu, in their order: Open · Regenerate · Reuse · Create element › · Assign to element ›
 * · Additional › · Like · Add to project › · Download · Delete. A submenu replaces the list (with
 * a back row) rather than flying out, so it never runs off a small tile or the screen edge. It
 * floats over the page (a portal), since a tile clips what's inside it.
 */
export function ResultMenu({ item, anchor, onClose, onOpen, onDeleted }: ResultMenuProps) {
  const box = useRef<HTMLDivElement>(null)
  const [view, setView] = useState<MenuView>('main')
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)
  const regen = useRegenerate(item)
  const media = mediaOf(item)[0]
  const kind = kindOf(item, media)
  const pos = useFloat(anchor, box, [view, msg])

  useEffect(() => {
    const onDown = (e: globalThis.MouseEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !anchor?.contains(t)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      onClose()
    }
    const onScroll = (e: Event) => {
      if (!box.current?.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onClose)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onClose)
    }
  }, [anchor, onClose])

  /** One action at a time; a result worth saying stays in the menu, the rest close it. */
  const run = (id: string, fn: () => Promise<string | void>) => {
    if (busy) return
    setBusy(id)
    setMsg(null)
    fn()
      .then((text) => (text ? setMsg({ bad: false, text }) : onClose()))
      .catch((e: unknown) => setMsg({ bad: true, text: (e as Error).message || 'That did not work.' }))
      .finally(() => setBusy(null))
  }
  const row = (id: string, label: ReactNode, Icon: typeof Film, onClick: () => void, opts: { sub?: string; next?: boolean; danger?: boolean; disabled?: boolean; title?: string } = {}) => (
    <button key={id} type="button" role="menuitem" className={`vw-list-item st-menu-row ${opts.danger ? 'is-danger' : ''}`} disabled={Boolean(busy) || opts.disabled} title={opts.title} onClick={onClick}>
      {busy === id ? <Loader2 size={14} className="st-spin" /> : <Icon size={14} />}
      <span>{label}</span>
      {opts.sub && <span className="vw-list-sub">{opts.sub}</span>}
      {opts.next && <ChevronRight size={13} className="st-menu-next" />}
    </button>
  )
  const back = (title: string) => (
    <button type="button" className="vw-list-item st-menu-back" onClick={() => setView('main')}>
      <ChevronLeft size={14} />
      <span>{title}</span>
    </button>
  )
  const extra = toolsFor(kind).filter((t) => !['reference', 'animate', 'last-frame'].includes(t.id))
  const source = media ? elementSource(media) : null

  let body: ReactNode
  if (view === 'element') {
    body = (
      <>
        {back('Create element')}
        {ELEMENT_CHOICES.map((c) =>
          row(`el-${c.id}`, `${c.label} element`, Shapes, () =>
            run(`el-${c.id}`, async () => {
              if (!media) throw new Error('This result has no file.')
              const el = await saveAsElement(media, nameFromPrompt(item.prompt, `New ${c.label.toLowerCase()}`), c.id)
              return `Saved as “${el.name}”. @-mention it from any prompt.`
            }),
          ),
        )}
      </>
    )
  } else if (view === 'assign') {
    body = (
      <>
        {back('Assign to element')}
        <AssignList busy={busy} onPick={(el) => run(`as-${el.id}`, async () => {
          if (!source) throw new Error('Only a result with a file on disk or an https link can go into an Element.')
          await libraryApi.addImageUrl(el.id, source)
          return `Added to “${el.name}”.`
        })} />
      </>
    )
  } else if (view === 'more') {
    body = (
      <>
        {back('Additional')}
        {extra.map((t) => row(t.id, t.label, Wand2, () => media && run(t.id, () => runTool(t.id, item, media)), { title: t.hint, disabled: !media }))}
      </>
    )
  } else if (view === 'project') {
    body = (
      <>
        {back('Add to project')}
        <ProjectList busy={busy} onPick={(target, label) => run('project', async () => {
          await addToProject(target, [item])
          return `Added to “${label}”.`
        })} />
      </>
    )
  } else if (view === 'delete') {
    body = (
      <>
        <p className="st-menu-note">Delete this result for good? Its files on disk go with it.</p>
        <div className="vw-row-end">
          <button type="button" className="vw-btn is-sm" onClick={() => setView('main')} disabled={busy === 'delete'}>
            Keep it
          </button>
          <button
            type="button"
            className="vw-btn is-sm is-danger"
            disabled={Boolean(busy)}
            onClick={() =>
              run('delete', async () => {
                await deleteItems([item.taskId])
                selection.clear()
                onDeleted?.()
              })
            }
          >
            {busy === 'delete' ? <Loader2 size={14} className="st-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </div>
      </>
    )
  } else {
    body = (
      <>
        {onOpen && row('open', 'Open', ExternalLink, () => {
          onClose()
          onOpen(item)
        })}
        {row(
          'regenerate',
          'Regenerate',
          RefreshCw,
          () =>
            regen.model &&
            run('regenerate', async () => {
              await regenerate(item, regen.model as ModelDefinition)
            }),
          { disabled: !regen.model || Boolean(regen.blocker), title: regen.blocker ?? regen.estimate?.detail ?? 'Run the same job again (spends credits)', sub: regen.estimate ? `${Number(regen.estimate.credits.toFixed(2))} cr` : undefined },
        )}
        {row('reuse', 'Reuse', RotateCcw, () =>
          run('reuse', async () => {
            const { handoff, dropped } = await prepareReuse(item, regen.model)
            sendReuse(handoff)
            if (dropped) return `${dropped} of its files had expired on Kie and were left out.`
          }),
        { title: 'Put the prompt, model and settings back in the form' })}
        {canSaveElement(kind) && row('element', 'Create element', UserRoundPlus, () => setView('element'), { next: true, disabled: !media })}
        {canSaveElement(kind) && row('assign', 'Assign to element', Shapes, () => setView('assign'), { next: true, disabled: !source })}
        {extra.length > 0 && row('more', 'Additional', Wand2, () => setView('more'), { next: true })}
        {row('like', item.pinned ? 'Unlike' : 'Like', Heart, () => run('like', () => setFavourites([item], !item.pinned)))}
        {row('project', 'Add to project', FolderPlus, () => setView('project'), { next: true })}
        {row('download', 'Download', Download, () => run('download', () => downloadItems([item])), { disabled: !media })}
        {row('delete', 'Delete', Trash2, () => setView('delete'), { danger: true })}
      </>
    )
  }

  return createPortal(
    <div ref={box} className="st-menu" role="menu" aria-label="More actions" style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}>
      {body}
      {msg && (
        <p className={`st-menu-msg ${msg.bad ? 'is-bad' : ''}`} role={msg.bad ? 'alert' : 'status'}>
          {msg.text}
        </p>
      )}
    </div>,
    document.body,
  )
}

/** Assign to element: every element, newest first; a full one can't take another picture. */
function AssignList({ busy, onPick }: { busy: string | null; onPick: (el: { id: string; name: string }) => void }) {
  const { items, loading } = useElements()
  if (loading && !items.length) return <p className="st-menu-note">Loading elements…</p>
  if (!items.length) return <p className="st-menu-note">No elements yet. Use Create element first.</p>
  return (
    <div className="st-menu-scroll">
      {items.map((el) => (
        <button key={el.id} type="button" role="menuitem" className="vw-list-item st-menu-row" disabled={Boolean(busy) || el.images.length >= 12} title={el.images.length >= 12 ? 'This element is full (12 pictures)' : `Add this picture to ${el.name}`} onClick={() => onPick(el)}>
          {busy === `as-${el.id}` ? <Loader2 size={14} className="st-spin" /> : <Shapes size={14} />}
          <span>{el.name}</span>
          <span className="vw-list-sub">{el.images.length}</span>
        </button>
      ))}
    </div>
  )
}

/** Add to project: the projects (with how many each holds), and a box to start a new one. */
function ProjectList({ busy, onPick }: { busy: string | null; onPick: (target: { id: string } | { title: string }, label: string) => void }) {
  const { items, loading } = useProjects()
  const [title, setTitle] = useState('')
  const name = (t: string) => t || 'Untitled project'
  return (
    <>
      {loading && !items.length ? (
        <p className="st-menu-note">Loading projects…</p>
      ) : items.length ? (
        <div className="st-menu-scroll">
          {items.map((p) => (
            <button key={p.id} type="button" role="menuitem" className="vw-list-item st-menu-row" disabled={Boolean(busy)} onClick={() => onPick({ id: p.id }, name(p.title))}>
              <FolderPlus size={14} />
              <span>{name(p.title)}</span>
              <span className="vw-list-sub">{p.taskIds.length}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="st-menu-note">No projects yet.</p>
      )}
      <form
        className="vw-copyline st-menu-new"
        onSubmit={(e) => {
          e.preventDefault()
          const t = title.trim()
          if (t) onPick({ title: t }, t)
        }}
      >
        <input className="vw-input" placeholder="New project name" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New project name" />
        <button type="submit" className="vw-btn is-icon" aria-label="Create project" disabled={!title.trim() || Boolean(busy)}>
          {busy === 'project' ? <Loader2 size={14} className="st-spin" /> : <Plus size={14} />}
        </button>
      </form>
    </>
  )
}

/* ---------- the floating bulk bar ---------- */

/**
 * Their bulk bar, floating over the feed while anything is ticked: N selected · Download · Add to
 * project · ♥ Like · Delete · ✕. Mounted once (beside the viewer) and fed by `selection`; the same
 * actions as Assets' selection bar (zip download, favourites, project, delete). Escape clears.
 */
export function FloatingSelectionBar() {
  const version = useSyncExternalStore(selection.subscribe, selection.version, selection.version)
  const { items: history } = useHistory()
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ bad: boolean; text: string } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const [projOpen, setProjOpen] = useState(false)
  const projBtn = useRef<HTMLButtonElement>(null)
  const n = selection.size()

  useEffect(() => {
    setConfirm(false)
    setMsg(null)
  }, [version])
  useEffect(() => {
    if (!n) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.vw-root')) selection.clear()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [n])

  if (!n) return null
  // The ticked items as history has them now, so ♥ reads the current state.
  const picked = selection.items().map((it) => history?.find((h) => h.taskId === it.taskId) ?? it)
  const allFav = picked.every((i) => i.pinned)
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
    <div className="st-bulkbar" role="toolbar" aria-label="Selected results">
      <span className="vw-selbar-count">{n} selected</span>
      {confirm ? (
        <>
          <span style={{ fontWeight: 600 }}>Delete {things} for good?</span>
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
                selection.clear()
              })
            }
          >
            {busy === 'delete' ? <Loader2 size={14} className="st-spin" /> : <Trash2 size={14} />}
            Delete
          </button>
        </>
      ) : (
        <>
          <button type="button" className="vw-btn is-sm" disabled={Boolean(busy)} onClick={() => void run('download', () => downloadItems(picked))}>
            {busy === 'download' ? <Loader2 size={14} className="st-spin" /> : <Download size={14} />}
            Download
          </button>
          <button ref={projBtn} type="button" className={`vw-btn is-sm ${projOpen ? 'is-on' : ''}`} disabled={Boolean(busy)} onClick={() => setProjOpen(!projOpen)} aria-expanded={projOpen}>
            {busy === 'project' ? <Loader2 size={14} className="st-spin" /> : <FolderPlus size={14} />}
            Add to project
          </button>
          {projOpen && <BulkProjectMenu anchor={projBtn.current} onClose={() => setProjOpen(false)} onPick={(target, label) => {
            setProjOpen(false)
            void run('project', async () => {
              await addToProject(target, picked)
              return `Added ${things} to “${label}”.`
            })
          }} />}
          <button type="button" className={`vw-btn is-sm ${allFav ? 'is-on' : ''}`} disabled={Boolean(busy)} onClick={() => void run('fav', () => setFavourites(picked, !allFav))}>
            {busy === 'fav' ? <Loader2 size={14} className="st-spin" /> : <Heart size={14} className="vw-heart" />}
            {allFav ? 'Unlike' : 'Like'}
          </button>
          <button type="button" className="vw-btn is-sm is-danger" disabled={Boolean(busy)} onClick={() => setConfirm(true)}>
            <Trash2 size={14} />
            Delete…
          </button>
        </>
      )}
      {msg && (
        <span role={msg.bad ? 'alert' : 'status'} className={`st-bulkbar-msg ${msg.bad ? 'is-bad' : ''}`}>
          {msg.text}
        </span>
      )}
      <button type="button" className="vw-btn is-icon is-sm" aria-label="Clear selection" title="Clear selection (Esc)" onClick={() => selection.clear()}>
        <X size={15} />
      </button>
    </div>
  )
}

/** The bulk bar's project list, floating under its button. */
function BulkProjectMenu({ anchor, onClose, onPick }: { anchor: HTMLElement | null; onClose: () => void; onPick: (target: { id: string } | { title: string }, label: string) => void }) {
  const box = useRef<HTMLDivElement>(null)
  const pos = useFloat(anchor, box, [])
  useEffect(() => {
    const onDown = (e: globalThis.MouseEvent) => {
      const t = e.target as Node
      if (!box.current?.contains(t) && !anchor?.contains(t)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [anchor, onClose])
  return createPortal(
    <div ref={box} className="st-menu" role="menu" aria-label="Add to project" style={pos ? { top: pos.top, left: pos.left } : { top: -9999, left: -9999 }}>
      <ProjectList busy={null} onPick={onPick} />
    </div>,
    document.body,
  )
}

/** Their right-hand column: like, download, copy the prompt, and ⋯ for the rest (ResultMenu). */
function CornerActions({ item, onOpen, a }: { item: HistoryItem; onOpen?: (item: HistoryItem) => void; a: TileAction }) {
  const [more, setMore] = useState(false)
  const moreBtn = useRef<HTMLButtonElement>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(t)
  }, [copied])
  return (
    <span className="vw-quick">
      <button
        type="button"
        className={`vw-qbtn ${item.pinned ? 'is-on' : ''}`}
        aria-label={item.pinned ? 'Remove from favourites' : 'Favourite'}
        aria-pressed={Boolean(item.pinned)}
        title={item.pinned ? 'Remove from favourites' : 'Favourite'}
        disabled={a.busy === 'fav'}
        onClick={() => a.act('fav', () => setFavourites([item], !item.pinned))}
      >
        {a.busy === 'fav' ? spin : <Heart size={13} />}
      </button>
      <button type="button" className="vw-qbtn" aria-label="Download" title="Download" disabled={a.busy === 'down'} onClick={() => a.act('down', () => downloadItems([item]))}>
        {a.busy === 'down' ? spin : <Download size={13} />}
      </button>
      {item.prompt && (
        <button
          type="button"
          className="vw-qbtn"
          aria-label="Copy prompt"
          title={copied ? 'Copied' : 'Copy prompt'}
          onClick={() => a.act('copy', () => copyText(item.prompt ?? '').then(() => setCopied(true)))}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      )}
      <button ref={moreBtn} type="button" className={`vw-qbtn ${more ? 'is-pressed' : ''}`} aria-label="More actions" aria-haspopup="menu" aria-expanded={more} title="More: regenerate, reuse, elements, projects…" onClick={() => setMore(!more)}>
        <Ellipsis size={14} />
      </button>
      {more && <ResultMenu item={item} anchor={moreBtn.current} onOpen={onOpen} onClose={() => setMore(false)} />}
    </span>
  )
}

/** Open in ▾ on a still: the edit tools, each a handoff with the picture already in place. */
const OPEN_IN: { id: ToolId; label: string }[] = [
  { id: 'inpaint', label: 'Inpaint' },
  { id: 'angles', label: 'Angles' },
  { id: 'upscale', label: 'Upscale' },
  { id: 'relight', label: 'Relight' },
  { id: 'background', label: 'Remove BG' },
  { id: 'reframe', label: 'Expand' },
  { id: 'layers', label: 'Layers' },
]

/**
 * Their bottom bar. A still gets Reference (into the image composer), Animate ▾ with the frame
 * placement (start or end frame) and Open in ▾ (the edit tools); a clip gets Extend and Upscale.
 * Each re-hosts the file for Kie first, so the button spins until the target surface opens.
 */
function ToolBar({ item, a }: { item: HistoryItem; a: TileAction }) {
  const [open, setOpen] = useState<'animate' | 'open' | null>(null)
  const menu = open !== null
  const setMenu = (on: boolean) => setOpen(on ? 'animate' : null)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!menu) return
    const onDown = (e: globalThis.MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setMenu(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])
  const media = mediaOf(item)[0]
  if (!media) return null
  const kind = kindOf(item, media)
  const send = (id: ToolId) => a.act(id, () => runTool(id, item, media))
  const btn = (id: ToolId, label: string, Icon: typeof Film, title: string) => (
    <button type="button" className="vw-tbtn" title={title} disabled={Boolean(a.busy)} onClick={() => send(id)}>
      {a.busy === id ? spin : <Icon size={13} />}
      <span>{label}</span>
    </button>
  )
  return (
    <span className={`vw-tilebar ${menu ? 'is-open' : ''}`} ref={box}>
      {a.failed && (
        <span className="vw-tile-err" role="alert" title={a.failed}>
          {a.failed}
        </span>
      )}
      {kind === 'image' ? (
        <>
          {btn('reference', 'Reference', ImagePlus, 'Attach to the image composer as a reference')}
          <span className="vw-tmenu-anchor">
            <button type="button" className={`vw-tbtn ${open === 'animate' ? 'is-on' : ''}`} aria-haspopup="menu" aria-expanded={open === 'animate'} disabled={Boolean(a.busy)} onClick={() => setOpen(open === 'animate' ? null : 'animate')} title="Send to Video as a frame">
              {a.busy === 'animate' || a.busy === 'last-frame' ? spin : <Clapperboard size={13} />}
              <span>Animate</span>
              <ChevronDown size={12} />
            </button>
            {open === 'animate' && (
              <span className="vw-tmenu" role="menu" aria-label="Frame placement">
                <span className="vw-tmenu-head">Frame placement</span>
                <button type="button" role="menuitem" className="vw-list-item" onClick={() => {
                    setMenu(false)
                    send('animate')
                  }}>
                  <span>Start frame</span>
                </button>
                <button type="button" role="menuitem" className="vw-list-item" onClick={() => {
                    setMenu(false)
                    send('last-frame')
                  }}>
                  <span>End frame</span>
                </button>
              </span>
            )}
          </span>
          <span className="vw-tmenu-anchor">
            <button type="button" className={`vw-tbtn ${open === 'open' ? 'is-on' : ''}`} aria-haspopup="menu" aria-expanded={open === 'open'} disabled={Boolean(a.busy)} onClick={() => setOpen(open === 'open' ? null : 'open')} title="Open in an edit tool">
              {a.busy && OPEN_IN.some((t) => t.id === a.busy) ? spin : <Wand2 size={13} />}
              <span>Open in</span>
              <ChevronDown size={12} />
            </button>
            {open === 'open' && (
              <span className="vw-tmenu is-right" role="menu" aria-label="Open in">
                <span className="vw-tmenu-head">Open in</span>
                {OPEN_IN.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    className="vw-list-item"
                    onClick={() => {
                      setOpen(null)
                      send(t.id)
                    }}
                  >
                    <span>{t.label}</span>
                  </button>
                ))}
              </span>
            )}
          </span>
        </>
      ) : kind === 'video' ? (
        <>
          {btn('extend', 'Extend', FastForward, 'Carry the clip on for a few more seconds')}
          {btn('upscale-video', 'Upscale', Maximize2, 'Make the clip sharper and larger')}
        </>
      ) : null}
    </span>
  )
}

export interface ResultTileProps {
  item: HistoryItem
  /** Makes the whole tile a button into the viewer. */
  onOpen?: (item: HistoryItem) => void
  /** Fill the parent's box (a square grid cell) instead of taking the media's own height. */
  fill?: boolean
  /** Hide the hover actions (a picker that only wants the picture). */
  bare?: boolean
  /** Multi-select, for grids that offer it: the box on hover, ticked when `selected`. */
  onSelect?: (item: HistoryItem, e: { shiftKey: boolean }) => void
  selected?: boolean
  /** Something is already selected: a click on the tile selects instead of opening. */
  selecting?: boolean
}

/**
 * A finished result. `onOpen` makes the whole tile a button into the viewer. A grid that runs its
 * own selection passes `onSelect`; every other (non-bare) tile ticks into the shared `selection`,
 * so the Image feed and the rail grids get the reference app's select box and the floating bulk bar too.
 */
export function ResultTile({ item, onOpen, fill, bare, onSelect: ownSelect, selected: ownSelected, selecting: ownSelecting }: ResultTileProps) {
  const a = useTileAction()
  const src = firstMedia(item)
  const shared = !ownSelect && !bare
  const sharedOn = useSyncExternalStore(selection.subscribe, () => selection.has(item.taskId), () => false)
  const sharedAny = useSyncExternalStore(selection.subscribe, () => selection.size() > 0, () => false)
  const last = useSyncExternalStore(lastViewed.subscribe, () => lastViewed.get(surfaceNow()) === item.taskId, () => false)
  useEffect(() => {
    if (!shared) return
    mounted.set(item.taskId, item)
    return () => {
      if (mounted.get(item.taskId) === item) mounted.delete(item.taskId)
    }
  }, [shared, item])
  const onSelect = ownSelect ?? (shared ? (it: HistoryItem, e: { shiftKey: boolean }) => selection.toggle(it, e.shiftKey, screenOrder(), (id) => mounted.get(id)) : undefined)
  const selected = ownSelect ? ownSelected : shared && sharedOn
  const selecting = ownSelect ? ownSelecting : shared && sharedAny
  const style = fill ? { width: '100%', height: '100%', objectFit: 'cover' as const, display: 'block' } : undefined
  const media = !src ? (
    <div className="st-tile-ph" style={{ aspectRatio: '1', height: fill ? '100%' : undefined }} />
  ) : item.category === 'video' ? (
    <video src={src} muted loop playsInline preload="metadata" style={style} onMouseEnter={(e) => void e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => e.currentTarget.pause()} />
  ) : item.category === 'audio' ? (
    <span className="st-tile-audio" style={fill ? { height: '100%' } : undefined}>
      <audio src={src} controls preload="none" style={{ width: '100%' }} />
    </span>
  ) : (
    <img src={src} alt={item.prompt ?? ''} loading="lazy" style={style} />
  )
  // While a grid is selecting, a click (or a shift-click at any time) ticks instead of opening.
  const click = (e: MouseEvent) => {
    if (onSelect && (selecting || e.shiftKey)) {
      e.preventDefault()
      onSelect(item, { shiftKey: e.shiftKey })
      return
    }
    onOpen?.(item)
  }
  // An audio player is itself a control, so it can't sit inside the open button; the
  // caption opens it instead.
  const wrap = (onOpen || onSelect) && item.category !== 'audio'
  // Stills and clips swap the hover caption for the tool bar; the prompt moves to the tooltip.
  const bar = !bare && Boolean(src) && item.category !== 'audio' && !selecting
  const caption = item.prompt?.slice(0, 90) ?? item.model
  const cls = ['st-tile', selected ? 'is-selected' : '', selecting ? 'is-selecting' : '', bar ? 'vw-has-bar' : ''].filter(Boolean).join(' ')
  return (
    <figure className={cls} style={{ margin: 0, height: fill ? '100%' : undefined }} data-sel-id={shared ? item.taskId : undefined}>
      {wrap ? (
        <button type="button" className="st-tile-open" onClick={click} aria-label={selecting ? (selected ? 'Unselect' : 'Select') : 'Open'} title={bar ? item.prompt?.slice(0, 300) : undefined}>
          {media}
        </button>
      ) : (
        media
      )}
      {bar ? (
        <ToolBar item={item} a={a} />
      ) : (onOpen || onSelect) && !wrap ? (
        <button type="button" className="st-tile-meta st-tile-meta-btn" onClick={click}>
          {caption}
        </button>
      ) : (
        <figcaption className="st-tile-meta">{caption}</figcaption>
      )}
      {onSelect && (
        <button
          type="button"
          className={`vw-check ${selected ? 'is-on' : ''}`}
          role="checkbox"
          aria-checked={Boolean(selected)}
          aria-label={selected ? 'Unselect' : 'Select'}
          title="Select (shift-click selects a run)"
          onClick={(e) => onSelect(item, { shiftKey: e.shiftKey })}
        >
          {selected && <Check size={14} />}
        </button>
      )}
      {last && !selected && !bare && (
        <span className="vw-lastmark" aria-label="Last viewed">
          Last viewed
        </span>
      )}
      {item.pinned && (
        <span className="vw-pinmark" aria-label="Favourite">
          <Heart size={12} />
        </span>
      )}
      {!bare && <CornerActions item={item} onOpen={onOpen} a={a} />}
      {!bar && a.failed && (
        <span className="vw-tile-err is-top" role="alert" title={a.failed}>
          {a.failed}
        </span>
      )}
    </figure>
  )
}

/**
 * A failed history row's ways out, shared by the tile and the List card: Recreate (prompt,
 * model and settings back in the form; free), Retry (the same job again — it spends credits,
 * so it shows the price — and the old row leaves the feed) and Remove (after a confirm).
 */
function useFailure(item: HistoryItem) {
  const { model, blocker, estimate } = useRegenerate(item)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState<'retry' | 'remove' | 'recreate' | null>(null)
  const [note, setNote] = useState<{ bad: boolean; text: string } | null>(null)
  const go = (which: 'retry' | 'remove' | 'recreate', fn: () => Promise<string | void>) => {
    if (busy) return
    setBusy(which)
    setNote(null)
    fn()
      .then((text) => text && setNote({ bad: false, text }))
      .catch((e: unknown) => setNote({ bad: true, text: (e as Error).message || 'That did not work.' }))
      .finally(() => setBusy(null))
  }
  const noteEl = note && (
    <span className="st-job-err" role={note.bad ? 'alert' : 'status'} style={{ fontWeight: 600 }}>
      {note.text}
    </span>
  )
  const buttons = confirm ? (
    <>
      <button type="button" className="st-pill" onClick={() => setConfirm(false)} disabled={busy === 'remove'}>
        Keep
      </button>
      <button type="button" className="st-pill" onClick={() => go('remove', () => deleteResult(item.taskId))} disabled={Boolean(busy)}>
        {busy === 'remove' ? spin : <Trash2 size={13} />}
        Remove
      </button>
    </>
  ) : (
    <>
      <button type="button" className="st-pill is-icon" title="Remove from history" aria-label="Remove" onClick={() => setConfirm(true)} disabled={Boolean(busy)}>
        <Trash2 size={14} />
      </button>
      <button
        type="button"
        className="st-pill"
        title="Put this job's prompt, model and settings back in the form"
        disabled={Boolean(busy)}
        onClick={() =>
          go('recreate', async () => {
            const dropped = await recreate(item, model)
            if (dropped) return `${dropped} of its files had expired on Kie and were left out.`
          })
        }
      >
        {busy === 'recreate' ? spin : <Undo2 size={13} />}
        Recreate
      </button>
      <button
        type="button"
        className="st-pill"
        disabled={!model || Boolean(blocker) || Boolean(busy)}
        title={blocker ?? estimate?.detail ?? 'Run the same job again'}
        onClick={() =>
          model &&
          go('retry', async () => {
            await retryFailed(item, model)
            return 'Sent again.'
          })
        }
      >
        {busy === 'retry' ? spin : <RotateCcw size={13} />}
        Retry
        {estimate && <CostTag credits={estimate.credits} />}
      </button>
    </>
  )
  return { model, note: noteEl, buttons }
}

const failedAspect = (item: HistoryItem) => {
  const aspect = item.input?.aspect_ratio
  return item.category === 'audio' ? '4 / 1' : ratioOf(typeof aspect === 'string' ? aspect : item.category === 'video' ? '16:9' : '1:1')
}

/**
 * A job that failed, kept in the feed the way the reference app keeps it: marked Failed (and "Credits
 * refunded" when Kie charged nothing), with Kie's reason and its ways out (`useFailure`).
 */
export function FailedTile({ item }: { item: HistoryItem }) {
  const f = useFailure(item)
  const refunded = !item.creditsConsumed
  return (
    <figure className="st-tile st-job is-failed" style={{ margin: 0, aspectRatio: failedAspect(item) }}>
      <div className="st-job-body">
        <AlertTriangle size={18} />
        <span className="st-job-state">{refunded ? 'Failed · Credits refunded' : 'Failed'}</span>
        <span className="st-job-err" title={item.failMsg}>
          {item.failMsg || 'Kie gave no reason.'}
        </span>
        {f.note}
        <span className="st-job-actions">{f.buttons}</span>
      </div>
      <figcaption className="st-tile-meta">{item.prompt?.slice(0, 90) || item.model}</figcaption>
    </figure>
  )
}

/* ---------- the List view: one card per job ---------- */

function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(t)
  }, [copied])
  if (!text) return null
  return (
    <button type="button" className="st-pill is-icon" aria-label="Copy prompt" title={copied ? 'Copied' : 'Copy prompt'} onClick={() => void copyText(text).then(() => setCopied(true)).catch(() => {})}>
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

/** The prompt as the reference app's panel shows it: reference tokens (`@image1`, `@Video1`) as chips. */
function PromptText({ text }: { text: string }) {
  if (!text.trim()) return <p className="st-lcard-prompt is-empty">No prompt</p>
  return (
    <p className="st-lcard-prompt" title={text}>
      {promptParts(text).map((p, i) => ('chip' in p ? <span key={i} className="st-ptoken">{p.chip}</span> : <span key={i}>{p.text}</span>))}
    </p>
  )
}

/** The files the job was given, as thumbnails (from its input, in the model's own field order). */
function RefThumbs({ item, model }: { item: HistoryItem; model: ModelDefinition | null }) {
  const files = settingRows(item, model).files.flatMap((f) =>
    f.urls.map((url) => {
      const guessed = urlKind(url)
      return { url, label: f.label, kind: f.kind ?? (guessed === 'file' ? 'image' : guessed) }
    }),
  )
  if (!files.length) return null
  return (
    <div className="vw-files st-lcard-refs">
      {files.slice(0, 8).map((f, i) => (
        <RefThumb key={`${f.url}-${i}`} url={f.url} label={f.label} kind={f.kind} />
      ))}
    </div>
  )
}

/**
 * One file a job was given. Kie throws its uploads away after a few days, and a dead link would
 * show as a broken picture; such a thumbnail just leaves the row.
 */
function RefThumb({ url, label, kind }: { url: string; label: string; kind: string }) {
  const [gone, setGone] = useState(false)
  if (gone) return null
  return (
    <a className="vw-file" href={url} target="_blank" rel="noopener noreferrer" title={label}>
      {kind === 'image' ? (
        <img src={url} alt="" loading="lazy" onError={() => setGone(true)} />
      ) : kind === 'video' ? (
        <video src={url} muted preload="metadata" onError={() => setGone(true)} />
      ) : (
        <AudioLines size={16} />
      )}
    </a>
  )
}

/** The side panel: model chip, prompt, refs, resolution · duration · aspect, then the date and the actions. */
function CardPanel({ item, model, actions, note, extra }: { item: HistoryItem; model: ModelDefinition | null; actions: ReactNode; note?: ReactNode; extra?: ReactNode }) {
  const chips = specChips(item.input)
  return (
    <aside className="st-lcard-side">
      <div className="st-lcard-head">
        <span className="pl-badge st-lcard-model" title={item.modelId ?? item.model}>
          {model?.title ?? item.model}
        </span>
      </div>
      <PromptText text={item.prompt ?? ''} />
      <RefThumbs item={item} model={model} />
      {chips.length > 0 && (
        <div className="st-lcard-chips">
          {chips.map((c) => (
            <span key={c} className="pl-badge pl-badge--quiet">
              {c}
            </span>
          ))}
        </div>
      )}
      {extra && <div className="st-tile-actions">{extra}</div>}
      {note}
      <div className="st-lcard-foot">
        <span className="st-lcard-date">{whenLabel(item.createdAt)}</span>
        <span className="st-lcard-actions">{actions}</span>
      </div>
    </aside>
  )
}

/** A job still on its way (or failed in the queue), as a List card. */
export function JobCard({ job }: { job: Job }) {
  const { models } = useCatalog()
  const live = isActive(job)
  useTick(live)
  const phase = phaseOf(job)
  const item = itemOfJob(job)
  const model = models?.find((m) => m.id === job.modelId) ?? null
  const aspect = job.meta.aspect ?? (job.category === 'video' ? '16:9' : '1:1')
  return (
    <article className="st-lcard">
      <div className="st-lcard-media">
        <div className={`st-lcard-ph ${phaseClass(phase)}`} style={{ aspectRatio: job.category === 'audio' ? '4 / 1' : ratioOf(aspect) }}>
          <StateChips phase={phase} refunded={jobRefunded(job)} />
          <div className="st-job-body">
            {live ? (
              <JobClock job={job} />
            ) : (
              <>
                <AlertTriangle size={18} />
                <span className="st-job-err">{job.error}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <CardPanel
        item={item}
        model={model}
        actions={live ? <CopyPrompt text={job.prompt} /> : <JobFailureActions job={job} />}
      />
    </article>
  )
}

/** A failed history row, as a List card: Failed + Credits refunded, the reason, then its ways out. */
export function FailedCard({ item }: { item: HistoryItem }) {
  const f = useFailure(item)
  return (
    <article className="st-lcard">
      <div className="st-lcard-media">
        <div className="st-lcard-ph is-failed" style={{ aspectRatio: failedAspect(item) }}>
          <StateChips phase="failed" refunded={!item.creditsConsumed} />
          <div className="st-job-body">
            <AlertTriangle size={18} />
            <span className="st-job-err" title={item.failMsg}>
              {item.failMsg || 'Kie gave no reason.'}
            </span>
          </div>
        </div>
      </div>
      <CardPanel item={item} model={f.model} note={f.note} actions={f.buttons} />
    </article>
  )
}

/**
 * A finished result as a List card: the clip plays inline (an image fits the box, and opens
 * the viewer), the hover corner keeps like · download · copy · ⋯, and the panel ends on
 * Rerun (the same job again; spends credits) · copy prompt · delete.
 */
export function ResultCard({ item, onOpen, extra }: { item: HistoryItem; onOpen?: (item: HistoryItem) => void; extra?: ReactNode }) {
  const a = useTileAction()
  const { model, blocker, estimate } = useRegenerate(item)
  const [confirm, setConfirm] = useState(false)
  const [sent, setSent] = useState(false)
  const files = mediaOf(item)
  const src = firstMedia(item)
  const kind = kindOf(item, files[0])
  const media = !src ? (
    <div className="st-lcard-ph" />
  ) : kind === 'video' ? (
    <video src={src} controls loop playsInline preload="metadata" />
  ) : kind === 'audio' ? (
    <span className="st-tile-audio" style={{ width: '100%' }}>
      <audio src={src} controls preload="none" style={{ width: '100%' }} />
    </span>
  ) : (
    <button type="button" className="st-lcard-open" aria-label="Open" onClick={() => onOpen?.(item)}>
      <img src={src} alt={item.prompt ?? ''} loading="lazy" />
    </button>
  )
  const actions = confirm ? (
    <>
      <button type="button" className="st-pill" onClick={() => setConfirm(false)} disabled={a.busy === 'delete'}>
        Keep
      </button>
      <button type="button" className="st-pill" onClick={() => a.act('delete', () => deleteResult(item.taskId))} disabled={Boolean(a.busy)}>
        {a.busy === 'delete' ? spin : <Trash2 size={13} />}
        Delete
      </button>
    </>
  ) : (
    <>
      <button type="button" className="st-pill is-icon" aria-label="Delete" title="Delete from history" onClick={() => setConfirm(true)}>
        <Trash2 size={14} />
      </button>
      <CopyPrompt text={item.prompt ?? ''} />
      <button
        type="button"
        className="st-pill"
        disabled={!model || Boolean(blocker) || Boolean(a.busy)}
        title={blocker ?? estimate?.detail ?? 'Run the same job again'}
        onClick={() =>
          model &&
          a.act('rerun', async () => {
            await regenerate(item, model)
            setSent(true)
          })
        }
      >
        {a.busy === 'rerun' ? spin : <RotateCcw size={13} />}
        {sent ? 'Sent' : 'Rerun'}
        {estimate && <CostTag credits={estimate.credits} />}
      </button>
    </>
  )
  return (
    <article className="st-lcard">
      <div className={`st-lcard-media ${kind === 'audio' ? 'is-audio' : ''}`}>
        {media}
        {files.length > 1 && <span className="pl-badge st-lcard-count">{files.length} outputs</span>}
        {item.pinned && (
          <span className="vw-pinmark" aria-label="Favourite">
            <Heart size={12} />
          </span>
        )}
        <CornerActions item={item} onOpen={onOpen} a={a} />
      </div>
      <CardPanel
        item={item}
        model={model}
        extra={extra}
        note={
          a.failed && (
            <span className="st-job-err" role="alert" style={{ fontWeight: 600 }}>
              {a.failed}
            </span>
          )
        }
        actions={actions}
      />
    </article>
  )
}
