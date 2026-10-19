/**
 * The result viewer, mounted once by Studio and opened from any tile (viewer.ts).
 *
 * the reference app opens every finished result full-screen with everything you can do to it beside
 * it: download, favourite, copy the prompt, run it again with the same settings, send it on
 * to another tool, keep it in a project or as a reusable element, delete it. This is that
 * view, with their Info-tab buttons on top (Turn to video on a still, Download, Like, Reuse,
 * Regenerate). The decisions live in actions.ts (tested); this file is layout and wiring.
 *
 * The item comes from the viewer's snapshot, but anything that changes while it is open
 * (favourited, say) is read back from history, so the panel never shows a stale state.
 * Its Info side follows theirs: Turn to video, Reference, Download, Like, Recreate (Reuse), Regenerate,
 * More (the tiles' ⋯ menu), the prompt with its Image N chips and reference thumbnails in order, and
 * Details with Model, Quality, Size (read off the file) and Created. It also marks the feed's "Last
 * viewed" tile, and the feeds' floating bulk bar is mounted alongside it. On a still the panel has
 * their Info · Edit tabs: Edit (ViewerEdit.tsx) is the edit prompt bar with its version strip and
 * the EDIT IMAGE tool list. Comments is left out — it is for teams.
 *
 * Delete confirms inline, never with window.confirm — a native dialog freezes the page for
 * the browser automation that checks it.
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import {
  AudioLines,
  AudioWaveform,
  Brush,
  Check,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Copy,
  Crop,
  Download,
  Ellipsis,
  Eraser,
  ExternalLink,
  FastForward,
  File as FileIcon,
  Flag,
  FolderPlus,
  Heart,
  ImageOff,
  ImagePlus,
  Languages,
  Layers,
  Loader2,
  Maximize2,
  Mic,
  Music,
  PersonStanding,
  Plus,
  RefreshCw,
  Repeat,
  RotateCcw,
  Rotate3d,
  Shapes,
  Sun,
  Trash2,
  Wand2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { mediaUrl, useCatalog, useHistory, type HistoryItem, type MediaAsset, type ModelDefinition, type RefKind } from './api.ts'
import {
  addToProject,
  canSaveElement,
  copyText,
  deleteItems,
  downloadItems,
  downloadMedia,
  ELEMENT_CHOICES,
  kindOf,
  mediaOf,
  prepareReuse,
  regenerate,
  regenerateMeta,
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
import { surfaceOf } from './nav.ts'
import { CostTag, TabBar } from './parts.tsx'
import { promptParts } from './feed.ts'
import { FloatingSelectionBar, markViewed, ResultMenu } from './tiles.tsx'
import { libraryApi, useProjects, type ElementKind } from './library.ts'
import { closeViewer, openViewer, stepViewer, useViewer, type ViewerState } from './viewer.ts'
import { EditTab, clearViewerTab, viewerTabFor } from './ViewerEdit.tsx'
import './viewer.css'

const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  reference: ImagePlus,
  animate: Clapperboard,
  upscale: Maximize2,
  background: Eraser,
  inpaint: Brush,
  reframe: Crop,
  relight: Sun,
  angles: Rotate3d,
  layers: Layers,
  extend: FastForward,
  'upscale-video': Maximize2,
  lipsync: Mic,
  'edit-video': Wand2,
  motion: PersonStanding,
  'lipsync-audio': AudioLines,
  'last-frame': Flag,
  isolate: AudioWaveform,
  cover: Music,
  'change-voice': Repeat,
  translate: Languages,
}

const KIND_LABEL: Record<RefKind, string> = { image: 'Image', video: 'Video', audio: 'Audio' }

const whenMade = (ms: number) =>
  new Date(ms).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

const credits = (n?: number) => (typeof n === 'number' ? `${Number(n.toFixed(2))} credits` : 'Not recorded')

type Panel = null | 'element' | 'project' | 'delete'
type SideTab = 'info' | 'edit'

// Their viewer's tabs on a still (Comments is for teams; Trenchable has none).
const SIDE_TABS: { id: SideTab; label: string }[] = [
  { id: 'info', label: 'Info' },
  { id: 'edit', label: 'Edit' },
]
interface Message {
  tone: 'bad' | 'ok' | 'warn'
  text: string
  action?: { label: string; run: () => void }
}

export function Viewer() {
  const state = useViewer()
  // The feeds' floating bulk bar lives here too: like the viewer, it is one layer for every surface.
  return (
    <>
      <FloatingSelectionBar />
      {/* Keyed by result, so stepping to the next one starts with its own zoom, forms and messages. */}
      {state && <ViewerOpen key={state.item.taskId} state={state} />}
    </>
  )
}

