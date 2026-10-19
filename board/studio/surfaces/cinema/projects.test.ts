// Cinema's project bookkeeping. `onSubmitted` hands over LOCAL job ids; the Kie task id
// arrives later, and only then can the job be filed into its project on the server. The
// jobs module is replaced by a fake here so no generation is ever sent.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryItem } from '../../api.ts'
import type { Job } from '../../jobs.ts'
import type { Project } from '../../library.ts'

const fakeJobs = new Map<string, Partial<Job>>()
vi.mock('../../jobs.ts', () => ({
  getJob: (id: string) => fakeJobs.get(id),
  onJobFinished: () => () => {},
  resumeFromHistory: () => {},
  submitJob: () => {
    throw new Error('no generations in tests')
  },
  isActive: (j: Job) => j.status === 'submitting' || j.status === 'running',
}))

const { fileJobs, mergedTaskIds, projectCover, projectItems, projectJobs, projectStills, projectTag, searchProjects, untitledName } = await import('./projects.ts')
const { trackedTasks } = await import('../track.ts')

const item = (taskId: string, over: Partial<HistoryItem> = {}): HistoryItem => ({
  taskId,
  model: 'm',
  category: 'video',
  state: 'success',
  createdAt: 1,
  media: [{ kind: over.category === 'image' ? 'image' : 'video', url: `https://x/${taskId}` }],
  ...over,
})

const job = (id: string, over: Partial<Job>): Job =>
  ({ id, taskId: null, modelId: 'm', modelTitle: 'M', category: 'video', provider: 'market', operation: 'generate', input: {}, prompt: '', meta: { surface: 'cinema' }, status: 'running', startedAt: 1, ...over }) as Job

const project = (taskIds: string[], over: Partial<Project> = {}): Project => ({ id: 'p1', title: 'Film', notes: '', createdAt: '', updatedAt: '', taskIds, ...over })

describe('what a project shows', () => {
  const byTask = new Map([item('a'), item('b', { state: 'fail' }), item('still', { category: 'image' })].map((i) => [i.taskId, i]))

  it('lists its results in the project order, skipping what history no longer has', () => {
    expect(projectItems(project(['still', 'gone', 'a', 'b']), byTask).map((i) => i.taskId)).toEqual(['still', 'a', 'b'])
  })

  it('shows its own running and failed jobs, but not one already standing as a result', () => {
    const jobs = [
      job('j1', { meta: { surface: 'cinema', projectId: 'p1' }, status: 'running' }),
      job('j2', { meta: { surface: 'cinema', projectId: 'p1' }, status: 'error' }),
      job('j3', { meta: { surface: 'cinema', projectId: 'other' } }),
      job('j4', { meta: { surface: 'cinema' } }),
      job('j5', { meta: { surface: 'cinema', projectId: 'p1' }, status: 'done', taskId: 'a' }),
      job('j6', { meta: { surface: 'cinema', projectId: 'p1' }, status: 'running', taskId: 'a' }),
    ]
    expect(projectJobs(jobs, 'p1', new Set(['a'])).map((j) => j.id)).toEqual(['j1', 'j2'])
  })

  it('covers with the newest finished result and offers stills as first frames', () => {
    expect(projectCover(project(['b', 'a']), byTask)).toEqual({ src: 'https://x/a', video: true })
    expect(projectCover(project([]), byTask)).toBeNull()
    expect(projectStills(project(['a', 'still']), byTask).map((i) => i.taskId)).toEqual(['still'])
  })

  it('puts unconfirmed local filings first, without doubling', () => {
    expect(mergedTaskIds(['s1', 's2'], ['l1', 's1'])).toEqual(['l1', 's1', 's2'])
  })

  it('names new projects without clashing and searches title and notes', () => {
    expect(untitledName([])).toBe('Untitled project')
    expect(untitledName([{ title: 'Untitled project' }, { title: 'untitled project 2' }])).toBe('Untitled project 3')
    const list = [project([], { id: '1', title: 'Rain scene' }), project([], { id: '2', title: 'Other', notes: 'night rain' }), project([], { id: '3', title: 'Beach' })]
    expect(searchProjects(list, 'RAIN').map((p) => p.id)).toEqual(['1', '2'])
    expect(searchProjects(list, ' ').length).toBe(3)
  })
})

describe('fileJobs', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    fakeJobs.clear()
    window.localStorage.clear()
  })
  afterEach(() => vi.useRealTimers())

  it('adds each job to the project once its task id exists, and keeps it locally too', async () => {
    const add = vi.fn(() => Promise.resolve({} as Project))
    fakeJobs.set('job-a', { id: 'job-a', taskId: null, status: 'submitting' })
    fakeJobs.set('job-b', { id: 'job-b', taskId: 'task-b', status: 'running' })

    fileJobs('p9', ['job-a', 'job-b'], add)
    // job-b already had its id; job-a is still waiting.
    expect(add).toHaveBeenCalledTimes(1)
    expect(add).toHaveBeenLastCalledWith('p9', ['task-b'])

    fakeJobs.set('job-a', { id: 'job-a', taskId: 'task-a', status: 'running' })
    await vi.advanceTimersByTimeAsync(1_100)
    expect(add).toHaveBeenCalledTimes(2)
    expect(add).toHaveBeenLastCalledWith('p9', ['task-a'])
    expect(trackedTasks(projectTag('p9'))).toEqual(['task-a', 'task-b'])

    await vi.advanceTimersByTimeAsync(5_000)
    expect(add).toHaveBeenCalledTimes(2)
  })

  it('survives a failed add (the page retries from the local copy)', async () => {
    const add = vi.fn(() => Promise.reject(new Error('server down')))
    fakeJobs.set('job-c', { id: 'job-c', taskId: 'task-c', status: 'running' })
    fileJobs('p10', ['job-c'], add)
    await vi.advanceTimersByTimeAsync(10)
    expect(trackedTasks(projectTag('p10'))).toEqual(['task-c'])
  })
})
