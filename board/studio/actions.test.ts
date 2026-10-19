// Result actions: the decisions behind the viewer's buttons — which tools fit which kind of
// file, what each handoff carries (the contract in docs/STUDIO-ENGINE.md), what a download is
// called, how a job's settings read as a table, and which upload a file needs before Kie can
// use it. The network is stubbed, and the queue's submitJob is replaced: nothing here submits a job.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { studioApi, type HistoryItem, type MediaAsset, type ModelDefinition } from './api.ts'
import { takeHandoff } from './handoff.ts'
import { isSettled, submitJob, type Job } from './jobs.ts'
import { libraryApi, type Element, type Project } from './library.ts'
import { ANGLES, anglePrompt, identityEditor, pickedAngles } from './surfaces/edit/catalog.ts'
import editModels from './surfaces/edit/__fixtures__/edit-models.json'
// Regenerate goes through the queue; the real one would POST /api/generate and spend credits.
vi.mock('./jobs.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('./jobs.ts')>()), submitJob: vi.fn(() => 'job-test') }))

import {
  addToProject,
  canSaveElement,
  dateWords,
  downloadItems,
  downloadMedia,
  downloadSource,
  editToolOf,
  editorRoom,
  elementSource,
  extOf,
  fileNameFor,
  handoffFor,
  hostOnce,
  hostPlan,
  humanize,
  imageEditBlocker,
  imageEditInput,
  inDateRange,
  isEnhanced,
  isUrl,
  itemOfJob,
  kindOf,
  matchesSearch,
  matchesType,
  mediaOf,
  prepareReuse,
  recreate,
  retryFailed,
  reuseHandoff,
  reuseMode,
  reuseSources,
  reuseSurface,
  regenerate,
  regenerateBlocker,
  regenerateInput,
  regenerateMeta,
  runTool,
  saveAsElement,
  selectRange,
  setFavourites,
  settingRows,
  slugOf,
  toolsFor,
  urlKind,
  zipName,
  zipPlan,
} from './actions.ts'

const item = (over: Partial<HistoryItem> = {}): HistoryItem => ({
  taskId: 'abcdef1234567890',
  model: 'nano-banana-pro',
  category: 'image',
  state: 'success',
  createdAt: Date.now(),
  ...over,
})

const model = (over: Partial<ModelDefinition>): ModelDefinition => ({
  id: 'x',
  model: 'x',
  title: 'X',
  category: 'image',
  provider: 'market',
  fields: [],
  ...over,
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('what a result holds', () => {
  it('drops text attachments and falls back to resultUrls for old rows', () => {
    const withText = item({ media: [{ kind: 'image', url: 'https://x/a.png' }, { kind: 'text', url: 'https://x/lyrics.txt' }] })
    expect(mediaOf(withText)).toHaveLength(1)
    expect(mediaOf(item({ category: 'video', resultUrls: ['https://x/a.mp4'] }))).toEqual([{ kind: 'video', url: 'https://x/a.mp4' }])
    expect(mediaOf(item({ media: [{ kind: 'image' }] }))).toEqual([])
  })

  it('takes the kind from the file, then from the job', () => {
    expect(kindOf(item({ category: 'video' }), { kind: 'image', url: 'u' })).toBe('image')
    expect(kindOf(item({ category: 'audio' }))).toBe('audio')
    expect(kindOf(item({ category: 'video' }), { kind: 'text', url: 'u' })).toBe('video')
  })
})

describe('downloads', () => {
  it('finds the extension on the archive path, then the URL, then the type', () => {
    expect(extOf({ kind: 'image', localPath: 'media/t/0.webp', url: 'https://x/a.png' })).toBe('webp')
    expect(extOf({ kind: 'video', url: 'https://x/clip.MP4?sig=1.png' })).toBe('mp4')
    expect(extOf({ kind: 'audio', url: 'https://x/stream', mimeType: 'audio/wav' })).toBe('wav')
    expect(extOf({ kind: 'video', url: 'https://x/stream' })).toBe('mp4')
  })

  it('names the file after the prompt, the task and the output number', () => {
    const it1 = item({ prompt: 'A café on the Seine at dawn, shot on 35mm film with soft grain everywhere' })
    const m: MediaAsset = { kind: 'image', localPath: 'media/abc/0.png' }
    expect(fileNameFor(it1, m)).toBe('a-cafe-on-the-seine-at-dawn-shot-on-35mm-film-abcdef12.png')
    expect(fileNameFor(it1, m, 1, 4)).toBe('a-cafe-on-the-seine-at-dawn-shot-on-35mm-film-abcdef12-2.png')
    expect(fileNameFor(item({ prompt: '', model: 'Seedance 2' }), { kind: 'video', url: 'https://x/v.mp4' })).toBe('seedance-2-abcdef12.mp4')
    expect(fileNameFor(item({ prompt: '!!!', model: '' }), m)).toBe('trenchable-abcdef12.png')
  })

  it('cuts a slug on a word boundary', () => {
    expect(slugOf('one two three', 9)).toBe('one-two')
    expect(slugOf('supercalifragilistic', 5)).toBe('super')
    expect(slugOf('')).toBe('')
  })

  it('prefers the archived copy, which is same-origin and never expires', () => {
    expect(downloadSource({ kind: 'image', localPath: 'media/t/0.png', url: 'https://x/a.png' })).toEqual({ href: '/media/t/0.png', local: true })
    expect(downloadSource({ kind: 'image', url: 'https://x/a.png' })).toEqual({ href: 'https://x/a.png', local: false })
    expect(downloadSource({ kind: 'image' })).toBeNull()
  })
})

describe('which actions fit which result', () => {
  it('offers image tools on stills, clip tools on video, lip-sync on audio', () => {
    expect(toolsFor('image').map((t) => t.id)).toEqual(['reference', 'animate', 'last-frame', 'upscale', 'background', 'inpaint', 'reframe', 'relight', 'angles', 'layers'])
    expect(toolsFor('video').map((t) => t.id)).toEqual(['extend', 'upscale-video', 'lipsync', 'edit-video', 'motion', 'change-voice', 'translate'])
    expect(toolsFor('audio').map((t) => t.id)).toEqual(['lipsync-audio', 'isolate', 'cover'])
  })

  it('only lets a still become an Element', () => {
    expect(canSaveElement('image')).toBe(true)
    expect(canSaveElement('video')).toBe(false)
    expect(canSaveElement('audio')).toBe(false)
  })
})

describe('handoffs follow the engine contract', () => {
  const v = item({ category: 'video', taskId: 'task-9' })
  const url = 'https://kie/up/1'

  it('names the original file behind every slot', () => {
    const m: MediaAsset = { kind: 'image', localPath: 'media/t/0.png' }
    expect(handoffFor('reframe', item(), url, m)).toEqual({ surface: 'edit', mode: 'reframe', slots: { image: url }, sources: { image: m } })
    expect(handoffFor('reference', item(), url, m)).toEqual({ surface: 'image', refs: [{ url, kind: 'image' }] })
  })

  it('sends stills where they belong', () => {
    expect(handoffFor('reference', item(), url)).toEqual({ surface: 'image', refs: [{ url, kind: 'image' }] })
    expect(handoffFor('animate', item(), url)).toEqual({ surface: 'video', mode: 'create', slots: { first: url } })
    expect(handoffFor('last-frame', item(), url)).toEqual({ surface: 'video', mode: 'create', slots: { last: url } })
    for (const mode of ['upscale', 'background', 'inpaint', 'reframe', 'relight', 'angles'] as const) {
      expect(handoffFor(mode, item(), url)).toEqual({ surface: 'edit', mode, slots: { image: url } })
    }
    expect(handoffFor('layers', item(), url)).toEqual({ surface: 'layers', slots: { image: url } })
  })

  it('sends clips with the task id where a tool works by task', () => {
    expect(handoffFor('extend', v, url)).toEqual({ surface: 'video', mode: 'extend', slots: { video: url }, sourceTaskId: 'task-9' })
    expect(handoffFor('upscale-video', v, url)).toEqual({ surface: 'video', mode: 'upscale', slots: { video: url }, sourceTaskId: 'task-9' })
    expect(handoffFor('lipsync', v, url)).toEqual({ surface: 'video', mode: 'lipsync', slots: { video: url } })
    expect(handoffFor('edit-video', v, url)).toEqual({ surface: 'video', mode: 'edit', slots: { video: url } })
    // Use the motion opens Genjutsu (its own lane), on Motion transfer.
    expect(handoffFor('motion', v, url)).toEqual({ surface: 'genjutsu', mode: 'transfer', slots: { motion: url } })
  })

  it("sends a clip to Audio's Voice change and Translate tabs", () => {
    expect(handoffFor('change-voice', v, url)).toEqual({ surface: 'audio', mode: 'change', slots: { video: url } })
    expect(handoffFor('translate', v, url)).toEqual({ surface: 'audio', mode: 'translate', slots: { video: url } })
  })

  it('puts audio in the lip-sync, isolate and cover audio slots', () => {
    const a = item({ category: 'audio' })
    expect(handoffFor('lipsync-audio', a, url)).toEqual({ surface: 'video', mode: 'lipsync', slots: { audio: url } })
    expect(handoffFor('isolate', a, url)).toEqual({ surface: 'audio', mode: 'isolate', slots: { audio: url } })
    expect(handoffFor('cover', a, url)).toEqual({ surface: 'audio', mode: 'music', slots: { audio: url } })
  })
})

describe('Reuse', () => {
  it('lands on the tab the job came from', () => {
    expect(reuseMode(item())).toBeUndefined()
    expect(reuseMode(item({ category: 'video', modelId: 'bytedance/seedance-2-mini' }))).toBe('create')
    expect(reuseMode(item({ category: 'video', modelId: 'veo3/extend' }))).toBe('extend')
    expect(reuseMode(item({ category: 'video', modelId: 'kling/ai-avatar' }))).toBe('lipsync')
    expect(reuseMode(item({ category: 'video', modelId: 'kling-2.6/motion-control' }))).toBe('motion')
    expect(reuseMode(item({ category: 'audio', modelId: 'elevenlabs/text-to-dialogue-v3' }))).toBe('dialogue')
    expect(reuseMode(item({ category: 'audio', modelId: 'suno/generate-music' }))).toBe('music')
    expect(reuseMode(item({ category: 'audio', modelId: 'elevenlabs/text-to-speech' }))).toBe('tts')
  })

  it('sends a Genjutsu job back to Genjutsu, not Video, its clip and pictures in their slots', () => {
    const guided = item({ category: 'video', modelId: 'studio/guided-swap', input: { video_url: 'https://k/clip.mp4', image_urls: ['https://k/a.png', 'https://k/b.png'] } })
    expect(reuseSurface(guided)).toBe('genjutsu')
    expect(reuseMode(guided)).toBe('guided')
    expect(reuseSources(guided).map((s) => s.slot)).toEqual(['motion', 'img1', 'img2'])
    expect(regenerateMeta(guided).surface).toBe('genjutsu')
    // An untagged Motion Control job is Video's.
    expect(reuseSurface(item({ category: 'video', modelId: 'kling-2.6/motion-control' }))).toBe('video')
  })

  it('puts an image job’s files back as references', () => {
    const it1 = item({ input: { prompt: 'p', input_urls: ['https://k/a.png', 'https://k/b.png'], aspect_ratio: '1:1' } })
    expect(reuseSources(it1)).toEqual([
      { key: 'input_urls', url: 'https://k/a.png', kind: 'image' },
      { key: 'input_urls', url: 'https://k/b.png', kind: 'image' },
    ])
  })

  it('puts a video job’s frames back in their slots, one file per slot', () => {
    const it1 = item({
      category: 'video',
      modelId: 'kling/i2v',
      input: { first_frame_url: 'https://k/f.png', last_frame_url: 'https://k/l.png', image_urls: ['https://k/x.png'] },
    })
    expect(reuseSources(it1).map((s) => [s.key, s.slot])).toEqual([
      ['first_frame_url', 'first'],
      ['last_frame_url', 'last'],
    ])
  })

  it('reads the kind off the model’s field when the model is known', () => {
    const m = model({
      category: 'video',
      fields: [
        { name: 'prompt', type: 'textarea', label: 'Prompt' },
        { name: 'video_url', type: 'reference', label: 'Video', accept: 'video/*', scalar: true },
        { name: 'audio_url', type: 'reference', label: 'Audio', accept: 'audio/*', scalar: true },
      ],
    })
    const it1 = item({ category: 'video', modelId: 'infinitetalk/lip-sync', input: { video_url: 'https://k/blob1', audio_url: 'https://k/blob2', prompt: 'x' } })
    expect(reuseSources(it1, m).map((s) => [s.kind, s.slot])).toEqual([
      ['video', 'video'],
      ['audio', 'audio'],
    ])
  })

  it('carries model, settings, prompt and files', () => {
    const it1 = item({ modelId: 'nano-banana-pro', prompt: 'p', input: { prompt: 'p', aspect_ratio: '4:5' } })
    expect(reuseHandoff(it1, [{ key: 'input_urls', url: 'https://k/a.png', kind: 'image' }])).toEqual({
      surface: 'image',
      prompt: 'p',
      modelId: 'nano-banana-pro',
      values: { prompt: 'p', aspect_ratio: '4:5' },
      refs: [{ url: 'https://k/a.png', kind: 'image' }],
    })
    const v = item({ category: 'video', modelId: 'seedance', input: {} })
    expect(reuseHandoff(v, [{ key: 'first_frame_url', url: 'https://k/f.png', kind: 'image', slot: 'first' }])).toMatchObject({ surface: 'video', mode: 'create', slots: { first: 'https://k/f.png' } })
  })

  it('uses young files as they are and re-hosts old ones, leaving out what Kie lost', async () => {
    const rehost = vi.spyOn(studioApi, 'rehost')
    const young = item({ input: { input_urls: ['https://k/a.png'] } })
    expect(await prepareReuse(young)).toMatchObject({ dropped: 0, handoff: { refs: [{ url: 'https://k/a.png' }] } })
    expect(rehost).not.toHaveBeenCalled()

    rehost.mockImplementation(async (u: string) => {
      if (u.includes('gone')) throw new Error('404')
      return { fileUrl: `${u}?fresh` }
    })
    const old = item({ createdAt: Date.now() - 5 * 24 * 3600_000, input: { input_urls: ['https://k/a.png', 'https://k/gone.png'] } })
    const out = await prepareReuse(old)
    expect(out.dropped).toBe(1)
    expect(out.handoff.refs).toEqual([{ url: 'https://k/a.png?fresh', kind: 'image' }])
  })

  it('sends an Edit tool’s result back to that tool, with its picture in the slot', () => {
    const up = item({ modelId: 'topaz/image-upscale', model: 'topaz/image-upscale', input: { image_url: 'https://k/src.png', upscale_factor: '2' } })
    expect(editToolOf(up)).toBe('upscale')
    expect(reuseHandoff(up, reuseSources(up))).toEqual({
      surface: 'edit',
      mode: 'upscale',
      modelId: 'topaz/image-upscale',
      values: { image_url: 'https://k/src.png', upscale_factor: '2' },
      slots: { image: 'https://k/src.png' },
    })
    expect(editToolOf(item({ modelId: 'recraft/remove-background' }))).toBe('background')
    expect(editToolOf(item({ prompt: 'Relight this photo with warm light.' }))).toBe('relight')
    // Angles' recipe marks its results, so Reuse goes back to Angles with the picture.
    const turned = item({ modelId: 'nano-banana-pro', prompt: anglePrompt('left45'), input: { image_input: ['https://k/src.png'] } })
    expect(editToolOf(turned)).toBe('angles')
    expect(reuseHandoff(turned, reuseSources(turned))).toMatchObject({ surface: 'edit', mode: 'angles', slots: { image: 'https://k/src.png' } })
    // Reframe with a masked border is still Reframe, not Inpaint.
    expect(editToolOf(item({ modelId: 'ideogram/v3-edit', prompt: 'Reframe this picture to 16:9 …', input: { mask_url: 'https://k/m.png' } }))).toBe('reframe')
    const paint = item({ modelId: 'ideogram/v3-edit', prompt: 'a hat', input: { image_url: 'https://k/src.png', mask_url: 'https://k/m.png' } })
    expect(editToolOf(paint)).toBe('inpaint')
    // The painted mask is drawn again; only the picture goes back.
    expect(reuseSources(paint)).toEqual([{ key: 'image_url', url: 'https://k/src.png', kind: 'image', slot: 'image' }])
    // A mask model without a mask, or an ordinary image job, stays an Image job.
    expect(editToolOf(item({ modelId: 'ideogram/v3-edit', prompt: 'a hat' }))).toBeNull()
    expect(reuseHandoff(item({ modelId: 'nano-banana-pro' })).surface).toBe('image')
    expect(editToolOf(item({ category: 'video', modelId: 'topaz/image-upscale' }))).toBeNull()
  })
})

describe('Recreate and retrying a failure', () => {
  const failed = item({ taskId: 'fail-1', state: 'fail', modelId: 'nano-banana-pro', prompt: 'p', input: { prompt: 'p', aspect_ratio: '4:5' } })

  it('puts a failed job back in its form without running anything', async () => {
    vi.mocked(submitJob).mockClear()
    expect(await recreate(failed)).toBe(0)
    expect(takeHandoff('image')).toMatchObject({ surface: 'image', prompt: 'p', modelId: 'nano-banana-pro', values: { aspect_ratio: '4:5' } })
    expect(submitJob).not.toHaveBeenCalled()
  })

  it('reads a queued job as the history row it becomes', () => {
    const job = {
      id: 'job-1',
      taskId: null,
      modelId: 'kling/3',
      modelTitle: 'Kling 3.0',
      category: 'video',
      provider: 'market',
      operation: 'generate',
      input: { prompt: 'q', duration: 5 },
      prompt: 'q',
      meta: { surface: 'video' },
      status: 'error',
      error: 'flagged',
      startedAt: 1000,
    } as Job
    expect(itemOfJob(job)).toEqual({
      taskId: 'job-1',
      model: 'Kling 3.0',
      modelId: 'kling/3',
      category: 'video',
      state: 'fail',
      createdAt: 1000,
      provider: 'market',
      operation: 'generate',
      input: { prompt: 'q', duration: 5 },
      prompt: 'q',
      failMsg: 'flagged',
    })
  })

  it('retries a failed row and settles it, so it leaves the feed', async () => {
    const m = model({ id: 'nano-banana-pro', fields: [{ name: 'prompt', type: 'textarea', label: 'Prompt' }] })
    expect(isSettled('fail-1')).toBe(false)
    expect(await retryFailed(failed, m)).toBe('job-test')
    expect(isSettled('fail-1')).toBe(true)
  })
})

describe('the settings table', () => {
  it('leaves out the prompt, pulls out file links and words the values', () => {
    const it1 = item({
      prompt: 'a cat',
      input: {
        prompt: 'a cat',
        aspect_ratio: '9:16',
        duration: 7,
        generate_audio: false,
        first_frame_url: 'https://k/f.png',
        input_urls: ['https://k/a.png', 'https://k/b.png'],
        tags: ['a', 'b'],
        _parentTaskId: 'x',
        negative_prompt: '',
        extra: { seed: 4 },
      },
    })
    const { rows, files } = settingRows(it1)
    expect(rows).toEqual([
      { key: 'aspect_ratio', label: 'Aspect ratio', value: '9:16' },
      { key: 'duration', label: 'Duration', value: '7s' },
      { key: 'generate_audio', label: 'Generate audio', value: 'Off' },
      { key: 'tags', label: 'Tags', value: 'a, b' },
      { key: 'extra', label: 'Extra', value: '{"seed":4}' },
    ])
    expect(files).toEqual([
      { key: 'first_frame_url', label: 'First frame url', urls: ['https://k/f.png'] },
      { key: 'input_urls', label: 'Input urls', urls: ['https://k/a.png', 'https://k/b.png'] },
    ])
  })

  it('uses the model’s labels and order, and its prompt field', () => {
    const m = model({
      fields: [
        { name: 'text', type: 'textarea', label: 'Script' },
        { name: 'voice', type: 'enum', label: 'Voice', enum: ['Rachel'] },
        { name: 'speed', type: 'number', label: 'Speaking speed' },
      ],
    })
    const it1 = item({ category: 'audio', prompt: 'Hello there', input: { speed: 1.1, voice: 'Rachel', text: 'Hello there', timestamps: true } })
    expect(settingRows(it1, m).rows).toEqual([
      { key: 'voice', label: 'Voice', value: 'Rachel' },
      { key: 'speed', label: 'Speaking speed', value: '1.1' },
      { key: 'timestamps', label: 'Timestamps', value: 'On' },
    ])
  })

  it('humanizes field names', () => {
    expect(humanize('aspect_ratio')).toBe('Aspect ratio')
    expect(humanize('firstFrameUrl')).toBe('First frame url')
    expect(humanize('n')).toBe('N')
  })

  it('tells links from text, and a link’s kind from its extension', () => {
    expect(isUrl('https://x/a')).toBe(true)
    expect(isUrl('/media/t/0.png')).toBe(true)
    expect(isUrl('a cat')).toBe(false)
    expect(urlKind('https://x/a.JPG?x=1')).toBe('image')
    expect(urlKind('https://x/a.mov')).toBe('video')
    expect(urlKind('https://x/a.m4a')).toBe('audio')
    expect(urlKind('https://x/blob')).toBe('file')
  })
})

describe('getting a file to Kie', () => {
  it('uploads the archive copy, else re-hosts the provider link', () => {
    expect(hostPlan({ kind: 'image', localPath: 'media/t/0.png', url: 'https://x/a.png' })).toEqual({ via: 'upload', from: '/media/t/0.png' })
    expect(hostPlan({ kind: 'image', url: 'https://x/a.png' })).toEqual({ via: 'rehost', from: 'https://x/a.png' })
    expect(hostPlan({ kind: 'image' })).toBeNull()
  })

  it('uploads a file once and reuses the link for the next action', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['png'], { type: 'image/png' }))))
    const upload = vi.spyOn(studioApi, 'upload').mockResolvedValue({ fileUrl: 'https://kie/up/once', originalFileName: '0.png' })
    const m: MediaAsset = { kind: 'image', localPath: 'media/host-once-test/0.png' }
    const [a, b] = await Promise.all([hostOnce(m), hostOnce(m)])
    expect(await hostOnce(m)).toBe('https://kie/up/once')
    expect([a, b]).toEqual(['https://kie/up/once', 'https://kie/up/once'])
    expect(upload).toHaveBeenCalledTimes(1)
  })

  it('gives Elements the same-origin archive path or an https link', () => {
    expect(elementSource({ kind: 'image', localPath: 'media/t/0.png' })).toBe('/media/t/0.png')
    expect(elementSource({ kind: 'image', url: 'https://x/a.png' })).toBe('https://x/a.png')
    expect(elementSource({ kind: 'image', url: 'http://x/a.png' })).toBeNull()
  })
})

