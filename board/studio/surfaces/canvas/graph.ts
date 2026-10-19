/**
 * Canvas rules, kept pure so they can be tested without React, xyflow or Kie.
 *
 * the reference app's Canvas chains generations: a prompt and a picture feed a generator, its
 * result feeds an upscaler or a video. Everything that decides what may connect to what,
 * what reaches a node when it runs, which order "Run all" goes in, and how a board
 * survives a reload lives here; the surface and its nodes are only views over it.
 * Nothing in this file talks to the server or spends credits.
 */
import type { FieldSchema, MediaAsset, ModelDefinition } from '../../api.ts'
import type { Family } from '../../families.ts'

/* ---------- the pieces ---------- */

export type NodeType = 'prompt' | 'image' | 'genImage' | 'genVideo' | 'upscale' | 'output'
/** What an edge carries. */
export type Kind = 'text' | 'image' | 'video'
export type InputHandle = 'prompt' | 'image' | 'media'
export const OUT = 'out'

export type Upscaler = 'topaz' | 'recraft'

/** A finished result a node hands on: what to show, and the asset to re-host for Kie. */
export type NodeOutput = { url: string; kind: 'image' | 'video'; media?: MediaAsset }

/**
 * A picture put on the board by hand: an upload (already on Kie, `hosted`, until
 * `expiresAt`) or something from history (`media`, re-hosted right before each run).
 * `preview` is a local object URL for an upload, good for this session only.
 */
export type ImageSource = { hosted?: string; media?: MediaAsset; preview?: string; display?: string; name?: string; expiresAt?: number }

export type NodeData = {
  /** A Prompt node's text, or a generator's own prompt when nothing is connected. */
  text?: string
  familyKey?: string
  /** A member picked by hand inside the family (kept while it still fits). */
  modelId?: string
  aspect?: string
  duration?: string
  upscaler?: Upscaler
  factor?: '2' | '4'
  image?: ImageSource
  /** The local job id from jobs.ts, and Kie's task id once it has one (survives reload). */
  jobId?: string
  taskId?: string
  output?: NodeOutput
  /** The last plain-words reason a run was refused. */
  note?: string
}

export type XY = { x: number; y: number }

export type CanvasNode = {
  id: string
  type: NodeType
  position: XY
  data: NodeData
  // xyflow's own bookkeeping; carried in memory, never saved.
  selected?: boolean
  dragging?: boolean
  measured?: { width?: number; height?: number }
}

export type CanvasEdge = {
  id: string
  source: string
  target: string
  sourceHandle: typeof OUT
  targetHandle: InputHandle
  selected?: boolean
}

export type Board = { id: string; name: string; nodes: CanvasNode[]; edges: CanvasEdge[]; updatedAt: number }
export type Boards = { v: 1; activeId: string; boards: Board[] }

export type Connection = { source: string | null; sourceHandle?: string | null; target: string | null; targetHandle?: string | null }

export const TITLES: Record<NodeType, string> = {
  prompt: 'Prompt',
  image: 'Image',
  genImage: 'Generate image',
  genVideo: 'Generate video',
  upscale: 'Upscale',
  output: 'Output',
}

export const NODE_TYPES = Object.keys(TITLES) as NodeType[]

/** What each node puts out on its `out` handle. */
export const OUTPUT_KIND: Record<NodeType, Kind | null> = {
  prompt: 'text',
  image: 'image',
  genImage: 'image',
  genVideo: 'video',
  upscale: 'image',
  output: null,
}

type Port = { accepts: Kind[]; many: boolean; label: string }

/** The inputs each node has. A generator takes any number of references; a first frame, one. */
export const INPUTS: Record<NodeType, Partial<Record<InputHandle, Port>>> = {
  prompt: {},
  image: {},
  genImage: { prompt: { accepts: ['text'], many: false, label: 'Prompt' }, image: { accepts: ['image'], many: true, label: 'References' } },
  genVideo: { prompt: { accepts: ['text'], many: false, label: 'Prompt' }, image: { accepts: ['image'], many: false, label: 'First frame' } },
  upscale: { image: { accepts: ['image'], many: false, label: 'Image' } },
  output: { media: { accepts: ['image', 'video'], many: false, label: 'Media' } },
}

export const isRunnable = (t: NodeType) => t === 'genImage' || t === 'genVideo' || t === 'upscale'

export const isNodeType = (v: unknown): v is NodeType => typeof v === 'string' && (NODE_TYPES as string[]).includes(v)

const isHandle = (v: unknown): v is InputHandle => v === 'prompt' || v === 'image' || v === 'media'

