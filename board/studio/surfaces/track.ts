/**
 * Which Kie tasks came from where: a preset, an Influencer tab, a Cinema project.
 *
 * Kie's history is one flat list and a job only learns its task id a moment after
 * Generate (it goes out through a queue, jobs.ts). `onSubmitted` hands a surface the
 * LOCAL job ids, so this waits for each job's task id at module level — it keeps
 * waiting after the surface unmounts — and records it under a tag ("preset:orbit",
 * "influencer:create"). A tag can also run a callback once (Cinema adds the task to
 * its project on the server).
 *
 * Tags live in localStorage, newest first, capped, and every read and write is wrapped:
 * private windows and blocked storage must never break a Generate button.
 */
import { useSyncExternalStore } from 'react'
import { getJob, onJobFinished, type Job } from '../jobs.ts'

const KEY = 'trenchable.studio.tracked.v1'
/** Per tag; enough for covers and filters, small enough for storage. */
export const TRACK_CAP = 400

export type Tracked = Record<string, string[]>

/** Put a task at the head of a tag, once. Pure, so the bookkeeping can be tested. */
export function recordTask(state: Tracked, tag: string, taskId: string, cap = TRACK_CAP): Tracked {
  const now = state[tag] ?? []
  if (now[0] === taskId) return state
  return { ...state, [tag]: [taskId, ...now.filter((t) => t !== taskId)].slice(0, cap) }
}

function load(): Tracked {
  try {
    const raw = window.localStorage.getItem(KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : {}
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Tracked = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string')
    }
    return out
  } catch {
    return {}
  }
}

function save(state: Tracked) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // Storage full or blocked: the tags still work for this page.
  }
}

let state: Tracked | null = null
const listeners = new Set<() => void>()
const current = (): Tracked => (state ??= load())

function write(tag: string, taskId: string) {
  const next = recordTask(current(), tag, taskId)
  if (next === state) return
  state = next
  save(next)
  for (const l of listeners) l()
}

/** Take a task out of a tag (removed from a project, say), so nothing puts it back. */
export function untrack(tag: string, taskId: string) {
  const now = current()[tag]
  if (!now?.includes(taskId)) return
  state = { ...current(), [tag]: now.filter((t) => t !== taskId) }
  save(state)
  for (const l of listeners) l()
}

/** Forget a whole tag (a deleted project). */
export function forgetTag(tag: string) {
  if (!current()[tag]) return
  const next = { ...current() }
  delete next[tag]
  state = next
  save(next)
  for (const l of listeners) l()
}

/** Task ids under a tag, newest first. */
export const trackedTasks = (tag: string): string[] => current()[tag] ?? []

/** Every tag, read once (a viewer action deciding where a job belongs). */
export const trackedAll = (): Tracked => current()

const EMPTY: string[] = []
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Task ids under a tag, newest first, live. */
export function useTracked(tag: string): string[] {
  return useSyncExternalStore(subscribe, () => current()[tag] ?? EMPTY, () => EMPTY)
}

/** Every tag, live (the preset catalogue reads all covers at once). */
export function useAllTracked(): Tracked {
  return useSyncExternalStore(subscribe, current, current)
}

/* ---------- waiting for task ids ---------- */

interface Waiter {
  tags: string[]
  onTask?: (taskId: string, jobId: string) => void
  since: number
}

/** Give up on a job that never got a task id (it failed to send, or was dismissed). */
const GIVE_UP_MS = 30 * 60 * 1000

/**
 * The waiting room, separated from the module's timer so tests can drive it: `check`
 * looks at every waiting job once and settles the ones that have a task id.
 */
export function createWaiter(deps: { getJob: (id: string) => Pick<Job, 'taskId' | 'status'> | undefined; record: (tag: string, taskId: string) => void; now: () => number }) {
  const waiting = new Map<string, Waiter>()
  const settle = (jobId: string, w: Waiter, taskId: string) => {
    waiting.delete(jobId)
    for (const tag of w.tags) deps.record(tag, taskId)
    try {
      w.onTask?.(taskId, jobId)
    } catch {
      // A callback's failure is its own business.
    }
  }
  return {
    add(jobIds: string[], tags: string[], onTask?: Waiter['onTask']) {
      for (const id of jobIds) waiting.set(id, { tags, onTask, since: deps.now() })
    },
    check() {
      for (const [id, w] of [...waiting]) {
        const job = deps.getJob(id)
        if (job?.taskId) settle(id, w, job.taskId)
        else if (!job || job.status === 'error' || deps.now() - w.since > GIVE_UP_MS) waiting.delete(id)
      }
      return waiting.size
    },
    /** A finished job always has its task id by now, if it ever got one. */
    finished(job: Pick<Job, 'id' | 'taskId'>) {
      const w = waiting.get(job.id)
      if (!w) return
      if (job.taskId) settle(job.id, w, job.taskId)
      else waiting.delete(job.id)
    },
    size: () => waiting.size,
  }
}

const waiter = createWaiter({ getJob, record: write, now: () => Date.now() })
let timer: number | null = null

const tick = () => {
  if (waiter.check() === 0 && timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}

onJobFinished((job) => waiter.finished(job))

/**
 * Record each job's task id under these tags as soon as it has one, then call `onTask`.
 * Safe to call straight from `onSubmitted`.
 */
export function trackJobs(jobIds: string[], tags: string | string[], onTask?: (taskId: string, jobId: string) => void) {
  if (!jobIds.length) return
  waiter.add(jobIds, Array.isArray(tags) ? tags : [tags], onTask)
  tick()
  if (waiter.size() && timer === null) timer = window.setInterval(tick, 1_000)
}
