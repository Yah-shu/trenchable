/**
 * The engine's choices, against real catalogue entries (__fixtures__/models.json, copied
 * from /api/models): which variant a family runs, which field each pill drives, and what
 * survives a variant switch. A wrong answer here silently sends the wrong model or a
 * value the model rejects, so each case is one that has actually bitten.
 */
import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/models.json'
import type { ModelDefinition } from './api.ts'
import { buildInput } from './api.ts'
import { carryOver, controlsFor, pillDefault } from './controls.ts'
import {
  directionOf,
  familiesOf,
  familyAbility,
  familyNote,
  familySpecs,
  familyTakes,
  familyTitle,
  isNew,
  isTool,
  lengthLabel,
  needsImage,
  rangeInText,
  searchFamilies,
  seriesName,
  seriesOf,
  seriesSpecs,
  variantFor,
  type Family,
} from './families.ts'
import { missingFields, primaryRefFields, promptFieldOf } from './generator.ts'
import { stripMentions } from './mentions.ts'

const models = raw as unknown as ModelDefinition[]
const byId = (id: string) => {
  const m = models.find((x) => x.id === id)
  if (!m) throw new Error(`fixture missing ${id}`)
  return m
}
const familyNamed = (title: string, category = 'image') => {
  const f = familiesOf(models.filter((m) => m.category === category)).find((x) => x.title === title)
  if (!f) throw new Error(`no family ${title}`)
  return f
}

describe('families', () => {
  it('groups the per-direction models under one name', () => {
    expect(familyTitle(byId('flux-2/pro-text-to-image'))).toBe('Flux-2 Pro')
    expect(familyTitle(byId('flux-2/pro-image-to-image'))).toBe('Flux-2 Pro')
    // "GPT Image-2" and "GPT Image 2" are spelled differently in the catalogue.
    expect(familyNamed('GPT Image 2').members.map((m) => m.id).sort()).toEqual(['gpt-image-2-image-to-image', 'gpt-image-2-text-to-image'])
  })

  it('reads a bare slug title as words', () => {
    expect(familyTitle(byId('bytedance/seedance-2'))).toBe('Seedance 2')
  })

  it('names the ElevenLabs slugs that read badly as words', () => {
    const turbo = { id: 'elevenlabs/text-to-speech-turbo-2-5', title: 'elevenlabs/text-to-speech-turbo-2-5' } as ModelDefinition
    expect(familyTitle(turbo)).toBe('ElevenLabs Turbo 2.5')
  })

  it('keeps post-processors out of the pickers', () => {
    expect(isTool(byId('topaz/image-upscale'))).toBe(true)
    expect(isTool(byId('veo/extend'))).toBe(true)
    expect(isTool(byId('kling/ai-avatar-pro'))).toBe(true)
    expect(isTool(byId('nano-banana-pro'))).toBe(false)
    const ids = familiesOf(models).flatMap((f) => f.members.map((m) => m.id))
    expect(ids).not.toContain('topaz/image-upscale')
  })

  it('skips catalogue entries that came through with no fields', () => {
    expect(byId('kling-3.0-omni/image-to-video').fields).toHaveLength(0)
    const ids = familiesOf(models).flatMap((f) => f.members.map((m) => m.id))
    expect(ids).not.toContain('kling-3.0-omni/image-to-video')
  })

  it('switches to image-to-image when a picture is attached, and back without one', () => {
    const f = familyNamed('Flux-2 Pro')
    expect(variantFor(f, {}).id).toBe('flux-2/pro-text-to-image')
    expect(variantFor(f, { image: 1 }).id).toBe('flux-2/pro-image-to-image')
  })

  it('never lands on a mask editor when no mask was drawn', () => {
    const f = familyNamed('Ideogram V3')
    expect(variantFor(f, { image: 1 }).id).toBe('ideogram/v3-remix')
  })

  it('keeps a hand-picked variant while it still fits, and drops it when it cannot run', () => {
    const f = familyNamed('Flux-2 Pro')
    expect(variantFor(f, { image: 1 }, 'flux-2/pro-image-to-image').id).toBe('flux-2/pro-image-to-image')
    // Image-to-image with nothing attached would fail on Kie, so the text variant runs.
    expect(variantFor(f, {}, 'flux-2/pro-image-to-image').id).toBe('flux-2/pro-text-to-image')
  })

  it('tells a text-only family from one that takes references', () => {
    // Only the text-to-image Seedream 4.0 is in the fixture: nowhere for a file to go.
    const seedream = familyNamed('Seedream4.0')
    expect(familyTakes(seedream)).toBe(false)
    expect(familyTakes(seedream, 'image')).toBe(false)
    const gpt = familyNamed('GPT Image 2')
    expect(familyTakes(gpt)).toBe(true)
    expect(familyTakes(gpt, 'image')).toBe(true)
    expect(familyTakes(gpt, 'video')).toBe(false)
  })

  it('knows which models will not run without a picture', () => {
    expect(needsImage(byId('kling-2.6/image-to-video'))).toBe(true)
    expect(needsImage(byId('hailuo/2-3-image-to-video-pro'))).toBe(true)
    expect(needsImage(byId('veo/generate'))).toBe(false)
    expect(directionOf(byId('kling-2.6/text-to-video'))).toBe('text')
  })
})

