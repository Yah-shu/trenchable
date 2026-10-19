/**
 * The Canvas rules: what may connect, what reaches a node when it runs, the order Run all
 * goes in (and the loop that stops it), how a board survives a reload — including the
 * corrupt or half-written storage a real browser hands back — and what a node's status
 * says when its job was lost. Pure: no server, no jobs, no credits.
 */
import { describe, expect, it } from 'vitest'
import type { MediaAsset, ModelDefinition } from '../../api.ts'
import {
  checkConnection,
  clock,
  connect,
  firstFrameField,
  freshBoards,
  graphBlocker,
  makeNode,
  newBoard,
  parseBoards,
  resolveInputs,
  sanitiseEdges,
  serialiseBoards,
  statusOf,
  topoOrder,
  uniqueName,
  type Board,
  type CanvasEdge,
  type CanvasNode,
  type InputHandle,
  type NodeData,
  type NodeType,
} from './graph.ts'

const node = (id: string, type: NodeType, data: NodeData = {}): CanvasNode => ({ id, type, position: { x: 0, y: 0 }, data })
const edge = (source: string, target: string, targetHandle: InputHandle): CanvasEdge => ({ id: `e-${source}-${target}-${targetHandle}`, source, target, sourceHandle: 'out', targetHandle })
const c = (source: string, target: string, targetHandle: string) => ({ source, sourceHandle: 'out', target, targetHandle })

const asset = (url: string, kind: 'image' | 'video' = 'image'): MediaAsset => ({ kind, url })

const NODES: CanvasNode[] = [
  node('p', 'prompt', { text: 'a red fox' }),
  node('img', 'image', { image: { hosted: 'https://kie/up.png', display: 'https://kie/up.png' } }),
  node('g', 'genImage'),
  node('v', 'genVideo'),
  node('u', 'upscale'),
  node('o', 'output'),
]

describe('checkConnection', () => {
  it('lets each kind into the handles that take it', () => {
    expect(checkConnection(NODES, [], c('p', 'g', 'prompt'))).toBeNull()
    expect(checkConnection(NODES, [], c('img', 'g', 'image'))).toBeNull()
    expect(checkConnection(NODES, [], c('g', 'u', 'image'))).toBeNull()
    expect(checkConnection(NODES, [], c('u', 'v', 'image'))).toBeNull()
    expect(checkConnection(NODES, [], c('v', 'o', 'media'))).toBeNull()
    expect(checkConnection(NODES, [], c('img', 'o', 'media'))).toBeNull()
  })

  it('refuses the wrong kind, in plain words', () => {
    expect(checkConnection(NODES, [], c('p', 'g', 'image'))).toMatch(/prompt can only go into a Prompt input/)
    expect(checkConnection(NODES, [], c('p', 'o', 'media'))).toMatch(/prompt can only go/)
    expect(checkConnection(NODES, [], c('img', 'g', 'prompt'))).toMatch(/picture can’t go into Prompt/)
    expect(checkConnection(NODES, [], c('v', 'u', 'image'))).toMatch(/video can only go into an Output/)
    expect(checkConnection(NODES, [], c('v', 'g', 'image'))).toMatch(/video can only go into an Output/)
  })

  it('refuses handles that do not exist and nodes with nothing to give', () => {
    expect(checkConnection(NODES, [], c('p', 'u', 'prompt'))).toMatch(/no input there/)
    expect(checkConnection(NODES, [], c('o', 'g', 'image'))).toMatch(/nothing to pass on/)
    expect(checkConnection(NODES, [], c('p', 'g', 'bogus'))).toMatch(/no input there/)
    expect(checkConnection(NODES, [], c('missing', 'g', 'prompt'))).toMatch(/gone/)
  })

  it('refuses self-feeds, duplicates and loops', () => {
    expect(checkConnection(NODES, [], c('g', 'g', 'image'))).toMatch(/itself/)
    expect(checkConnection(NODES, [edge('img', 'g', 'image')], c('img', 'g', 'image'))).toMatch(/already connected/)
    // g → u already; u → g would loop.
    expect(checkConnection(NODES, [edge('g', 'u', 'image')], c('u', 'g', 'image'))).toMatch(/loop/)
    // A longer way round: g → u → v(image) ; v is video so use an image chain g → u, u → g2 → g?
    const nodes = [...NODES, node('g2', 'genImage')]
    expect(checkConnection(nodes, [edge('g', 'u', 'image'), edge('u', 'g2', 'image')], c('g2', 'g', 'image'))).toMatch(/loop/)
  })
})

