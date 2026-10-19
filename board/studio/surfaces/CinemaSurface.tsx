/**
 * Cinema — their Cinema Studio, archetype C: a sidebar (Home, My generations, My
 * elements, Favourites, then your projects with a search), a hero and an inline composer,
 * and your work underneath.
 *
 * Projects are real now: they live in the library on disk (library.ts), so they survive
 * reloads and show the same in every tab. A job started inside a project is stamped with
 * it and filed into it as soon as Kie gives it a task id (cinema/projects.ts).
 *
 * Their attribute pills sit above the prompt: References (the project's stills), Film
 * look (Genre / Era / Tempo), Camera (Setup wheels and an ordered list of named moves),
 * Color palette and Lighting (cinema/CameraModals.tsx). Everything but References is
 * written into the prompt as it goes out (cinema/camera.ts), so the box keeps only what
 * you typed. Image / Video switches what the composer makes; a clip can start from one
 * of the project's own stills, handed to the composer as `initialRefs`.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Clapperboard, Film, FolderPlus, Heart, Home, Image as ImageIcon, ImagePlus, Lightbulb, Palette, Pencil, RotateCcw, Search, Shapes, Trash2, X, type LucideIcon } from 'lucide-react'
import { Composer } from '../Composer.tsx'
import { loadMode, saveMode } from '../draft.ts'
import { firstMedia, isDone, refFieldKind, useHistory, useModels, type HistoryItem, type Ref } from '../api.ts'
import { useJobs } from '../jobs.ts'
import { hostForKie } from '../mentions.ts'
import { libraryApi, useProjects, type Project } from '../library.ts'
import { ElementsPanel } from '../elements/ElementsPanel.tsx'
import { CardGrid, Chips, Empty, Hero, SectionHead, TabBar, type CardItem } from '../parts.tsx'
import { indexHistory } from '../presets.ts'
import { Btn, QuietBtn, ResultsGrid } from './pageParts.tsx'
import { forgetTag, untrack, useTracked } from './track.ts'
import { addMove, APERTURES, CAMERAS, dressPrompt, ERAS, GENRES, LENSES, LIGHTS, lookCounts, MOVES, optionLabel, PALETTES, removeMove, TEMPOS, type CinemaLook, type Mode } from './cinema/camera.ts'
import { CameraModal, FilmLookModal, Modal, PresetModal } from './cinema/CameraModals.tsx'
import { fileJobs, mergedTaskIds, projectCover, projectItems, projectJobs, projectStills, projectTag, searchProjects, untitledName } from './cinema/projects.ts'
import './studio-pages.css'

type View = { kind: 'home' } | { kind: 'project'; id: string } | { kind: 'generations' } | { kind: 'elements' } | { kind: 'favourites' }

/** The id of the grid's first card, which makes a project instead of opening one. */
const NEW_CARD = '__new'


