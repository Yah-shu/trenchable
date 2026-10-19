/**
 * The pure parts of Edit and Layers: mask colours and size, outpaint geometry, layer
 * order. A mistake in any of them repaints the wrong area or puts a layer in the wrong
 * place without any error, so each is pinned here.
 */
import { describe, expect, it } from 'vitest'
import { frameMaskPixels, invertAlpha, maskPixels, maskPolarity, paintedShare } from './mask.ts'
import { ANCHOR_OFFSET, coverZoom, dragOffset, framePlacement, nearestAspect, parseAspect } from './frame.ts'
import { layerRect, layersFrom, moveLayer, visibleStack } from './layers.ts'
import { imageFromHandoff } from './pixels.ts'
import { REFRAME_MARK, RELIGHT_MARK, UPSCALE_IDS, asMode, isImageEditor, madeBy, reframePrompt, relightPrompt } from './catalog.ts'
import type { ModelDefinition } from '../../api.ts'

/** A w×h RGBA buffer with the given pixels painted (alpha 255). */
function painted(w: number, h: number, on: [number, number][]) {
  const px = new Uint8ClampedArray(w * h * 4)
  for (const [x, y] of on) px[(y * w + x) * 4 + 3] = 255
  return px
}
const valueAt = (px: Uint8ClampedArray, w: number, x: number, y: number) => px[(y * w + x) * 4]

describe('mask export', () => {
  it('knows which colour each model repaints', () => {
    expect(maskPolarity('ideogram/v3-edit')).toBe('black-edits')
    expect(maskPolarity('ideogram/character-edit')).toBe('black-edits')
    expect(maskPolarity('qwen2-1/image-to-image')).toBe('white-edits')
  })

  it('paints the edit area white for Qwen and black for Ideogram, at the same size', () => {
    const src = painted(3, 2, [[1, 0]])
    const white = maskPixels(src, 'white-edits')
    const black = maskPixels(src, 'black-edits')
    expect(white.length).toBe(3 * 2 * 4)
    expect(valueAt(white, 3, 1, 0)).toBe(255)
    expect(valueAt(white, 3, 0, 0)).toBe(0)
    expect(valueAt(black, 3, 1, 0)).toBe(0)
    expect(valueAt(black, 3, 2, 1)).toBe(255)
  })

  it('is pure black and white and fully opaque', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 90, 0, 0, 0, 200])
    const out = maskPixels(src, 'white-edits')
    expect([...out]).toEqual([0, 0, 0, 255, 255, 255, 255, 255])
  })

  it('inverts what is painted', () => {
    const src = painted(2, 1, [[0, 0]])
    const out = maskPixels(src, 'white-edits', true)
    expect(valueAt(out, 2, 0, 0)).toBe(0)
    expect(valueAt(out, 2, 1, 0)).toBe(255)
    const flipped = invertAlpha(src, [253, 155, 155])
    expect(flipped[3]).toBe(0)
    expect(flipped[7]).toBe(255)
    expect(flipped[4]).toBe(253)
  })

  it('measures how much is painted', () => {
    expect(paintedShare(painted(2, 2, []))).toBe(0)
    expect(paintedShare(painted(2, 2, [[0, 0]]))).toBe(0.25)
  })

  it('masks everything outside the kept box for an outpaint', () => {
    const out = frameMaskPixels(4, 4, { x: 1, y: 1, w: 2, h: 2 }, 'white-edits')
    expect(valueAt(out, 4, 0, 0)).toBe(255)
    expect(valueAt(out, 4, 1, 1)).toBe(0)
    expect(valueAt(out, 4, 2, 2)).toBe(0)
    expect(valueAt(out, 4, 3, 3)).toBe(255)
    const overlapped = frameMaskPixels(4, 4, { x: 0, y: 0, w: 4, h: 4 }, 'black-edits', 1)
    expect(valueAt(overlapped, 4, 0, 0)).toBe(0)
    expect(valueAt(overlapped, 4, 1, 1)).toBe(255)
  })
})

