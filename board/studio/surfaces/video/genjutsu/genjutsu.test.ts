// Genjutsu's routing: which models each job runs on, how many pictures each takes and the
// line that says so, how @image1 is written per model, the composed prompt, what is
// remembered, the handoffs it answers, its own lane and History apart from Video's, and the
// Motion Library's shelves. Models are the
// live Kie catalogue entries (__fixtures__/genjutsu-models.json, copied 2026-10-16).
import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/genjutsu-models.json'
import type { HistoryItem, ModelDefinition } from '../../../api.ts'
import { fieldForSlot, type SlotSpec } from '../../../RailStudio.tsx'
import { routeToSurface } from '../../../nav.ts'
import { GUIDED_MODEL_ID } from '../localtools.ts'
import {
  GENJUTSU_TAG,
  IMAGE_FIELD,
  ROUTE_FILTER,
  ROUTE_MODELS,
  VIDEO_FIELD,
  START_QUALITY,
  citeFor,
  clipLengthProblem,
  composePrompt,
  genjutsuTasks,
  handoffPatch,
  imageCapacity,
  imageNote,
  isGenjutsuItem,
  modeForModel,
  motionClips,
  preferFor,
  readState,
  routeOf,
  savedClips,
  seedQuality,
  shiftCitations,
  toggleSaved,
} from './genjutsu.ts'
import { CUSTOM, STYLES, styleTag } from './styles.ts'

const models = raw as unknown as ModelDefinition[]
const byId = (id: string) => {
  const m = models.find((x) => x.id === id)
  if (!m) throw new Error(`fixture missing ${id}`)
  return m
}

describe('routes and models', () => {
  it('a style wins over the switch; otherwise the switch decides', () => {
    expect(routeOf('transfer', null)).toBe('motion')
    expect(routeOf('swap', null)).toBe('swap')
    expect(routeOf('transfer', 'knitted-yarn')).toBe('style')
    expect(routeOf('swap', CUSTOM)).toBe('style')
  })
  it('each route offers only its models, and they are all in the catalogue', () => {
    for (const ids of Object.values(ROUTE_MODELS)) for (const id of ids) expect(byId(id).id).toBe(id)
    expect(models.filter(ROUTE_FILTER.motion).map((m) => m.id)).toEqual(['kling-3.0/motion-control', 'kling-2.6/motion-control', 'wan/2-2-animate-move'])
    expect(ROUTE_FILTER.swap(byId('runway/aleph'))).toBe(false)
    expect(ROUTE_FILTER.style(byId('wan/2-2-animate-replace'))).toBe(false)
  })
  it('opens on the model last used on that route, else its first', () => {
    expect(preferFor('motion', {}).test('kling-3.0/motion-control')).toBe(true)
    expect(preferFor('swap', {}).test('happyhorse/video-edit')).toBe(true)
    expect(preferFor('swap', { swap: 'kling-3.0-omni/transformation' }).test('kling-3.0-omni/transformation')).toBe(true)
    // A model from another route is not taken.
    expect(preferFor('motion', { motion: 'runway/aleph' }).test('kling-3.0/motion-control')).toBe(true)
  })
})

describe('slots reach each model', () => {
  const clip: SlotSpec = { id: 'motion', icon: (() => null) as never, title: 'clip', kind: 'video', field: VIDEO_FIELD }
  const pic: SlotSpec = { id: 'img1', icon: (() => null) as never, title: 'Add', kind: 'image', group: 'refs', field: IMAGE_FIELD }
  it.each([
    ['kling-3.0/motion-control', 'video_urls', 'input_urls'],
    ['wan/2-2-animate-move', 'video_url', 'image_url'],
    ['kling-3.0-omni/transformation', 'video_urls', 'image_urls'],
    ['happyhorse/video-edit', 'video_url', 'reference_image'],
    ['wan/2-7-videoedit', 'video_url', 'reference_image'],
    ['runway/aleph', 'videoUrl', undefined],
  ])('%s', (id, video, image) => {
    expect(fieldForSlot(clip, byId(id))?.name).toBe(video)
    expect(fieldForSlot(pic, byId(id), 'image')?.name).toBe(image)
  })
})

