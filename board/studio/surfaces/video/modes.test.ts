// Video modes: which catalogue models each mode offers, and which past clips the task
// tools (extend / upscale by job id) can work on, with the ids they need. Ids below are the
// real Kie catalogue's, as of 2026-10-11. Nothing here touches the network.
import { describe, expect, it } from 'vitest'
import type { FieldSchema, HistoryItem, ModelDefinition } from '../../api.ts'
import {
  clipProblem,
  extendToolFor,
  inMode,
  isClipLipsync,
  isEditModel,
  isExtender,
  isMotionModel,
  isPhotoLipsync,
  mergeLocked,
  modeForHandoff,
  takesReferences,
  upscaleToolsFor,
  whyNotExtend,
} from './modes.ts'

const ref = (name: string, accept = 'image/*'): FieldSchema => ({ name, type: 'reference', label: name, accept }) as FieldSchema

const model = (id: string, title = id, fields: FieldSchema[] = [ref('x')]): ModelDefinition => ({ id, model: id, title, category: 'video', provider: 'market', fields }) as ModelDefinition

const CATALOGUE = [
  model('veo/generate', 'Veo — Create a video'),
  model('veo/extend', 'Veo — Extend a video'),
  model('veo/1080p', 'Veo — Convert to 1080p'),
  model('runway/extend', 'Runway — Extend a video'),
  model('runway/aleph', 'Runway Aleph — Transform a video'),
  model('market/volcengine-lip-sync', 'Volcengine — Lip-sync a video'),
  model('grok-imagine/extend', 'Grok Imagine - Video Extend'),
  model('grok-imagine/upscale', 'Grok Imagine - Video Upscale'),
  model('kling-2.6/motion-control', 'Kling 2.6 motion-control'),
  model('kling-3.0/motion-control', 'Kling-3.0 motion-control'),
  model('wan/2-2-animate-move', 'Wan - Animate Move'),
  model('wan/2-2-animate-replace', 'Wan - Animate Replace'),
  model('kling-3.0-omni/transformation', 'Kling 3.0 Omni Transformation'),
  model('wan/2-7-videoedit', 'Wan 2.7 - Video Edit'),
  model('wan/2-6-video-to-video', 'Wan 2.6 - Video to Video'),
  model('wan/2-6-flash-video-to-video', 'Wan - 2-6-flash-video-to-video'),
  model('happyhorse/video-edit', 'happyhorse/video-edit'),
  model('kling/ai-avatar-pro', 'Kling AI Avatar Pro'),
  model('kling/ai-avatar-standard', 'Kling AI Avatar Standard'),
  model('infinitalk/from-audio', 'Infinitalk - From Audio'),
  model('omnihuman-1-5', 'Omnihuman 1.5'),
  model('omnihuman-1-5/subject-detection', 'OmniHuman 1.5 Subject Detection'),
  model('wan/2-2-a14b-speech-to-video-turbo', 'Wan - 2.2 A14B Speech to Video Turbo'),
  model('topaz/video-upscale', 'Topaz - Video Upscale'),
  model('kling-2.6/text-to-video', 'Kling 2.6 Text to Video'),
]
const ids = (f: (m: ModelDefinition) => boolean) => CATALOGUE.filter(f).map((m) => m.id)

describe('mode filters', () => {
  it('Motion offers Kling motion control and Wan Animate', () => {
    expect(ids(isMotionModel)).toEqual(['kling-2.6/motion-control', 'kling-3.0/motion-control', 'wan/2-2-animate-move', 'wan/2-2-animate-replace'])
  })

  it('Edit offers the five video editors and Runway Aleph', () => {
    expect(ids(isEditModel)).toEqual(['runway/aleph', 'kling-3.0-omni/transformation', 'wan/2-7-videoedit', 'wan/2-6-video-to-video', 'wan/2-6-flash-video-to-video', 'happyhorse/video-edit'])
  })

  it('Lip-sync splits by what you bring: a clip, or a photo', () => {
    expect(ids(isClipLipsync)).toEqual(['market/volcengine-lip-sync'])
    expect(ids(isPhotoLipsync)).toEqual(['kling/ai-avatar-pro', 'kling/ai-avatar-standard', 'infinitalk/from-audio', 'omnihuman-1-5', 'wan/2-2-a14b-speech-to-video-turbo'])
  })

  it('Extend lists only the three task extenders', () => {
    expect(ids(isExtender)).toEqual(['veo/extend', 'runway/extend', 'grok-imagine/extend'])
  })

  it('References keeps generators with named reference fields, never tools', () => {
    const seedance = model('bytedance/seedance-2-5', 'Bytedance Seedance 2.5', [ref('first_frame_url'), ref('reference_image_urls'), ref('reference_video_urls', 'video/*')])
    const wan27 = model('wan/2-7-r2v', 'Wan 2.7 - Reference to Video', [ref('reference_image'), ref('reference_video', 'video/*')])
    const kling = model('kling-2.6/image-to-video', 'Kling 2.6 Image to Video', [ref('image_urls')])
    const editor = model('happyhorse/video-edit', 'happyhorse/video-edit', [ref('video_url', 'video/*'), ref('reference_image')])
    expect([seedance, wan27, kling, editor].filter(takesReferences).map((m) => m.id)).toEqual(['bytedance/seedance-2-5', 'wan/2-7-r2v'])
  })
})

const clip = (over: Partial<HistoryItem>): HistoryItem => ({
  taskId: 't1',
  model: 'x',
  category: 'video',
  state: 'success',
  createdAt: 1,
  media: [{ kind: 'video', url: 'https://x/clip.mp4', duration: 8 }],
  ...over,
})

