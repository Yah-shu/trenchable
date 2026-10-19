/**
 * Run all against a fake queue: each node goes out only after the jobs it reads from
 * have finished, carries their (re-hosted) result into its own payload, and a failure
 * upstream stops everything downstream. jobs.ts and the re-hosting are replaced by
 * fakes, so nothing is fetched and no credit is spent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import raw from '../../__fixtures__/models.json'
import type { ModelDefinition } from '../../api.ts'
import type { Job } from '../../jobs.ts'
import { makeNode, type Board, type CanvasEdge, type InputHandle } from './graph.ts'

const fake = vi.hoisted(() => ({
  jobs: new Map<string, Job>(),
  done: new Set<(j: Job) => void>(),
  sent: [] as { id: string; model: string; input: Record<string, unknown> }[],
}))

vi.mock('../../jobs.ts', () => ({
  submitJob: (model: ModelDefinition, input: Record<string, unknown>, meta: Job['meta']) => {
    const id = `job${fake.sent.length + 1}`
    fake.jobs.set(id, { id, taskId: `t-${id}`, modelId: model.id, modelTitle: model.title, category: model.category, provider: 'market', operation: 'generate', input, prompt: '', meta, status: 'running', startedAt: Date.now() })
    fake.sent.push({ id, model: model.id, input })
    return id
  },
  getJob: (id: string) => fake.jobs.get(id),
  isActive: (j: Job) => j.status === 'submitting' || j.status === 'running',
  onJobFinished: (cb: (j: Job) => void) => {
    fake.done.add(cb)
    return () => fake.done.delete(cb)
  },
  resumeFromHistory: () => {},
}))

vi.mock('../../mentions.ts', () => ({
  hostForKie: async (m: { url?: string }) => `hosted:${m.url}`,
}))

const { runAll } = await import('./run.ts')

const models = raw as unknown as ModelDefinition[]

function finish(id: string, url: string, ok = true) {
  const job = fake.jobs.get(id)!
  const next: Job = ok
    ? { ...job, status: 'done', task: { taskId: job.taskId!, state: 'success', resultUrls: [url], provider: 'market', operation: 'generate', media: [{ kind: job.category === 'video' ? 'video' : 'image', url }] } }
    : { ...job, status: 'error', error: 'boom' }
  fake.jobs.set(id, next)
  for (const cb of fake.done) cb(next)
}

const settle = async () => {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0))
}

const e = (source: string, target: string, targetHandle: InputHandle): CanvasEdge => ({ id: `${source}-${target}`, source, target, sourceHandle: 'out', targetHandle })

/** prompt → generate image → upscale → generate video (Kling 2.6, first frame from the upscale). */
function chain(): Board {
  const p = makeNode('prompt', { x: 0, y: 0 }, 'p')
  p.data.text = 'a fox in snow'
  const g = makeNode('genImage', { x: 0, y: 0 }, 'g')
  const u = makeNode('upscale', { x: 0, y: 0 }, 'u')
  const v = makeNode('genVideo', { x: 0, y: 0 }, 'v')
  v.data.familyKey = 'video:kling 2 6'
  return { id: 'b', name: 'b', updatedAt: 0, nodes: [v, u, g, p], edges: [e('p', 'g', 'prompt'), e('g', 'u', 'image'), e('u', 'v', 'image'), e('p', 'v', 'prompt')] }
}

function env(board: Board) {
  let b = board
  return {
    models,
    board: () => b,
    patch: (nodeId: string, data: object) => {
      b = { ...b, nodes: b.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)) }
    },
    get current() {
      return b
    },
  }
}

beforeEach(() => {
  fake.jobs.clear()
  fake.done.clear()
  fake.sent.length = 0
})

describe('runAll', () => {
  it('sends each node only after its upstream finished, with the upstream result in its payload', async () => {
    const ctx = env(chain())
    const progress: string[] = []
    const done = runAll(ctx, { stopped: () => false, progress: (l) => progress.push(l) })
    await settle()
    expect(fake.sent.map((s) => s.model)).toEqual(['gpt-image-2-text-to-image'])
    expect(fake.sent[0]!.input).toMatchObject({ prompt: 'a fox in snow' })

    finish('job1', 'https://cdn/g.png')
    await settle()
    expect(fake.sent.map((s) => s.model)).toEqual(['gpt-image-2-text-to-image', 'topaz/image-upscale'])
    expect(fake.sent[1]!.input).toEqual({ image_url: 'hosted:https://cdn/g.png', upscale_factor: '2' })
    expect(ctx.current.nodes.find((n) => n.id === 'g')!.data.output).toMatchObject({ url: 'https://cdn/g.png', kind: 'image' })

    finish('job2', 'https://cdn/u.png')
    await settle()
    expect(fake.sent[2]).toMatchObject({ model: 'kling-2.6/image-to-video', input: { prompt: 'a fox in snow', image_urls: ['hosted:https://cdn/u.png'] } })

    finish('job3', 'https://cdn/v.mp4')
    await expect(done).resolves.toBeNull()
    expect(ctx.current.nodes.find((n) => n.id === 'v')!.data.output).toMatchObject({ url: 'https://cdn/v.mp4', kind: 'video' })
    expect(progress.some((l) => l.startsWith('Waiting for Generate image'))).toBe(true)
  })

  it('a failure upstream stops the run before anything downstream goes out', async () => {
    const ctx = env(chain())
    const done = runAll(ctx, { stopped: () => false, progress: () => {} })
    await settle()
    finish('job1', '', false)
    await expect(done).resolves.toMatch(/Stopped: Generate image failed — boom/)
    expect(fake.sent).toHaveLength(1)
  })

  it('a refusal names the node and why', async () => {
    const board = chain()
    board.nodes = board.nodes.map((n) => (n.id === 'p' ? { ...n, data: { text: '' } } : n))
    const done = runAll(env(board), { stopped: () => false, progress: () => {} })
    await expect(done).resolves.toMatch(/Stopped at Generate image: The connected Prompt is empty/)
    expect(fake.sent).toHaveLength(0)
  })

  it('stopping leaves sent jobs alone and sends nothing more', async () => {
    let stop = false
    const done = runAll(env(chain()), { stopped: () => stop, progress: () => {} })
    await settle()
    stop = true
    finish('job1', 'https://cdn/g.png')
    await expect(done).resolves.toMatch(/^Stopped\./)
    expect(fake.sent).toHaveLength(1)
  })
})