describe('favourites', () => {
  it('sends only the flag, only for results whose state changes, then refreshes once', async () => {
    const fav = vi.spyOn(studioApi, 'favourite').mockImplementation(async (taskId, on) => ({ taskId, pinned: on }))
    const save = vi.spyOn(studioApi, 'saveHistory')
    const history = vi.spyOn(studioApi, 'history').mockResolvedValue({ items: [], count: 0 })
    const a = item({ taskId: 'a', pinned: true })
    const b = item({ taskId: 'b' })
    const c = item({ taskId: 'c' })
    await setFavourites([a, b, c], true)
    expect(fav.mock.calls).toEqual([
      ['b', true],
      ['c', true],
    ])
    expect(save).not.toHaveBeenCalled()
    expect(history).toHaveBeenCalledTimes(1)
    fav.mockClear()
    await setFavourites([a], true)
    expect(fav).not.toHaveBeenCalled()
  })

  it('says how many did not save', async () => {
    vi.spyOn(studioApi, 'favourite').mockImplementation(async (taskId, on) => {
      if (taskId === 'b') throw new Error('Task not found')
      return { taskId, pinned: on }
    })
    vi.spyOn(studioApi, 'history').mockResolvedValue({ items: [], count: 0 })
    await expect(setFavourites([item({ taskId: 'a' }), item({ taskId: 'b' })], true)).rejects.toThrow('1 of 2 did not save.')
    await expect(setFavourites([item({ taskId: 'b' })], true)).rejects.toThrow('Task not found')
  })
})