/** the reference app's Quality row: the job's quality setting, else its resolution, as the model named it. */
export function qualityOf(input?: Record<string, unknown>): string | null {
  for (const key of ['quality', 'rendering_speed', 'resolution', 'image_resolution', 'output_quality']) {
    const v = input?.[key]
    if (typeof v === 'string' && v.trim()) return v.trim().replace(/^./, (c) => c.toUpperCase())
    if (typeof v === 'number') return String(v)
  }
  return null
}

function ViewerOpen({ state }: { state: ViewerState }) {
  const { items } = useHistory()
  const { models } = useCatalog()
  const item = items?.find((i) => i.taskId === state.item.taskId) ?? state.item
  const list = state.list
  const index = Math.max(0, list.findIndex((x) => x.taskId === item.taskId))
  const files = useMemo(() => mediaOf(item), [item])
  const [mi, setMi] = useState(0)
  const media: MediaAsset | undefined = files[Math.min(mi, Math.max(0, files.length - 1))]
  const kind = kindOf(item, media)
  const model = models?.find((m) => m.id === item.modelId) ?? null
  const title = model?.title ?? item.model ?? 'Result'
  const regen = useRegenerate(item)
  // An extend or upscale points back at the job it continued; open that one from here.
  const parent = item.parentTaskId ? items?.find((i) => i.taskId === item.parentTaskId) : undefined

  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<Message | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [more, setMore] = useState(false)
  const moreBtn = useRef<HTMLButtonElement>(null)
  // The picture's real size, read off the file once it loads (the reference app's "Size 2048x2048").
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  // Info · Edit. The version strip re-opens the viewer on a version and asks for Edit again.
  const [tab, setTab] = useState<SideTab>(() => viewerTabFor(state.item.taskId))
  useEffect(() => clearViewerTab(), [])

  // The feed marks this tile "Last viewed" (stepping with the arrows moves the mark along).
  useEffect(() => markViewed(item.taskId), [item.taskId])

  useEffect(() => {
    // Take focus off whatever was behind (a composer's textarea), so keys come here.
    frame.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(null), 1500)
    return () => window.clearTimeout(t)
  }, [copied])

  /** One action at a time; its error lands in the panel instead of an alert. */
  const run = async (id: string, fn: () => Promise<string | void>) => {
    if (busy) return
    setBusy(id)
    setMsg(null)
    try {
      const done = await fn()
      if (typeof done === 'string') setMsg({ tone: 'ok', text: done })
    } catch (e) {
      setMsg({ tone: 'bad', text: (e as Error).message || 'That did not work.' })
    } finally {
      setBusy(null)
    }
  }

  const favourite = () => void run('favourite', () => setFavourites([item], !item.pinned))
  const download = () => {
    if (media) void run('download', () => downloadMedia(item, media, mi, files.length))
  }
  const copy = (key: string, text: string) =>
    void copyText(text).then(
      () => setCopied(key),
      (e: unknown) => setMsg({ tone: 'bad', text: (e as Error).message }),
    )
  const reuse = () =>
    void run('reuse', async () => {
      const { handoff, dropped } = await prepareReuse(item, model)
      if (!dropped) return sendReuse(handoff)
      setMsg({
        tone: 'warn',
        text: `${dropped} of the files this job was given ${dropped === 1 ? 'has' : 'have'} expired on Kie, so Reuse can't bring ${dropped === 1 ? 'it' : 'them'} back.`,
        action: { label: 'Reuse without them', run: () => sendReuse(handoff) },
      })
    })
  const again = () => {
    const m = regen.model
    if (!m || regen.blocker) return
    void run('regenerate', async () => {
      await regenerate(item, m)
      const where = surfaceOf(regenerateMeta(item).surface)
      setMsg({
        tone: 'ok',
        text: `Running again. It lands in ${where.label} as it goes, and here in Assets when it's done.`,
        action: {
          label: `Open ${where.label}`,
          run: () => {
            closeViewer()
            window.location.hash = `#/gen/${where.id}`
          },
        },
      })
    })
  }
  const tool = (id: ToolId) => {
    if (media) void run(id, () => runTool(id, item, media))
  }
  /** After a delete: on to the next result (or the one before), or close when it was the last. */
  const afterDelete = () => {
    const rest = list.filter((x) => x.taskId !== item.taskId)
    const next = list[index + 1] ?? list[index - 1]
    if (next) openViewer(next, rest)
    else closeViewer()
  }
  const remove = () =>
    void run('delete', async () => {
      await deleteItems([item.taskId])
      afterDelete()
    })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const t = e.target as HTMLElement | null
      const tag = t?.tagName ?? ''
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (more) setMore(false)
        else if (panel) setPanel(null)
        else closeViewer()
        return
      }
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t?.isContentEditable) return
      // A focused player keeps its own arrow keys (seeking).
      const seeking = (tag === 'VIDEO' || tag === 'AUDIO') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      if (seeking) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const handlers: Record<string, () => void> = {
        ArrowLeft: () => stepViewer(-1),
        ArrowRight: () => stepViewer(1),
        f: favourite,
        d: download,
      }
      const h = handlers[key]
      if (!h) return
      e.preventDefault()
      e.stopPropagation()
      h()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const tools = toolsFor(kind)
  const mediaSrc = media ? mediaUrl(media) : undefined
  const sendBlocked = !media || Boolean(busy)

  return (
    <div className="vw-root" role="dialog" aria-modal="true" aria-label="Result viewer">
      <div className="vw-scrim" onClick={closeViewer} />
      <div className="vw-frame" ref={frame} tabIndex={-1}>
        <section className="vw-stage">
          <div className="vw-stage-bar">
            <span className="vw-count">
              {index + 1} of {list.length}
            </span>
            <span className="pl-badge pl-badge--quiet">{KIND_LABEL[kind]}</span>
            {files.length > 1 && (
              <span className="pl-badge pl-badge--quiet">
                Output {Math.min(mi, files.length - 1) + 1} of {files.length}
              </span>
            )}
            <span className="vw-keys">
              <kbd>←</kbd>
              <kbd>→</kbd> browse · <kbd>F</kbd> favourite · <kbd>D</kbd> download · <kbd>Esc</kbd> close
            </span>
            {files.length > 1 && (
              <button type="button" className="vw-btn is-sm" disabled={Boolean(busy)} onClick={() => void run('download-all', () => downloadItems([item]))} title="Download every output of this job">
                {busy === 'download-all' ? <Loader2 size={14} className="st-spin" /> : <Download size={14} />}
                All {files.length}
              </button>
            )}
            {mediaSrc && (
              <a className="vw-btn is-icon is-sm" href={mediaSrc} target="_blank" rel="noopener noreferrer" aria-label="Open the file in a new tab" title="Open the file in a new tab">
                <ExternalLink size={14} />
              </a>
            )}
          </div>

          <Stage media={media} kind={kind} alt={item.prompt ?? title} onSize={setSize} />

          <button type="button" className="vw-nav is-prev" aria-label="Previous" title="Previous (←)" disabled={index <= 0} onClick={() => stepViewer(-1)}>
            <ChevronLeft size={20} />
          </button>
          <button type="button" className="vw-nav is-next" aria-label="Next" title="Next (→)" disabled={index >= list.length - 1} onClick={() => stepViewer(1)}>
            <ChevronRight size={20} />
          </button>

          {files.length > 1 && (
            <div className="vw-strip" role="tablist" aria-label="Outputs of this job">
              {files.map((m, i) => (
                <button
                  key={`${m.localPath ?? m.url ?? i}`}
                  type="button"
                  role="tab"
                  aria-selected={i === mi}
                  className={`vw-thumb ${i === mi ? 'is-on' : ''}`}
                  title={`Output ${i + 1}`}
                  onClick={() => setMi(i)}
                >
                  <Thumb media={m} kind={kindOf(item, m)} />
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="vw-side">
          <header className="vw-head">
            <div className="vw-head-text">
              <h2 className="vw-title">{title}</h2>
              <p className="vw-sub">{whenMade(item.createdAt)}</p>
            </div>
            <button type="button" className="vw-btn is-icon" aria-label="Close" title="Close (Esc)" onClick={closeViewer}>
              <X size={16} />
            </button>
          </header>

          {msg && (
            <div className={`vw-msg is-${msg.tone}`} role={msg.tone === 'bad' ? 'alert' : 'status'} style={{ marginTop: 12 }}>
              {msg.text}
              {msg.action && (
                <div className="vw-row-end">
                  <button type="button" className="vw-btn is-sm" onClick={() => setMsg(null)}>
                    {msg.tone === 'ok' ? 'Close' : 'Cancel'}
                  </button>
                  <button type="button" className="vw-btn is-sm is-primary" onClick={msg.action.run}>
                    {msg.action.label}
                  </button>
                </div>
              )}
            </div>
          )}

          {kind === 'image' && (
            <div className="vw-sidetabs">
              <TabBar tabs={SIDE_TABS} value={tab} onPick={setTab} />
            </div>
          )}

          {kind === 'image' && tab === 'edit' ? (
            <EditTab item={item} media={media} ratio={size ? size.w / size.h : null} busyTool={busy} onTool={tool} />
          ) : (
            <>
              <div className="vw-sec">
                {kind === 'image' && (
                  // Their main call to action on a still.
                  <button type="button" className="vw-btn is-primary is-wide" style={{ marginBottom: 8 }} onClick={() => tool('animate')} disabled={sendBlocked} title="Make a video that starts on this frame">
                    {busy === 'animate' ? <Loader2 size={15} className="st-spin" /> : <Clapperboard size={15} />}
                    Turn to video
                  </button>
                )}
                <div className="vw-primary">
                  {kind === 'image' && (
                    <button type="button" className="vw-btn" onClick={() => tool('reference')} disabled={sendBlocked} title="Attach to the image composer as a reference">
                      {busy === 'reference' ? <Loader2 size={15} className="st-spin" /> : <ImagePlus size={15} />}
                      Reference
                    </button>
                  )}
                  <button type="button" className={`vw-btn ${kind === 'image' ? '' : 'is-primary'}`} onClick={download} disabled={!media || Boolean(busy)} title="Download (D)">
                    {busy === 'download' ? <Loader2 size={15} className="st-spin" /> : <Download size={15} />}
                    Download
                  </button>
                  <button type="button" className={`vw-btn ${item.pinned ? 'is-on' : ''}`} onClick={favourite} disabled={Boolean(busy)} aria-pressed={Boolean(item.pinned)} title="Favourite (F)">
                    {busy === 'favourite' ? <Loader2 size={15} className="st-spin" /> : <Heart size={15} className="vw-heart" />}
                    {item.pinned ? 'Favourited' : 'Favourite'}
                  </button>
                  <button type="button" className="vw-btn" onClick={reuse} disabled={Boolean(busy)} title="Recreate: open the same tool with this prompt, model and settings (Reuse)">
                    {busy === 'reuse' ? <Loader2 size={15} className="st-spin" /> : <RotateCcw size={15} />}
                    Recreate
                  </button>
                  <button
                    type="button"
                    className="vw-btn"
                    onClick={again}
                    disabled={Boolean(busy) || Boolean(regen.blocker) || !regen.model}
                    title={regen.blocker ?? (regen.estimate ? `${regen.estimate.detail}. Runs the same job again.` : 'Run the same job again, exactly as it was')}
                  >
                    {busy === 'regenerate' ? <Loader2 size={15} className="st-spin" /> : <RefreshCw size={15} />}
                    Regenerate
                    {regen.estimate && <CostTag credits={regen.estimate.credits} />}
                  </button>
                  <button type="button" className="vw-btn" onClick={() => copy('prompt', item.prompt ?? '')} disabled={!item.prompt}>
                    {copied === 'prompt' ? <Check size={15} /> : <Copy size={15} />}
                    {copied === 'prompt' ? 'Copied' : 'Copy prompt'}
                  </button>
                  <button ref={moreBtn} type="button" className={`vw-btn ${more ? 'is-on' : ''}`} aria-haspopup="menu" aria-expanded={more} onClick={() => setMore(!more)} title="More: create or assign an element, add to a project, other tools">
                    <Ellipsis size={15} />
                    More
                  </button>
                  {more && <ResultMenu item={item} anchor={moreBtn.current} onClose={() => setMore(false)} onDeleted={afterDelete} />}
                </div>
              </div>

              <Section title={kind === 'image' ? 'Use this image' : kind === 'video' ? 'Use this video' : 'Use this audio'} right={busy && TOOL_ICONS[busy as ToolId] ? <span className="vw-list-sub">Sending the file to Kie…</span> : undefined}>
                <div className="vw-tools">
                  {tools.map((t) => {
                    const Icon = TOOL_ICONS[t.id]
                    return (
                      <button key={t.id} type="button" className="vw-tool" title={t.hint} disabled={sendBlocked} onClick={() => tool(t.id)}>
                        {busy === t.id ? <Loader2 size={15} className="st-spin" /> : <Icon size={15} />}
                        {t.label}
                      </button>
                    )
                  })}
                </div>
              </Section>

              <Section
                title="Prompt"
                right={
                  item.prompt ? (
                    <button type="button" className="vw-mini" aria-label="Copy prompt" title="Copy prompt" onClick={() => copy('prompt', item.prompt ?? '')}>
                      {copied === 'prompt' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  ) : undefined
                }
              >
                <Prompt text={item.prompt} />
                <RefStrip item={item} model={model} />
              </Section>

              <Settings item={item} model={model} />

              <Section title="Details">
                <dl className="vw-table">
                  <dt>Model</dt>
                  <dd>{title}</dd>
                  {item.model && item.model !== title && (
                    <>
                      <dt>Job</dt>
                      <dd>{item.model}</dd>
                    </>
                  )}
                  {qualityOf(item.input) && (
                    <>
                      <dt>Quality</dt>
                      <dd>{qualityOf(item.input)}</dd>
                    </>
                  )}
                  {size && (
                    <>
                      <dt>Size</dt>
                      <dd>
                        {size.w}×{size.h}
                      </dd>
                    </>
                  )}
                  <dt>Created</dt>
                  <dd>{whenMade(item.createdAt)}</dd>
                  <dt>Credits</dt>
                  <dd>{credits(item.creditsConsumed)}</dd>
                  <dt>Outputs</dt>
                  <dd>{files.length || 'None'}</dd>
                  <dt>Stored</dt>
                  <dd>{media?.localPath ? 'On disk (never expires)' : 'At Kie (expires with the job)'}</dd>
                  <dt>Task id</dt>
                  <dd className="vw-copyline">
                    <span className="vw-mono" title={item.taskId}>
                      {item.taskId}
                    </span>
                    <button type="button" className="vw-mini" aria-label="Copy task id" title="Copy task id" onClick={() => copy('task', item.taskId)}>
                      {copied === 'task' ? <Check size={13} /> : <Copy size={13} />}
                    </button>
                  </dd>
                  {item.parentTaskId && (
                    <>
                      <dt>Made from</dt>
                      <dd className="vw-copyline">
                        <span className="vw-mono" title={item.parentTaskId}>
                          {item.parentTaskId}
                        </span>
                        {parent && (
                          <button type="button" className="vw-link" onClick={() => openViewer(parent, [parent, item])}>
                            Open
                          </button>
                        )}
                      </dd>
                    </>
                  )}
                </dl>
              </Section>

              <Section title="Keep it">
                <div className="vw-primary">
                  <button
                    type="button"
                    className={`vw-btn ${panel === 'element' ? 'is-on' : ''}`}
                    disabled={!media || !canSaveElement(kind)}
                    title={canSaveElement(kind) ? 'Save as a character, product, location or style you can @-mention' : 'Only images can become Elements'}
                    onClick={() => setPanel(panel === 'element' ? null : 'element')}
                  >
                    <Shapes size={15} />
                    Save as Element
                  </button>
                  <button type="button" className={`vw-btn ${panel === 'project' ? 'is-on' : ''}`} onClick={() => setPanel(panel === 'project' ? null : 'project')}>
                    <FolderPlus size={15} />
                    Add to project
                  </button>
                </div>
                {panel === 'element' && media && (
                  <ElementForm
                    defaultName=""
                    busy={busy === 'element'}
                    onCancel={() => setPanel(null)}
                    onSave={(name, k) =>
                      void run('element', async () => {
                        const el = await saveAsElement(media, name, k)
                        setPanel(null)
                        return `Saved to Elements as “${el.name}”. @-mention it from any prompt.`
                      })
                    }
                  />
                )}
                {panel === 'project' && <ProjectPicker item={item} onDone={(text) => setMsg({ tone: 'ok', text })} onError={(text) => setMsg({ tone: 'bad', text })} />}
              </Section>

              <Section title="Delete">
                {panel === 'delete' ? (
                  <div className="vw-confirm">
                    <p>Delete this result for good? Its files on disk go with it.</p>
                    <div className="vw-row-end">
                      <button type="button" className="vw-btn is-sm" onClick={() => setPanel(null)} disabled={busy === 'delete'}>
                        Keep it
                      </button>
                      <button type="button" className="vw-btn is-sm is-danger" onClick={remove} disabled={Boolean(busy)}>
                        {busy === 'delete' ? <Loader2 size={14} className="st-spin" /> : <Trash2 size={14} />}
                        Delete
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="vw-btn is-danger is-wide" onClick={() => setPanel('delete')} disabled={Boolean(busy)}>
                    <Trash2 size={15} />
                    Delete…
                  </button>
                )}
              </Section>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}

/* ---------- the stage ---------- */

function Stage({ media, kind, alt, onSize }: { media?: MediaAsset; kind: RefKind; alt: string; onSize?: (s: { w: number; h: number } | null) => void }) {
  const src = media ? mediaUrl(media) : undefined
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null)
  if (!src) {
    return (
      <div className="vw-media">
        <div className="vw-missing">
          <ImageOff size={28} />
          This result has no file any more.
        </div>
      </div>
    )
  }
  // Click to zoom where you clicked; while zoomed the picture follows the pointer.
  const at = (e: ReactMouseEvent<HTMLElement>) => {
    const box = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect()
    return { x: ((e.clientX - box.left) / box.width) * 100, y: ((e.clientY - box.top) / box.height) * 100 }
  }
  const closeOnBackdrop = (e: ReactMouseEvent) => {
    if (e.target === e.currentTarget && !zoom) closeViewer()
  }
  return (
    <div className={`vw-media ${zoom ? 'is-zoomed' : ''}`} onClick={closeOnBackdrop}>
      {kind === 'video' ? (
        <video key={src} src={src} controls autoPlay loop playsInline onLoadedMetadata={(e) => onSize?.(e.currentTarget.videoWidth ? { w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight } : null)} />
      ) : kind === 'audio' ? (
        <div className="vw-audio">
          <span className="vw-audio-icon">
            <Music size={26} />
          </span>
          <span className="vw-audio-title">{media?.title || alt.slice(0, 80) || 'Audio'}</span>
          <audio key={src} src={src} controls autoPlay />
        </div>
      ) : (
        <img
          src={src}
          alt={alt}
          title={zoom ? 'Click to fit' : 'Click to zoom'}
          style={zoom ? { transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined}
          onLoad={(e) => onSize?.(e.currentTarget.naturalWidth ? { w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight } : null)}
          onClick={(e) => setZoom(zoom ? null : at(e))}
          onMouseMove={(e) => zoom && setZoom(at(e))}
        />
      )}
    </div>
  )
}

function Thumb({ media, kind }: { media: MediaAsset; kind: RefKind }) {
  const src = mediaUrl(media)
  if (!src) return <ImageOff size={16} />
  if (kind === 'video') return <video src={src} muted preload="metadata" />
  if (kind === 'audio') return <Music size={18} />
  return <img src={src} alt="" loading="lazy" />
}

/* ---------- the panel's pieces ---------- */

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="vw-sec">
      <p className="vw-sec-title">
        <span>{title}</span>
        {right}
      </p>
      {children}
    </div>
  )
}

function Prompt({ text }: { text?: string }) {
  const [all, setAll] = useState(false)
  if (!text?.trim()) return <p className="vw-empty-line">This job had no prompt.</p>
  const long = text.length > 360
  return (
    <>
      <p className={`vw-prompt ${long && !all ? 'is-clamped' : ''}`}>
        {promptParts(text).map((p, i) => ('chip' in p ? <span key={i} className="st-ptoken">{p.chip}</span> : <span key={i}>{p.text}</span>))}
      </p>
      {long && (
        <button type="button" className="vw-link" style={{ marginTop: 6 }} onClick={() => setAll(!all)}>
          {all ? 'Show less' : 'Show all'}
        </button>
      )}
    </>
  )
}

/** The files the job was given, in order, under the prompt (as their Info tab shows them). */
function RefStrip({ item, model }: { item: HistoryItem; model: ModelDefinition | null }) {
  const { files } = useMemo(() => settingRows(item, model), [item, model])
  const all = files.flatMap((f) => f.urls.map((url) => ({ url, kind: f.kind })))
  if (!all.length) return null
  return (
    <div className="vw-files" style={{ marginTop: 10 }} aria-label="References">
      {all.map((f, i) => (
        <FileThumb key={`${f.url}-${i}`} url={f.url} kind={f.kind} />
      ))}
    </div>
  )
}

function Settings({ item, model }: { item: HistoryItem; model: ModelDefinition | null }) {
  const { rows, files } = useMemo(() => settingRows(item, model), [item, model])
  if (!rows.length && !files.length) {
    return (
      <Section title="Settings">
        <p className="vw-empty-line">No settings were recorded for this job.</p>
      </Section>
    )
  }
  return (
    <Section title="Settings">
      {rows.length > 0 && (
        <dl className="vw-table">
          {rows.map((r) => (
            <SettingLine key={r.key} label={r.label} value={r.value} />
          ))}
        </dl>
      )}
      {files.map((f) => (
        <div key={f.key} style={{ marginTop: 10 }}>
          <p className="vw-sec-title" style={{ marginBottom: 6 }}>
            {f.label}
          </p>
          <div className="vw-files">
            {f.urls.map((u, i) => (
              <FileThumb key={`${u}-${i}`} url={u} kind={f.kind} />
            ))}
          </div>
        </div>
      ))}
    </Section>
  )
}

function SettingLine({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

/** A file the job was given. Kie throws its uploads away after a few days, so it may not load. */
function FileThumb({ url, kind }: { url: string; kind?: RefKind }) {
  const [gone, setGone] = useState(false)
  const k = kind ?? urlKind(url)
  return (
    <a className="vw-file" href={url} target="_blank" rel="noopener noreferrer" title={gone ? 'Expired on Kie' : url}>
      {gone ? 'Expired' : k === 'image' ? <img src={url} alt="" loading="lazy" onError={() => setGone(true)} /> : k === 'video' ? <video src={url} muted preload="metadata" onError={() => setGone(true)} /> : k === 'audio' ? <Music size={16} /> : <FileIcon size={16} />}
    </a>
  )
}

function ElementForm({ defaultName, busy, onSave, onCancel }: { defaultName: string; busy: boolean; onSave: (name: string, kind: ElementKind) => void; onCancel: () => void }) {
  const [name, setName] = useState(defaultName)
  const [kind, setKind] = useState<ElementKind>('character')
  return (
    <form
      className="vw-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim()) onSave(name, kind)
      }}
    >
      <input className="vw-input" placeholder="Name it, e.g. Anna in the red coat" value={name} autoFocus onChange={(e) => setName(e.target.value)} aria-label="Element name" />
      <div className="vw-seg" role="radiogroup" aria-label="What it is">
        {ELEMENT_CHOICES.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={kind === c.id} className={kind === c.id ? 'is-on' : ''} onClick={() => setKind(c.id)}>
            {c.label}
          </button>
        ))}
      </div>
      <div className="vw-row-end">
        <button type="button" className="vw-btn is-sm" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="vw-btn is-sm is-primary" disabled={busy || !name.trim()}>
          {busy ? <Loader2 size={14} className="st-spin" /> : <Shapes size={14} />}
          Save
        </button>
      </div>
    </form>
  )
}

/** Projects with a tick on the ones this result is in; a click adds or takes it out. */
function ProjectPicker({ item, onDone, onError }: { item: HistoryItem; onDone: (text: string) => void; onError: (text: string) => void }) {
  const { items: projects, loading, error } = useProjects()
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const go = async (key: string, fn: () => Promise<string>) => {
    if (busy) return
    setBusy(key)
    try {
      onDone(await fn())
    } catch (e) {
      onError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }
  const name = (t: string) => t || 'Untitled project'
  return (
    <div className="vw-form">
      {error && <p className="vw-empty-line">Projects did not load: {error}</p>}
      {loading && !projects.length ? (
        <p className="vw-empty-line">Loading projects…</p>
      ) : projects.length ? (
        <div className="vw-list" role="list">
          {projects.map((p) => {
            const inIt = p.taskIds.includes(item.taskId)
            return (
              <button
                key={p.id}
                type="button"
                role="listitem"
                className={`vw-list-item ${inIt ? 'is-on' : ''}`}
                disabled={Boolean(busy)}
                title={inIt ? 'In this project — click to take it out' : 'Add to this project'}
                onClick={() =>
                  void go(p.id, async () => {
                    if (inIt) {
                      await libraryApi.removeFromProject(p.id, item.taskId)
                      return `Taken out of “${name(p.title)}”.`
                    }
                    await addToProject({ id: p.id }, [item])
                    return `Added to “${name(p.title)}”.`
                  })
                }
              >
                <span>{name(p.title)}</span>
                <span className="vw-list-sub">{p.taskIds.length}</span>
                {busy === p.id ? <Loader2 size={13} className="st-spin" /> : inIt ? <Check size={13} /> : null}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="vw-empty-line">No projects yet. Name one to start it with this result.</p>
      )}
      <form
        className="vw-copyline"
        onSubmit={(e) => {
          e.preventDefault()
          const t = title.trim()
          if (!t) return
          void go('new', async () => {
            await addToProject({ title: t }, [item])
            setTitle('')
            return `Started “${t}” with this result.`
          })
        }}
      >
        <input className="vw-input" placeholder="New project name" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="New project name" />
        <button type="submit" className="vw-btn is-icon" aria-label="Create project" title="Create and add" disabled={!title.trim() || Boolean(busy)}>
          {busy === 'new' ? <Loader2 size={15} className="st-spin" /> : <Plus size={15} />}
        </button>
      </form>
    </div>
  )
}