describe('up to 30 pictures', () => {
  it('reads each model’s capacity', () => {
    expect(imageCapacity(byId('kling-3.0/motion-control'))).toBe(1)
    expect(imageCapacity(byId('wan/2-2-animate-replace'))).toBe(1)
    expect(imageCapacity(byId('kling-3.0-omni/transformation'))).toBe(4)
    expect(imageCapacity(byId('happyhorse/video-edit'))).toBe(5)
    expect(imageCapacity(byId('wan/2-7-videoedit'))).toBe(1)
    expect(imageCapacity(byId('runway/aleph'))).toBe(0)
  })
  it('says in one line when some are not sent', () => {
    expect(imageNote(byId('happyhorse/video-edit'), 5)).toBeNull()
    expect(imageNote(byId('happyhorse/video-edit'), 7)).toMatch(/only the first 5 of your 7 are sent/)
    expect(imageNote(byId('kling-3.0/motion-control'), 3)).toMatch(/one picture, so only the first of your 3 is sent/)
    expect(imageNote(byId('runway/aleph'), 2)).toMatch(/takes no pictures/)
    // The Custom style image goes first and takes a place.
    expect(imageNote(byId('happyhorse/video-edit'), 4, true)).toBeNull()
    expect(imageNote(byId('happyhorse/video-edit'), 5, true)).toMatch(/only the first 4 of your 5 go with the style image/)
    expect(imageNote(byId('wan/2-7-videoedit'), 2, true)).toMatch(/the style image — so your other pictures/)
  })
})

describe('citations', () => {
  it('shift past a style image in front', () => {
    expect(shiftCitations('the girl in @image1 and @Image 2', 1)).toBe('the girl in @image2 and @image3')
    expect(shiftCitations('@image1', 0)).toBe('@image1')
  })
  it('are written the way each model reads them', () => {
    expect(citeFor(byId('kling-3.0/motion-control'), 'the character from @Image 1 dancing')).toBe('the character from @image1 dancing')
    expect(citeFor(byId('kling-3.0-omni/transformation'), 'swap for @image2')).toBe('swap for @image2')
    expect(citeFor(byId('happyhorse/video-edit'), 'swap for @image1')).toBe('swap for [Image 1]')
    expect(citeFor(byId('wan/2-7-videoedit'), 'swap for @image1')).toBe('swap for the reference image')
    expect(citeFor(byId('runway/aleph'), 'make it @image1 night')).toBe('make it night')
  })
})

describe('the prompt a job sends', () => {
  const happy = byId('happyhorse/video-edit')
  const base = { mode: 'transfer' as const, style: null, prompt: 'on a rooftop', promptOn: false, pictures: 1 }
  it('motion transfer sends nothing but what you typed with Prompt on', () => {
    expect(composePrompt({ ...base, route: 'motion' }, byId('kling-3.0/motion-control'))).toBe('')
    expect(composePrompt({ ...base, route: 'motion', promptOn: true, prompt: '@image1 on a rooftop' }, byId('kling-3.0/motion-control'))).toBe('@image1 on a rooftop')
  })
  it('objects swap with no prompt becomes the swap instruction', () => {
    const p = composePrompt({ ...base, route: 'swap', mode: 'swap' }, happy)
    expect(p).toMatch(/^Replace the matching person, product or garment in the video with the one in \[Image 1\]/)
    // What you type replaces the instruction.
    expect(composePrompt({ ...base, route: 'swap', mode: 'swap', promptOn: true, prompt: 'the mug becomes @image1' }, happy)).toBe('the mug becomes [Image 1]')
  })
  it('a built-in style is its look, the keep line, then your characters', () => {
    const look = STYLES.find((s) => s.id === 'knitted-yarn')!
    const p = composePrompt({ ...base, route: 'style', style: look.id }, happy)
    expect(p.startsWith(look.prompt)).toBe(true)
    expect(p).toMatch(/motion, timing, camera movement, framing/)
    expect(p).toMatch(/character in \[Image 1\]/)
    expect(composePrompt({ ...base, route: 'style', style: look.id, pictures: 0 }, byId('runway/aleph'))).not.toMatch(/Image|@/)
  })
  it('a custom style is image 1 and your pictures follow it', () => {
    const p = composePrompt({ ...base, route: 'style', style: CUSTOM, promptOn: true, prompt: 'keep @image1 smiling' }, byId('kling-3.0-omni/transformation'))
    expect(p).toMatch(/^Redraw every frame in the exact visual style of @image1/)
    // What you type says what the pictures are for, so the default line steps aside.
    expect(p).not.toMatch(/character in/)
    expect(p.endsWith('keep @image2 smiling')).toBe(true)
    expect(composePrompt({ ...base, route: 'style', style: CUSTOM }, byId('kling-3.0-omni/transformation'))).toMatch(/character in @image2/)
  })
  it('every built-in look says medium and palette in its own words', () => {
    expect(STYLES).toHaveLength(12)
    for (const s of STYLES) expect(s.prompt.length).toBeGreaterThan(150)
  })
})