/* ---------- connecting ---------- */

const KIND_WORDS: Record<Kind, string> = { text: 'A prompt', image: 'A picture', video: 'A video' }

/** Everything upstream of a node (not including it). */
export function ancestorsOf(edges: CanvasEdge[], id: string): Set<string> {
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const cur = stack.pop()!
    for (const e of edges) {
      if (e.target !== cur || seen.has(e.source)) continue
      seen.add(e.source)
      stack.push(e.source)
    }
  }
  return seen
}

/** Why this connection can't be made, in plain words, or null when it can. */
export function checkConnection(nodes: CanvasNode[], edges: CanvasEdge[], c: Connection): string | null {
  const from = nodes.find((n) => n.id === c.source)
  const to = nodes.find((n) => n.id === c.target)
  if (!from || !to) return 'That node is gone.'
  if (from.id === to.id) return 'A node can’t feed itself.'
  const kind = OUTPUT_KIND[from.type]
  if (!kind || (c.sourceHandle ?? OUT) !== OUT) return `${TITLES[from.type]} has nothing to pass on.`
  const handle = c.targetHandle
  const port = isHandle(handle) ? INPUTS[to.type][handle] : undefined
  if (!port) return `${TITLES[to.type]} has no input there.`
  if (!port.accepts.includes(kind)) {
    if (kind === 'video') return 'A video can only go into an Output node.'
    if (kind === 'text') return 'A prompt can only go into a Prompt input.'
    return `${KIND_WORDS[kind]} can’t go into ${port.label}.`
  }
  if (edges.some((e) => e.source === from.id && e.target === to.id && e.targetHandle === handle)) return 'Those two are already connected.'
  // A node that already feeds the source would feed itself through this edge.
  if (ancestorsOf(edges, from.id).has(to.id)) return 'That would make a loop.'
  return null
}

/**
 * Add a connection. A single input (prompt, first frame, an upscaler's image, an
 * output) holds one edge, so a new one replaces whatever was plugged in there.
 */
export function connect(nodes: CanvasNode[], edges: CanvasEdge[], c: Connection): { edges: CanvasEdge[]; error: string | null } {
  const error = checkConnection(nodes, edges, c)
  if (error) return { edges, error }
  const to = nodes.find((n) => n.id === c.target)!
  const handle = c.targetHandle as InputHandle
  const port = INPUTS[to.type][handle]!
  const kept = port.many ? edges : edges.filter((e) => !(e.target === to.id && e.targetHandle === handle))
  const edge: CanvasEdge = { id: `e-${c.source}-${c.target}-${handle}`, source: c.source!, target: to.id, sourceHandle: OUT, targetHandle: handle }
  return { edges: [...kept, edge], error: null }
}

/** What an edge carries, for its colour. */
export const edgeKind = (nodes: CanvasNode[], e: CanvasEdge): Kind | null => {
  const from = nodes.find((n) => n.id === e.source)
  return from ? OUTPUT_KIND[from.type] : null
}

/** Drop edges that point nowhere or break the rules (old saves, hand-edited storage). */
export function sanitiseEdges(nodes: CanvasNode[], edges: CanvasEdge[]): CanvasEdge[] {
  let out: CanvasEdge[] = []
  for (const e of edges) {
    const next = connect(nodes, out, e)
    if (!next.error) out = next.edges
  }
  return out
}

/* ---------- order ---------- */

/**
 * Kahn's algorithm, stable in board order. A loop can't be drawn through `connect`, but
 * a corrupt save could hold one, so it is reported rather than assumed away.
 */
export function topoOrder(nodes: CanvasNode[], edges: CanvasEdge[]): { order: string[]; cycle: string[] | null } {
  const ids = nodes.map((n) => n.id)
  const known = new Set(ids)
  const live = edges.filter((e) => known.has(e.source) && known.has(e.target))
  const indegree = new Map(ids.map((id) => [id, 0]))
  for (const e of live) indegree.set(e.target, (indegree.get(e.target) ?? 0) + 1)
  const order: string[] = []
  const ready = ids.filter((id) => indegree.get(id) === 0)
  while (ready.length) {
    const id = ready.shift()!
    order.push(id)
    for (const e of live) {
      if (e.source !== id) continue
      const d = (indegree.get(e.target) ?? 0) - 1
      indegree.set(e.target, d)
      if (d === 0) {
        // Keep board order among the nodes that just became ready.
        const at = ready.findIndex((r) => ids.indexOf(r) > ids.indexOf(e.target))
        if (at === -1) ready.push(e.target)
        else ready.splice(at, 0, e.target)
      }
    }
  }
  if (order.length === ids.length) return { order, cycle: null }
  return { order, cycle: ids.filter((id) => !order.includes(id)) }
}