describe('extendToolFor', () => {
  it('Veo continues a Veo clip by its task id', () => {
    expect(extendToolFor(clip({ modelId: 'veo/generate', provider: 'veo', operation: 'generate', taskId: 'veo-1' }))).toEqual({ modelId: 'veo/extend', locked: { taskId: 'veo-1' } })
  })

  it('an extended Veo clip can be extended again', () => {
    expect(extendToolFor(clip({ modelId: 'veo/extend', provider: 'veo', operation: 'extend' }))?.modelId).toBe('veo/extend')
  })

  it('Runway also needs the clip id it returned', () => {
    const item = clip({ modelId: 'runway/generate', provider: 'runway', taskId: 'rw-1', media: [{ kind: 'video', url: 'u', providerAssetId: 'vid-9' }] })
    expect(extendToolFor(item)).toEqual({ modelId: 'runway/extend', locked: { taskId: 'rw-1', videoId: 'vid-9' } })
    expect(extendToolFor({ ...item, media: [{ kind: 'video', url: 'u' }] })).toBeNull()
  })

  it('Grok continues from the end of the clip', () => {
    expect(extendToolFor(clip({ modelId: 'grok-imagine/text-to-video', taskId: 'g-1' }))).toEqual({ modelId: 'grok-imagine/extend', locked: { task_id: 'g-1', extend_at: 8 } })
    // Grok's minimum start point is 2 seconds.
    expect(extendToolFor(clip({ modelId: 'grok-imagine/image-to-video', media: [{ kind: 'video', url: 'u', duration: 1 }] }))?.locked.extend_at).toBe(2)
  })

  it('nothing else can be extended, and unfinished jobs never', () => {
    expect(extendToolFor(clip({ modelId: 'kling-2.6/text-to-video' }))).toBeNull()
    expect(extendToolFor(clip({ modelId: 'runway/aleph', provider: 'runway', operation: 'aleph' }))).toBeNull()
    expect(extendToolFor(clip({ modelId: 'veo/generate', provider: 'veo', state: 'fail' }))).toBeNull()
    expect(extendToolFor(null)).toBeNull()
  })

  it('says why in plain words', () => {
    expect(whyNotExtend(clip({ modelId: 'kling-2.6/text-to-video' }), 'Kling 2.6')).toMatch(/^Kling 2.6 clips can't be extended/)
    expect(whyNotExtend(clip({ modelId: 'runway/generate', provider: 'runway', media: [] }))).toMatch(/video id/)
  })
})

describe('upscaleToolsFor', () => {
  it('Topaz always, after the clip’s own renderer', () => {
    expect(upscaleToolsFor(null).map((t) => t.modelId)).toEqual(['topaz/video-upscale'])
    expect(upscaleToolsFor(clip({ modelId: 'kling-2.6/text-to-video' })).map((t) => t.modelId)).toEqual(['topaz/video-upscale'])
  })

  it('Veo clips get Veo 1080p and 4K by task id', () => {
    const tools = upscaleToolsFor(clip({ modelId: 'veo/generate', provider: 'veo', taskId: 'v' }))
    expect(tools.map((t) => t.modelId)).toEqual(['veo/1080p', 'veo/4k', 'topaz/video-upscale'])
    expect(mergeLocked(tools)).toEqual({ taskId: 'v' })
  })

  it('Grok clips get Grok upscale; a Seedance 2.5 draft gets its 1080p finish', () => {
    expect(mergeLocked(upscaleToolsFor(clip({ modelId: 'grok-imagine/text-to-video', taskId: 'g' })))).toEqual({ task_id: 'g' })
    const draft = upscaleToolsFor(clip({ modelId: 'bytedance/seedance-2-5', taskId: 'd', input: { draft: true } }))
    expect(draft.map((t) => t.modelId)).toEqual(['bytedance/seedance-2-5-draft', 'topaz/video-upscale'])
    expect(mergeLocked(draft)).toEqual({ draft_task_id: 'd' })
    expect(upscaleToolsFor(clip({ modelId: 'bytedance/seedance-2-5', input: { draft: false } })).map((t) => t.modelId)).toEqual(['topaz/video-upscale'])
  })
})

describe('clipProblem', () => {
  it('holds an edit back until a clip is attached, even where the field is optional', () => {
    const kling = model('kling-3.0-omni/transformation', 'Kling 3.0 Omni Transformation', [ref('video_urls', 'video/*'), ref('image_urls')])
    expect(clipProblem(kling, { prompt: 'make it night' })).toBe('Add the clip to edit first.')
    expect(clipProblem(kling, { video_urls: ['https://x/a.mp4'] })).toBeNull()
    expect(clipProblem(model('x', 'X', [ref('image_url')]), {})).toBeNull()
  })
})

describe('history and handoffs', () => {
  it('each mode shows its own results; Create shows every clip', () => {
    expect(inMode('create', clip({ modelId: 'topaz/video-upscale' }))).toBe(true)
    expect(inMode('upscale', clip({ modelId: 'veo/4k' }))).toBe(true)
    expect(inMode('upscale', clip({ modelId: 'veo/generate' }))).toBe(false)
    expect(inMode('lipsync', clip({ modelId: 'omnihuman-1-5' }))).toBe(true)
    expect(inMode('edit', clip({ modelId: 'runway/aleph' }))).toBe(true)
    expect(inMode('extend', clip({ modelId: 'grok-imagine/extend' }))).toBe(true)
  })

  it('reads the mode from a handoff, defaulting framed shots to Create', () => {
    expect(modeForHandoff('lipsync', undefined)).toBe('lipsync')
    expect(modeForHandoff(undefined, { first: 'u' })).toBe('create')
    expect(modeForHandoff('nonsense', undefined)).toBeNull()
  })
})
