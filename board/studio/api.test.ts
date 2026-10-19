// Studio: the two bits that aren't layout. `pickModel` resolves a model class against
// whatever Kie's catalogue currently holds, and `buildInput` maps the composer's fixed
// controls onto one model's own field names. Nothing here touches the network.
import { describe, expect, it } from 'vitest'
import { buildInput, pickModel, type ModelDefinition, type Ref } from './api.ts'
import { mentionFor, refFieldFor } from './mentions.ts'

const img = (url: string): Ref => ({ url, kind: 'image' })

const model = (over: Partial<ModelDefinition>): ModelDefinition => ({
  id: 'x',
  model: 'x',
  title: 'X',
  category: 'image',
  provider: 'market',
  fields: [],
  ...over,
})

const catalogue: ModelDefinition[] = [
  model({ id: 'flux/upscale', model: 'flux/upscale', title: 'Flux Upscaler' }),
  model({ id: 'flux/text-to-image', model: 'flux/text-to-image', title: 'Flux' }),
  model({ id: 'nano-banana/edit', model: 'nano-banana/edit', title: 'Nano Banana Edit' }),
  model({ id: 'kling/i2v', model: 'kling/i2v', title: 'Kling image-to-video', category: 'video' }),
  model({ id: 'veo/t2v', model: 'veo/t2v', title: 'Veo', category: 'video' }),
  model({ id: 'eleven/tts', model: 'eleven/tts', title: 'ElevenLabs speech', category: 'audio' }),
]

describe('pickModel', () => {
  it('stays inside the class it was asked for', () => {
    expect(pickModel(catalogue, 'image')?.category).toBe('image')
    expect(pickModel(catalogue, 'video')?.category).toBe('video')
    expect(pickModel(catalogue, 'audio')?.id).toBe('eleven/tts')
  })

  it('skips the models that only post-process something else', () => {
    // An upscaler is an image model, but it is never what "make me an image" means.
    expect(pickModel(catalogue, 'image')?.id).toBe('flux/text-to-image')
  })

  it('prefers an editor when a reference is going to be supplied', () => {
    expect(pickModel(catalogue, 'image-edit')?.id).toBe('nano-banana/edit')
    expect(pickModel(catalogue, 'video-ref')?.id).toBe('kling/i2v')
  })

  it('returns null rather than something from the wrong category', () => {
    expect(pickModel([catalogue[0]!], 'audio')).toBeNull()
  })

  it('reads Kie’s real titles the way they are written', () => {
    // These are the actual titles in the live catalogue: the direction is in the name,
    // so "Image to Image" must not win when a plain image was asked for.
    const live: ModelDefinition[] = [
      model({ id: 'a', title: 'Flux-2 - Image to Image' }),
      model({ id: 'b', title: 'Flux-2 - Pro Text to Image' }),
      model({ id: 'c', title: 'Google - Nano Banana Edit' }),
      model({ id: 'd', title: 'Bytedance - V1 Lite Image to Video', category: 'video' }),
      model({ id: 'e', title: 'Bytedance - V1 Lite Text to Video', category: 'video' }),
      model({ id: 'f', title: 'Veo — Convert to 4K', category: 'video' }),
      model({ id: 'g', title: 'ElevenLabs — Create dialogue', category: 'audio' }),
      model({ id: 'h', title: 'Gemini 3.8 Flash Text to speech', category: 'audio' }),
      model({ id: 'i', title: 'Suno — Create a song', category: 'audio' }),
    ]
    expect(pickModel(live, 'image')?.id).toBe('b')
    expect(pickModel(live, 'image-edit')?.id).toBe('a')
    expect(pickModel(live, 'video')?.id).toBe('e')
    expect(pickModel(live, 'video-ref')?.id).toBe('d')
    // Speech, not a song, and not the dialogue model that wants a JSON script.
    expect(pickModel(live, 'audio')?.id).toBe('h')
  })
})