/* ---------- what reaches a node ---------- */

/** A picture or clip on its way into a node: what to show, and how to get it to Kie. */
export type MediaValue = {
  from: string
  kind: 'image' | 'video'
  url: string
  /** Already on Kie (an upload); used as-is unless expired. */
  hosted?: string
  expiresAt?: number
  /** A past or fresh result; re-hosted right before the run. */
  media?: MediaAsset
}

export type Inputs = {
  prompt: string
  promptFrom: 'edge' | 'inline'
  promptNode?: string
  images: MediaValue[]
  media: MediaValue | null
  /** Upstream nodes that have nothing to hand on yet. */
  waiting: string[]
}

/** What a node hands on right now, or null when it has nothing yet. */
export function valueOf(node: CanvasNode): { kind: 'text'; text: string } | Omit<MediaValue, 'from'> | null {
  const d = node.data
  if (node.type === 'prompt') return d.text?.trim() ? { kind: 'text', text: d.text } : null
  if (node.type === 'image') {
    const img = d.image
    const url = img?.preview || img?.display || img?.hosted
    if (!img || !url || (!img.hosted && !img.media)) return null
    return { kind: 'image', url, hosted: img.hosted, expiresAt: img.expiresAt, media: img.media }
  }
  if (node.type === 'output') return null
  return d.output?.url ? { kind: d.output.kind, url: d.output.url, media: d.output.media } : null
}

/** Gather a node's inputs from its incoming edges (in the order they were connected). */
export function resolveInputs(nodes: CanvasNode[], edges: CanvasEdge[], id: string): Inputs {
  const node = nodes.find((n) => n.id === id)
  const out: Inputs = { prompt: node?.data.text ?? '', promptFrom: 'inline', images: [], media: null, waiting: [] }
  if (!node) return out
  for (const e of edges) {
    if (e.target !== id) continue
    const from = nodes.find((n) => n.id === e.source)
    if (!from) continue
    const v = valueOf(from)
    if (e.targetHandle === 'prompt') {
      out.promptFrom = 'edge'
      out.promptNode = from.id
      out.prompt = v?.kind === 'text' ? v.text : ''
      if (!v) out.waiting.push(from.id)
      continue
    }
    if (!v) {
      out.waiting.push(from.id)
      continue
    }
    if (v.kind === 'text') continue
    const mv: MediaValue = { from: from.id, ...v }
    if (e.targetHandle === 'image' && v.kind === 'image') out.images.push(mv)
    if (e.targetHandle === 'media') out.media = mv
  }
  // One first frame / one image is all those inputs hold, even from an old save.
  if (!INPUTS[node.type].image?.many) out.images = out.images.slice(0, 1)
  return out
}

const nameOf = (nodes: CanvasNode[], id: string) => {
  const n = nodes.find((x) => x.id === id)
  return n ? TITLES[n.type] : 'a node'
}

/**
 * Why a node can't run from what reaches it, in plain words, or null. The model-specific
 * checks (a picture-only model with no picture, a required field) come later, once the
 * model is known.
 */
export function graphBlocker(nodes: CanvasNode[], edges: CanvasEdge[], id: string, now = Date.now()): string | null {
  const node = nodes.find((n) => n.id === id)
  if (!node) return 'That node is gone.'
  if (!isRunnable(node.type)) return `${TITLES[node.type]} doesn’t run on its own.`
  const inputs = resolveInputs(nodes, edges, id)
  if (inputs.waiting.length) {
    const first = nodes.find((n) => n.id === inputs.waiting[0])
    if (first?.type === 'prompt') return 'The connected Prompt is empty — write something in it first.'
    if (first?.type === 'image') return 'The connected Image node has no picture yet — upload or pick one.'
    const names = [...new Set(inputs.waiting.map((w) => nameOf(nodes, w)))].join(', ')
    return `Waiting on ${names} — run ${inputs.waiting.length > 1 ? 'them' : 'it'} first, it has no result yet.`
  }
  const expired = inputs.images.find((v) => v.hosted && !v.media && v.expiresAt && v.expiresAt < now)
  if (expired) return 'An uploaded picture has expired on Kie — upload it again in its Image node.'
  if (node.type === 'upscale' && !inputs.images.length) return 'Connect a picture to upscale.'
  return null
}

