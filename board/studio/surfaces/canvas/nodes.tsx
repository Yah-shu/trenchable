/**
 * The Canvas node cards: Prompt, Image, Generate image, Generate video, Upscale, Output.
 *
 * Each card is a compact Plinth panel with typed handles — inputs on the left (prompt,
 * pictures, media), one output on the right — coloured by what they carry so a wrong
 * wire is visible before it is refused. Cards hold no state of their own beyond a popover
 * or an upload in flight: what they show comes from the board (node data) and the shared
 * job queue, through `CanvasContext`, so a reload or a lane switch loses nothing.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { AlertTriangle, Download, ExternalLink, Expand, Film, History, ImagePlus, Loader2, Maximize2, MonitorPlay, Play, Sparkles, Type, Upload, X, type LucideIcon } from 'lucide-react'
import { mediaUrl, type HistoryItem, type ModelDefinition } from '../../api.ts'
import { uploadMedia } from '../../library.ts'
import { controlsFor } from '../../controls.ts'
import { familyAbility, variantFor, type Family } from '../../families.ts'
import type { Job } from '../../jobs.ts'
import { MentionPicker } from '../../Mentions.tsx'
import { openViewer } from '../../viewer.ts'
import { clock, INPUTS, OUTPUT_KIND, pickFamily, resolveInputs, statusOf, TITLES, valueOf, type Board, type CanvasNode, type InputHandle, type Kind, type NodeData, type NodeOutput, type NodeType } from './graph.ts'
import './canvas.css'

export interface CanvasApi {
  board: Board
  jobs: Job[]
  history: HistoryItem[] | null
  models: ModelDefinition[] | null
  families: { image: Family[]; video: Family[] }
  /** Nodes whose Run was pressed and whose pictures are still going up. */
  sending: ReadonlySet<string>
  patch: (nodeId: string, data: Partial<NodeData>) => void
  remove: (nodeId: string) => void
  run: (nodeId: string) => void
}

export const CanvasContext = createContext<CanvasApi | null>(null)

const useCanvas = (): CanvasApi => {
  const c = useContext(CanvasContext)
  if (!c) throw new Error('Canvas nodes need CanvasContext.')
  return c
}

export const ICONS: Record<NodeType, LucideIcon> = {
  prompt: Type,
  image: ImagePlus,
  genImage: Sparkles,
  genVideo: Film,
  upscale: Maximize2,
  output: MonitorPlay,
}

/** The job behind a node: by local id, else (after a reload) by Kie task id. */
export function jobFor(jobs: Job[], data: NodeData): Job | undefined {
  return (data.jobId ? jobs.find((j) => j.id === data.jobId) : undefined) ?? (data.taskId ? jobs.find((j) => j.taskId === data.taskId) : undefined)
}

const historyFor = (history: HistoryItem[] | null, taskId?: string) => (taskId && history ? history.find((i) => i.taskId === taskId) : undefined)