describe('buildInput', () => {
  const full = model({
    fields: [
      { name: 'prompt', type: 'textarea', label: 'Prompt', required: true },
      { name: 'image_url', type: 'reference', label: 'Image', scalar: true },
      { name: 'aspect_ratio', type: 'enum', label: 'Aspect', enum: ['1:1', '16:9', '9:16'] },
      { name: 'resolution', type: 'enum', label: 'Size', enum: ['720p', '1080p'] },
      { name: 'num_images', type: 'number', label: 'How many', min: 1, max: 4 },
      { name: 'seed', type: 'number', label: 'Seed' },
    ],
  })

  it('puts each control on the field that model actually calls it', () => {
    const input = buildInput(full, { prompt: 'a cat', aspect: '16:9', resolution: '1080p', count: 3 })
    expect(input).toMatchObject({ prompt: 'a cat', aspect_ratio: '16:9', resolution: '1080p', num_images: 3 })
  })

  it('sends a scalar reference as the bare url, not an array', () => {
    const input = buildInput(full, { prompt: 'p', refs: [img('https://x/1.png'), img('https://x/2.png')] })
    expect(input.image_url).toBe('https://x/1.png')
  })

  it('keeps an array reference as an array, capped at what the field takes', () => {
    const multi = model({ fields: [{ name: 'image_urls', type: 'reference', label: 'Images', maxItems: 2 }] })
    expect(buildInput(multi, { prompt: '', refs: [img('a'), img('b'), img('c')] }).image_urls).toEqual(['a', 'b'])
  })

  it('sorts each reference into the field that takes that kind of file', () => {
    // Video models routinely offer stills, clips and audio separately; sending the
    // soundtrack to the stills field is the kind of mistake that fails mid-job.
    const multi = model({
      category: 'video',
      fields: [
        { name: 'imageUrls', type: 'reference', label: 'Stills', mentionStyle: 'at-image' },
        { name: 'videoUrls', type: 'reference', label: 'Clips', mentionStyle: 'at-video' },
        { name: 'audioUrls', type: 'reference', label: 'Audio', mentionStyle: 'at-audio' },
      ],
    })
    const input = buildInput(multi, {
      prompt: 'p',
      refs: [img('still.png'), { url: 'clip.mp4', kind: 'video' }, { url: 'voice.mp3', kind: 'audio' }],
    })
    expect(input).toMatchObject({ imageUrls: ['still.png'], videoUrls: ['clip.mp4'], audioUrls: ['voice.mp3'] })
  })

  it('gives a lone reference field everything, whatever kind it is', () => {
    const one = model({ fields: [{ name: 'input_urls', type: 'reference', label: 'Refs', mentionStyle: 'at-image' }] })
    const input = buildInput(one, { prompt: 'p', refs: [{ url: 'clip.mp4', kind: 'video' }] })
    expect(input.input_urls).toEqual(['clip.mp4'])
  })

  it('leaves an optional language with no default out, so the model detects it', () => {
    // ElevenLabs dialogue's language_code lists "af" first: picking enum[0] made every
    // dialogue Afrikaans while the picker said "Detect".
    const dialogue = model({ fields: [{ name: 'language_code', type: 'enum', label: 'Language', enum: ['af', 'ar', 'en'] }] })
    expect(buildInput(dialogue, { prompt: 'p' })).not.toHaveProperty('language_code')
    expect(buildInput(dialogue, { prompt: 'p', locked: { language_code: 'en' } }).language_code).toBe('en')
  })

  it('falls back to the nearest allowed value instead of sending one the model rejects', () => {
    // 4K is not on offer here; 2K is not either. Rather than fail, leave the default.
    const input = buildInput(full, { prompt: 'p', resolution: '4K' })
    expect(input.resolution).toBe('720p')
    expect(buildInput(full, { prompt: 'p', aspect: '9:16' }).aspect_ratio).toBe('9:16')
  })

  it('clamps a count the model will not accept', () => {
    expect(buildInput(full, { prompt: 'p', count: 9 }).num_images).toBe(4)
  })

  it('lets a preset override the pills', () => {
    const input = buildInput(full, { prompt: 'p', aspect: '1:1', locked: { aspect_ratio: '9:16' } })
    expect(input.aspect_ratio).toBe('9:16')
  })

  it('drops blank optional fields rather than sending empty values', () => {
    const input = buildInput(full, { prompt: 'p' })
    expect('image_url' in input).toBe(false)
    expect(input.prompt).toBe('p')
  })

  it('ignores controls a model has no field for', () => {
    const plain = model({ fields: [{ name: 'prompt', type: 'textarea', label: 'Prompt', required: true }] })
    expect(buildInput(plain, { prompt: 'p', aspect: '16:9', duration: 5 })).toEqual({ prompt: 'p' })
  })
})

