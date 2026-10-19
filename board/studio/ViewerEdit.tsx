/**
 * The viewer's Edit tab on a still, as the reference app's: a "Describe how to edit image…" bar with
 * `+` for an extra reference and a submit button (with its cost), a version strip — this
 * image and the edits made from it in this session — and the EDIT IMAGE tool list, which
 * hands the picture to Trenchable's own tools.
 *
 * An edit is one image-edit job with this picture first: the editor is the one that keeps the
 * subject best (`identityEditor`, the same pick as Angles), the job is built in actions.ts
 * (`imageEditInput`, tested). Versions are kept per session in this module, keyed by the
 * picture the chain started from, so stepping to a version (the viewer re-opens on it) still
 * shows the whole strip, and an edit of an edit joins the same chain.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ArrowUp, Brush, Crop, Eraser, ImageOff, Layers, Loader2, Maximize2, Plus, Rotate3d, Sun, X, type LucideIcon } from 'lucide-react'
import { isDone, mediaUrl, useCatalog, useHistory, type HistoryItem, type MediaAsset } from './api.ts'
import { hostOnce, imageEditBlocker, imageEditInput, editorRoom, mediaOf, type ToolId } from './actions.ts'
import { useEstimate } from './estimate.ts'
import { submitJob, useJobs, type Job } from './jobs.ts'
import { uploadMedia } from './library.ts'
import { CostTag } from './parts.tsx'
import { identityEditor } from './surfaces/edit/catalog.ts'
import { openViewer } from './viewer.ts'

/* ---------- versions, for this session ---------- */

interface Version {
  jobId: string
  taskId: string | null
}

/** Chain root → its edits, oldest first; and every edit's task → its root. */
const chains = new Map<string, Version[]>()
const roots = new Map<string, string>()
const listeners = new Set<() => void>()
let tick = 0
const emit = () => {
  tick++
  for (const l of listeners) l()
}
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
const useChains = () => useSyncExternalStore(subscribe, () => tick, () => tick)

const rootOf = (taskId: string) => roots.get(taskId) ?? taskId

function addVersion(root: string, jobId: string) {
  chains.set(root, [...(chains.get(root) ?? []), { jobId, taskId: null }])
  emit()
}

/** Once Kie names the job's task, the result can be found in history and joins the chain. */
function learnTask(root: string, jobId: string, taskId: string) {
  const list = chains.get(root)
  const v = list?.find((x) => x.jobId === jobId)
  if (!v || v.taskId === taskId) return
  v.taskId = taskId
  roots.set(taskId, root)
  emit()
}

/**
 * The strip re-opens the viewer on a version, still in Edit: the result it opens on, until the
 * viewer has mounted (read, not taken, so React's double render in dev sees it both times).
 */
let editNext: string | null = null
export const viewerTabFor = (taskId: string): 'info' | 'edit' => (editNext === taskId ? 'edit' : 'info')
export const clearViewerTab = () => {
  editNext = null
}

/* ---------- the EDIT IMAGE tools ---------- */

/** Theirs: Upscale, Remove background, Relight, Expand & Crop, Inpaint, Angles, Layers — each opens Trenchable's tool. */
const EDIT_TOOLS: { id: ToolId; label: string; icon: LucideIcon }[] = [
  { id: 'upscale', label: 'Upscale', icon: Maximize2 },
  { id: 'background', label: 'Remove background', icon: Eraser },
  { id: 'relight', label: 'Relight', icon: Sun },
  { id: 'reframe', label: 'Expand & Crop', icon: Crop },
  { id: 'inpaint', label: 'Inpaint', icon: Brush },
  { id: 'angles', label: 'Angles', icon: Rotate3d },
  { id: 'layers', label: 'Layers', icon: Layers },
]

/* ---------- the tab ---------- */

interface Extra {
  url: string
  preview: string
}

