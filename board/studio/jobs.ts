/**
 * Studio's job queue — every generation any surface starts, in one place.
 *
 * the reference app lets you fire off job after job and watch them land; the old `useRun` hook
 * held one job inside one component, so switching lane killed its poller and a second
 * Generate replaced the first. Jobs live here instead, at module level: they keep
 * polling while you move between surfaces, any number can run at once, and a page
 * reload picks the unfinished ones back up from history.
 *
 * Kie has no push channel, so each job polls — 2.5s, then 5s after half a minute, 10s
 * after two — and pauses while the tab is hidden. Each poll also keeps Kie's own state on
 * the job (`phase`), so a tile can say Queued or Generating the way the reference app's do.
 */
import { useSyncExternalStore } from 'react'
import { sanitizeWorkflowInput } from '../../src/lib/workflowValidation.ts'
import { studioApi, type HistoryItem, type ModelCategory, type ModelDefinition, type NormalizedTask, type Operation, type Provider } from './api.ts'

export type JobStatus = 'submitting' | 'running' | 'done' | 'error'

/** Kie's task states, as a job last heard them. */
export type TaskState = NormalizedTask['state']

/** What a surface knows about a job that the model and its input don't say. */
export interface JobMeta {
  /** The surface that started it, so each one can show only its own pending tiles. */
  surface: string
  /** A short name for what it is when the prompt says nothing ("Upscale ×2"). */
  label?: string
  /** The aspect asked for, so a pending tile has the right shape before anything exists. */
  aspect?: string
  projectId?: string
}

export interface Job {
  id: string
  taskId: string | null
  modelId: string
  modelTitle: string
  category: ModelCategory
  provider: Provider
  operation: Operation
  input: Record<string, unknown>
  prompt: string
  meta: JobMeta
  status: JobStatus
  startedAt: number
  finishedAt?: number
  task?: NormalizedTask
  error?: string
  progress?: number
  /** Kie's latest state for a running job (`waiting`/`queuing` → Queued, `generating`). */
  phase?: TaskState
}

const jobs = new Map<string, Job>()
const listeners = new Set<() => void>()
const finishListeners = new Set<(job: Job) => void>()
const timers = new Map<string, number>()
let snapshot: Job[] = []
let seq = 0

function emit() {
  snapshot = [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt)
  for (const l of listeners) l()
}

function patch(id: string, next: Partial<Job>) {
  const job = jobs.get(id)
  if (!job) return
  const merged = { ...job, ...next }
  jobs.set(id, merged)
  emit()
  if ((next.status === 'done' || next.status === 'error') && job.status !== next.status) {
    for (const l of finishListeners) l(merged)
  }
}

/** Called once per finished job — history hooks use it to refresh themselves. */
export function onJobFinished(cb: (job: Job) => void): () => void {
  finishListeners.add(cb)
  return () => finishListeners.delete(cb)
}

