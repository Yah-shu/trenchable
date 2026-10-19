/**
 * Running Canvas nodes: from what is wired in to a job in the shared queue.
 *
 * A node's Run reads its inputs off the board (graph.ts), refuses in plain words when
 * something is missing, re-hosts every picture for Kie right before sending (uploads and
 * provider URLs expire, our archive is unreachable for Kie), maps the lot onto the chosen
 * model's real fields with `buildInput`, and submits through jobs.ts so the job keeps
 * going while you leave the surface. "Run all" walks the board in dependency order and
 * waits for each node's upstream jobs before sending it.
 */
import { buildInput, mediaUrl, type Intent, type ModelDefinition, type Ref } from '../../api.ts'
import { controlsFor, carryOver, pillValue } from '../../controls.ts'
import { accepts, familiesOf, needsImage, variantFor } from '../../families.ts'
import { missingFields, promptFieldOf } from '../../generator.ts'
import { getJob, isActive, onJobFinished, submitJob, type Job } from '../../jobs.ts'
import { hostForKie } from '../../mentions.ts'
import {
  firstFrameField,
  graphBlocker,
  isRunnable,
  pickFamily,
  resolveInputs,
  topoOrder,
  TITLES,
  UPSCALERS,
  type Board,
  type CanvasNode,
  type MediaValue,
  type NodeData,
  type NodeOutput,
} from './graph.ts'

export interface RunEnv {
  /** The whole catalogue (all categories), or null while it loads. */
  models: ModelDefinition[] | null
  /** The board as it is right now — read fresh at every step, never captured. */
  board: () => Board
  patch: (nodeId: string, data: Partial<NodeData>) => void
  /** Told when a node starts and stops preparing (checks, picture uploads) before its job exists. */
  sending?: (nodeId: string, on: boolean) => void
}

export type RunResult = { jobId: string } | { error: string }

/** The model a node will run with for what is wired in. Null with a reason when there is none. */
export function modelFor(node: CanvasNode, models: ModelDefinition[], images: number): { model: ModelDefinition; title: string } | { error: string } {
  if (node.type === 'upscale') {
    const which = UPSCALERS[node.data.upscaler ?? 'topaz']
    const model = models.find((m) => m.id === which.id)
    return model ? { model, title: which.title } : { error: `The ${which.title} upscaler isn’t in the catalogue right now.` }
  }
  const category = node.type === 'genVideo' ? 'video' : 'image'
  const family = pickFamily(familiesOf(models.filter((m) => m.category === category)), node.data.familyKey, category)
  if (!family) return { error: `No ${category} models are available.` }
  return { model: variantFor(family, { image: images }, node.data.modelId), title: family.title }
}

/** The pill-backed settings (aspect, duration) as field values for this model. */
function settingValues(node: CanvasNode, model: ModelDefinition): { values: Record<string, unknown>; aspect?: string } {
  const controls = controlsFor(model)
  const values: Record<string, unknown> = {}
  let aspect: string | undefined
  if (controls.aspect && node.data.aspect) {
    aspect = carryOver(controls.aspect, node.data.aspect)
    values[controls.aspect.field.name] = pillValue(controls.aspect, aspect)
  }
  if (controls.duration && node.data.duration && node.type === 'genVideo') {
    values[controls.duration.field.name] = pillValue(controls.duration, carryOver(controls.duration, node.data.duration))
  }
  if (node.type === 'upscale' && model.fields.some((f) => f.name === 'upscale_factor')) values.upscale_factor = node.data.factor ?? '2'
  return { values, aspect }
}

/** The intent for a node, given picture URLs Kie can fetch. */
export function intentFor(node: CanvasNode, model: ModelDefinition, text: string, urls: string[]): Intent {
  const { values } = settingValues(node, model)
  const prompt = text.trim()
  const refs: Ref[] = urls.map((url) => ({ url, kind: 'image' }))
  if (node.type === 'genVideo' && urls[0]) {
    const frame = firstFrameField(model)
    if (frame) return { prompt, refs: [], fields: { [frame.name]: urls[0] }, values }
  }
  return { prompt: node.type === 'upscale' ? '' : prompt, refs, values }
}