describe('connect', () => {
  it('replaces what was in a single input', () => {
    const nodes = [...NODES, node('p2', 'prompt', { text: 'b' })]
    const first = connect(nodes, [], c('p', 'g', 'prompt'))
    const second = connect(nodes, first.edges, c('p2', 'g', 'prompt'))
    expect(second.error).toBeNull()
    expect(second.edges.map((e) => e.source)).toEqual(['p2'])
  })

  it('stacks references on a generator but keeps one first frame on a video', () => {
    const nodes = [...NODES, node('img2', 'image', { image: { hosted: 'https://kie/2.png' } })]
    let edges = connect(nodes, [], c('img', 'g', 'image')).edges
    edges = connect(nodes, edges, c('img2', 'g', 'image')).edges
    expect(edges.filter((e) => e.target === 'g')).toHaveLength(2)
    edges = connect(nodes, edges, c('img', 'v', 'image')).edges
    edges = connect(nodes, edges, c('img2', 'v', 'image')).edges
    expect(edges.filter((e) => e.target === 'v').map((e) => e.source)).toEqual(['img2'])
  })

  it('passes the refusal back and leaves the edges alone', () => {
    const before = [edge('p', 'g', 'prompt')]
    const res = connect(NODES, before, c('v', 'g', 'image'))
    expect(res.error).toMatch(/video/)
    expect(res.edges).toBe(before)
  })

  it('sanitising drops edges that break the rules', () => {
    const bad: CanvasEdge[] = [edge('p', 'g', 'prompt'), edge('v', 'g', 'image'), edge('ghost', 'g', 'image'), edge('p', 'u', 'prompt')]
    expect(sanitiseEdges(NODES, bad).map((e) => `${e.source}>${e.target}`)).toEqual(['p>g'])
  })
})

describe('topoOrder', () => {
  it('puts every node after what feeds it, keeping board order otherwise', () => {
    const edges = [edge('g', 'u', 'image'), edge('p', 'g', 'prompt'), edge('img', 'g', 'image'), edge('u', 'v', 'image'), edge('p', 'v', 'prompt'), edge('v', 'o', 'media')]
    const { order, cycle } = topoOrder(NODES, edges)
    expect(cycle).toBeNull()
    expect(order).toEqual(['p', 'img', 'g', 'u', 'v', 'o'])
  })

  it('lists independent chains in board order', () => {
    const nodes = [node('a', 'genImage'), node('b', 'genImage'), node('a2', 'upscale'), node('b2', 'upscale')]
    const { order } = topoOrder(nodes, [edge('b', 'b2', 'image'), edge('a', 'a2', 'image')])
    expect(order).toEqual(['a', 'b', 'a2', 'b2'])
  })

  it('reports a loop (only a corrupt save can hold one)', () => {
    const nodes = [node('x', 'genImage'), node('y', 'upscale'), node('z', 'prompt')]
    const { cycle, order } = topoOrder(nodes, [edge('x', 'y', 'image'), edge('y', 'x', 'image')])
    expect(order).toEqual(['z'])
    expect(cycle).toEqual(['x', 'y'])
  })

  it('ignores edges to nodes that are gone', () => {
    expect(topoOrder([node('a', 'genImage')], [edge('gone', 'a', 'image')]).order).toEqual(['a'])
  })
})

