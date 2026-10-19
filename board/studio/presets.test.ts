// The recipe catalogue that Effects, Presets and (through the same grid) Marketing read:
// it must hold together (ids, groups, a {prompt} in every recipe), filter the way the
// chips say, and find each card's cover — the user's own newest finished result.
import { describe, expect, it } from 'vitest'
import type { HistoryItem } from './api.ts'
import {
  PRESETS,
  PRESET_GROUPS,
  aboutOf,
  applyPreset,
  dressWith,
  filterPresets,
  groupsFor,
  indexHistory,
  jobOfRecipe,
  lockedLabels,
  presetById,
  presetCover,
  presetKind,
  presetTag,
  recipeCovers,
  recipeOfItem,
  recipeOfPrompt,
  recipeResults,
  taskRecipes,
} from './presets.ts'

const item = (taskId: string, over: Partial<HistoryItem> = {}): HistoryItem => ({
  taskId,
  model: 'm',
  category: 'image',
  state: 'success',
  createdAt: 1,
  media: [{ kind: 'image', url: `https://x/${taskId}.png` }],
  ...over,
})

describe('the catalogue', () => {
  it('is a real catalogue: 40 to 80 recipes with unique ids', () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(40)
    expect(PRESETS.length).toBeLessThanOrEqual(80)
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length)
  })

  it('puts every recipe in a known group and leaves room for the subject', () => {
    const groups = new Set(PRESET_GROUPS.map((g) => g.id))
    for (const p of PRESETS) {
      expect(groups.has(p.group)).toBe(true)
      expect(p.template).toContain('{prompt}')
    }
  })

  it('covers the camera moves the reference app is known for', () => {
    const titles = PRESETS.map((p) => p.title.toLowerCase()).join(' | ')
    for (const move of ['dolly zoom', 'crash zoom', 'orbit', 'fpv', 'bullet time', 'whip pan', 'handheld']) expect(titles).toContain(move)
  })

  it('has both stills and clips', () => {
    expect(PRESETS.some((p) => presetKind(p) === 'image')).toBe(true)
    expect(PRESETS.some((p) => presetKind(p) === 'video')).toBe(true)
  })
})

describe('filterPresets', () => {
  it('filters by group, type and search together', () => {
    const cams = filterPresets(PRESETS, { group: 'camera' })
    expect(cams.length).toBeGreaterThan(10)
    expect(cams.every((p) => p.group === 'camera')).toBe(true)
    expect(filterPresets(PRESETS, { type: 'image' }).every((p) => presetKind(p) === 'image')).toBe(true)
    expect(filterPresets(PRESETS, { group: 'camera', type: 'image' })).toEqual([])
    const hit = filterPresets(PRESETS, { q: 'VERTIGO' })
    expect(hit.map((p) => p.id)).toContain('cam-dolly-zoom')
  })

  it('only offers groups that have something of the chosen type', () => {
    const ids = groupsFor(PRESETS, 'image').map((g) => g.id)
    expect(ids).toContain('all')
    expect(ids).toContain('style')
    expect(ids).not.toContain('camera')
  })
})

describe('recipes', () => {
  it('fills the subject, or keeps the skeleton readable without one', () => {
    const p = { template: 'Orbit around {prompt}, slowly.' }
    expect(applyPreset(p, '  a red car ')).toBe('Orbit around a red car, slowly.')
    expect(applyPreset(p, '')).toBe('Orbit around the subject, slowly.')
    expect(dressWith(p)('a cat')).toBe('Orbit around a cat, slowly.')
  })

  it('names locked parameters the way a card shows them', () => {
    expect(lockedLabels({ aspect_ratio: '9:16', aspectRatio: '9:16', duration: 5 })).toEqual(['9:16', '5s'])
    expect(lockedLabels(undefined)).toEqual([])
  })
})

describe('presetCover', () => {
  it('uses the newest finished result, skipping failed and missing ones', () => {
    const byTask = indexHistory([item('old'), item('failed', { state: 'fail' }), item('clip', { category: 'video', media: [{ kind: 'video', url: 'https://x/clip.mp4' }] })])
    expect(presetCover(['gone', 'failed', 'old'], byTask)).toEqual({ src: 'https://x/old.png', video: false })
    expect(presetCover(['clip', 'old'], byTask)).toEqual({ src: 'https://x/clip.mp4', video: true })
  })

  it('prefers the archived copy and is null with nothing to show', () => {
    const byTask = indexHistory([item('a', { media: [{ kind: 'image', url: 'https://x/a.png', localPath: 'media/a/0.png' }] })])
    expect(presetCover(['a'], byTask)?.src).toBe('/media/a/0.png')
    expect(presetCover([], byTask)).toBeNull()
    expect(presetCover(undefined, byTask)).toBeNull()
  })

  it('tags by recipe id', () => {
    expect(presetTag('cam-orbit')).toBe('preset:cam-orbit')
  })
})

