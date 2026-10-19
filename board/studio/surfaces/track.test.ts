// The tracker records which Kie task came from which recipe / tab / project. A job only
// learns its task id after the submit queue answers, so the waiting room is what matters:
// it must settle each job exactly once, run its callback once, and drop jobs that never
// get an id. Nothing here touches the network or Kie.
import { describe, expect, it, vi } from 'vitest'
import { createWaiter, recordTask, TRACK_CAP } from './track.ts'

describe('recordTask', () => {
  it('puts a task at the head of its tag, once', () => {
    let s = recordTask({}, 'preset:a', 't1')
    s = recordTask(s, 'preset:a', 't2')
    s = recordTask(s, 'preset:a', 't1')
    expect(s['preset:a']).toEqual(['t1', 't2'])
  })

  it('returns the same object when nothing changes, so subscribers are not woken', () => {
    const s = recordTask({}, 'x', 't1')
    expect(recordTask(s, 'x', 't1')).toBe(s)
  })

  it('keeps tags apart and caps each one', () => {
    let s = recordTask({}, 'a', 'one')
    for (let i = 0; i < TRACK_CAP + 5; i++) s = recordTask(s, 'b', `t${i}`)
    expect(s.a).toEqual(['one'])
    expect(s.b).toHaveLength(TRACK_CAP)
    expect(s.b?.[0]).toBe(`t${TRACK_CAP + 4}`)
  })
})

describe('createWaiter', () => {
  const setup = () => {
    const jobs = new Map<string, { taskId: string | null; status: 'submitting' | 'running' | 'done' | 'error' }>()
    const recorded: [string, string][] = []
    let now = 0
    const waiter = createWaiter({ getJob: (id) => jobs.get(id), record: (tag, t) => recorded.push([tag, t]), now: () => now })
    return { jobs, recorded, waiter, advance: (ms: number) => (now += ms) }
  }

  it('waits until a job has its task id, then records it under every tag and calls back once', () => {
    const { jobs, recorded, waiter } = setup()
    const onTask = vi.fn()
    jobs.set('j1', { taskId: null, status: 'submitting' })
    waiter.add(['j1'], ['project:p1', 'preset:x'], onTask)

    expect(waiter.check()).toBe(1)
    expect(recorded).toEqual([])

    jobs.set('j1', { taskId: 'task-1', status: 'running' })
    expect(waiter.check()).toBe(0)
    expect(recorded).toEqual([
      ['project:p1', 'task-1'],
      ['preset:x', 'task-1'],
    ])
    expect(onTask).toHaveBeenCalledTimes(1)
    expect(onTask).toHaveBeenCalledWith('task-1', 'j1')

    waiter.check()
    expect(onTask).toHaveBeenCalledTimes(1)
  })

  it('drops a job that failed to send or was dismissed', () => {
    const { jobs, recorded, waiter } = setup()
    jobs.set('bad', { taskId: null, status: 'error' })
    waiter.add(['bad', 'gone'], ['t'])
    expect(waiter.check()).toBe(0)
    expect(recorded).toEqual([])
  })

  it('gives up after half an hour without a task id', () => {
    const { jobs, waiter, advance } = setup()
    jobs.set('slow', { taskId: null, status: 'submitting' })
    waiter.add(['slow'], ['t'])
    advance(29 * 60 * 1000)
    expect(waiter.check()).toBe(1)
    advance(2 * 60 * 1000)
    expect(waiter.check()).toBe(0)
  })

  it('settles from the finish event too, and a broken callback does not stop the bookkeeping', () => {
    const { recorded, waiter } = setup()
    waiter.add(['j2'], ['t'], () => {
      throw new Error('boom')
    })
    waiter.finished({ id: 'j2', taskId: 'task-2' })
    expect(recorded).toEqual([['t', 'task-2']])
    expect(waiter.size()).toBe(0)
  })
})
