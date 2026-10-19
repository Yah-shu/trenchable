// Video's three tabs: where old handoffs and saved tabs land, which inputs Create shows for
// a model, the duration slider and Audio chip, Motion Control's scene switch, and the
// references grid's growth and citations. Models are real Kie catalogue entries
// (__fixtures__/video-models.json, copied 2026-10-16). Nothing here touches the network.
import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/video-models.json'
import type { ModelDefinition, Ref } from '../../api.ts'
import { audioFieldOf, controlsFor, durationRange } from '../../controls.ts'
import { citationOf, fieldForSlot, visibleGroupSlots, type SlotSpec } from '../../RailStudio.tsx'
import { REF_GRID_FIELD, createInputs, placeForHandoff, placeForSaved, readsReferences, sceneField, wanScene, wanSceneTwin } from './modes.ts'

const models = raw as unknown as ModelDefinition[]
const byId = (id: string) => {
  const m = models.find((x) => x.id === id)
  if (!m) throw new Error(`fixture missing ${id}`)
  return m
}
const ids = (...list: string[]) => list.map(byId)

describe('tabs and handoffs', () => {
  it('maps every old mode onto a tab and an Edit Video tool', () => {
    expect(placeForHandoff('create', { first: 'u' })).toEqual({ tab: 'create', tool: null })
    expect(placeForHandoff(undefined, { last: 'u' })).toEqual({ tab: 'create', tool: null })
    expect(placeForHandoff('motion', { motion: 'u' })).toEqual({ tab: 'motion', tool: null })
    expect(placeForHandoff('extend', { video: 'u' })).toEqual({ tab: 'edit', tool: 'extend' })
    expect(placeForHandoff('upscale', { video: 'u' })).toEqual({ tab: 'edit', tool: 'upscale' })
    expect(placeForHandoff('lipsync', { audio: 'u' })).toEqual({ tab: 'edit', tool: 'lipsync' })
    expect(placeForHandoff('edit', { video: 'u' })).toEqual({ tab: 'edit', tool: 'edit' })
    expect(placeForHandoff('nonsense', undefined)).toBeNull()
  })

  it('reads a saved tab, old or new, and a saved tool', () => {
    expect(placeForSaved('extend', null)).toEqual({ tab: 'edit', tool: 'extend' })
    expect(placeForSaved('edit', 'fps')).toEqual({ tab: 'edit', tool: 'fps' })
    expect(placeForSaved('edit', 'list')).toEqual({ tab: 'edit', tool: null })
    expect(placeForSaved('motion', 'upscale')).toEqual({ tab: 'motion', tool: null })
    expect(placeForSaved(null, null)).toEqual({ tab: 'create', tool: null })
  })
})

describe('Create follows the model', () => {
  it('Grok Imagine shows only a start frame', () => {
    expect(createInputs(ids('grok-imagine/text-to-video', 'grok-imagine/image-to-video'))).toEqual({ start: true, end: false, refs: [] })
  })
  it('Kling 2.6 has a start frame, Kling 2.5 Turbo a start and an end frame', () => {
    expect(createInputs(ids('kling-2.6/text-to-video', 'kling-2.6/image-to-video'))).toEqual({ start: true, end: false, refs: [] })
    expect(createInputs(ids('kling/v2-5-turbo-image-to-video-pro'))).toMatchObject({ start: true, end: true })
  })
  it('Seedance 2.5 shows both frames and a grid of images, clips and audio', () => {
    expect(createInputs(ids('bytedance/seedance-2-5'))).toEqual({ start: true, end: true, refs: ['image', 'video', 'audio'] })
  })
  it('HappyHorse R2V is the grid alone; Gemini Omni is frames plus a picture grid', () => {
    expect(createInputs(ids('happyhorse/reference-to-video'))).toEqual({ start: false, end: false, refs: ['image'] })
    expect(createInputs(ids('google/gemini-omni-flash-1-1'))).toEqual({ start: true, end: true, refs: ['image'] })
    expect(readsReferences(byId('grok-imagine/image-to-video'))).toBe(false)
  })
})

describe('references grid', () => {
  const grid: SlotSpec[] = ['a', 'b', 'c', 'd'].map((id) => ({ id, icon: (() => null) as never, title: 'Add', group: 'refs', field: REF_GRID_FIELD }))
  const frame: SlotSpec = { id: 'first', icon: (() => null) as never, title: 'Start frame', role: 'first', kind: 'image' }
  it('shows the filled tiles and one empty tile to add the next', () => {
    expect([...visibleGroupSlots([frame, ...grid], () => false)]).toEqual(['first', 'a'])
    expect([...visibleGroupSlots([frame, ...grid], (id) => id === 'a' || id === 'b')]).toEqual(['first', 'a', 'b', 'c'])
  })
  it('cites each file by its kind and order', () => {
    const up: Record<string, Ref> = { a: { url: '1', kind: 'image' }, b: { url: '2', kind: 'video' }, c: { url: '3', kind: 'image' } }
    expect(citationOf(grid, up, 'a')).toBe('@Image 1')
    expect(citationOf(grid, up, 'b')).toBe('@Video 1')
    expect(citationOf(grid, up, 'c')).toBe('@Image 2')
    expect(citationOf([frame], { first: { url: '1', kind: 'image' } }, 'first')).toBeNull()
  })
  it('a tile finds the field for the kind it holds, never a frame field', () => {
    const seedance = byId('bytedance/seedance-2-5')
    expect(fieldForSlot(grid[0], seedance, 'image')?.name).toBe('reference_image_urls')
    expect(fieldForSlot(grid[0], seedance, 'video')?.name).toBe('reference_video_urls')
    expect(fieldForSlot(grid[0], byId('google/gemini-omni-flash-1-1'), 'image')?.name).toBe('image_urls')
    expect(fieldForSlot(grid[0], byId('happyhorse/reference-to-video'), 'video')).toBeUndefined()
    expect(fieldForSlot(frame, seedance)?.name).toBe('first_frame_url')
  })
})

describe('duration, audio and scene', () => {
  it('a duration range is a slider over every second; a short list stays pills', () => {
    expect(durationRange(controlsFor(byId('bytedance/seedance-2-5')).duration)).toEqual({ min: 4, max: 30, step: 1 })
    expect(controlsFor(byId('bytedance/seedance-2-5')).duration?.choices).toHaveLength(27)
    expect(durationRange(controlsFor(byId('kling-2.6/text-to-video')).duration)).toBeNull()
  })
  it('finds the sound switch under each spelling', () => {
    expect(audioFieldOf(byId('bytedance/seedance-2-5'))?.name).toBe('generate_audio')
    expect(audioFieldOf(byId('kling-2.6/text-to-video'))?.name).toBe('sound')
    expect(audioFieldOf(byId('grok-imagine/text-to-video'))).toBeUndefined()
  })
  it('scene control is Kling’s character orientation, and Wan’s Move / Replace pair', () => {
    expect(sceneField(byId('kling-3.0/motion-control'))?.name).toBe('character_orientation')
    expect(sceneField(byId('kling-2.6/motion-control'))?.required).toBe(true)
    expect(wanScene(byId('wan/2-2-animate-move'))).toBe('image')
    expect(wanSceneTwin(byId('wan/2-2-animate-move'), 'video')).toBe('wan/2-2-animate-replace')
    expect(wanSceneTwin(byId('wan/2-2-animate-replace'), 'video')).toBeNull()
    expect(wanSceneTwin(byId('kling-3.0/motion-control'), 'image')).toBeNull()
  })
})