/** Why this model can't run with what is wired in, in the same words the composer uses. */
export function modelBlocker(node: CanvasNode, model: ModelDefinition, title: string, prompt: string, images: number): string | null {
  if (needsImage(model) && !images) return node.type === 'genVideo' ? `${title} works from a first frame — connect an image.` : `${title} works from a picture — connect an image.`
  if (images && !accepts(model, 'image')) return `${title} can’t take a picture — pick another model or disconnect the image.`
  // Placeholder URLs: the check is about which fields are filled, not what is in them.
  const draft = buildInput(model, intentFor(node, model, prompt, Array.from({ length: images }, () => 'https://placeholder.invalid/x.png')))
  const missing = missingFields(model, draft)
  if (!missing.length) return null
  if (missing.length === 1 && missing[0] === promptFieldOf(model) && !prompt.trim()) return 'Write a prompt here, or connect a Prompt node.'
  return `Still needed: ${missing.map((f) => f.label || f.name).join(', ')}.`
}

/** Get one input picture onto Kie: a still-valid upload as-is, anything else re-hosted. */
async function hosted(v: MediaValue): Promise<string> {
  if (v.hosted && (!v.expiresAt || v.expiresAt > Date.now())) return v.hosted
  if (v.media) return hostForKie(v.media)
  throw new Error('That picture is no longer available — add it again.')
}

/** Run one node. Resolves once the job is queued (not when it finishes). */
export async function runNode(env: RunEnv, id: string): Promise<RunResult> {
  env.sending?.(id, true)
  try {
    return await prepareAndSubmit(env, id)
  } finally {
    env.sending?.(id, false)
  }
}

async function prepareAndSubmit(env: RunEnv, id: string): Promise<RunResult> {
  const refuse = (error: string): RunResult => {
    env.patch(id, { note: error })
    return { error }
  }
  const board = env.board()
  const node = board.nodes.find((n) => n.id === id)
  if (!node || !isRunnable(node.type)) return { error: 'That node doesn’t run.' }
  const current = node.data.jobId ? getJob(node.data.jobId) : undefined
  if (current && isActive(current)) return refuse('It’s already running.')
  if (!env.models) return refuse('The model list is still loading — try again in a moment.')

  const blocked = graphBlocker(board.nodes, board.edges, id)
  if (blocked) return refuse(blocked)
  const inputs = resolveInputs(board.nodes, board.edges, id)
  const picked = modelFor(node, env.models, inputs.images.length)
  if ('error' in picked) return refuse(picked.error)
  const { model, title } = picked
  const why = modelBlocker(node, model, title, inputs.prompt, inputs.images.length)
  if (why) return refuse(why)

  let urls: string[]
  try {
    urls = await Promise.all(inputs.images.map(hosted))
  } catch (e) {
    return refuse(`Couldn’t send the picture to Kie: ${(e as Error).message}`)
  }
  // The board may have changed while the pictures went up; a second press must not double-send.
  const again = env.board().nodes.find((n) => n.id === id)
  if (!again) return { error: 'That node was removed.' }
  const twice = again.data.jobId ? getJob(again.data.jobId) : undefined
  if (twice && isActive(twice)) return { error: 'It’s already running.' }

  const input = buildInput(model, intentFor(again, model, inputs.prompt, urls))
  const { aspect } = settingValues(again, model)
  const label = node.type === 'upscale' ? (node.data.upscaler === 'recraft' ? 'Crisp upscale' : `Upscale ×${node.data.factor ?? '2'}`) : undefined
  const jobId = submitJob(model, input, { surface: 'canvas', label, aspect })
  env.patch(id, { jobId, taskId: undefined, output: undefined, note: undefined })
  return { jobId }
}

/** What a finished job hands on: its first picture or clip. */
export function outputFromJob(job: Job): NodeOutput | null {
  const media = job.task?.media?.find((m) => m.kind === 'image' || m.kind === 'video') ?? job.task?.media?.[0]
  const url = (media && mediaUrl(media)) || job.task?.resultUrls?.[0]
  if (!url) return null
  const kind = media?.kind === 'video' || (!media && job.category === 'video') ? 'video' : 'image'
  return { url, kind, media }
}

/**
 * Wait for a job to finish. `onJobFinished` covers done/error; the slow check covers a
 * job dismissed meanwhile (which finishes nothing) and a stop request.
 */