describe('memory and handoffs', () => {
  it('reads a saved state and drops what no longer exists', () => {
    expect(readState(null)).toEqual({ mode: 'transfer', style: null, promptOn: false, models: {} })
    expect(readState(JSON.stringify({ mode: 'swap', style: 'graphic-cel', promptOn: true, models: { swap: 'x' } }))).toEqual({ mode: 'swap', style: 'graphic-cel', promptOn: true, models: { swap: 'x' } })
    expect(readState(JSON.stringify({ style: 'gone' })).style).toBeNull()
    expect(readState('{bad').mode).toBe('transfer')
    // Guided swap is remembered like the other two; anything else falls back to Motion transfer.
    expect(readState(JSON.stringify({ mode: 'guided' })).mode).toBe('guided')
    expect(readState(JSON.stringify({ mode: 'katana' })).mode).toBe('transfer')
  })
  it('switches tab for Use the motion and a Reuse, and keeps everything for a Motion Library pick', () => {
    expect(handoffPatch({ mode: 'transfer' })).toEqual({ mode: 'transfer' })
    // A Reuse names its model, which must be on the tab's own list: the style goes.
    expect(handoffPatch({ mode: 'swap', modelId: 'happyhorse/video-edit' })).toEqual({ mode: 'swap', style: null })
    expect(handoffPatch({ mode: 'guided', modelId: GUIDED_MODEL_ID })).toEqual({ mode: 'guided', style: null })
    expect(handoffPatch({})).toBeNull()
    // Video's own modes are not Genjutsu's.
    expect(handoffPatch({ mode: 'motion' })).toBeNull()
    expect(handoffPatch({ mode: 'create' })).toBeNull()
  })
})

describe('its own lane and History, apart from Video', () => {
  it('opens at #/gen/genjutsu instead of handing over to Video', () => {
    expect(routeToSurface('studio/genjutsu')).toBe('genjutsu')
    expect(routeToSurface('studio/video')).toBe('video')
    expect(routeToSurface('studio/explore')).toBe('image')
  })

  it('knows its jobs by its tag, any style tag, or the guided swap model', () => {
    const tasks = genjutsuTasks({ [GENJUTSU_TAG]: ['a'], [styleTag('graphic-cel')]: ['b'], 'preset:orbit': ['c'], 'influencer:motion': ['d'] })
    expect([...tasks].sort()).toEqual(['a', 'b'])
    expect(isGenjutsuItem({ taskId: 'a' }, tasks)).toBe(true)
    expect(isGenjutsuItem({ taskId: 'b' }, tasks)).toBe(true)
    expect(isGenjutsuItem({ taskId: 'c' }, tasks)).toBe(false)
    expect(isGenjutsuItem({ taskId: 'x', modelId: GUIDED_MODEL_ID }, tasks)).toBe(true)
    expect(isGenjutsuItem({ taskId: 'x', modelId: 'kling-3.0/motion-control' }, tasks)).toBe(false)
  })

  it('reads the tab a past job ran on off its model', () => {
    expect(modeForModel('kling-3.0/motion-control')).toBe('transfer')
    expect(modeForModel('wan/2-2-animate-move')).toBe('transfer')
    expect(modeForModel('happyhorse/video-edit')).toBe('swap')
    expect(modeForModel('runway/aleph')).toBe('swap')
    expect(modeForModel(GUIDED_MODEL_ID)).toBe('guided')
    expect(modeForModel(undefined)).toBe('swap')
  })
})

