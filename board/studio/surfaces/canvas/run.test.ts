/**
 * What a Canvas run would send, against real catalogue entries — without sending it.
 * The model each node lands on, the payload `buildInput` makes from its wiring (a first
 * frame in the frame field, an upscale factor where Topaz wants it), the refusals that
 * stop a run before anything goes out, and the order Run all would go in. No submit, no
 * fetch, no credits.
 */
import { describe, expect, it } from 'vitest'
import raw from '../../__fixtures__/models.json'
import { buildInput, type ModelDefinition } from '../../api.ts'
import { makeNode, newBoard, type Board, type CanvasNode, type NodeData, type NodeType } from './graph.ts'
import { intentFor, modelBlocker, modelFor, runPlan } from './run.ts'

const fixture = raw as unknown as ModelDefinition[]

/** Two catalogue entries the shared fixture doesn't carry, copied from /api/models. */
const geminiFlash: ModelDefinition = {
  id: 'google/gemini-omni-flash-1-1',
  model: 'google/gemini-omni-flash-1-1',
  title: 'Gemini Omni 1.1 Flash',
  category: 'video',
  provider: 'market',
  fields: [
    { name: 'prompt', type: 'textarea', label: 'Prompt', required: true },
    { name: 'image_urls', type: 'reference', label: 'Images', maxItems: 8, accept: 'image/*', mentionStyle: 'at-image' },
    { name: 'first_frame_url', type: 'reference', label: 'First frame', scalar: true, maxItems: 1, accept: 'image/*', mentionStyle: 'at-image' },
    { name: 'last_frame_url', type: 'reference', label: 'Last frame', scalar: true, maxItems: 1, accept: 'image/*', mentionStyle: 'at-image' },
    { name: 'duration', type: 'enum', label: 'Duration', required: true, enum: ['4', '6', '8', '10'] },
    { name: 'aspect_ratio', type: 'enum', label: 'Aspect', enum: ['16:9', '9:16'] },
  ],
}
const recraft: ModelDefinition = {
  id: 'recraft/crisp-upscale',
  model: 'recraft/crisp-upscale',
  title: 'Recraft - Crisp Upscale',
  category: 'image',
  provider: 'market',
  fields: [{ name: 'image', type: 'reference', label: 'Image', required: true, scalar: true, maxItems: 1, accept: 'image/*', mentionStyle: 'at-image' }],
}
const models = [...fixture, geminiFlash, recraft]

const at = (type: NodeType, data: NodeData = {}): CanvasNode => ({ ...makeNode(type, { x: 0, y: 0 }, type), data: { ...makeNode(type, { x: 0, y: 0 }).data, ...data } })