const day = (ms: number | string) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export function CinemaSurface() {
  const [view, setView] = useState<View>({ kind: 'home' })
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'recent' | 'name'>('recent')
  const { items: projects, loading, error } = useProjects()
  const { items: history } = useHistory()
  const byTask = useMemo(() => indexHistory(history), [history])
  const [making, setMaking] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const newProject = async () => {
    setMaking(true)
    setNote(null)
    try {
      const made = await libraryApi.createProject(untitledName(projects))
      setView({ kind: 'project', id: made.id })
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setMaking(false)
    }
  }

  // The library already returns most recently changed first.
  const found = searchProjects(projects, q)
  const listed = sort === 'name' ? [...found].sort((a, b) => a.title.localeCompare(b.title)) : found
  const is = (kind: View['kind']) => view.kind === kind

  return (
    <div className="st-split">
      <aside className="st-side">
        <button type="button" className={`st-side-item ${is('home') ? 'is-active' : ''}`} onClick={() => setView({ kind: 'home' })}>
          <Home size={14} />
          Home
        </button>
        <button type="button" className={`st-side-item ${is('generations') ? 'is-active' : ''}`} onClick={() => setView({ kind: 'generations' })}>
          <Film size={14} />
          My generations
        </button>
        <button type="button" className={`st-side-item ${is('elements') ? 'is-active' : ''}`} onClick={() => setView({ kind: 'elements' })}>
          <Shapes size={14} />
          My elements
        </button>
        <button type="button" className={`st-side-item ${is('favourites') ? 'is-active' : ''}`} onClick={() => setView({ kind: 'favourites' })}>
          <Heart size={14} />
          Favourites
        </button>

        <p className="st-side-head sp-side-head">
          Projects
          <button type="button" className="sp-side-sort" onClick={() => setSort((v) => (v === 'recent' ? 'name' : 'recent'))} title="Change the order">
            {sort === 'recent' ? 'Recent' : 'A–Z'}
          </button>
        </p>
        <label className="st-mention-search sp-side-search">
          <Search size={12} />
          <input placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        {loading && !projects.length ? (
          <p className="sp-hint sp-side-note">Loading…</p>
        ) : error && !projects.length ? (
          <p className="sp-hint sp-side-note">Projects unavailable: {error}</p>
        ) : (
          listed.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`st-side-item ${view.kind === 'project' && view.id === p.id ? 'is-active' : ''}`}
              onClick={() => setView({ kind: 'project', id: p.id })}
              title={p.title}
            >
              <Clapperboard size={14} />
              <span className="sp-ellipsis">{p.title || 'Untitled project'}</span>
            </button>
          ))
        )}
        {q.trim() && !listed.length && <p className="sp-hint sp-side-note">No project matches.</p>}
        <button type="button" className="st-side-item" onClick={() => void newProject()} disabled={making}>
          <FolderPlus size={14} />
          {making ? 'Creating…' : 'New project'}
        </button>
        <button type="button" className="st-side-item" onClick={() => setView({ kind: 'home' })}>
          All projects
        </button>

        <div className="st-side-foot">
          <p className="st-note">{note ?? 'Projects are kept on this computer. Generating inside one files every result into it.'}</p>
        </div>
      </aside>

      <div className="st-page">
        {view.kind === 'project' ? (
          <ProjectPage key={view.id} id={view.id} byTask={byTask} onGone={() => setView({ kind: 'home' })} />
        ) : view.kind === 'elements' ? (
          <ElementsPanel title="My elements" />
        ) : view.kind === 'generations' || view.kind === 'favourites' ? (
          <Generations favourites={view.kind === 'favourites'} items={history} />
        ) : (
          <HomeView projects={projects} byTask={byTask} onOpen={(id) => setView({ kind: 'project', id })} onNew={() => void newProject()} making={making} />
        )}
      </div>
    </div>
  )
}

/* ---------- the attribute pills and the composer they sit on ---------- */

type Picker = 'camera' | 'film' | 'palette' | 'lighting' | 'refs'

/** A still from the project handed to the composer as a reference (a clip's first frame in Video). */
interface Frame {
  taskId: string
  url: string
}

/** One of their attribute pills: a name, what it is set to, and a click that opens its picker. */
function AttrPill({ icon: Icon, label, value, on, disabled, title, onClick }: { icon: LucideIcon; label: string; value: string; on?: boolean; disabled?: boolean; title?: string; onClick: () => void }) {
  return (
    <button type="button" className={`st-pill sp-attr ${on ? 'is-set' : ''}`} onClick={onClick} disabled={disabled} title={title ?? label}>
      <Icon size={14} />
      <span className="st-pill-label">{label}</span>
      <span>{value}</span>
    </button>
  )
}

/** The most pictures any model of this kind takes — the ceiling the References pill shows. */
function useRefCeiling(mode: Mode): number {
  const { models } = useModels(mode)
  return useMemo(() => {
    let most = 0
    for (const m of models ?? []) for (const f of m.fields) if (f.type === 'reference' && refFieldKind(f) === 'image') most = Math.max(most, f.maxItems ?? 1)
    return most || 50
  }, [models])
}

/**
 * Mode switch, their five attribute pills (References, Film look, Camera, Color palette,
 * Lighting) and the composer. The composer is keyed by mode and by the references handed
 * to it, so it picks a fresh model per category and takes the references as it mounts;
 * what you had typed comes back from its draft (one per project and mode).
 */