export function EditTab({ item, media, ratio, busyTool, onTool }: { item: HistoryItem; media: MediaAsset | undefined; ratio: number | null; busyTool: string | null; onTool: (id: ToolId) => void }) {
  const { models } = useCatalog()
  const { items } = useHistory()
  const jobs = useJobs()
  useChains()
  const model = useMemo(() => identityEditor(models), [models])
  const room = editorRoom(model)
  const [prompt, setPrompt] = useState('')
  const [extras, setExtras] = useState<Extra[]>([])
  const [busy, setBusy] = useState<'upload' | 'send' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const root = rootOf(item.taskId)
  const chain = chains.get(root) ?? []
  const jobOf = (v: Version): Job | undefined => jobs.find((j) => j.id === v.jobId)
  useEffect(() => {
    for (const v of chain) {
      const t = v.taskId ?? jobOf(v)?.taskId
      if (t) learnTask(root, v.jobId, t)
    }
  })

  // The chain's first picture: the one it started from (this one, or the one this was edited from).
  const first = root === item.taskId ? item : items?.find((i) => i.taskId === root)
  const versions = chain.map((v) => {
    const job = jobOf(v)
    const taskId = v.taskId ?? job?.taskId ?? null
    const done = taskId ? items?.find((i) => i.taskId === taskId && isDone(i)) : undefined
    const failed = job?.status === 'error' || (taskId ? items?.some((i) => i.taskId === taskId && i.state === 'fail') : false)
    return { v, done, failed, error: job?.error }
  })
  const finished = [first, ...versions.map((x) => x.done)].filter((x): x is HistoryItem => Boolean(x))
  const open = (to: HistoryItem) => {
    if (to.taskId === item.taskId) return
    editNext = to.taskId
    openViewer(to, finished)
  }

  // The cost of one edit: the price doesn't depend on the files, so the picture's own link stands in.
  const preview = model ? imageEditInput(model, prompt || 'edit', [media?.url ?? 'https://example.invalid/base.png', ...extras.map((x) => x.url)], ratio) : null
  const estimate = useEstimate(model, preview, 1)
  const blocker = !media ? 'This result has no file to edit.' : imageEditBlocker(model, preview, prompt)

  const attach = async (f: File | undefined) => {
    if (!f) return
    setBusy('upload')
    setNote(null)
    try {
      const { fileUrl } = await uploadMedia(f)
      setExtras((x) => [...x, { url: fileUrl, preview: URL.createObjectURL(f) }])
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(null)
      if (file.current) file.current.value = ''
    }
  }

  const send = async () => {
    if (!model || !media || blocker || busy) return
    setBusy('send')
    setNote(null)
    try {
      const base = await hostOnce(media)
      const input = imageEditInput(model, prompt, [base, ...extras.map((x) => x.url)], ratio)
      if (!input) throw new Error(`${model.title} has no picture field.`)
      const aspect = typeof input.aspect_ratio === 'string' ? input.aspect_ratio : undefined
      addVersion(root, submitJob(model, input, { surface: 'image', label: 'Edit', aspect }))
      setPrompt('')
      setExtras([])
    } catch (e) {
      setNote((e as Error).message || 'That edit did not go out.')
    } finally {
      setBusy(null)
    }
  }

  const canAttach = room > 1 + extras.length

  return (
    <>
      <div className="vw-sec">
        <p className="vw-sec-title">
          <span>Versions</span>
          <span className="vw-list-sub">{versions.length ? `${versions.length + 1} in this session` : 'Edits you make appear here'}</span>
        </p>
        <div className="vw-versions" role="list" aria-label="Versions">
          {first && <VersionThumb item={first} label="Original" on={first.taskId === item.taskId} onOpen={() => open(first)} />}
          {versions.map(({ v, done, failed, error }, i) =>
            done ? (
              <VersionThumb key={v.jobId} item={done} label={`Edit ${i + 1}`} on={done.taskId === item.taskId} onOpen={() => open(done)} />
            ) : (
              <span key={v.jobId} role="listitem" className={`vw-version is-pending ${failed ? 'is-failed' : ''}`} title={failed ? (error ?? 'This edit failed.') : 'Editing…'}>
                {failed ? <ImageOff size={16} /> : <Loader2 size={16} className="st-spin" />}
                <span className="vw-version-label">{failed ? 'Failed' : `Edit ${i + 1}`}</span>
              </span>
            ),
          )}
        </div>
      </div>

      <div className="vw-sec">
        <form
          className="vw-editbar"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          {extras.length > 0 && (
            <div className="vw-editbar-refs">
              {extras.map((x, i) => (
                <span key={x.url} className="vw-editbar-ref" title={`Reference ${i + 1}`}>
                  <img src={x.preview} alt="" />
                  <button type="button" aria-label="Remove this reference" onClick={() => setExtras((all) => all.filter((y) => y.url !== x.url))}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <textarea
            className="vw-editbar-input"
            rows={2}
            placeholder="Describe how to edit image…"
            aria-label="Describe how to edit image"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
          />
          <div className="vw-editbar-row">
            <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void attach(e.target.files?.[0])} />
            <button
              type="button"
              className="vw-btn is-icon is-sm"
              aria-label="Add a reference image"
              title={canAttach ? 'Add a reference image' : model ? `${model.title} takes no more pictures` : 'Add a reference image'}
              disabled={!canAttach || Boolean(busy)}
              onClick={() => file.current?.click()}
            >
              {busy === 'upload' ? <Loader2 size={14} className="st-spin" /> : <Plus size={14} />}
            </button>
            <span className="vw-editbar-model" title="The editor that keeps the subject most alike">
              {model ? model.title : 'Loading models…'}
            </span>
            <CostTag credits={estimate?.credits ?? null} />
            <button type="submit" className="vw-btn is-icon is-sm is-primary" aria-label="Edit image" title={blocker ?? estimate?.detail ?? 'Edit image'} disabled={Boolean(blocker) || Boolean(busy)}>
              {busy === 'send' ? <Loader2 size={14} className="st-spin" /> : <ArrowUp size={14} />}
            </button>
          </div>
        </form>
        {note && (
          <p className="vw-msg is-bad" role="alert" style={{ marginTop: 8 }}>
            {note}
          </p>
        )}
        <p className="vw-list-sub" style={{ marginTop: 6 }}>
          Runs as a new image job with this picture first; the result joins the versions above and lands in Image.
        </p>
      </div>

      <div className="vw-sec">
        <p className="vw-sec-title">
          <span>Edit image</span>
          {busyTool && EDIT_TOOLS.some((t) => t.id === busyTool) ? <span className="vw-list-sub">Sending the file to Kie…</span> : null}
        </p>
        <div className="vw-tools">
          {EDIT_TOOLS.map((t) => (
            <button key={t.id} type="button" className="vw-tool" disabled={!media || Boolean(busyTool)} onClick={() => onTool(t.id)}>
              {busyTool === t.id ? <Loader2 size={15} className="st-spin" /> : <t.icon size={15} />}
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function VersionThumb({ item, label, on, onOpen }: { item: HistoryItem; label: string; on: boolean; onOpen: () => void }) {
  const m = mediaOf(item)[0]
  const src = m ? mediaUrl(m) : undefined
  return (
    <button type="button" role="listitem" className={`vw-version ${on ? 'is-on' : ''}`} aria-current={on || undefined} title={on ? `${label} (showing)` : `Show ${label.toLowerCase()}`} onClick={onOpen}>
      {src ? <img src={src} alt="" loading="lazy" /> : <ImageOff size={16} />}
      <span className="vw-version-label">{label}</span>
    </button>
  )
}