describe('resolveInputs', () => {
  it('takes the prompt from a connected Prompt over the inline text', () => {
    const nodes = NODES.map((n) => (n.id === 'g' ? { ...n, data: { text: 'inline words' } } : n))
    expect(resolveInputs(nodes, [], 'g')).toMatchObject({ prompt: 'inline words', promptFrom: 'inline', waiting: [] })
    expect(resolveInputs(nodes, [edge('p', 'g', 'prompt')], 'g')).toMatchObject({ prompt: 'a red fox', promptFrom: 'edge', promptNode: 'p' })
  })

  it('an empty connected Prompt is waited on, not silently replaced by inline text', () => {
    const nodes = NODES.map((n) => (n.id === 'p' ? { ...n, data: { text: '  ' } } : n.id === 'g' ? { ...n, data: { text: 'inline' } } : n))
    const r = resolveInputs(nodes, [edge('p', 'g', 'prompt')], 'g')
    expect(r.prompt).toBe('')
    expect(r.waiting).toEqual(['p'])
  })

  it('collects references from uploads, history picks and finished results, in wiring order', () => {
    const picked = asset('https://cdn/past.png')
    const nodes = [
      ...NODES.map((n) => (n.id === 'u' ? { ...n, data: { output: { url: '/data/up.png', kind: 'image' as const, media: asset('https://cdn/up.png') } } } : n)),
      node('hist', 'image', { image: { media: picked, display: 'https://cdn/past.png' } }),
    ]
    const r = resolveInputs(nodes, [edge('img', 'g', 'image'), edge('hist', 'g', 'image'), edge('u', 'g', 'image')], 'g')
    expect(r.waiting).toEqual([])
    expect(r.images.map((i) => i.from)).toEqual(['img', 'hist', 'u'])
    expect(r.images[0]).toMatchObject({ hosted: 'https://kie/up.png', url: 'https://kie/up.png' })
    expect(r.images[1]?.media).toBe(picked)
    expect(r.images[2]).toMatchObject({ url: '/data/up.png', kind: 'image' })
  })

  it('waits on upstream generators that have no result yet', () => {
    const r = resolveInputs(NODES, [edge('g', 'u', 'image')], 'u')
    expect(r.images).toEqual([])
    expect(r.waiting).toEqual(['g'])
  })

  it('a video first frame holds one picture even if an old save had two', () => {
    const nodes = [...NODES, node('img2', 'image', { image: { hosted: 'https://kie/2.png' } })]
    const r = resolveInputs(nodes, [edge('img', 'v', 'image'), edge('img2', 'v', 'image')], 'v')
    expect(r.images.map((i) => i.from)).toEqual(['img'])
  })

  it('an Output gets whatever media flows in', () => {
    const nodes = NODES.map((n) => (n.id === 'v' ? { ...n, data: { output: { url: 'https://cdn/clip.mp4', kind: 'video' as const } } } : n))
    expect(resolveInputs(nodes, [edge('v', 'o', 'media')], 'o').media).toMatchObject({ from: 'v', kind: 'video', url: 'https://cdn/clip.mp4' })
  })

  it('an Image node with only a dead blob preview hands on nothing', () => {
    const nodes = [node('i', 'image', { image: { preview: 'blob:x' } }), node('o', 'output')]
    expect(resolveInputs(nodes, [edge('i', 'o', 'media')], 'o')).toMatchObject({ media: null, waiting: ['i'] })
  })
})

describe('graphBlocker', () => {
  it('says what to do about an empty prompt, a missing picture or an unrun upstream node', () => {
    const empty = NODES.map((n) => (n.id === 'p' ? { ...n, data: {} } : n))
    expect(graphBlocker(empty, [edge('p', 'g', 'prompt')], 'g')).toMatch(/Prompt is empty/)
    const noPic = [...NODES, node('i2', 'image')]
    expect(graphBlocker(noPic, [edge('i2', 'u', 'image')], 'u')).toMatch(/no picture yet/)
    expect(graphBlocker(NODES, [edge('g', 'u', 'image')], 'u')).toMatch(/Waiting on Generate image — run it first/)
    expect(graphBlocker(NODES, [], 'u')).toMatch(/Connect a picture/)
  })

  it('catches an expired upload before anything is sent', () => {
    const nodes = NODES.map((n) => (n.id === 'img' ? { ...n, data: { image: { hosted: 'https://kie/up.png', expiresAt: 1_000 } } } : n))
    expect(graphBlocker(nodes, [edge('img', 'u', 'image')], 'u', 2_000)).toMatch(/expired/)
    expect(graphBlocker(nodes, [edge('img', 'u', 'image')], 'u', 500)).toBeNull()
  })

  it('only runnable nodes run', () => {
    expect(graphBlocker(NODES, [], 'p')).toMatch(/doesn’t run/)
    expect(graphBlocker(NODES, [], 'nope')).toMatch(/gone/)
    expect(graphBlocker(NODES, [edge('p', 'g', 'prompt')], 'g')).toBeNull()
  })
})