const pick = (node: CanvasNode, images: number) => {
  const r = modelFor(node, models, images)
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('modelFor', () => {
  it('opens on GPT Image 2 and switches to its image-to-image member when a picture is wired in', () => {
    expect(pick(at('genImage'), 0).model.id).toBe('gpt-image-2-text-to-image')
    expect(pick(at('genImage'), 2).model.id).toBe('gpt-image-2-image-to-image')
  })

  it('opens video on Gemini Omni Flash, and honours a picked family', () => {
    expect(pick(at('genVideo'), 0).model.id).toBe('google/gemini-omni-flash-1-1')
    expect(pick(at('genVideo', { familyKey: 'video:kling 2 6' }), 1).model.id).toBe('kling-2.6/image-to-video')
    expect(pick(at('genVideo', { familyKey: 'video:kling 2 6' }), 0).model.id).toBe('kling-2.6/text-to-video')
  })

  it('runs the named upscaler, and says so when it is missing', () => {
    expect(pick(at('upscale'), 1).model.id).toBe('topaz/image-upscale')
    expect(pick(at('upscale', { upscaler: 'recraft' }), 1).model.id).toBe('recraft/crisp-upscale')
    expect(modelFor(at('upscale', { upscaler: 'recraft' }), fixture, 1)).toEqual({ error: expect.stringMatching(/Recraft crisp upscaler isn’t in the catalogue/) })
  })
})

describe('what a run would send', () => {
  it('references go to the generator’s picture field, the aspect to its aspect field', () => {
    const node = at('genImage', { aspect: '16:9' })
    const { model } = pick(node, 2)
    const input = buildInput(model, intentFor(node, model, 'a fox', ['https://kie/a.png', 'https://kie/b.png']))
    expect(input).toMatchObject({ prompt: 'a fox', input_urls: ['https://kie/a.png', 'https://kie/b.png'], aspect_ratio: '16:9' })
  })

  it('a first frame lands in the frame field, not the references list', () => {
    const node = at('genVideo', { duration: '8', aspect: '9:16' })
    const { model } = pick(node, 1)
    const input = buildInput(model, intentFor(node, model, 'she turns', ['https://kie/frame.png']))
    expect(input.first_frame_url).toBe('https://kie/frame.png')
    expect(input.image_urls).toBeUndefined()
    expect(input).toMatchObject({ duration: '8', aspect_ratio: '9:16' })
  })

  it('without a frame field the picture takes the general route (Kling 2.6)', () => {
    const node = at('genVideo', { familyKey: 'video:kling 2 6', duration: '10' })
    const { model } = pick(node, 1)
    const input = buildInput(model, intentFor(node, model, 'slow push in', ['https://kie/f.png']))
    expect(input).toMatchObject({ image_urls: ['https://kie/f.png'], duration: '10' })
  })

  it('Topaz gets one image and the factor; Recraft just the image', () => {
    const topaz = at('upscale', { factor: '4' })
    const t = pick(topaz, 1).model
    expect(buildInput(t, intentFor(topaz, t, 'ignored', ['https://kie/x.png']))).toEqual({ image_url: 'https://kie/x.png', upscale_factor: '4' })
    const crisp = at('upscale', { upscaler: 'recraft' })
    const r = pick(crisp, 1).model
    expect(buildInput(r, intentFor(crisp, r, '', ['https://kie/x.png']))).toEqual({ image: 'https://kie/x.png' })
  })
})

describe('modelBlocker', () => {
  const byId = (id: string) => models.find((m) => m.id === id)!

  it('a picture-only model with no picture', () => {
    expect(modelBlocker(at('genVideo'), byId('hailuo/2-3-image-to-video-pro'), 'Hailuo 2.3 Pro', 'go', 0)).toMatch(/works from a first frame/)
  })

  it('a text-only model with a picture wired in', () => {
    expect(modelBlocker(at('genImage'), byId('bytedance/seedream-v4-text-to-image'), 'Seedream4.0', 'go', 1)).toMatch(/can’t take a picture/)
  })

  it('an empty prompt', () => {
    expect(modelBlocker(at('genImage'), byId('gpt-image-2-text-to-image'), 'GPT Image 2', '  ', 0)).toMatch(/Write a prompt/)
  })

  it('nothing in the way', () => {
    expect(modelBlocker(at('genImage'), byId('gpt-image-2-image-to-image'), 'GPT Image 2', 'a fox', 1)).toBeNull()
    expect(modelBlocker(at('upscale'), byId('topaz/image-upscale'), 'Topaz', '', 1)).toBeNull()
  })
})

describe('runPlan', () => {
  it('runs generators and upscalers in dependency order', () => {
    const b = newBoard('x', 'b')
    const u = makeNode('upscale', { x: 0, y: 0 }, 'u')
    const board: Board = { ...b, nodes: [u, ...b.nodes], edges: [...b.edges, { id: 'e', source: 'b-g', target: 'u', sourceHandle: 'out', targetHandle: 'image' }] }
    expect(runPlan(board)).toEqual({ ids: ['b-g', 'u'] })
  })

  it('refuses a loop and an empty board', () => {
    const loop: Board = {
      id: 'l',
      name: 'l',
      updatedAt: 0,
      nodes: [makeNode('genImage', { x: 0, y: 0 }, 'a'), makeNode('upscale', { x: 0, y: 0 }, 'z')],
      edges: [
        { id: '1', source: 'a', target: 'z', sourceHandle: 'out', targetHandle: 'image' },
        { id: '2', source: 'z', target: 'a', sourceHandle: 'out', targetHandle: 'image' },
      ],
    }
    expect(runPlan(loop)).toEqual({ error: expect.stringMatching(/loop back on themselves \(Generate image → Upscale\)/) })
    expect(runPlan({ ...loop, nodes: [makeNode('prompt', { x: 0, y: 0 })], edges: [] })).toEqual({ error: expect.stringMatching(/Nothing to run/) })
  })
})