function useTick(on: boolean) {
  const [, set] = useState(0)
  useEffect(() => {
    if (!on) return
    const t = window.setInterval(() => set((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [on])
}

/* ---------- frame ---------- */

function Card({ id, type, selected, wide, children }: { id: string; type: NodeType; selected?: boolean; wide?: boolean; children: ReactNode }) {
  const { remove } = useCanvas()
  const Icon = ICONS[type]
  const out = OUTPUT_KIND[type]
  return (
    <div className={`cv-node is-${type}${selected ? ' is-selected' : ''}${wide ? ' is-wide' : ''}`}>
      <header className="cv-node-head">
        <Icon size={14} aria-hidden />
        <span className="cv-node-title">{TITLES[type]}</span>
        <button type="button" className="cv-x nodrag" title="Remove node" aria-label="Remove node" onClick={() => remove(id)}>
          <X size={13} />
        </button>
      </header>
      <div className="cv-node-body">{children}</div>
      {out ? <Handle type="source" position={Position.Right} id="out" className={`cv-handle is-${out}`} style={{ top: 21 }} title={`Passes on ${out === 'text' ? 'its text' : out === 'video' ? 'a video' : 'a picture'}`} /> : null}
    </div>
  )
}

/** One input row: the handle on the card's edge, its name, and what is plugged in. */
function Port({ type, handle, children }: { type: NodeType; handle: InputHandle; children?: ReactNode }) {
  const port = INPUTS[type][handle]
  if (!port) return null
  const kind: Kind = port.accepts.length > 1 ? 'image' : port.accepts[0]!
  return (
    <div className="cv-port">
      <Handle type="target" position={Position.Left} id={handle} className={`cv-handle is-${port.accepts.length > 1 ? 'media' : kind}`} />
      <span className="cv-port-label">{port.label}</span>
      <span className="cv-port-info">{children}</span>
    </div>
  )
}

/* ---------- shared bits ---------- */

function Media({ output, onOpen, big }: { output: { url: string; kind: 'image' | 'video' }; onOpen?: () => void; big?: boolean }) {
  const media =
    output.kind === 'video' ? (
      <video src={output.url} muted loop playsInline controls={big} preload="metadata" onMouseEnter={(e) => !big && void e.currentTarget.play().catch(() => {})} onMouseLeave={(e) => !big && e.currentTarget.pause()} />
    ) : (
      <img src={output.url} alt="" loading="lazy" />
    )
  if (!onOpen || (big && output.kind === 'video')) return <div className={`cv-media${big ? ' is-big' : ''}`}>{media}</div>
  return (
    <button type="button" className={`cv-media nodrag${big ? ' is-big' : ''}`} onClick={onOpen} title="Open">
      {media}
    </button>
  )
}

/** Open a result in Studio's viewer when history has it, else in a new tab. */
function useOpen(output: NodeOutput | { url: string } | undefined, taskId?: string) {
  const { history } = useCanvas()
  return () => {
    const item = historyFor(history, taskId)
    if (item) openViewer(item, [item])
    else if (output?.url) window.open(output.url, '_blank', 'noopener')
  }
}

function StatusLine({ id, data }: { id: string; data: NodeData }) {
  const { jobs, history, sending, run } = useCanvas()
  const job = jobFor(jobs, data)
  const failed = historyFor(history, data.taskId)
  const status = statusOf(data, job, failed?.state === 'fail' ? failed.failMsg || 'Kie reported a failure.' : undefined)
  const uploading = sending.has(id)
  const live = uploading || status.state === 'sending' || status.state === 'running'
  useTick(status.state === 'running')
  const badge = uploading ? (
    <span className="pl-badge pl-badge--info">
      <Loader2 size={12} className="st-spin" /> Preparing…
    </span>
  ) : status.state === 'sending' ? (
    <span className="pl-badge pl-badge--info">
      <Loader2 size={12} className="st-spin" /> Sending…
    </span>
  ) : status.state === 'running' ? (
    <span className="pl-badge pl-badge--info">
      <Loader2 size={12} className="st-spin" /> Generating {clock((Date.now() - status.startedAt) / 1000)}
      {typeof status.progress === 'number' && status.progress > 0 && status.progress < 1 ? ` · ${Math.round(status.progress * 100)}%` : ''}
    </span>
  ) : status.state === 'done' ? (
    <span className="pl-badge pl-badge--ok">Done</span>
  ) : status.state === 'failed' ? (
    <span className="pl-badge pl-badge--bad">Failed</span>
  ) : status.state === 'interrupted' ? (
    <span className="pl-badge pl-badge--warn">Interrupted — run again</span>
  ) : (
    <span className="pl-badge pl-badge--quiet">Not run yet</span>
  )
  const label = status.state === 'failed' || status.state === 'interrupted' ? 'Retry' : status.state === 'done' ? 'Run again' : 'Run'
  return (
    <>
      <div className="cv-run">
        {badge}
        <button type="button" className="plinth-btn plinth-btn--sm nodrag" aria-disabled={live} disabled={live} onClick={() => run(id)}>
          <span className="plinth-btn__face">
            <Play className="plinth-btn__icon" aria-hidden />
            <span className="plinth-btn__label">{label}</span>
          </span>
        </button>
      </div>
      {status.state === 'failed' ? (
        <p className="cv-msg is-bad">
          <AlertTriangle size={13} aria-hidden /> {status.error}
        </p>
      ) : null}
      {data.note && !live ? <p className="cv-msg">{data.note}</p> : null}
      {status.state === 'done' && !data.output ? <p className="cv-msg">Finished, but Kie sent no file back.</p> : null}
    </>
  )
}

function Result({ data }: { data: NodeData }) {
  const open = useOpen(data.output, data.taskId)
  return data.output ? <Media output={data.output} onOpen={open} /> : null
}

/** Model family picker over the given families (generators only — tools never show here). */
function FamilyPick({ families, family, onPick }: { families: Family[]; family: Family | null; onPick: (key: string) => void }) {
  if (!families.length) return <p className="cv-msg">Loading models…</p>
  return (
    <label className="cv-field">
      <span>Model</span>
      <select className="studio-input cv-select nodrag" value={family?.key ?? ''} onChange={(e) => onPick(e.target.value)}>
        {families.map((f) => (
          <option key={f.key} value={f.key}>
            {f.title} · {familyAbility(f)}
          </option>
        ))}
      </select>
    </label>
  )
}

/** A select for one of the pill settings, or nothing when this model has no such setting. */
function SettingPick({ label, choices, value, onPick }: { label: string; choices: { value: string; label: string }[]; value?: string; onPick: (v: string | undefined) => void }) {
  if (!choices.length) return null
  const shown = value && choices.some((c) => c.value === value) ? value : ''
  return (
    <label className="cv-field">
      <span>{label}</span>
      <select className="studio-input cv-select nodrag" value={shown} onChange={(e) => onPick(e.target.value || undefined)}>
        <option value="">Model default</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    </label>
  )
}

function InlinePrompt({ id, data, from }: { id: string; data: NodeData; from: 'edge' | 'inline' }) {
  const { patch } = useCanvas()
  if (from === 'edge') return null
  return (
    <textarea
      className="studio-input cv-text nodrag nowheel"
      rows={3}
      placeholder="Describe what to make, or connect a Prompt node"
      value={data.text ?? ''}
      onChange={(e) => patch(id, { text: e.target.value })}
    />
  )
}

/* ---------- the nodes ---------- */

type P = NodeProps & { data: NodeData }

function PromptNode({ id, data, selected }: P) {
  const { patch } = useCanvas()
  return (
    <Card id={id} type="prompt" selected={selected}>
      <textarea className="studio-input cv-text nodrag nowheel" rows={5} placeholder="Write the prompt. Connect it to any number of generators." value={data.text ?? ''} onChange={(e) => patch(id, { text: e.target.value })} />
      <p className="cv-hint">{(data.text ?? '').trim().length} characters</p>
    </Card>
  )
}

function ImageNode({ id, data, selected }: P) {
  const { patch } = useCanvas()
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const value = valueOf({ id, type: 'image', position: { x: 0, y: 0 }, data })

  const upload = async (f: File | undefined) => {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      patch(id, { note: 'That file isn’t a picture.' })
      return
    }
    setBusy(true)
    const preview = URL.createObjectURL(f)
    try {
      const res = (await uploadMedia(f)) as { fileUrl: string; expiresAt?: string | number }
      const exp = typeof res.expiresAt === 'number' ? res.expiresAt : res.expiresAt ? Date.parse(res.expiresAt) : NaN
      patch(id, { image: { hosted: res.fileUrl, preview, display: res.fileUrl, name: f.name, expiresAt: Number.isFinite(exp) ? exp : undefined }, note: undefined })
    } catch (e) {
      URL.revokeObjectURL(preview)
      patch(id, { note: `Upload failed: ${(e as Error).message}` })
    } finally {
      setBusy(false)
    }
  }

  const onDrop = (e: DragEvent) => {
    if (!e.dataTransfer.files.length) return
    e.preventDefault()
    e.stopPropagation()
    void upload(e.dataTransfer.files[0])
  }

  return (
    <Card id={id} type="image" selected={selected}>
      <div className="cv-drop" onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()} onDrop={onDrop}>
        {value && value.kind !== 'text' ? <Media output={{ url: value.url, kind: 'image' }} /> : <p className="cv-hint">Drop a picture here, upload one, or pick from your work.</p>}
      </div>
      <div className="cv-actions">
        <button type="button" className="st-pill nodrag" disabled={busy} onClick={() => file.current?.click()}>
          {busy ? <Loader2 size={13} className="st-spin" /> : <Upload size={13} />} {busy ? 'Uploading…' : 'Upload'}
        </button>
        <span className="cv-pick-wrap nodrag nowheel">
          <button type="button" className="st-pill" onClick={() => setPicking((v) => !v)}>
            <History size={13} /> From history
          </button>
          {picking ? (
            <MentionPicker
              model={null}
              kind="image"
              placement="down"
              refs={[]}
              onClose={() => setPicking(false)}
              onPick={({ media }) => {
                setPicking(false)
                patch(id, { image: { media, display: mediaUrl(media) }, note: undefined })
              }}
            />
          ) : null}
        </span>
        {data.image ? (
          <button type="button" className="st-pill is-icon nodrag" title="Clear picture" aria-label="Clear picture" onClick={() => patch(id, { image: undefined })}>
            <X size={14} />
          </button>
        ) : null}
      </div>
      {data.image?.hosted && !data.image.media && data.image.expiresAt && data.image.expiresAt < Date.now() ? <p className="cv-msg is-bad">This upload has expired on Kie — upload the picture again.</p> : null}
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => void upload(e.target.files?.[0] ?? undefined).finally(() => (e.target.value = ''))} />
      {data.note ? <p className="cv-msg">{data.note}</p> : null}
    </Card>
  )
}

/** What the Generate image and Generate video cards share: inputs, model, settings, run. */
function GenNode({ id, data, selected, type }: P & { type: 'genImage' | 'genVideo' }) {
  const ctx = useCanvas()
  const category = type === 'genVideo' ? 'video' : 'image'
  const families = ctx.families[category]
  const inputs = useMemo(() => resolveInputs(ctx.board.nodes, ctx.board.edges, id), [ctx.board, id])
  const wired = ctx.board.edges.filter((e) => e.target === id && e.targetHandle === 'image').length
  const family = pickFamily(families, data.familyKey, category)
  const variant = family ? variantFor(family, { image: wired }, data.modelId) : null
  const controls = controlsFor(variant)
  const promptInfo = inputs.promptFrom === 'edge' ? (inputs.prompt.trim() ? `“${inputs.prompt.trim().slice(0, 40)}${inputs.prompt.trim().length > 40 ? '…' : ''}”` : 'connected, empty') : 'typed below'
  const imageInfo = type === 'genVideo' ? (wired ? 'connected' : 'none — text to video') : wired ? `${wired} connected` : 'none — text only'
  return (
    <Card id={id} type={type} selected={selected}>
      <Port type={type} handle="prompt">
        {promptInfo}
      </Port>
      <Port type={type} handle="image">
        {imageInfo}
      </Port>
      <FamilyPick families={families} family={family} onPick={(key) => ctx.patch(id, { familyKey: key, modelId: undefined })} />
      {variant && family && family.members.length > 1 ? <p className="cv-hint">Runs as {variant.title}</p> : null}
      <div className="cv-row">
        <SettingPick label="Aspect" choices={controls.aspect?.choices ?? []} value={data.aspect} onPick={(v) => ctx.patch(id, { aspect: v })} />
        {type === 'genVideo' ? <SettingPick label="Length" choices={controls.duration?.choices ?? []} value={data.duration} onPick={(v) => ctx.patch(id, { duration: v })} /> : null}
      </div>
      <InlinePrompt id={id} data={data} from={inputs.promptFrom} />
      <StatusLine id={id} data={data} />
      <Result data={data} />
    </Card>
  )
}

const GenImageNode = (p: P) => <GenNode {...p} type="genImage" />
const GenVideoNode = (p: P) => <GenNode {...p} type="genVideo" />

const UPSCALE_CHOICES = [
  { value: 'topaz-2', label: 'Topaz ×2', data: { upscaler: 'topaz', factor: '2' } },
  { value: 'topaz-4', label: 'Topaz ×4', data: { upscaler: 'topaz', factor: '4' } },
  { value: 'recraft', label: 'Recraft crisp', data: { upscaler: 'recraft' } },
] as const

function UpscaleNode({ id, data, selected }: P) {
  const ctx = useCanvas()
  const wired = ctx.board.edges.some((e) => e.target === id && e.targetHandle === 'image')
  const value = data.upscaler === 'recraft' ? 'recraft' : `topaz-${data.factor ?? '2'}`
  return (
    <Card id={id} type="upscale" selected={selected}>
      <Port type="upscale" handle="image">
        {wired ? 'connected' : 'connect a picture'}
      </Port>
      <label className="cv-field">
        <span>Upscaler</span>
        <select
          className="studio-input cv-select nodrag"
          value={value}
          onChange={(e) => {
            const hit = UPSCALE_CHOICES.find((c) => c.value === e.target.value)
            if (hit) ctx.patch(id, { ...hit.data })
          }}
        >
          {UPSCALE_CHOICES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <StatusLine id={id} data={data} />
      <Result data={data} />
    </Card>
  )
}

function OutputNode({ id, selected }: P) {
  const ctx = useCanvas()
  const inputs = useMemo(() => resolveInputs(ctx.board.nodes, ctx.board.edges, id), [ctx.board, id])
  const source: CanvasNode | undefined = ctx.board.nodes.find((n) => n.id === (inputs.media?.from ?? inputs.waiting[0]))
  const media = inputs.media
  const open = useOpen(media ?? undefined, source?.data.taskId)
  const item = historyFor(ctx.history, source?.data.taskId)
  return (
    <Card id={id} type="output" selected={selected} wide>
      <Port type="output" handle="media">
        {media ? (media.kind === 'video' ? 'a video' : 'a picture') : source ? 'waiting for a result' : 'connect a result'}
      </Port>
      {media ? (
        <>
          <Media output={media} onOpen={open} big />
          <div className="cv-actions">
            {item ? (
              <button type="button" className="st-pill nodrag" onClick={() => openViewer(item, [item])}>
                <Expand size={13} /> View
              </button>
            ) : null}
            <a className="st-pill nodrag" href={media.url} target="_blank" rel="noreferrer">
              <ExternalLink size={13} /> Open
            </a>
            <a className="st-pill nodrag" href={media.url} download>
              <Download size={13} /> Download
            </a>
          </div>
        </>
      ) : (
        <div className="cv-empty">{source ? `Run ${TITLES[source.type]} to see its result here.` : 'Connect any picture or video to show it large.'}</div>
      )}
    </Card>
  )
}

export const nodeTypes = {
  prompt: PromptNode,
  image: ImageNode,
  genImage: GenImageNode,
  genVideo: GenVideoNode,
  upscale: UpscaleNode,
  output: OutputNode,
}
