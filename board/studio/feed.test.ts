// The feeds' Filter and View: what each filter hides (a running job never), the model list
// with its counts, per-surface memory that survives junk in storage, and the List view's
// prompt chips and resolution · duration · aspect chips.
import { describe, expect, it } from 'vitest'
import type { HistoryItem } from './api.ts'
import {
  activeFilters,
  createLastViewed,
  createSelection,
  surfaceKeyOf,
  clearFilters,
  feedDefaults,
  modelChoices,
  promptParts,
  readPrefs,
  showFailure,
  showJob,
  showResult,
  specChips,
  toggleModel,
  writePrefs,
  type FeedPrefs,
} from './feed.ts'

const now = new Date(2026, 9, 16, 15, 0)
const day = 24 * 3600_000

const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  taskId: 't',
  model: 'kling-3',
  modelId: 'kling/3',
  category: 'video',
  state: 'success',
  createdAt: now.getTime() - 3600_000,
  ...over,
})

const prefs = (over: Partial<FeedPrefs> = {}): FeedPrefs => ({ ...readPrefs('x', feedDefaults('x'), null), ...over })

/** An in-memory Storage for the persistence tests. */
const memory = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
}

describe('feed filters', () => {
  it('filters results by model, date and Liked only', () => {
    const old = item({ createdAt: now.getTime() - 10 * day })
    expect(showResult(item(), prefs(), now)).toBe(true)
    expect(showResult(item(), prefs({ models: ['other'] }), now)).toBe(false)
    expect(showResult(item(), prefs({ models: ['kling/3'] }), now)).toBe(true)
    expect(showResult(old, prefs({ range: '7d' }), now)).toBe(false)
    expect(showResult(old, prefs({ range: '30d' }), now)).toBe(true)
    expect(showResult(item(), prefs({ liked: true }), now)).toBe(false)
    expect(showResult(item({ pinned: true }), prefs({ liked: true }), now)).toBe(true)
  })

  it('keys a row without a catalogue id by its model name', () => {
    expect(showResult(item({ modelId: undefined }), prefs({ models: ['kling-3'] }), now)).toBe(true)
  })

  it('hides failures under Hide failed and Liked only', () => {
    const f = item({ state: 'fail' })
    expect(showFailure(f, prefs(), now)).toBe(true)
    expect(showFailure(f, prefs({ hideFailed: true }), now)).toBe(false)
    expect(showFailure(f, prefs({ liked: true }), now)).toBe(false)
    expect(showFailure(f, prefs({ models: ['other'] }), now)).toBe(false)
  })

  it('never hides a running job; a failed one follows the failure rules', () => {
    const off = prefs({ hideFailed: true, liked: true, models: ['other'] })
    expect(showJob({ status: 'running', modelId: 'kling/3' }, off)).toBe(true)
    expect(showJob({ status: 'submitting', modelId: 'kling/3' }, off)).toBe(true)
    expect(showJob({ status: 'error', modelId: 'kling/3' }, prefs())).toBe(true)
    expect(showJob({ status: 'error', modelId: 'kling/3' }, prefs({ hideFailed: true }))).toBe(false)
    expect(showJob({ status: 'error', modelId: 'kling/3' }, prefs({ models: ['other'] }))).toBe(false)
  })

  it('counts what is on and clears only the filters', () => {
    const p = prefs({ models: ['a'], range: 'today', hideFailed: true, liked: true, size: 400, layout: 'list' })
    expect(activeFilters(p)).toBe(4)
    expect(activeFilters(prefs())).toBe(0)
    expect(clearFilters(p)).toEqual({ ...prefs(), size: 400, layout: 'list' })
    expect(toggleModel(prefs({ models: ['a'] }), 'b')).toEqual(['a', 'b'])
    expect(toggleModel(prefs({ models: ['a', 'b'] }), 'a')).toEqual(['b'])
  })

  it('lists the feed’s own models, most used first, with titles and counts', () => {
    const rows = [item(), item({ modelId: 'veo/3', model: 'veo3' }), item(), item({ modelId: undefined, model: 'raw-model' })]
    expect(modelChoices(rows, (id) => (id === 'kling/3' ? 'Kling 3.0' : undefined))).toEqual([
      { id: 'kling/3', label: 'Kling 3.0', count: 2 },
      { id: 'raw-model', label: 'raw-model', count: 1 },
      { id: 'veo/3', label: 'veo3', count: 1 },
    ])
  })
})