/* ---------- picking the model ---------- */

/** House defaults (the working models), then the first family. */
const HOUSE: Record<'image' | 'video', RegExp> = {
  image: /^gpt-image-2-text-to-image$/,
  video: /^google\/gemini-omni-flash-1-1$/,
}

export function pickFamily(families: Family[], key: string | undefined, category: 'image' | 'video'): Family | null {
  if (!families.length) return null
  return families.find((f) => f.key === key) ?? families.find((f) => f.members.some((m) => HOUSE[category].test(m.id))) ?? families[0] ?? null
}

/** The catalogue ids behind the Upscale node. */
export const UPSCALERS: Record<Upscaler, { id: string; title: string }> = {
  topaz: { id: 'topaz/image-upscale', title: 'Topaz' },
  recraft: { id: 'recraft/crisp-upscale', title: 'Recraft crisp' },
}

/**
 * The field a first frame belongs in. Video models name it every way there is, and some
 * (Gemini Omni Flash) list a references field before it — the general routing would put
 * the frame there, so the frame field is targeted by name when there is one.
 */
export function firstFrameField(model: ModelDefinition): FieldSchema | null {
  const refs = model.fields.filter((f) => f.type === 'reference')
  return refs.find((f) => /first.?frame|start.?(frame|image)/i.test(f.name)) ?? null
}

/* ---------- boards ---------- */

export const STORAGE_KEY = 'studio.canvas.v1'

export const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function makeNode(type: NodeType, position: XY, id = makeId(type)): CanvasNode {
  const data: NodeData = {}
  if (type === 'upscale') {
    data.upscaler = 'topaz'
    data.factor = '2'
  }
  return { id, type, position, data }
}

/** A new board opens on the chain most people start with: prompt → image → output. */
export function newBoard(name: string, id = makeId('board')): Board {
  const p = makeNode('prompt', { x: 0, y: 40 }, `${id}-p`)
  const g = makeNode('genImage', { x: 340, y: 0 }, `${id}-g`)
  const o = makeNode('output', { x: 680, y: 0 }, `${id}-o`)
  return {
    id,
    name,
    nodes: [p, g, o],
    edges: [
      { id: `e-${p.id}-${g.id}-prompt`, source: p.id, target: g.id, sourceHandle: OUT, targetHandle: 'prompt' },
      { id: `e-${g.id}-${o.id}-media`, source: g.id, target: o.id, sourceHandle: OUT, targetHandle: 'media' },
    ],
    updatedAt: Date.now(),
  }
}