function CinemaComposer({
  projectId,
  mode,
  onMode,
  onSubmitted,
  frames = [],
  stills,
  onFrames,
}: {
  projectId?: string
  mode: Mode
  onMode: (m: Mode) => void
  onSubmitted?: (ids: string[]) => void
  frames?: Frame[]
  stills?: HistoryItem[]
  onFrames?: (next: Frame[]) => void
}) {
  const [look, setLook] = useState<CinemaLook>(() => loadLook(projectId))
  useEffect(() => saveLook(projectId, look), [projectId, look])
  const [open, setOpen] = useState<Picker | null>(null)
  const ceiling = useRefCeiling(mode)
  const counts = lookCounts(look, mode)
  const moves = mode === 'video' ? (look.moves ?? []) : []
  const refs: Ref[] = frames.map((f) => ({ url: f.url, kind: 'image' }))
  // Everything attached, however it got there: the stills handed in, and + / @ in the composer.
  const [attached, setAttached] = useState(refs.length)
  /** Typing # in the prompt offers the moves; a pick goes on the end of the shot, like "Put on prompt". */
  const hashItems = mode === 'video' ? MOVES.map((m) => ({ label: m.label, insert: m.words })) : undefined
  const pickMove = (label: string) => {
    const move = MOVES.find((m) => m.label === label)
    if (move) setLook((l) => ({ ...l, moves: addMove(l.moves, move.id) }))
  }

  const cameraValue = [optionLabel(CAMERAS, look.camera), optionLabel(LENSES, look.lens), optionLabel(APERTURES, look.aperture)].filter(Boolean).join(' · ') || (moves.length ? '' : 'Auto')
  const cameraText = [cameraValue, moves.length ? `${moves.length} ${moves.length === 1 ? 'move' : 'moves'}` : ''].filter(Boolean).join(' · ')
  const filmText = [look.genre && look.genre !== 'general' ? optionLabel(GENRES, look.genre) : '', optionLabel(ERAS, look.era), mode === 'video' ? optionLabel(TEMPOS, look.tempo) : ''].filter(Boolean).join(' · ') || 'Auto'

  return (
    <div className="sp-cinema-composer">
      <div className="sp-attr-row">
        <TabBar
          tabs={[
            { id: 'image' as const, label: 'Image' },
            { id: 'video' as const, label: 'Video' },
          ]}
          value={mode}
          onPick={onMode}
        />
        <AttrPill
          icon={ImagePlus}
          label="References"
          value={`${attached}/${ceiling}`}
          on={attached > 0}
          disabled={!onFrames}
          title={onFrames ? 'Use this project’s stills as references (a clip’s first frame in Video). Add more with + or @ below.' : 'Open a project to use its stills. Add pictures with + or @ below.'}
          onClick={() => setOpen('refs')}
        />
        <AttrPill icon={Clapperboard} label="Film look" value={filmText} on={counts.film > 0} onClick={() => setOpen('film')} />
        <AttrPill icon={Camera} label="Camera" value={cameraText} on={counts.camera > 0} onClick={() => setOpen('camera')} />
        <AttrPill icon={Palette} label="Color palette" value={optionLabel(PALETTES, look.palette) ?? 'Auto'} on={counts.palette > 0} onClick={() => setOpen('palette')} />
        <AttrPill icon={Lightbulb} label="Lighting" value={optionLabel(LIGHTS, look.lighting) ?? 'Auto'} on={counts.lighting > 0} onClick={() => setOpen('lighting')} />
        {counts.camera + counts.film + counts.palette + counts.lighting > 0 && (
          <QuietBtn icon={RotateCcw} onClick={() => setLook({ genre: 'general' })} title="Set everything back to Auto">
            Reset
          </QuietBtn>
        )}
      </div>
      {moves.length > 0 && (
        <div className="sp-move-shot is-inline">
          <span className="sp-label-inline">Camera moves</span>
          {moves.map((id, i) => (
            <span key={id} className="sp-move-chip">
              <span className="sp-move-n">{i + 1}</span>
              {MOVES.find((m) => m.id === id)?.label ?? id}
              <button type="button" aria-label="Take off" onClick={() => setLook({ ...look, moves: removeMove(look.moves, id) })}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <Composer
        key={`${projectId ?? 'home'}:${mode}:${frames.map((f) => f.taskId).join(',')}`}
        surface="cinema"
        inline
        category={mode}
        klass={mode}
        placeholder={mode === 'video' ? 'Describe your scene – use @ to add characters & locations, # for camera moves' : 'Describe your scene – use @ to add characters & locations'}
        draftKey={`cinema:${projectId ?? 'home'}:${mode}`}
        initialRefs={refs.length ? refs : undefined}
        onRefsChange={(list) => setAttached(list.length)}
        hashItems={hashItems}
        onHashPick={pickMove}
        dress={(p) => dressPrompt(p, look, mode)}
        meta={projectId ? { projectId } : undefined}
        onSubmitted={onSubmitted}
      />

      {open === 'camera' && <CameraModal look={look} mode={mode} onChange={setLook} onClose={() => setOpen(null)} />}
      {open === 'film' && <FilmLookModal look={look} mode={mode} onChange={setLook} onClose={() => setOpen(null)} />}
      {(open === 'palette' || open === 'lighting') && <PresetModal kind={open} look={look} onChange={setLook} onClose={() => setOpen(null)} />}
      {open === 'refs' && onFrames && <ReferencesModal frames={frames} stills={stills ?? []} max={ceiling} mode={mode} onFrames={onFrames} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** The References pill's picker: this project's stills, ticked on and off. */
function ReferencesModal({ frames, stills, max, mode, onFrames, onClose }: { frames: Frame[]; stills: HistoryItem[]; max: number; mode: Mode; onFrames: (next: Frame[]) => void; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const toggle = async (item: HistoryItem) => {
    if (frames.some((f) => f.taskId === item.taskId)) {
      onFrames(frames.filter((f) => f.taskId !== item.taskId))
      return
    }
    const media = item.media?.[0]
    if (!media || frames.length >= max) return
    setBusy(item.taskId)
    setNote(null)
    try {
      const url = await hostForKie(media)
      onFrames([...frames, { taskId: item.taskId, url }])
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  return (
    <Modal title="References" onClose={onClose} onReset={frames.length ? () => onFrames([]) : undefined}>
      <p className="sp-hint">
        {mode === 'video' ? 'The first one is the clip’s first frame on image-to-video models.' : 'They steer the look and the subject of the still.'} {frames.length}/{max} picked. Elements and other work go in with @ in the prompt.
      </p>
      {stills.length ? (
        <div className="sp-past-grid">
          {stills.map((s) => {
            const at = frames.findIndex((f) => f.taskId === s.taskId)
            return (
              <button key={s.taskId} type="button" className={`sp-past-item ${at >= 0 ? 'is-on' : ''}`} onClick={() => void toggle(s)} disabled={busy !== null} title={s.prompt}>
                <img src={firstMedia(s)} alt="" loading="lazy" />
                {at >= 0 && <span className="sp-choice-tick">{at + 1}</span>}
                {busy === s.taskId && <span className="sp-frame-busy">…</span>}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="sp-hint">This project has no stills yet. Make one in Image mode and it shows up here.</p>
      )}
      {note && <p className="st-note">{note}</p>}
    </Modal>
  )
}

/* ---------- what a reload keeps ---------- */

const MODES: Mode[] = ['image', 'video']

/** Image or Video, remembered per project (and for Home) like every other surface's tab. */
function useCinemaMode(key: string): [Mode, (m: Mode) => void] {
  const [mode, setMode] = useState<Mode>(() => loadMode(key, MODES) ?? 'video')
  useEffect(() => saveMode(key, mode), [key, mode])
  return [mode, setMode]
}

const lookKey = (projectId?: string) => `studio.cinema.look.${projectId ?? 'home'}`

/** The film look / camera / palette / lighting picks, so a reload doesn't set them back to Auto. */
function loadLook(projectId?: string): CinemaLook {
  try {
    const raw = window.localStorage.getItem(lookKey(projectId))
    const look = raw ? (JSON.parse(raw) as CinemaLook) : null
    return look && typeof look === 'object' ? look : { genre: 'general' }
  } catch {
    return { genre: 'general' }
  }
}

function saveLook(projectId: string | undefined, look: CinemaLook) {
  try {
    window.localStorage.setItem(lookKey(projectId), JSON.stringify(look))
  } catch {
    // ignore
  }
}

/* ---------- home ---------- */

function HomeView({ projects, byTask, onOpen, onNew, making }: { projects: Project[]; byTask: Map<string, HistoryItem>; onOpen: (id: string) => void; onNew: () => void; making: boolean }) {
  const [mode, setMode] = useCinemaMode('cinema.home')
  const jobs = useJobs().filter((j) => j.meta.surface === 'cinema' && !j.meta.projectId && (j.status !== 'done'))
  const cards: CardItem[] = [
    { id: NEW_CARD, title: making ? 'Creating…' : 'New project', sub: 'Start an empty one', cover: null, tag: 'New' },
    ...projects.map((p) => {
      const cover = projectCover(p, byTask)
      return { id: p.id, title: p.title || 'Untitled project', sub: `${p.taskIds.length} · ${day(p.updatedAt)}`, cover: cover?.src ?? null, video: cover?.video }
    }),
  ]
  return (
    <>
      <Hero kicker="Cinema Studio" title="Shoot the scene in your head" sub="before you can afford the crew" />
      <div className="st-section sp-narrow">
        <CinemaComposer mode={mode} onMode={setMode} />
        <p className="sp-hint">Generating here goes to My generations. Open a project to keep its shots together.</p>
      </div>
      {jobs.length > 0 && (
        <div className="st-section">
          <SectionHead title="Running" right={<span className="st-pill-label">{jobs.length}</span>} />
          <ResultsGrid jobs={jobs} items={[]} />
        </div>
      )}
      <div className="st-section">
        <SectionHead title="My projects" right={<span className="st-pill-label">{projects.length}</span>} />
        <CardGrid items={cards} onOpen={(id) => (id === NEW_CARD ? !making && onNew() : onOpen(id))} />
      </div>
    </>
  )
}

/* ---------- one project ---------- */

function ProjectPage({ id, byTask, onGone }: { id: string; byTask: Map<string, HistoryItem>; onGone: () => void }) {
  const { items: projects, loading } = useProjects()
  const project = projects.find((p) => p.id === id)
  const local = useTracked(projectTag(id))
  const jobs = useJobs()
  const [mode, setMode] = useCinemaMode(`cinema.${id}`)
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [framing, setFraming] = useState<string | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [type, setType] = useState<'all' | 'image' | 'video'>('all')
  const retried = useRef('')
  const renamingNow = useRef(false)
  // Just after "New project" the list is still reloading: give it a moment before saying it's gone.
  const [grace, setGrace] = useState(true)
  useEffect(() => {
    const t = window.setTimeout(() => setGrace(false), 4_000)
    return () => window.clearTimeout(t)
  }, [])

  const taskIds = useMemo(() => mergedTaskIds(project?.taskIds ?? [], local), [project?.taskIds, local])
  const missing = useMemo(() => (project ? local.filter((t) => !project.taskIds.includes(t)) : []), [project, local])

  // A task this browser filed that the server never confirmed: file it again, once per visit.
  useEffect(() => {
    if (!project || !missing.length) return
    const key = missing.join(',')
    if (retried.current === key) return
    retried.current = key
    void libraryApi.addToProject(project.id, missing).catch(() => {})
  }, [project, missing])

  if (!project) {
    return loading || grace ? (
      <p className="sp-hint">Loading project…</p>
    ) : (
      <Empty icon={Clapperboard} title="That project is gone" sub="It may have been deleted in another tab." cta={<Btn onClick={onGone}>Back to projects</Btn>} />
    )
  }

  const all = projectItems({ taskIds }, byTask)
  const items = type === 'all' ? all : all.filter((i) => i.category === type)
  const shown = new Set(all.filter(isDone).map((i) => i.taskId))
  const running = projectJobs(jobs, id, shown).filter((j) => type === 'all' || j.category === type)
  const stills = projectStills({ taskIds }, byTask)

  const rename = async () => {
    // Enter submits and the input's blur follows; only the first one saves.
    if (renamingNow.current) return
    renamingNow.current = true
    const next = title.trim()
    setRenaming(false)
    if (!next || next === project.title) {
      renamingNow.current = false
      return
    }
    try {
      await libraryApi.updateProject(id, { title: next })
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      renamingNow.current = false
    }
  }

  const remove = async () => {
    try {
      await libraryApi.deleteProject(id)
      forgetTag(projectTag(id))
      onGone()
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  const takeOut = async (taskId: string) => {
    untrack(projectTag(id), taskId)
    try {
      if (project.taskIds.includes(taskId)) await libraryApi.removeFromProject(id, taskId)
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  /** Put a still into the composer as the clip's first frame (the composer is rebuilt with it). */
  const startFrom = async (item: HistoryItem) => {
    const media = item.media?.[0]
    if (!media) return
    setFraming(item.taskId)
    setNote(null)
    try {
      const url = await hostForKie(media)
      setMode('video')
      setFrames([{ taskId: item.taskId, url }])
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setFraming(null)
    }
  }

  return (
    <>
      <div className="sp-head">
        <div className="sp-head-main">
          {renaming ? (
            <form
              className="sp-rename"
              onSubmit={(e) => {
                e.preventDefault()
                void rename()
              }}
            >
              <input className="sp-input sp-title-input" value={title} autoFocus maxLength={120} onChange={(e) => setTitle(e.target.value)} onBlur={() => void rename()} onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)} />
            </form>
          ) : (
            <h2 className="sp-title sp-title-edit">
              {project.title || 'Untitled project'}
              <QuietBtn
                icon={Pencil}
                title="Rename project"
                onClick={() => {
                  setTitle(project.title)
                  setRenaming(true)
                }}
              />
            </h2>
          )}
          <p className="sp-sub">
            {taskIds.length} {taskIds.length === 1 ? 'generation' : 'generations'} · started {day(project.createdAt)}
          </p>
        </div>
        <div className="sp-head-actions">
          {confirmDelete ? (
            <span className="sp-confirm" role="alert">
              Delete this project? Its generations stay in My generations.
              <Btn onClick={() => void remove()}>Delete</Btn>
              <Btn ghost onClick={() => setConfirmDelete(false)}>
                Keep it
              </Btn>
            </span>
          ) : (
            <QuietBtn icon={Trash2} danger title="Delete project" onClick={() => setConfirmDelete(true)}>
              Delete
            </QuietBtn>
          )}
        </div>
      </div>
      {note && <p className="st-note">{note}</p>}

      <div className="st-section sp-narrow">
        <CinemaComposer projectId={id} mode={mode} onMode={setMode} onSubmitted={(ids) => fileJobs(id, ids)} frames={frames} stills={stills} onFrames={setFrames} />
        {mode === 'video' && (
          <div className="sp-frames">
            <span className="sp-label-inline">Start from a still</span>
            {stills.length ? (
              <div className="sp-frame-strip">
                {stills.slice(0, 16).map((s) => (
                  <button key={s.taskId} type="button" className={`sp-frame ${frames[0]?.taskId === s.taskId ? 'is-on' : ''}`} title="Use as the clip's first frame" onClick={() => void startFrom(s)} disabled={framing !== null}>
                    <img src={firstMedia(s)} alt="" loading="lazy" />
                    {framing === s.taskId && <span className="sp-frame-busy">…</span>}
                  </button>
                ))}
              </div>
            ) : (
              <span className="sp-hint">Make a still in Image mode first — it shows up here as a first frame.</span>
            )}
          </div>
        )}
      </div>

      <div className="st-section">
        <SectionHead
          title="In this project"
          right={
            <Chips
              options={[
                { id: 'all' as const, label: 'All' },
                { id: 'image' as const, label: 'Images', icon: ImageIcon },
                { id: 'video' as const, label: 'Videos', icon: Film },
              ]}
              value={type}
              onPick={setType}
            />
          }
        />
        <ResultsGrid
          jobs={running}
          items={items}
          empty={<Empty icon={Clapperboard} title="Nothing in this project yet" sub="Everything you generate from the composer above is filed here as soon as Kie accepts it." />}
          actions={(item) => (
            <>
              {item.category === 'image' && (
                <QuietBtn icon={Film} onClick={() => void startFrom(item)} title="Start a clip from this still">
                  Animate
                </QuietBtn>
              )}
              <QuietBtn icon={X} onClick={() => void takeOut(item.taskId)} title="Take out of this project (stays in My generations)">
                Remove
              </QuietBtn>
            </>
          )}
        />
      </div>
    </>
  )
}

/* ---------- my generations / favourites ---------- */

function Generations({ favourites, items }: { favourites: boolean; items: HistoryItem[] | null }) {
  const [type, setType] = useState<'all' | 'image' | 'video'>('all')
  const done = (items ?? []).filter((i) => isDone(i) && i.category !== 'audio' && (!favourites || i.pinned) && (type === 'all' || i.category === type))
  const jobs = useJobs().filter((j) => j.meta.surface === 'cinema' && j.status !== 'done' && (type === 'all' || j.category === type))
  return (
    <div className="st-section" style={{ marginTop: 0 }}>
      <SectionHead
        title={favourites ? 'Favourites' : 'My generations'}
        right={
          <Chips
            options={[
              { id: 'all' as const, label: 'All' },
              { id: 'image' as const, label: 'Images', icon: ImageIcon },
              { id: 'video' as const, label: 'Videos', icon: Film },
            ]}
            value={type}
            onPick={setType}
          />
        }
      />
      {!items ? (
        <p className="sp-hint">Loading…</p>
      ) : (
        <ResultsGrid
          jobs={favourites ? [] : jobs}
          items={done}
          empty={
            <Empty
              icon={favourites ? Heart : Film}
              title={favourites ? 'Nothing pinned yet' : 'Nothing here yet'}
              sub={favourites ? 'Pin a result in the viewer and it shows up here.' : 'Everything you generate, on any surface, lands here newest first.'}
            />
          }
        />
      )}
    </div>
  )
}