describe('saving boards', () => {
  const board = (): Board => {
    const b = newBoard('Mine', 'b1')
    const g = b.nodes.find((n) => n.type === 'genImage')!
    g.data = { jobId: 'job-1', taskId: 'task-1', output: { url: '/data/x.png', kind: 'image', media: asset('https://cdn/x.png') }, familyKey: 'image:gpt image 2', aspect: '16:9' }
    const i = makeNode('image', { x: 10.4, y: 20.6 }, 'i1')
    i.data = { image: { hosted: 'https://kie/u.png', preview: 'blob:http://x/1', display: 'https://kie/u.png', expiresAt: 99 } }
    i.selected = true
    i.measured = { width: 264, height: 180 }
    b.nodes.push(i)
    return b
  }

  it('round-trips nodes, edges and results, and drops what only lives in memory', () => {
    const saved = serialiseBoards({ v: 1, activeId: 'b1', boards: [board()] })
    expect(saved).not.toContain('blob:')
    expect(saved).not.toContain('measured')
    expect(saved).not.toContain('selected')
    const back = parseBoards(saved)
    expect(back.activeId).toBe('b1')
    const b = back.boards[0]!
    expect(b.name).toBe('Mine')
    expect(b.edges).toHaveLength(2)
    const g = b.nodes.find((n) => n.type === 'genImage')!
    expect(g.data).toMatchObject({ jobId: 'job-1', taskId: 'task-1', aspect: '16:9', output: { url: '/data/x.png', kind: 'image' } })
    const i = b.nodes.find((n) => n.id === 'i1')!
    expect(i.position).toEqual({ x: 10, y: 21 })
    expect(i.data.image).toMatchObject({ hosted: 'https://kie/u.png', display: 'https://kie/u.png', expiresAt: 99 })
    expect(i.data.image?.preview).toBeUndefined()
  })

  it('starts fresh on nothing, bad JSON or the wrong shape', () => {
    for (const raw of [null, undefined, '', '{', 'null', '42', '"x"', '[]', '{"boards":"no"}', '{"boards":[]}', '{"boards":[null, 3, "x"]}']) {
      const s = parseBoards(raw)
      expect(s.boards).toHaveLength(1)
      expect(s.activeId).toBe(s.boards[0]!.id)
      expect(s.boards[0]!.nodes.length).toBeGreaterThan(0)
    }
  })

  it('keeps what it can from a damaged board', () => {
    const raw = JSON.stringify({
      activeId: 'missing',
      boards: [
        {
          id: 'b',
          name: '   ',
          nodes: [
            { id: 'p', type: 'prompt', position: { x: 'a', y: null }, data: { text: 5 } },
            { id: 'g', type: 'genImage', position: { x: 1, y: 2 }, data: { factor: '8', output: { url: 3 }, jobId: 'j' } },
            { id: 'g', type: 'genImage', position: { x: 9, y: 9 } },
            { id: 'w', type: 'wizard', position: { x: 0, y: 0 } },
            { type: 'output' },
            'junk',
          ],
          edges: [
            { source: 'p', target: 'g', targetHandle: 'prompt' },
            { source: 'g', target: 'w', targetHandle: 'image' },
            { source: 'p', target: 'g', targetHandle: 'teleport' },
            { source: 'g', target: 'p', targetHandle: 'prompt' },
            7,
          ],
        },
        { id: 'b', name: 'Twin', nodes: [], edges: [] },
      ],
    })
    const s = parseBoards(raw)
    expect(s.boards).toHaveLength(2)
    const [a, twin] = s.boards
    expect(s.activeId).toBe('b')
    expect(a!.name).toBe('Board 1')
    expect(a!.nodes.map((n) => n.id)).toEqual(['p', 'g'])
    expect(a!.nodes[0]!.position).toEqual({ x: 0, y: 0 })
    expect(a!.nodes[0]!.data).toEqual({})
    expect(a!.nodes[1]!.data).toEqual({ jobId: 'j' })
    expect(a!.edges.map((e) => `${e.source}>${e.target}:${e.targetHandle}`)).toEqual(['p>g:prompt'])
    expect(twin!.id).not.toBe('b')
    expect(twin!.name).toBe('Twin')
  })

  it('names new boards without clashing', () => {
    const { boards } = freshBoards()
    expect(uniqueName(boards, 'Board 1')).toBe('Board 1 2')
    expect(uniqueName(boards, 'Ideas')).toBe('Ideas')
    expect(uniqueName([...boards, { ...boards[0]!, name: 'Board' }], 'Board')).toBe('Board 2')
  })

  it('a new board opens on prompt → generate image → output, already wired', () => {
    const b = newBoard('X', 'x')
    expect(b.nodes.map((n) => n.type)).toEqual(['prompt', 'genImage', 'output'])
    expect(sanitiseEdges(b.nodes, b.edges)).toHaveLength(2)
  })
})

