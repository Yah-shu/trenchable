/**
 * The queue against a fake server: a job goes submitting → running → done, a 429 is
 * retried rather than failed, a Kie failure lands as an error with its message, and the
 * submit carries provider + operation (Veo/Runway/Suno are separate Kie APIs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryItem, ModelDefinition } from './api.ts'
import { dismissJob, getJob, hiddenFailures, isSettled, onJobFinished, phaseOf, resumeFromHistory, retryJob, settleFailure, submitJob } from './jobs.ts'

const veo: ModelDefinition = {
  id: 'veo/generate',
  model: 'veo',
  title: 'Veo — Create a video',
  category: 'video',
  provider: 'veo',
  operation: 'generate',
  fields: [{ name: 'prompt', type: 'textarea', label: 'Prompt' }],
}

type Reply = { status: number; body: unknown }
let replies: Record<string, Reply[]>
let calls: { url: string; body?: unknown }[]

beforeEach(() => {
  vi.useFakeTimers()
  replies = {}
  calls = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      const key = url.startsWith('/api/generate') ? 'generate' : url.startsWith('/api/task') ? 'task' : 'other'
      const r = replies[key]?.shift() ?? { status: 200, body: { data: {} } }
      return new Response(JSON.stringify(r.body), { status: r.status })
    }),
  )
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const flush = async (ms = 0) => {
  await vi.advanceTimersByTimeAsync(ms)
}

describe('jobs', () => {
  it('runs a job to done and tells listeners once', async () => {
    replies.generate = [{ status: 200, body: { data: { taskId: 't1' } } }]
    replies.task = [
      { status: 200, body: { data: { taskId: 't1', state: 'generating', media: [], resultUrls: [], provider: 'veo', operation: 'generate' } } },
      { status: 200, body: { data: { taskId: 't1', state: 'success', media: [{ kind: 'video', url: 'https://x/v.mp4' }], resultUrls: [], provider: 'veo', operation: 'generate' } } },
    ]
    const finished = vi.fn()
    const off = onJobFinished(finished)
    const id = submitJob(veo, { prompt: 'a cat' }, { surface: 'video' })
    expect(getJob(id)?.status).toBe('submitting')
    await flush()
    expect(getJob(id)?.status).toBe('running')
    expect(getJob(id)?.taskId).toBe('t1')
    await flush(2_500)
    expect(getJob(id)?.status).toBe('running')
    await flush(2_500)
    expect(getJob(id)?.status).toBe('done')
    expect(finished).toHaveBeenCalledTimes(1)
    const sent = calls.find((c) => c.url === '/api/generate')?.body as Record<string, unknown>
    expect(sent).toMatchObject({ model: 'veo', provider: 'veo', operation: 'generate', workflowId: 'veo/generate' })
    const polled = calls.find((c) => c.url.startsWith('/api/task'))!.url
    expect(polled).toContain('provider=veo')
    off()
    dismissJob(id)
  })

  it('retries a rate-limited submit instead of failing it', async () => {
    replies.generate = [
      { status: 429, body: { error: 'Rate limit exceeded (429)' } },
      { status: 200, body: { data: { taskId: 't2' } } },
    ]
    const id = submitJob(veo, { prompt: 'b' }, { surface: 'video' })
    await flush()
    await flush(1_500)
    expect(getJob(id)?.status).toBe('running')
    expect(getJob(id)?.taskId).toBe('t2')
    dismissJob(id)
  })

  it('records Kie failures with their message', async () => {
    replies.generate = [{ status: 200, body: { data: { taskId: 't3' } } }]
    replies.task = [{ status: 200, body: { data: { taskId: 't3', state: 'fail', failMsg: 'Content flagged', media: [], resultUrls: [], provider: 'veo', operation: 'generate' } } }]
    const id = submitJob(veo, { prompt: 'c' }, { surface: 'video' })
    await flush()
    await flush(2_500)
    expect(getJob(id)?.status).toBe('error')
    expect(getJob(id)?.error).toBe('Content flagged')
    dismissJob(id)
  })

  it('fails fast on a rejected submit', async () => {
    replies.generate = [{ status: 400, body: { error: 'prompt is required' } }]
    const id = submitJob(veo, {}, { surface: 'video' })
    await flush()
    expect(getJob(id)?.status).toBe('error')
    expect(getJob(id)?.error).toBe('prompt is required')
    dismissJob(id)
  })

  it('strips the Advanced form bookkeeping fields before sending', async () => {
    replies.generate = [{ status: 200, body: { data: { taskId: 't5' } } }]
    const id = submitJob(veo, { prompt: 'd', _duration: 30, _parentTaskId: 'x' }, { surface: 'video' })
    await flush()
    const sent = calls.find((c) => c.url === '/api/generate')?.body as { input: Record<string, unknown> }
    expect(sent.input).toEqual({ prompt: 'd' })
    dismissJob(id)
  })

  it('keeps Kie’s state on the job: Queued, then Generating', async () => {
    replies.generate = [{ status: 200, body: { data: { taskId: 't6' } } }]
    const task = (state: string, progress?: number) => ({ status: 200, body: { data: { taskId: 't6', state, progress, media: [], resultUrls: [], provider: 'veo', operation: 'generate' } } })
    replies.task = [task('queuing'), task('generating'), task('generating', 0.5)]
    const id = submitJob(veo, { prompt: 'e' }, { surface: 'video' })
    expect(phaseOf(getJob(id)!)).toBe('sending')
    await flush()
    expect(phaseOf(getJob(id)!)).toBe('queued')
    await flush(2_500)
    expect(getJob(id)?.phase).toBe('queuing')
    expect(phaseOf(getJob(id)!)).toBe('queued')
    await flush(2_500)
    expect(phaseOf(getJob(id)!)).toBe('generating')
    await flush(2_500)
    expect(getJob(id)?.progress).toBe(0.5)
    dismissJob(id)
  })

  it('reads a phase for every state, guessing Generating for one Kie doesn’t name', () => {
    expect(phaseOf({ status: 'running' })).toBe('queued')
    expect(phaseOf({ status: 'running', phase: 'waiting' })).toBe('queued')
    expect(phaseOf({ status: 'running', phase: 'waiting', progress: 0.2 })).toBe('generating')
    expect(phaseOf({ status: 'running', phase: 'unknown' })).toBe('generating')
    expect(phaseOf({ status: 'error' })).toBe('failed')
    expect(phaseOf({ status: 'done' })).toBe('done')
  })

  it('settles a failure on Retry so its history row stays hidden after the job is dropped', async () => {
    replies.generate = [
      { status: 200, body: { data: { taskId: 't7' } } },
      { status: 200, body: { data: { taskId: 't8' } } },
    ]
    replies.task = [{ status: 200, body: { data: { taskId: 't7', state: 'fail', failMsg: 'nope', media: [], resultUrls: [], provider: 'veo', operation: 'generate' } } }]
    const id = submitJob(veo, { prompt: 'f' }, { surface: 'video' })
    await flush()
    await flush(2_500)
    expect(getJob(id)?.status).toBe('error')
    // While the queue holds it, its own tile shows it.
    expect(hiddenFailures([getJob(id)!]).has('t7')).toBe(true)
    expect(isSettled('t7')).toBe(false)
    const again = retryJob(id, [veo])!
    expect(getJob(id)).toBeUndefined()
    expect(isSettled('t7')).toBe(true)
    expect(hiddenFailures([]).has('t7')).toBe(true)
    expect(JSON.parse(window.sessionStorage.getItem('st-settled-failures') ?? '[]')).toContain('t7')
    await flush()
    dismissJob(again)
    // Dismissing a running job settles nothing: it still lands in history.
    expect(isSettled('t8')).toBe(false)
  })

  it('settles a history failure retried from its own tile', () => {
    expect(isSettled('h1')).toBe(false)
    settleFailure('h1')
    expect(hiddenFailures([]).has('h1')).toBe(true)
  })

  it('resumes unfinished jobs from history with their phase', () => {
    const row = (taskId: string, state: HistoryItem['state']): HistoryItem => ({ taskId, model: 'veo', modelId: 'veo/generate', category: 'video', state, createdAt: Date.now() - 1000, provider: 'veo', operation: 'generate', input: { prompt: 'g' } })
    resumeFromHistory([row('r1', 'queuing'), row('r2', 'generating'), row('r3', 'success')])
    expect(getJob('job-r-r1')?.phase).toBe('queuing')
    expect(phaseOf(getJob('job-r-r1')!)).toBe('queued')
    expect(phaseOf(getJob('job-r-r2')!)).toBe('generating')
    expect(getJob('job-r-r3')).toBeUndefined()
    dismissJob('job-r-r1')
    dismissJob('job-r-r2')
  })
})