describe('zipping a selection', () => {
  const archived = (taskId: string, n = 1): HistoryItem =>
    item({ taskId, prompt: 'blue vase', media: Array.from({ length: n }, (_, i) => ({ kind: 'image' as const, localPath: `media/${taskId}/${i}.png` })) })

  it('zips only when every file is on disk and there is more than one', () => {
    expect(zipPlan([archived('t1'), archived('t2', 2)])).toEqual([
      { path: '/media/t1/0.png', name: 'blue-vase-t1.png' },
      { path: '/media/t2/0.png', name: 'blue-vase-t2-1.png' },
      { path: '/media/t2/1.png', name: 'blue-vase-t2-2.png' },
    ])
    expect(zipPlan([archived('t1')])).toBeNull()
    expect(zipPlan([archived('t1'), item({ media: [{ kind: 'video', url: 'https://x/v.mp4' }] })])).toBeNull()
  })

  it('names the zip after the day, with parts when it takes several', () => {
    expect(zipName(new Date(2026, 9, 7))).toBe('trenchable-assets-2026-10-07.zip')
    expect(zipName(new Date(2026, 9, 7), 1, 3)).toBe('trenchable-assets-2026-10-07-part2.zip')
  })

  it('downloads archived files as one zip, 200 to a part', async () => {
    const zip = vi.spyOn(studioApi, 'zip').mockResolvedValue(new Blob(['zip']))
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download)
    })
    const create = vi.fn(() => 'blob:zip')
    Object.defineProperty(URL, 'createObjectURL', { value: create, configurable: true, writable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true, writable: true })
    const many = Array.from({ length: 250 }, (_, i) => archived(`t${i}`))
    await downloadItems(many)
    expect(zip).toHaveBeenCalledTimes(2)
    expect(zip.mock.calls[0]?.[0]).toHaveLength(200)
    expect(zip.mock.calls[1]?.[0]).toHaveLength(50)
    expect(names).toHaveLength(2)
    expect(names[0]).toMatch(/^trenchable-assets-\d{4}-\d{2}-\d{2}-part1\.zip$/)
  })
})