describe('statusOf', () => {
  const job = (status: 'submitting' | 'running' | 'done' | 'error', error?: string) => ({ status, error, startedAt: 1 })

  it('follows a live job', () => {
    expect(statusOf({ jobId: 'j' }, job('submitting'))).toEqual({ state: 'sending' })
    expect(statusOf({ jobId: 'j' }, job('running'))).toMatchObject({ state: 'running', startedAt: 1 })
    expect(statusOf({ jobId: 'j' }, job('error', 'NSFW'))).toEqual({ state: 'failed', error: 'NSFW' })
    expect(statusOf({ jobId: 'j' }, job('done'))).toEqual({ state: 'done' })
  })

  it('after a reload: a result is done, a lost job is interrupted, a fresh node is idle', () => {
    expect(statusOf({ jobId: 'j', output: { url: 'u', kind: 'image' } }, undefined)).toEqual({ state: 'done' })
    expect(statusOf({ jobId: 'gone' }, undefined)).toEqual({ state: 'interrupted' })
    expect(statusOf({ taskId: 't' }, undefined, 'Content blocked')).toEqual({ state: 'failed', error: 'Content blocked' })
    expect(statusOf({}, undefined)).toEqual({ state: 'idle' })
  })
})

describe('firstFrameField', () => {
  const ref = (name: string) => ({ name, type: 'reference' as const, label: name })
  const model = (...names: string[]): ModelDefinition => ({ id: 'm', model: 'm', title: 'M', category: 'video', provider: 'market', fields: [{ name: 'prompt', type: 'textarea', label: 'Prompt' }, ...names.map(ref)] })

  it('finds the frame field by name even when a references field comes first', () => {
    expect(firstFrameField(model('image_urls', 'first_frame_url', 'last_frame_url'))?.name).toBe('first_frame_url')
    expect(firstFrameField(model('start_image', 'end_image'))?.name).toBe('start_image')
  })

  it('leaves plain image fields to the general routing', () => {
    expect(firstFrameField(model('image_url', 'tail_image_url'))).toBeNull()
    expect(firstFrameField(model())).toBeNull()
  })
})

it('clock reads m:ss', () => {
  expect(clock(0)).toBe('0:00')
  expect(clock(23.4)).toBe('0:23')
  expect(clock(65)).toBe('1:05')
  expect(clock(-3)).toBe('0:00')
})
