// Edit Video's local tools and GenShitSu's Guided swap, client side: clicks → normalised points, the
// prices shown before a Kie step, and the doctor's answer in plain words. Prices below are Kie's list
// as read on 2026-10-17. Nothing here touches the network.
import { describe, expect, it } from 'vitest'
import type { PriceRow } from '../../pricing.ts'
import { boxOf, guidedCost, guidedEstimateInput, notReady, perSecondCost, reframeEstimateInput, seedanceSeconds, toUnit } from './localtools.ts'
import { LOCAL_TOOLS, isLocalTool } from './modes.ts'

const row = (r: Partial<PriceRow>): PriceRow => ({ modelId: null, page: '', description: '', credits: 0, unit: 'second', unitText: 'per second', usd: 0, kind: 'video', ...r }) as PriceRow

const ROWS: PriceRow[] = [
  row({ page: 'seedance-2-5', description: 'bytedance/seedance-2-5, 1080p with video', credits: 95 }),
  row({ page: 'seedance-2-5', description: 'bytedance/seedance-2-5, 1080p no video', credits: 158 }),
  row({ page: 'seedance-2-5', description: 'bytedance/seedance-2-5, 480p with video', credits: 17 }),
  row({ page: 'seedance-2-5', description: 'bytedance/seedance-2-5, 480p no video', credits: 28 }),
  row({ modelId: 'happyhorse/video-edit', page: 'happyhorse-1-0', description: 'HappyHorse-1.0, video-edit, 720p', credits: 28 }),
  row({ modelId: 'happyhorse/video-edit', page: 'happyhorse-1-0', description: 'HappyHorse-1.0, video-edit, 1080p', credits: 48 }),
  row({ modelId: 'wan/2-7-videoedit', page: 'wan-2-7-video', description: 'wan 2.7 video, videoedit, 720p', credits: 16 }),
]

describe('click to select', () => {
  const rect = { left: 100, top: 50, width: 400, height: 800 }
  it('turns a click into a 0–1 point, clamped to the frame', () => {
    expect(toUnit(300, 450, rect)).toEqual({ x: 0.5, y: 0.5 })
    expect(toUnit(50, 2000, rect)).toEqual({ x: 0, y: 1 })
  })
  it('a drag is a box; a click is not', () => {
    expect(boxOf({ x: 0.8, y: 0.9 }, { x: 0.2, y: 0.1 })).toEqual([0.2, 0.1, 0.8, 0.9])
    expect(boxOf({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.6 })).toBeNull()
  })
})

describe('prices before a Kie step', () => {
  it('a guided draft is Seedance 2.5 with a reference video at 480p, billed on the guide plus the output (whole seconds, 4–15)', () => {
    expect(guidedCost(ROWS, 5.2, '480p')).toEqual({ credits: 170, perSecond: 17, seconds: 5, billed: 10 }) // Kie bills guide + output
    expect(guidedCost(ROWS, 5.2, '1080p')).toEqual({ credits: 950, perSecond: 95, seconds: 5, billed: 10 })
    expect(guidedCost(ROWS, 2, '480p')!.seconds).toBe(4)
    expect(guidedCost([], 5, '480p')).toBeNull()
    expect([seedanceSeconds(3), seedanceSeconds(9.5), seedanceSeconds(22)]).toEqual([4, 10, 15])
    expect(guidedEstimateInput(5, '480p')).toMatchObject({ draft: true, resolution: '480p', duration: 5 })
  })

  it('Reframe: the model’s per-second row at the chosen quality', () => {
    expect(perSecondCost(ROWS, 'happyhorse/video-edit', '720p', 5)).toEqual({ credits: 140, perSecond: 28 })
    expect(perSecondCost(ROWS, 'happyhorse/video-edit', '1080p', 4.6)).toEqual({ credits: 240, perSecond: 48 })
    expect(perSecondCost(ROWS, 'wan/2-7-videoedit', '1080p', 5)).toBeNull()
    expect(reframeEstimateInput('wan/2-7-videoedit', '9:16', '720p', 5.4)).toMatchObject({ aspect_ratio: '9:16', duration: 5 })
    expect(reframeEstimateInput('happyhorse/video-edit', '4:5', '720p', 5)).not.toHaveProperty('aspect_ratio')
  })
})

describe('the tools', () => {
  it('none of the five is "Soon" any more', () => {
    expect(LOCAL_TOOLS).toEqual(['reframe', 'removebg', 'hdr', 'fps', 'depth'])
    expect(isLocalTool('edit')).toBe(false)
  })
  it('says plainly when the tools are not installed or one is broken', () => {
    expect(notReady(null, ['depth'])).toBeNull()
    expect(notReady({ installed: false, reason: 'Local tools are not installed.', tools: {}, checkedAt: 0 }, ['depth'])).toBe('Local tools are not installed.')
    expect(notReady({ installed: true, tools: { depth: 'ok', rife: 'error: weights missing' }, checkedAt: 0 }, ['depth', 'rife'])).toBe('rife: error: weights missing')
  })
})