describe('Regenerate', () => {
  const m = model({
    id: 'nano-banana-pro',
    fields: [
      { name: 'prompt', type: 'textarea', label: 'Prompt' },
      { name: 'input_urls', type: 'reference', label: 'Images' },
    ],
  })

  it('says why a job cannot run again', () => {
    const it1 = item({ modelId: 'nano-banana-pro', input: { prompt: 'p' } })
    expect(regenerateBlocker(it1, null)).toMatch(/Loading/)
    expect(regenerateBlocker(it1, [m])).toBeNull()
    expect(regenerateBlocker(item({ modelId: 'gone', input: { prompt: 'p' } }), [m])).toMatch(/isn't in Kie's catalogue/)
    expect(regenerateBlocker(item({ modelId: 'nano-banana-pro' }), [m])).toMatch(/weren't recorded/)
  })

  it('lands on the surface that ran it, in the shape it asked for', () => {
    const it1 = item({ category: 'image', input: { aspect_ratio: '4:5' } })
    expect(regenerateMeta(it1)).toEqual({ surface: 'image', aspect: '4:5' })
    expect(regenerateMeta(it1, { meta: { surface: 'presets', label: 'Polaroid' } })).toEqual({ surface: 'presets', label: 'Polaroid', aspect: '4:5' })
  })

  it('sends a young job as it was and re-hosts an old one’s files', async () => {
    const rehost = vi.spyOn(studioApi, 'rehost').mockImplementation(async (u: string) => ({ fileUrl: `${u}?fresh` }))
    const young = item({ input: { prompt: 'p', input_urls: ['https://k/a.png'] } })
    expect(await regenerateInput(young, m)).toEqual({ prompt: 'p', input_urls: ['https://k/a.png'] })
    expect(rehost).not.toHaveBeenCalled()
    const old = item({ createdAt: Date.now() - 4 * 24 * 3600_000, input: { prompt: 'p', input_urls: ['https://k/a.png'], first: 'https://k/f.png' } })
    expect(await regenerateInput(old, m)).toEqual({ prompt: 'p', input_urls: ['https://k/a.png?fresh'], first: 'https://k/f.png?fresh' })
  })

  it('refuses when Kie has lost one of the files', async () => {
    vi.spyOn(studioApi, 'rehost').mockRejectedValue(new Error('404'))
    const old = item({ createdAt: Date.now() - 4 * 24 * 3600_000, input: { prompt: 'p', input_urls: ['https://k/a.png'] } })
    await expect(regenerateInput(old, m)).rejects.toThrow(/expired on Kie/)
  })

  it('queues the same model and input on the surface it came from', async () => {
    const it1 = item({ modelId: 'nano-banana-pro', input: { prompt: 'p', aspect_ratio: '1:1' } })
    expect(await regenerate(it1, m)).toBe('job-test')
    expect(submitJob).toHaveBeenCalledWith(m, { prompt: 'p', aspect_ratio: '1:1' }, { surface: 'image', aspect: '1:1' })
  })
})

describe('dates', () => {
  const now = new Date(2026, 9, 11, 15, 0)
  const at = (d: number, h = 12) => new Date(2026, 9, d, h).getTime()

  it('filters by calendar days', () => {
    expect(inDateRange(at(11, 0), { kind: 'today' }, now)).toBe(true)
    expect(inDateRange(at(10, 23), { kind: 'today' }, now)).toBe(false)
    expect(inDateRange(at(5, 0), { kind: '7d' }, now)).toBe(true)
    expect(inDateRange(at(4, 23), { kind: '7d' }, now)).toBe(false)
    expect(inDateRange(new Date(2026, 8, 12, 1).getTime(), { kind: '30d' }, now)).toBe(true)
    expect(inDateRange(new Date(2026, 8, 11, 23).getTime(), { kind: '30d' }, now)).toBe(false)
    expect(inDateRange(at(1), { kind: 'all' }, now)).toBe(true)
  })

  it('includes both ends of a custom range', () => {
    const r = { kind: 'custom' as const, from: '2026-10-03', to: '2026-10-05' }
    expect(inDateRange(at(3, 0), r, now)).toBe(true)
    expect(inDateRange(at(5, 23), r, now)).toBe(true)
    expect(inDateRange(at(2, 23), r, now)).toBe(false)
    expect(inDateRange(at(6, 0), r, now)).toBe(false)
    expect(inDateRange(at(1), { kind: 'custom', to: '2026-10-05' }, now)).toBe(true)
  })

  it('searches the prompt and the date', () => {
    const it1 = item({ prompt: 'A black cat on a wall', createdAt: at(7) })
    expect(dateWords(at(7))).toContain('october 7, 2026')
    for (const q of ['black cat', 'October 7', 'oct 7', '2026-10-07', '10/7/2026', 'cat october 7', 'wednesday']) {
      expect(matchesSearch(it1, q)).toBe(true)
    }
    for (const q of ['dog', 'October 8', '2026-10-08', 'cat october 8']) {
      expect(matchesSearch(it1, q)).toBe(false)
    }
  })
})

describe('saving a file', () => {
  it('downloads the archived copy straight from our server, named after the prompt', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.getAttribute('href')).toBe('/media/t/0.png')
      expect(this.download).toBe('red-car-abcdef12.png')
      expect(this.target).toBe('')
    })
    vi.stubGlobal('fetch', vi.fn())
    await downloadMedia(item({ prompt: 'red car' }), { kind: 'image', localPath: 'media/t/0.png' })
    expect(click).toHaveBeenCalledTimes(1)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks Kie for a download link when only the provider has the file', async () => {
    const opened: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      opened.push(`${this.href} ${this.target}`)
    })
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: { downloadUrl: 'https://kie/dl/1' } })))
    vi.stubGlobal('fetch', fetchMock)
    await downloadMedia(item(), { kind: 'video', url: 'https://tempfile/x.mp4' })
    expect(fetchMock).toHaveBeenCalledWith('/api/download-url', expect.objectContaining({ method: 'POST', body: JSON.stringify({ url: 'https://tempfile/x.mp4' }) }))
    expect(opened).toEqual(['https://kie/dl/1 _blank'])
  })
})