describe('outpaint geometry', () => {
  it('reads ratios and size words', () => {
    expect(parseAspect('16:9')).toBeCloseTo(16 / 9)
    expect(parseAspect('portrait_16_9')).toBeCloseTo(9 / 16)
    expect(parseAspect('auto')).toBeNull()
  })

  it('widens a portrait to 16:9 keeping the original at full size, centred', () => {
    const p = framePlacement(900, 1600, 16 / 9, { maxSide: 10_000 })
    expect(p.canvasH).toBe(1600)
    expect(p.canvasW).toBe(Math.round(1600 * (16 / 9)))
    expect(p.w).toBe(900)
    expect(p.h).toBe(1600)
    expect(p.x).toBe(Math.round((p.canvasW - 900) / 2))
    expect(p.y).toBe(0)
  })

  it('adds room on every side when zooming out, and anchors', () => {
    const p = framePlacement(1000, 1000, 1, { zoomOut: 0.5, maxSide: 10_000 })
    expect(p.canvasW).toBe(2000)
    expect(p.x).toBe(500)
    expect(p.y).toBe(500)
    const left = framePlacement(1000, 1000, 2, { anchor: 'left', maxSide: 10_000 })
    expect(left.x).toBe(0)
    expect(left.canvasW).toBe(2000)
    const bottom = framePlacement(1000, 1000, 0.5, { anchor: 'bottom', maxSide: 10_000 })
    expect(bottom.y).toBe(bottom.canvasH - 1000)
  })

  it('places the picture anywhere in the spare room, as dragged', () => {
    const p = framePlacement(1000, 1000, 2, { offset: { fx: 0.25, fy: 0.5 }, maxSide: 10_000 })
    expect(p.x).toBe(250)
    expect(p.y).toBe(0)
    const same = framePlacement(1000, 1000, 2, { offset: ANCHOR_OFFSET.right, maxSide: 10_000 })
    expect(same).toEqual(framePlacement(1000, 1000, 2, { anchor: 'right', maxSide: 10_000 }))
    expect(dragOffset({ fx: 0.5, fy: 0.5 }, 50, -500, 200, 0)).toEqual({ fx: 0.75, fy: 0.5 })
    expect(dragOffset({ fx: 0.9, fy: 0.5 }, 100, 0, 200, 100)).toEqual({ fx: 1, fy: 0.5 })
  })

  it('crops past zoom 1: the canvas shrinks and the picture overflows it', () => {
    // a 1000×1000 picture into 16:9: covered from zoom 16/9 on
    expect(coverZoom(1000, 1000, 16 / 9)).toBeCloseTo(16 / 9)
    expect(coverZoom(1600, 900, 16 / 9)).toBeCloseTo(1)
    const p = framePlacement(1000, 1000, 16 / 9, { zoomOut: 16 / 9, maxSide: 10_000 })
    expect(p.canvasW).toBe(1000)
    expect(p.canvasH).toBe(563)
    expect(p.w).toBe(1000)
    expect(p.y).toBe(Math.round(0.5 * (563 - 1000)))
    // dragging a cropped picture down shows more of its top
    const moved = dragOffset({ fx: 0.5, fy: 0.5 }, 0, 100, 0, -437)
    expect(moved.fy).toBeLessThan(0.5)
    expect(framePlacement(1000, 1000, 16 / 9, { zoomOut: 16 / 9, offset: moved, maxSide: 10_000 }).y).toBeGreaterThan(p.y)
  })

  it('caps the long side and scales the original with it', () => {
    const p = framePlacement(4000, 3000, 16 / 9, { maxSide: 2048 })
    expect(Math.max(p.canvasW, p.canvasH)).toBe(2048)
    expect(p.w / p.h).toBeCloseTo(4 / 3, 1)
    expect(p.x + p.w).toBeLessThanOrEqual(p.canvasW)
  })

  it('picks the nearest ratio a model offers', () => {
    const choices = ['1:1', '4:3', '3:4', '16:9', '9:16'].map((value) => ({ value }))
    expect(nearestAspect(choices, 1.7)).toBe('16:9')
    expect(nearestAspect(choices, 0.7)).toBe('3:4')
    expect(nearestAspect([{ value: 'auto' }, ...choices], 1.7)).toBe('auto')
    expect(nearestAspect([{ value: 'auto' }, ...choices], 1.7, false)).toBe('16:9')
    expect(nearestAspect([{ value: 'landscape_16_9', label: '16:9' }, { value: 'square', label: '1:1' }], 1.8)).toBe('landscape_16_9')
  })
})