describe('Motion Library', () => {
  const clip = (taskId: string, createdAt: number, extra: Partial<HistoryItem> = {}): HistoryItem =>
    ({ taskId, createdAt, model: 'm', category: 'video', state: 'success', media: [{ kind: 'video', url: `https://x/${taskId}.mp4` }], ...extra }) as HistoryItem
  const items = [clip('a', 1), clip('b', 3), clip('c', 2, { state: 'fail' } as Partial<HistoryItem>), clip('d', 4, { category: 'image', media: [{ kind: 'image', url: 'x' }] } as Partial<HistoryItem>)]
  it('From your videos: finished clips, newest first', () => {
    expect(motionClips(items).map((i) => i.taskId)).toEqual(['b', 'a'])
  })
  it('Saved motions: in saved order, only clips still in history', () => {
    expect(savedClips(['a', 'gone', 'b'], items).map((i) => i.taskId)).toEqual(['a', 'b'])
    expect(toggleSaved(['a'], 'b')).toEqual(['b', 'a'])
    expect(toggleSaved(['b', 'a'], 'b')).toEqual(['a'])
  })
})

describe('the reference video is checked before Generate', () => {
  const kling = byId('kling-3.0/motion-control')
  const omni = byId('kling-3.0-omni/transformation')
  const clip = (seconds: number, width = 1280, height = 720) => ({ seconds, width, height })

  it('takes 4–30 s on most models, with a little slack for container rounding', () => {
    expect(clipLengthProblem(kling, clip(4))).toBeNull()
    expect(clipLengthProblem(kling, clip(30.03))).toBeNull()
    expect(clipLengthProblem(kling, clip(3.2))).toMatch(/3\.2 s; .* at least 4 s/)
    expect(clipLengthProblem(kling, clip(42))).toMatch(/42 s; .* up to 30 s\. Trim it\.$/)
  })

  it('holds Kling 3.0 Omni to 15.5 s and 700 px a side, and points at the other models', () => {
    expect(clipLengthProblem(omni, clip(15))).toBeNull()
    expect(clipLengthProblem(omni, clip(20))).toMatch(/up to 15\.5 s\. Trim it — or pick another model, which takes up to 30 s\./)
    expect(clipLengthProblem(omni, clip(8, 640, 360))).toMatch(/640×360; .* at least 700 px/)
    expect(clipLengthProblem(kling, clip(8, 640, 360))).toBeNull()
  })

  it('lets an unreadable clip through (Kie has the last word)', () => {
    expect(clipLengthProblem(kling, null)).toBeNull()
    expect(clipLengthProblem(kling, clip(Number.NaN, 0, 0))).toBeNull()
    expect(clipLengthProblem(null, clip(2))).toBeNull()
  })
})

describe('Quality starts at 720p', () => {
  it('writes 720p where no Quality was ever picked, and keeps one that was', () => {
    expect(seedQuality({})).toEqual({ pills: { resolution: START_QUALITY }, byFamily: {} })
    const d = seedQuality({ pills: { aspect: '16:9' }, byFamily: { 'video:hh': { pills: {}, values: { seed: 3 } }, 'video:wan': { pills: { resolution: '1080p' }, values: {} } } })
    expect(d?.pills).toEqual({ aspect: '16:9', resolution: '720p' })
    expect(d?.byFamily?.['video:hh']).toEqual({ pills: { resolution: '720p' }, values: { seed: 3 } })
    expect(d?.byFamily?.['video:wan']?.pills.resolution).toBe('1080p')
  })

  it('says nothing needs writing once every Quality is set', () => {
    expect(seedQuality({ pills: { resolution: '1080p' }, byFamily: { a: { pills: { resolution: '720p' }, values: {} } } })).toBeNull()
  })
})