describe('sending a result on', () => {
  it('re-hosts the file, then posts the handoff to the target surface', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['png'], { type: 'image/png' }))))
    vi.spyOn(studioApi, 'upload').mockResolvedValue({ fileUrl: 'https://kie/up/animate', originalFileName: '0.png' })
    await runTool('animate', item(), { kind: 'image', localPath: 'media/run-tool-test/0.png' })
    expect(window.location.hash).toBe('#/gen/video')
    const m = { kind: 'image', localPath: 'media/run-tool-test/0.png' }
    expect(takeHandoff('video')).toMatchObject({ mode: 'create', slots: { first: 'https://kie/up/animate' }, sources: { first: m } })
  })

  it('saves a still as an Element from its archive path', async () => {
    const create = vi.spyOn(libraryApi, 'createElement').mockResolvedValue({ id: 'e1', name: 'Anna' } as Element)
    await saveAsElement({ kind: 'image', localPath: 'media/t/0.png' }, '  Anna ', 'character')
    expect(create).toHaveBeenCalledWith({ name: 'Anna', kind: 'character', sources: [{ url: '/media/t/0.png' }] })
    await expect(saveAsElement({ kind: 'image', localPath: 'media/t/0.png' }, ' ', 'character')).rejects.toThrow(/name/)
  })

  it('adds to a new project, newest first', async () => {
    vi.spyOn(libraryApi, 'createProject').mockResolvedValue({ id: 'p9' } as Project)
    const add = vi.spyOn(libraryApi, 'addToProject').mockResolvedValue({ id: 'p9' } as Project)
    await addToProject({ title: 'Launch' }, [item({ taskId: 'old', createdAt: 1 }), item({ taskId: 'new', createdAt: 2 })])
    expect(add).toHaveBeenCalledWith('p9', ['new', 'old'])
  })
})