/** "Board 2", "Board 3"… the first name not taken. */
export function uniqueName(boards: Board[], base = 'Board'): string {
  const taken = new Set(boards.map((b) => b.name.trim().toLowerCase()))
  if (!taken.has(base.toLowerCase())) return base
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`
}

export const freshBoards = (): Boards => {
  const b = newBoard('Board 1')
  return { v: 1, activeId: b.id, boards: [b] }
}

export function removeNodes(board: Board, ids: string[]): Board {
  const gone = new Set(ids)
  return { ...board, nodes: board.nodes.filter((n) => !gone.has(n.id)), edges: board.edges.filter((e) => !gone.has(e.source) && !gone.has(e.target)) }
}

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)

function readMedia(v: unknown): MediaAsset | undefined {
  const m = obj(v)
  if (!m) return undefined
  const kind = m.kind === 'video' || m.kind === 'audio' || m.kind === 'image' ? m.kind : undefined
  if (!kind || (!str(m.url) && !str(m.localPath))) return undefined
  return m as unknown as MediaAsset
}

/** One saved node's data, keeping only fields of the right type. */
function readData(v: unknown): NodeData {
  const d = obj(v) ?? {}
  const out: NodeData = {}
  for (const k of ['text', 'familyKey', 'modelId', 'aspect', 'duration', 'jobId', 'taskId', 'note'] as const) {
    const s = str(d[k])
    if (s !== undefined) out[k] = s
  }
  if (d.upscaler === 'topaz' || d.upscaler === 'recraft') out.upscaler = d.upscaler
  if (d.factor === '2' || d.factor === '4') out.factor = d.factor
  const img = obj(d.image)
  if (img) {
    const media = readMedia(img.media)
    const image: ImageSource = { hosted: str(img.hosted), media, display: str(img.display), name: str(img.name), expiresAt: num(img.expiresAt) }
    // A blob: URL died with the page that made it.
    const preview = str(img.preview)
    if (preview && !preview.startsWith('blob:')) image.preview = preview
    if (image.hosted || image.media) out.image = image
  }
  const o = obj(d.output)
  if (o && str(o.url) && (o.kind === 'image' || o.kind === 'video')) out.output = { url: o.url as string, kind: o.kind, media: readMedia(o.media) }
  return out
}

function readBoard(v: unknown, index: number): Board | null {
  const b = obj(v)
  if (!b) return null
  const id = str(b.id) || makeId('board')
  const nodes: CanvasNode[] = []
  const seen = new Set<string>()
  for (const raw of Array.isArray(b.nodes) ? b.nodes : []) {
    const n = obj(raw)
    if (!n || !isNodeType(n.type)) continue
    const nid = str(n.id)
    if (!nid || seen.has(nid)) continue
    seen.add(nid)
    const p = obj(n.position)
    const position = { x: num(p?.x) ?? 0, y: num(p?.y) ?? 0 }
    nodes.push({ id: nid, type: n.type, position, data: readData(n.data) })
  }
  const edges: CanvasEdge[] = []
  for (const raw of Array.isArray(b.edges) ? b.edges : []) {
    const e = obj(raw)
    const source = str(e?.source)
    const target = str(e?.target)
    if (!e || !source || !target || !isHandle(e.targetHandle)) continue
    edges.push({ id: str(e.id) || `e-${source}-${target}-${e.targetHandle}`, source, target, sourceHandle: OUT, targetHandle: e.targetHandle })
  }
  const name = str(b.name)?.trim() || `Board ${index + 1}`
  return { id, name, nodes, edges: sanitiseEdges(nodes, edges), updatedAt: num(b.updatedAt) ?? 0 }
}

/**
 * Read saved boards. Anything unreadable — no storage, bad JSON, a half-written value,
 * an older shape — degrades to what can be kept, and never to an empty list.
 */
export function parseBoards(raw: string | null | undefined): Boards {
  if (!raw) return freshBoards()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return freshBoards()
  }
  const root = obj(parsed)
  const list = Array.isArray(root?.boards) ? root.boards : []
  const boards: Board[] = []
  const ids = new Set<string>()
  list.forEach((b, i) => {
    const board = readBoard(b, i)
    if (!board) return
    if (ids.has(board.id)) board.id = makeId('board')
    ids.add(board.id)
    boards.push(board)
  })
  if (!boards.length) return freshBoards()
  const active = str(root?.activeId)
  return { v: 1, activeId: boards.some((b) => b.id === active) ? active! : boards[0]!.id, boards }
}

/** The saved form: positions and data only, none of xyflow's in-memory state. */
export function serialiseBoards(state: Boards): string {
  const boards = state.boards.map((b) => ({
    id: b.id,
    name: b.name,
    updatedAt: b.updatedAt,
    nodes: b.nodes.map((n) => {
      const data: NodeData = { ...n.data }
      if (data.image?.preview?.startsWith('blob:')) data.image = { ...data.image, preview: undefined }
      return { id: n.id, type: n.type, position: { x: Math.round(n.position.x), y: Math.round(n.position.y) }, data }
    }),
    edges: b.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, sourceHandle: e.sourceHandle, targetHandle: e.targetHandle })),
  }))
  return JSON.stringify({ v: 1, activeId: state.activeId, boards })
}

/* ---------- status ---------- */

/** The bits of a jobs.ts Job the status needs. */
export type JobLike = { status: 'submitting' | 'running' | 'done' | 'error'; error?: string; startedAt: number; progress?: number }

export type NodeStatus =
  | { state: 'idle' }
  | { state: 'sending' }
  | { state: 'running'; startedAt: number; progress?: number }
  | { state: 'done' }
  | { state: 'failed'; error: string }
  | { state: 'interrupted' }

/**
 * What a runnable node shows. A job id this page no longer knows (the page was reloaded
 * and the job is not in the resumed queue) with no result means the run was lost.
 */
export function statusOf(data: NodeData, job: JobLike | undefined, failedInHistory?: string): NodeStatus {
  if (job) {
    if (job.status === 'submitting') return { state: 'sending' }
    if (job.status === 'running') return { state: 'running', startedAt: job.startedAt, progress: job.progress }
    if (job.status === 'error') return { state: 'failed', error: job.error || 'Kie reported a failure.' }
    return { state: 'done' }
  }
  if (data.output) return { state: 'done' }
  if (failedInHistory) return { state: 'failed', error: failedInHistory }
  if (data.jobId || data.taskId) return { state: 'interrupted' }
  return { state: 'idle' }
}

/** "0:23", "1:05" — the clock on a running node. */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