describe('which recipe a result came from', () => {
  const orbit = presetById('cam-orbit')!
  const melt = presetById('fx-melt')!
  const clean = presetById('product-clean')!

  it('every recipe is told apart by its own words, whatever the subject', () => {
    for (const p of PRESETS) {
      expect(recipeOfPrompt(applyPreset(p, 'a man of 34 in his workshop'))?.id).toBe(p.id)
      expect(recipeOfPrompt(applyPreset(p, ''))?.id).toBe(p.id)
    }
    // Titles are unique too: a live job is matched by its title.
    expect(new Set(PRESETS.map((p) => p.title)).size).toBe(PRESETS.length)
  })

  it('a plain prompt, or a recipe someone rewrote, names no recipe', () => {
    expect(recipeOfPrompt('a red car on a wet road at night')).toBeNull()
    expect(recipeOfPrompt(applyPreset(melt, 'a cat').replace('melts', 'freezes'))).toBeNull()
    expect(recipeOfPrompt('')).toBeNull()
    expect(recipeOfPrompt(undefined)).toBeNull()
  })

  it('reads the tracker first, then the prompt (or the input when history kept no prompt)', () => {
    const byTask = taskRecipes({ [presetTag('cam-orbit')]: ['t1'], 'influencer:create': ['t2'], [presetTag('marketing-x')]: ['t3'] })
    expect([...byTask]).toEqual([['t1', 'cam-orbit']])
    expect(recipeOfItem({ taskId: 't1', prompt: 'anything' }, byTask)).toBe('cam-orbit')
    expect(recipeOfItem({ taskId: 'n', prompt: applyPreset(melt, 'a candle') }, byTask)).toBe('fx-melt')
    expect(recipeOfItem({ taskId: 'n', input: { prompt: applyPreset(clean, 'a jar') } }, byTask)).toBe('product-clean')
    expect(recipeOfItem({ taskId: 'n', prompt: 'a jar' }, byTask)).toBeNull()
  })

  it('matches a live job by its title or its words', () => {
    expect(jobOfRecipe({ meta: { label: orbit.title }, prompt: '' }, orbit)).toBe(true)
    expect(jobOfRecipe({ meta: {}, prompt: applyPreset(orbit, 'a car') }, orbit)).toBe(true)
    expect(jobOfRecipe({ meta: { label: 'Upscale ×2' }, prompt: applyPreset(melt, 'a car') }, orbit)).toBe(false)
  })

  it('gives each recipe its newest finished result as the cover, and lists its results newest first', () => {
    const items = [
      item('old', { createdAt: 1, prompt: applyPreset(melt, 'a candle') }),
      item('new', { createdAt: 3, category: 'video', prompt: applyPreset(melt, 'ice'), media: [{ kind: 'video', url: 'https://x/new.mp4' }] }),
      item('failed', { createdAt: 4, state: 'fail', prompt: applyPreset(melt, 'wax'), media: [] }),
      item('tracked', { createdAt: 2, prompt: 'edited by hand' }),
      item('plain', { createdAt: 5, prompt: 'a dog' }),
    ]
    const byTask = taskRecipes({ [presetTag('cam-orbit')]: ['tracked'] })
    const covers = recipeCovers(items, byTask)
    expect(covers.get('fx-melt')).toEqual({ src: 'https://x/new.mp4', video: true })
    expect(covers.get('cam-orbit')).toEqual({ src: 'https://x/tracked.png', video: false })
    expect(covers.size).toBe(2)
    expect(recipeResults(items, 'fx-melt', byTask).map((i) => i.taskId)).toEqual(['failed', 'new', 'old'])
  })

  it('describes a recipe in its own words', () => {
    expect(aboutOf(melt)).toMatch(/^The subject slowly melts/)
    expect(aboutOf(clean)).toMatch(/^Studio product photograph of your subject\./)
  })
})