describe('mentions', () => {
  const veo = model({
    category: 'video',
    fields: [
      { name: 'imageUrls', type: 'reference', label: 'Stills', mentionStyle: 'at-image', maxItems: 3 },
      { name: 'videoUrls', type: 'reference', label: 'Clips', mentionStyle: 'at-video' },
      { name: 'audioUrls', type: 'reference', label: 'Audio', mentionStyle: 'none' },
    ],
  })

  it('sends each kind to the field that declares it', () => {
    expect(refFieldFor(veo, 'image')?.name).toBe('imageUrls')
    expect(refFieldFor(veo, 'video')?.name).toBe('videoUrls')
    expect(refFieldFor(veo, 'audio')?.name).toBe('audioUrls')
  })

  it('numbers the token per field, not across all references', () => {
    expect(mentionFor(veo, 'image', []).token).toBe('@image1')
    // An audio clip in between must not push the second image to @image3.
    const refs: Ref[] = [img('a.png'), { url: 'v.mp3', kind: 'audio' }]
    expect(mentionFor(veo, 'image', refs).token).toBe('@image2')
    expect(mentionFor(veo, 'video', refs).token).toBe('@Video1')
  })

  it('attaches without a token when the field asks for none', () => {
    const m = mentionFor(veo, 'audio', [])
    expect(m).toEqual({ token: '', accepted: true })
  })

  it('refuses once the field is full', () => {
    const three: Ref[] = [img('1'), img('2'), img('3')]
    expect(mentionFor(veo, 'image', three).accepted).toBe(false)
  })

  it('refuses a kind the model has nowhere to put', () => {
    const imageOnly = model({ fields: [{ name: 'input_urls', type: 'reference', label: 'Refs', mentionStyle: 'at-image' }] })
    // One reference field takes anything, so a two-field model is the real test.
    const twoFields = model({
      fields: [
        { name: 'input_urls', type: 'reference', label: 'Refs', mentionStyle: 'at-image' },
        { name: 'mask_url', type: 'reference', label: 'Mask', mentionStyle: 'bracket-image' },
      ],
    })
    expect(mentionFor(imageOnly, 'video', []).accepted).toBe(true)
    expect(mentionFor(twoFields, 'audio', []).accepted).toBe(false)
  })

  it('always numbers a single-file field 1', () => {
    const scalar = model({ fields: [{ name: 'image_url', type: 'reference', label: 'Image', mentionStyle: 'at-image', scalar: true }] })
    expect(mentionFor(scalar, 'image', [img('a')]).token).toBe('@image1')
  })
})

describe('reference routing across same-kind fields', () => {
  // The common real shape: a picture plus a mask, or a first plus a last frame. Both
  // fields are "image", and filling both from one upload ruins the job quietly.
  const masked = model({
    fields: [
      { name: 'image_url', type: 'reference', label: 'Image', mentionStyle: 'at-image', scalar: true },
      { name: 'mask_url', type: 'reference', label: 'Mask', mentionStyle: 'at-image', scalar: true },
    ],
  })

  it('never fills a second field of the same kind by itself', () => {
    const input = buildInput(masked, { prompt: 'p', refs: [img('photo.png')] })
    expect(input.image_url).toBe('photo.png')
    expect('mask_url' in input).toBe(false)
  })

  it('fills a named field when the surface means that one', () => {
    const frames = model({
      category: 'video',
      fields: [
        { name: 'image_url', type: 'reference', label: 'First', mentionStyle: 'at-image', scalar: true },
        { name: 'end_image_url', type: 'reference', label: 'Last', mentionStyle: 'at-image', scalar: true },
      ],
    })
    const input = buildInput(frames, { prompt: 'p', fields: { image_url: 'a.png', end_image_url: 'b.png' } })
    expect(input).toMatchObject({ image_url: 'a.png', end_image_url: 'b.png' })
  })

  it('lets a named field win over the general routing', () => {
    const input = buildInput(masked, { prompt: 'p', refs: [img('photo.png')], fields: { mask_url: 'mask.png' } })
    expect(input).toMatchObject({ image_url: 'photo.png', mask_url: 'mask.png' })
  })

  it('ignores a named field the model does not have', () => {
    expect('end_image_url' in buildInput(masked, { prompt: 'p', fields: { end_image_url: 'b.png' } })).toBe(false)
  })
})