describe('layers', () => {
  const raw = {
    resultObject: {
      layers_data: [
        { z_index: 2, size: '400x100', url: 'https://x/2.png', name: 'Caption', bounding_box: { normalized: [100, 800, 900, 900] } },
        { z_index: 0, size: '1000x2000', url: 'https://x/0.png' },
        { z_index: 1, size: '300x300', url: 'https://x/1.png', name: 'Fox', bounding_box: { absolute: [100, 200, 400, 500] } },
      ],
    },
  }
  const media = [
    { kind: 'image' as const, url: 'https://x/0.png', localPath: 'media/t/0.png' },
    { kind: 'image' as const, url: 'https://x/1.png' },
    { kind: 'image' as const, url: 'https://x/2.png' },
  ]

  it('stacks bottom first, base without a box, archive copies preferred', () => {
    const layers = layersFrom(media, raw)
    expect(layers.map((l) => l.z)).toEqual([0, 1, 2])
    expect(layers[0]!.box).toBeNull()
    expect(layers[0]!.src).toBe('/media/t/0.png')
    expect(layers[0]!.name).toBe('Background')
    expect(layers[2]!.box).toEqual({ x: 0.1, y: 0.8, w: 0.8, h: 0.1 })
    // absolute boxes are read against the base's size
    expect(layers[1]!.box!.x).toBeCloseTo(0.1)
    expect(layers[1]!.box!.h).toBeCloseTo(0.15)
  })

  it('falls back to URL order when there is no layout data', () => {
    const layers = layersFrom(media, null)
    expect(layers.map((l) => l.name)).toEqual(['Background', 'Layer 1', 'Layer 2'])
  })

  it('reorders within bounds', () => {
    expect(moveLayer(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c'])
    expect(moveLayer(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c'])
    expect(moveLayer(['a', 'b', 'c'], 'c', -2)).toEqual(['c', 'a', 'b'])
    expect(moveLayer(['a', 'b'], 'x', 1)).toEqual(['a', 'b'])
  })

  it('draws visible layers in the chosen order, new ones on top', () => {
    const layers = layersFrom(media, raw)
    const [base, fox, caption] = layers.map((l) => l.id) as [string, string, string]
    const stack = visibleStack(layers, [fox, base], new Set([caption]))
    expect(stack.map((l) => l.id)).toEqual([fox, base])
    expect(visibleStack(layers, [base], new Set()).map((l) => l.id)).toEqual([base, fox, caption])
  })

  it('places a layer by its box', () => {
    const layers = layersFrom(media, raw)
    expect(layerRect(layers[2]!, 1000, 2000)).toEqual({ x: 100, y: 1600, w: 800, h: 200 })
    expect(layerRect(layers[0]!, 1000, 2000)).toEqual({ x: 0, y: 0, w: 1000, h: 2000 })
  })
})

describe('which models each tool runs', () => {
  const ref = (name: string, required = false) => ({ name, type: 'reference' as const, label: name, required })
  const model = (id: string, title: string, fields: ReturnType<typeof ref>[]) =>
    ({ id, model: id, title, category: 'image', provider: 'market', fields: [{ name: 'prompt', type: 'textarea', label: 'Prompt', required: true }, ...fields] }) as unknown as ModelDefinition

  it('offers prompt editors, not masks, tools or text-only models', () => {
    expect(isImageEditor(model('nano-banana-pro', 'Google - Nano Banana Pro', [ref('image_input')]))).toBe(true)
    expect(isImageEditor(model('gpt-image-2-image-to-image', 'GPT Image 2 - Image To Image', [ref('input_urls', true)]))).toBe(true)
    expect(isImageEditor(model('qwen2-1/image-to-image', 'Qwen 2.1 - Image to Image', [ref('image_urls', true), ref('mask_url')]))).toBe(true)
    expect(isImageEditor(model('ideogram/v3-edit', 'Ideogram V3 Edit', [ref('image_url', true), ref('mask_url', true)]))).toBe(false)
    expect(isImageEditor(model('topaz/image-upscale', 'Topaz - Image Upscale', [ref('image_url', true)]))).toBe(false)
    expect(isImageEditor(model('seedream/5-pro-layer-decomposition', 'Seedream5.0 Pro - Layer Decomposition', [ref('image_url', true)]))).toBe(false)
    expect(isImageEditor(model('ideogram/character', 'Ideogram - Character', [ref('reference_image_urls', true)]))).toBe(false)
    expect(isImageEditor(model('google/nano-banana', 'Google - Nano Banana', []))).toBe(false)
  })

  it('reads handoff modes', () => {
    expect(asMode('upscale')).toBe('upscale')
    expect(asMode('background')).toBe('background')
    expect(asMode('edit')).toBe('prompt')
    expect(asMode('lipsync')).toBeNull()
    expect(asMode(undefined)).toBeNull()
  })

  it('finds history by catalogue id or Kie model name', () => {
    const is = madeBy(UPSCALE_IDS)
    expect(is({ taskId: 't', model: 'topaz/image-upscale', category: 'image', state: 'success', createdAt: 0 })).toBe(true)
    expect(is({ taskId: 't', model: 'x', modelId: 'recraft/crisp-upscale', category: 'image', state: 'success', createdAt: 0 })).toBe(true)
    expect(is({ taskId: 't', model: 'nano-banana-pro', category: 'image', state: 'success', createdAt: 0 })).toBe(false)
  })

  it('writes recipes that start with their mark, so history can tell them apart', () => {
    const relight = relightPrompt({ preset: 'neon', direction: 'the right', temp: 'cool', strength: 'dramatic', extra: ' rain on the window ' })
    expect(relight.startsWith(RELIGHT_MARK)).toBe(true)
    expect(relight).toContain('from the right')
    expect(relight).toContain('magenta and cyan')
    expect(relight).toContain('7000K')
    expect(relight.endsWith('rain on the window')).toBe(true)
    for (const masked of [true, false])
      for (const padded of [true, false]) expect(reframePrompt({ aspect: '16:9', padded, masked, extra: '' }).startsWith(REFRAME_MARK)).toBe(true)
    expect(reframePrompt({ aspect: '9:16', padded: true, masked: false, extra: 'more sky' })).toContain('grey border')
    expect(reframePrompt({ aspect: '9:16', padded: true, masked: true, extra: 'more sky' })).toContain('In the new area: more sky.')
  })
})

describe('handoff pictures', () => {
  it('keeps the Kie upload to send and the archive copy to read', () => {
    expect(imageFromHandoff(null)).toBeNull()
    expect(imageFromHandoff({ surface: 'edit' })).toBeNull()
    expect(imageFromHandoff({ surface: 'edit', slots: { image: 'https://k/u.png' } })).toEqual({ url: 'https://k/u.png' })
    expect(imageFromHandoff({ surface: 'edit', slots: { image: 'https://k/u.png' }, sources: { image: { kind: 'image', url: 'https://r/x.png', localPath: 'media/t/0.png' } } })).toEqual({
      url: 'https://k/u.png',
      local: '/media/t/0.png',
    })
    // Not archived yet: the result host's URL is CORS-open, so that is the copy to read.
    expect(imageFromHandoff({ surface: 'edit', slots: { image: 'https://k/u.png' }, sources: { image: { kind: 'image', url: 'https://r/x.png' } } })!.local).toBe('https://r/x.png')
    expect(imageFromHandoff({ surface: 'layers', refs: [{ url: 'https://k/r.png', kind: 'image' }] })).toEqual({ url: 'https://k/r.png' })
  })
})