describe('model picker', () => {
  const fam = (title: string, category: Family['category'] = 'image', ids = ['qwen/image-edit']): Family => ({ key: `${category}:${title.toLowerCase()}`, title, category, members: ids.map(byId) })

  it("gives each family its one line: its own note, else its series', else what it takes", () => {
    expect(familyNote(familyNamed('Nano Banana Pro'))).toBe('Ultimate quality, text and diagrams')
    expect(familyNote(familyNamed('Seedance 2', 'video'))).toBe('Image, video and audio references, consistent identity')
    // "Flux-2 Pro" is matched as "flux 2 pro".
    expect(familyNote(familyNamed('Flux-2 Pro'))).toBe('Precise prompt adherence, Pro variant')
    expect(familyNote(fam('Qwen3'))).toMatch(/^Alibaba's Qwen image models/)
    const unknown = fam('Mystery Model')
    expect(familyNote(unknown)).toBe(familyAbility(unknown))
    // One title, two lists: the category picks the note.
    expect(familyNote(fam('Grok Imagine', 'image'))).toMatch(/high-contrast/)
    expect(familyNote(fam('Grok Imagine', 'video', ['kling-2.6/text-to-video']))).toBe('Text and image to video')
  })

  it('shows each model line once, featured versions first, then newest first', () => {
    const image = seriesOf(familiesOf(models.filter((m) => m.category === 'image')))
    expect(image.find((s) => s.name === 'Nano Banana')?.versions.map((f) => f.title)).toEqual(['Nano Banana Pro', 'Nano Banana'])
    // A family no other version joins stands alone under its own name and note.
    const gpt = image.find((s) => s.versions.some((f) => f.title === 'GPT Image 2'))
    expect(gpt).toMatchObject({ name: 'GPT Image 2', note: 'Sharp text rendering and edits, up to 4K' })
    const video = seriesOf(familiesOf(models.filter((m) => m.category === 'video')))
    expect(video.find((s) => s.name === 'Seedance')?.versions.map((f) => f.title)).toEqual(['Seedance 2', 'Seedance 1.5 Pro'])

    const kling = seriesOf(['Kling V2.1 Master', 'Kling 2.6', 'Kling V3 Turbo', 'Kling 3.0 Omni'].map((t) => fam(t, 'video', ['kling-2.6/text-to-video'])))
    expect(kling).toHaveLength(1)
    expect(kling[0]?.versions.map((f) => f.title)).toEqual(['Kling V3 Turbo', 'Kling 3.0 Omni', 'Kling 2.6', 'Kling V2.1 Master'])
    // Seedance 1.0 is "V1 Lite" in the catalogue; its ids put it with Seedance.
    const v1 = { ...fam('V1 Lite', 'video', ['bytedance/seedance-2']), members: [{ ...byId('bytedance/seedance-2'), id: 'bytedance/v1-lite-text-to-video' }] }
    expect(seriesName(v1)).toBe('Seedance')
  })

  it('merges a line’s chips: best resolution, widest length, sound if any version has it', () => {
    const s = seriesOf(familiesOf(models.filter((m) => m.category === 'video'))).find((x) => x.name === 'Seedance')!
    const merged = seriesSpecs(s)
    const each = s.versions.map(familySpecs)
    expect(merged.lo).toBe(Math.min(...each.map((x) => x.lo ?? Infinity)))
    expect(merged.hi).toBe(Math.max(...each.map((x) => x.hi ?? 0)))
    expect(merged.audio).toBe(each.some((x) => x.audio))
  })

  it('reads a length range written only in the description, and knows Veo is 8 s with sound', () => {
    expect(rangeInText('The duration of the generated video (in seconds) (6-30). (Minimum: 6, Maximum: 30, Step: 1)')).toEqual([6, 30])
    expect(rangeInText('Without video input, the range is [2, 30].')).toEqual([2, 30])
    expect(rangeInText('Required. Output length in whole seconds, 4–12.')).toEqual([4, 12])
    expect(rangeInText('Required. The duration of the generated video in seconds')).toBeNull()
    expect(familySpecs(familyNamed('Seedance 1.5 Pro', 'video'))).toMatchObject({ lo: 4, hi: 12 })
    expect(lengthLabel(familySpecs(familyNamed('Veo — Create a video', 'video')))).toBe('8s')
    expect(familySpecs(familyNamed('Veo — Create a video', 'video')).audio).toBe(true)
  })

  it('badges a family NEW for 30 days after it reached the catalogue', () => {
    const nb21 = fam('Nano Banana 2.1')
    expect(isNew(nb21, Date.parse('2026-10-20T12:00:00Z'))).toBe(true)
    expect(isNew(nb21, Date.parse('2026-11-14T12:00:00Z'))).toBe(false)
    expect(isNew(familyNamed('Nano Banana Pro'), Date.parse('2026-10-20T12:00:00Z'))).toBe(false)
  })

  it('searches every version, by name, line, note or specs', () => {
    const video = familiesOf(models.filter((m) => m.category === 'video'))
    expect(searchFamilies(video, 'seedance 1.5').map((f) => f.title)).toEqual(['Seedance 1.5 Pro'])
    expect(searchFamilies(video, 'kling').map((f) => f.title)).toEqual(['Kling 2.6'])
    expect(searchFamilies(video, '').length).toBe(video.length)
    // A number has to start a number: "5" is Seedream 5.0, not 4.5.
    const seedream = ['Seedream5.0 Pro', 'Seedream4.5', 'Seedream 5.0 Lite'].map((t) => fam(t))
    expect(searchFamilies(seedream, 'seedream 5').map((f) => f.title)).toEqual(['Seedream5.0 Pro', 'Seedream 5.0 Lite'])
    expect(searchFamilies(seedream, '4.5').map((f) => f.title)).toEqual(['Seedream4.5'])
  })
})

describe('controls', () => {
  it('finds the aspect field whatever it is called', () => {
    expect(controlsFor(byId('veo/generate')).aspect?.field.name).toBe('aspectRatio')
    expect(controlsFor(byId('wan/2-7-text-to-video')).aspect?.field.name).toBe('ratio')
    // Ideogram spells aspect as a size name.
    const ideo = controlsFor(byId('ideogram/v3-text-to-image')).aspect
    expect(ideo?.field.name).toBe('image_size')
    expect(ideo?.choices.find((c) => c.value === 'portrait_16_9')?.label).toBe('9:16')
  })

  it('offers only what the model takes, and nothing for settings it lacks', () => {
    const c = controlsFor(byId('google/nano-banana'))
    expect(c.resolution).toBeUndefined()
    expect(c.duration).toBeUndefined()
    expect(controlsFor(byId('gpt-image-2-text-to-image')).resolution?.choices.map((x) => x.value)).toEqual(['1K', '2K', '4K'])
  })

  it('turns a numeric duration range into whole-second choices', () => {
    const d = controlsFor(byId('bytedance/seedance-2')).duration
    expect(d?.field.type).toBe('number')
    expect(d?.choices.length).toBeGreaterThan(3)
    expect(d?.choices.every((c) => /^\d+$/.test(c.value))).toBe(true)
  })

  it('uses the model count field when there is one', () => {
    expect(controlsFor(byId('bytedance/seedream-v4-text-to-image')).count?.field.name).toBe('max_images')
    expect(controlsFor(byId('flux-2/pro-text-to-image')).count).toBeUndefined()
  })

  it('carries a setting across a variant switch, or falls back to the new default', () => {
    const veo = controlsFor(byId('veo/generate')).aspect!
    expect(carryOver(veo, '9:16')).toBe('9:16')
    expect(carryOver(veo, '1:1')).toBe(pillDefault(veo))
    const kling = controlsFor(byId('kling-2.6/text-to-video')).duration!
    // 8s is not on Kling 2.6's list; the nearest length is.
    expect(['5', '10']).toContain(carryOver(kling, '8'))
    expect(carryOver(kling, '9')).toBe('10')
  })
})

describe('generator helpers', () => {
  it('finds the prompt field, including text-to-speech scripts', () => {
    expect(promptFieldOf(byId('market/elevenlabs-tts'))?.name).toBe('text')
    expect(promptFieldOf(byId('nano-banana-pro'))?.name).toBe('prompt')
  })

  it('names only the first reference field of each kind as the general one', () => {
    const names = primaryRefFields(byId('bytedance/seedance-2')).map((f) => f.name)
    expect(names[0]).toBe('first_frame_url')
    expect(names).not.toContain('last_frame_url')
  })

  it('reports required fields that are still empty', () => {
    const m = byId('kling-2.6/image-to-video')
    const input = buildInput(m, { prompt: 'walks forward' })
    expect(missingFields(m, input).map((f) => f.name)).toContain('image_urls')
    const filled = buildInput(m, { prompt: 'walks forward', refs: [{ url: 'https://x/y.png', kind: 'image' }] })
    expect(missingFields(m, filled)).toHaveLength(0)
  })

  it('keeps the tokens of set-aside files out of what a text-only model is sent', () => {
    expect(stripMentions('a cat like @image1 and @image2, on @Video1', ['image'])).toBe('a cat like and , on @Video1')
    expect(stripMentions('[Image 1] at dusk', ['image'])).toBe('at dusk')
    expect(stripMentions('no tokens here', ['image'])).toBe('no tokens here')
  })

  it('lets pill and Advanced values through to the payload', () => {
    const m = byId('kling-2.6/text-to-video')
    const input = buildInput(m, { prompt: 'a', values: { duration: '10', sound: true, not_a_field: 1 } })
    expect(input.duration).toBe('10')
    expect(input.sound).toBe(true)
    expect(input).not.toHaveProperty('not_a_field')
  })
})