describe('library filters', () => {
  it('counts upscales and restores as Enhanced, alongside their own type', () => {
    const up = item({ modelId: 'topaz/image-upscale' })
    expect(isEnhanced(up)).toBe(true)
    expect(isEnhanced(item({ modelId: 'nano-banana-pro' }))).toBe(false)
    expect(matchesType(up, 'enhanced')).toBe(true)
    expect(matchesType(up, 'image')).toBe(true)
    expect(matchesType(up, 'video')).toBe(false)
    expect(matchesType(up, 'all')).toBe(true)
  })
})

describe('multi-select', () => {
  const order = ['a', 'b', 'c', 'd', 'e']
  it('toggles one on a plain click', () => {
    expect([...selectRange(order, new Set(['a']), 'a', 'c', false)]).toEqual(['a', 'c'])
    expect([...selectRange(order, new Set(['a', 'c']), 'a', 'c', false)]).toEqual(['a'])
  })
  it('adds the run between the last click and this one on shift', () => {
    expect([...selectRange(order, new Set(['b']), 'b', 'd', true)].sort()).toEqual(['b', 'c', 'd'])
    expect([...selectRange(order, new Set(['d']), 'd', 'a', true)].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
  it('falls back to a toggle when there is no anchor', () => {
    expect([...selectRange(order, new Set(), null, 'c', true)]).toEqual(['c'])
  })
})

describe('Angles and the viewer’s Edit tab', () => {
  const catalogue = editModels as unknown as ModelDefinition[]
  const byId = (id: string) => catalogue.find((m) => m.id === id)!

  it('opens on the editor that keeps identity best, read off what is on offer', () => {
    expect(identityEditor(catalogue)?.id).toBe('nano-banana-pro')
    expect(identityEditor(catalogue.filter((m) => m.id !== 'nano-banana-pro'))?.id).toBe('gpt-image-2-image-to-image')
    expect(identityEditor([])).toBeNull()
  })

  it('writes one camera move per angle and holds everything else', () => {
    expect(ANGLES.map((a) => a.label)).toEqual(['Front', 'Left 45°', 'Right 45°', 'Left profile', 'Right profile', 'Back', 'High angle', 'Low angle'])
    const p = anglePrompt('back', ' plain wall ')
    expect(p).toMatch(/^Show the same subject and scene from a new camera angle: the camera has moved all the way behind the subject/)
    expect(p).toMatch(/Only the camera position changes\. Keep the subject identical — the same face and identity, hair, body, expression, clothing/)
    expect(p.endsWith('plain wall')).toBe(true)
    expect(pickedAngles(['back', 'nope', 'front'])).toEqual(['front', 'back'])
  })

  it('sends this picture first, extras after, at its own shape', () => {
    const pro = byId('nano-banana-pro')
    expect(editorRoom(pro)).toBe(8)
    const input = imageEditInput(pro, ' make it night ', ['https://k/base.png', 'https://k/ref.png'], 4 / 5)!
    expect(input.prompt).toBe('make it night')
    expect(input.image_input).toEqual(['https://k/base.png', 'https://k/ref.png'])
    expect(input.aspect_ratio).toBe('auto')
    expect(imageEditBlocker(pro, input, 'make it night')).toBeNull()
    expect(imageEditBlocker(pro, input, '  ')).toBe('Describe the edit first.')
    expect(imageEditBlocker(null, null, 'x')).toMatch(/No image editor/)
  })

  it('takes the nearest ratio where the model has no auto', () => {
    const seed = byId('seedream/5-pro-image-to-image')
    const input = imageEditInput(seed, 'x', ['https://k/base.png'], 9 / 16)!
    expect(input.aspect_ratio).toBe('9:16')
    expect(input.image_urls).toEqual(['https://k/base.png'])
  })
})