export function waitForJob(id: string, stopped: () => boolean): Promise<Job> {
  return new Promise((resolve, reject) => {
    let timer = 0
    let off = () => {}
    const settle = (fn: () => void) => {
      window.clearInterval(timer)
      off()
      fn()
    }
    const check = () => {
      const job = getJob(id)
      if (!job) settle(() => reject(new Error('The job was dismissed.')))
      else if (job.status === 'done' || job.status === 'error') settle(() => resolve(job))
      else if (stopped()) settle(() => reject(new Error('Stopped.')))
    }
    off = onJobFinished((j) => {
      if (j.id === id) check()
    })
    timer = window.setInterval(check, 1500)
    check()
  })
}

export interface RunAllHooks {
  stopped: () => boolean
  /** A short line for the top bar: what Run all is doing now. */
  progress: (line: string) => void
}

/** Which nodes Run all would send, in the order it sends them; or the loop that stops it. */
export function runPlan(board: Board): { ids: string[] } | { error: string } {
  const { order, cycle } = topoOrder(board.nodes, board.edges)
  if (cycle) {
    const names = cycle.map((id) => TITLES[board.nodes.find((n) => n.id === id)?.type ?? 'prompt']).join(' → ')
    return { error: `These nodes loop back on themselves (${names}). Remove one of their connections first.` }
  }
  const ids = order.filter((id) => isRunnable(board.nodes.find((n) => n.id === id)!.type))
  return ids.length ? { ids } : { error: 'Nothing to run — add a Generate or Upscale node.' }
}

/**
 * Run every runnable node in dependency order. Each node waits for the jobs of the
 * nodes it reads from, takes their results, then goes out. The first refusal or failure
 * stops the run and says which node and why; the jobs already sent keep going.
 */
export async function runAll(env: RunEnv, hooks: RunAllHooks): Promise<string | null> {
  const plan = runPlan(env.board())
  if ('error' in plan) return plan.error
  const sent = new Map<string, string>()

  const settle = async (nodeId: string, jobId: string): Promise<string | null> => {
    const name = TITLES[env.board().nodes.find((n) => n.id === nodeId)?.type ?? 'genImage']
    let job: Job
    try {
      job = await waitForJob(jobId, hooks.stopped)
    } catch (e) {
      return (e as Error).message === 'Stopped.' ? 'Stopped. Jobs already sent keep going.' : `${name}: ${(e as Error).message}`
    }
    if (job.status === 'error') return `Stopped: ${name} failed — ${job.error ?? 'Kie reported a failure.'}`
    const output = outputFromJob(job)
    if (!output) return `Stopped: ${name} finished without a file.`
    // Straight onto the board, so the next node's inputs see it without waiting for a render.
    env.patch(nodeId, { output, taskId: job.taskId ?? undefined })
    return null
  }

  for (const [i, id] of plan.ids.entries()) {
    if (hooks.stopped()) return 'Stopped. Jobs already sent keep going.'
    const board = env.board()
    const node = board.nodes.find((n) => n.id === id)
    if (!node) continue
    // Upstream runnable nodes this one reads from: wait for their jobs (sent above, or already running).
    for (const e of board.edges.filter((x) => x.target === id)) {
      const up = board.nodes.find((n) => n.id === e.source)
      if (!up || !isRunnable(up.type)) continue
      const jobId = sent.get(up.id) ?? up.data.jobId
      const job = jobId ? getJob(jobId) : undefined
      if (!jobId || !job || (job.status === 'done' && up.data.output)) continue
      hooks.progress(`Waiting for ${TITLES[up.type]}…`)
      const err = await settle(up.id, jobId)
      if (err) return err
    }
    if (hooks.stopped()) return 'Stopped. Jobs already sent keep going.'
    hooks.progress(`Sending ${TITLES[node.type]} (${i + 1} of ${plan.ids.length})…`)
    const res = await runNode(env, id)
    if ('error' in res) return `Stopped at ${TITLES[node.type]}: ${res.error}`
    sent.set(id, res.jobId)
  }

  // Everything is out; stay "running" until the last results land so the bar tells the truth.
  for (const [nodeId, jobId] of sent) {
    hooks.progress('Waiting for the last results…')
    const err = await settle(nodeId, jobId)
    if (err) return err
  }
  return null
}