describe('feed prefs', () => {
  it('opens Video on List and everything else on Grid', () => {
    expect(feedDefaults('video').layout).toBe('list')
    expect(feedDefaults('effects').layout).toBe('grid')
    expect(feedDefaults('image', true).size).toBeGreaterThan(feedDefaults('effects').size)
  })

  it('remembers each surface on its own and survives junk', () => {
    const s = memory()
    const p = { ...readPrefs('video', feedDefaults('video'), s), layout: 'grid' as const, size: 340, hideFailed: true, models: ['kling/3'] }
    writePrefs('video', p, s)
    expect(readPrefs('video', feedDefaults('video'), s)).toEqual(p)
    expect(readPrefs('effects', feedDefaults('effects'), s).hideFailed).toBe(false)
    s.setItem('st-feed:video', '{"size": 99999, "layout": "sideways", "range": "forever", "models": [1, "a"]}')
    expect(readPrefs('video', feedDefaults('video'), s)).toMatchObject({ size: 520, layout: 'list', range: 'all', models: ['a'] })
    s.setItem('st-feed:video', 'not json')
    expect(readPrefs('video', feedDefaults('video'), s).layout).toBe('list')
  })
})

describe('the List view panel', () => {
  it('turns reference tokens into chips', () => {
    expect(promptParts('A cat like @image1 walks into [Image 2] then @Video1.')).toEqual([
      { text: 'A cat like ' },
      { chip: 'Image 1' },
      { text: ' walks into ' },
      { chip: 'Image 2' },
      { text: ' then ' },
      { chip: 'Video 1' },
      { text: '.' },
    ])
    expect(promptParts('no tokens')).toEqual([{ text: 'no tokens' }])
  })

  it('reads resolution, duration and aspect from whatever the model called them', () => {
    expect(specChips({ prompt: 'x', resolution: '720p', duration: 5, aspect_ratio: '16:9' })).toEqual(['720p', '5s', '16:9'])
    expect(specChips({ duration: '10', image_size: 'portrait_16_9' })).toEqual(['10s', '9:16'])
    expect(specChips({ quality: '1080p', seconds: '8s' })).toEqual(['1080p', '8s'])
    expect(specChips({ quality: 'high', aspect_ratio: 'auto', duration: '' })).toEqual([])
    expect(specChips(undefined)).toEqual([])
  })
})

describe('selection and Last viewed', () => {
  const it3 = ['a', 'b', 'c', 'd'].map((id) => ({ taskId: id, model: 'm', category: 'image', state: 'success', createdAt: 1 }) as HistoryItem)
  const find = (id: string) => it3.find((i) => i.taskId === id)

  it('ticks, shift-ticks a run in screen order, and clears', () => {
    const sel = createSelection()
    const order = ['a', 'b', 'c', 'd']
    let calls = 0
    sel.subscribe(() => calls++)
    sel.toggle(it3[0]!, false, order, find)
    sel.toggle(it3[2]!, true, order, find)
    expect(sel.items().map((i) => i.taskId).sort()).toEqual(['a', 'b', 'c'])
    sel.toggle(it3[1]!, false, order, find)
    expect(sel.has('b')).toBe(false)
    expect(sel.size()).toBe(2)
    sel.clear()
    expect(sel.size()).toBe(0)
    expect(calls).toBe(4)
    sel.clear()
    expect(calls).toBe(4)
  })

  it('remembers the last viewed tile per surface, and survives junk in storage', () => {
    const store = new Map<string, string>([['st-last-viewed', '{"image":"x","video":3}']])
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    const lv = createLastViewed(storage)
    expect(lv.get('image')).toBe('x')
    expect(lv.get('video')).toBeNull()
    lv.mark('video', 't9')
    expect(createLastViewed(storage).get('video')).toBe('t9')
    expect(createLastViewed({ getItem: () => 'not json', setItem: () => {} }).get('image')).toBeNull()
  })

  it('reads the surface off the hash', () => {
    expect(surfaceKeyOf('#/gen/image')).toBe('image')
    expect(surfaceKeyOf('#/gen/video?x=1')).toBe('video')
    expect(surfaceKeyOf('')).toBe('studio')
  })
})