const promptOf = (input: Record<string, unknown>): string => {
  for (const key of ['prompt', 'text', 'script', 'description']) {
    const v = input[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return ''
}

/* ---------- polling ---------- */

function poll(id: string) {
  const job = jobs.get(id)
  if (!job?.taskId) return
  const tick = async () => {
    const current = jobs.get(id)
    if (!current?.taskId || current.status !== 'running') return
    if (document.hidden) {
      timers.set(id, window.setTimeout(tick, 2_000))
      return
    }
    try {
      const task = await studioApi.task(current.taskId, current.provider, current.operation)
      if (task.state === 'success' || task.state === 'partial') {
        patch(id, { status: 'done', task, finishedAt: Date.now(), progress: 1 })
        return
      }
      if (task.state === 'fail' || task.state === 'expired') {
        patch(id, { status: 'error', task, error: task.failMsg || `Kie reported the job ${task.state}.`, finishedAt: Date.now() })
        return
      }
      // Only a change re-renders the feeds; most polls hear the same thing again.
      const progress = typeof task.progress === 'number' ? task.progress : current.progress
      if (task.state !== current.phase || progress !== current.progress) patch(id, { phase: task.state, progress })
    } catch {
      // One failed poll is not a failed job; keep waiting.
    }
    const age = Date.now() - current.startedAt
    timers.set(id, window.setTimeout(tick, age > 120_000 ? 10_000 : age > 30_000 ? 5_000 : 2_500))
  }
  timers.set(id, window.setTimeout(tick, 2_500))
}

/* ---------- submitting ---------- */

// Kie answers 429 when a batch arrives at once, so submissions go out one at a time
// and a rate-limited one waits and tries again rather than failing the job.
let lane: Promise<unknown> = Promise.resolve()

async function sendWithRetry(model: ModelDefinition, input: Record<string, unknown>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await studioApi.submit(model, input)
    } catch (e) {
      const message = (e as Error).message
      if (attempt < 3 && /429|rate limit|too many/i.test(message)) {
        await new Promise((r) => setTimeout(r, 1_500 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
}

/**
 * Start one job. Returns at once with the job's local id; the job itself appears in
 * `useJobs` straight away as `submitting`, then `running`, then `done` or `error`.
 */
export function submitJob(model: ModelDefinition, rawInput: Record<string, unknown>, meta: JobMeta): string {
  const id = `job-${Date.now().toString(36)}-${(seq++).toString(36)}`
  const operation = model.operation ?? 'generate'
  const input = sanitizeWorkflowInput(model, rawInput)
  // Internal bookkeeping fields the Advanced form uses; never part of the payload.
  delete input._duration
  delete input._parentTaskId
  jobs.set(id, {
    id,
    taskId: null,
    modelId: model.id,
    modelTitle: model.title,
    category: model.category,
    provider: model.provider,
    operation,
    input,
    prompt: promptOf(input),
    meta,
    status: 'submitting',
    startedAt: Date.now(),
  })
  emit()
  lane = lane
    .then(() => sendWithRetry(model, input))
    .then(({ taskId, task }) => {
      patch(id, { taskId, status: 'running', ...(task?.state ? { phase: task.state } : {}) })
      poll(id)
    })
    .catch((e: unknown) => patch(id, { status: 'error', error: (e as Error).message, finishedAt: Date.now() }))
  return id
}

/** Send a failed job again exactly as it went out the first time. */
export function retryJob(id: string, models: ModelDefinition[]): string | null {
  const job = jobs.get(id)
  const model = job && models.find((m) => m.id === job.modelId)
  if (!job || !model) return null
  dismissJob(id)
  return submitJob(model, job.input, job.meta)
}

/**
 * Forget a job locally. A running one keeps going on Kie and still lands in history; a
 * failed one is settled too, so its history row doesn't come back as a second failed tile.
 */
export function dismissJob(id: string) {
  const job = jobs.get(id)
  const t = timers.get(id)
  if (t) window.clearTimeout(t)
  timers.delete(id)
  jobs.delete(id)
  if (job?.status === 'error' && job.taskId) {
    settled.add(job.taskId)
    saveSettled()
  }
  emit()
}

/* ---------- failures already dealt with ---------- */

/*
 * A failure you retried (or dismissed) is done with: the feeds keep history's failed rows
 * on screen until something hides them, and while the queue held the job its tile did; once
 * Retry drops it, the old row would reappear next to the new job. Their task ids are kept
 * here for the session (sessionStorage), so a reload doesn't bring them back either.
 */
const SETTLED_KEY = 'st-settled-failures'
const settled = new Set<string>(
  (() => {
    try {
      const raw = JSON.parse(window.sessionStorage.getItem(SETTLED_KEY) ?? '[]') as unknown
      return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : []
    } catch {
      return []
    }
  })(),
)
function saveSettled() {
  try {
    window.sessionStorage.setItem(SETTLED_KEY, JSON.stringify([...settled].slice(-500)))
  } catch {
    // Storage off: it lasts until the page closes.
  }
}

/** Mark a failed history row as dealt with (retried from its own tile, say). */
export function settleFailure(taskId: string | null | undefined) {
  if (!taskId || settled.has(taskId)) return
  settled.add(taskId)
  saveSettled()
  emit()
}

export const isSettled = (taskId: string): boolean => settled.has(taskId)

/**
 * The failed history rows a feed should not draw: ones a live job already shows as its own
 * tile, and ones already retried or dismissed. Pass the jobs from `useJobs`, so the feed
 * re-renders when either changes.
 */
export function hiddenFailures(live: Job[]): Set<string> {
  const out = new Set(settled)
  for (const j of live) if (j.taskId) out.add(j.taskId)
  return out
}

export const getJob = (id: string): Job | undefined => jobs.get(id)

/** The job following a Kie task, if this page started or resumed it. */
export const findJobByTask = (taskId: string): Job | undefined => [...jobs.values()].find((j) => j.taskId === taskId)

/* ---------- picking up after a reload ---------- */

const RESUME_WINDOW_MS = 60 * 60 * 1000
let resumed = false

/**
 * Jobs that were still running when the page went away are still running on Kie; put
 * them back in the queue so their tiles reappear and they finish into history.
 */
export function resumeFromHistory(items: HistoryItem[]) {
  if (resumed) return
  resumed = true
  const known = new Set([...jobs.values()].map((j) => j.taskId))
  for (const item of items) {
    if (!['waiting', 'queuing', 'generating'].includes(item.state)) continue
    if (Date.now() - item.createdAt > RESUME_WINDOW_MS || known.has(item.taskId)) continue
    const id = `job-r-${item.taskId}`
    const input = (item.input ?? {}) as Record<string, unknown>
    jobs.set(id, {
      id,
      taskId: item.taskId,
      modelId: item.modelId ?? item.model,
      modelTitle: item.model,
      category: item.category,
      provider: item.provider ?? 'market',
      operation: item.operation ?? 'generate',
      input,
      prompt: item.prompt ?? promptOf(input),
      meta: { surface: item.category },
      status: 'running',
      phase: item.state,
      startedAt: item.createdAt,
    })
    poll(id)
  }
  emit()
}

/* ---------- hooks ---------- */

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Every job this page knows about, newest first. Filter in the caller. */
export function useJobs(): Job[] {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
}

export const isActive = (j: Job) => j.status === 'submitting' || j.status === 'running'

export type JobPhase = 'sending' | 'queued' | 'generating' | 'done' | 'failed'

/**
 * What a tile says about a job. Kie's `waiting`/`queuing` (and the moment before the first
 * poll) read as Queued; `generating`, any progress, or a state Kie doesn't name read as
 * Generating — a running job is never shown as stuck in the queue on a guess.
 */
export function phaseOf(j: Pick<Job, 'status' | 'phase' | 'progress'>): JobPhase {
  if (j.status === 'submitting') return 'sending'
  if (j.status === 'done') return 'done'
  if (j.status === 'error') return 'failed'
  if (typeof j.progress === 'number' && j.progress > 0) return 'generating'
  return !j.phase || j.phase === 'waiting' || j.phase === 'queuing' ? 'queued' : 'generating'
}

/** Seconds since a job started, for the pending tile's clock. */
export const elapsed = (j: Job, now = Date.now()) => Math.max(0, Math.round(((j.finishedAt ?? now) - j.startedAt) / 1000))

