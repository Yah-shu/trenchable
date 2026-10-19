/**
 * The Edit tools against real catalogue entries (__fixtures__/edit-models.json, copied
 * from /api/models): which family each tool offers, which member runs, and which field
 * the picture and the mask land in. A wrong answer here sends a restyle where an
 * outpaint was meant, or a mask to a model that ignores it.
 */
import { describe, expect, it } from 'vitest'
import raw from './__fixtures__/edit-models.json'
import { buildInput, type ModelDefinition } from '../../api.ts'
import { familiesOf, variantFor } from '../../families.ts'
import { BACKGROUND_IDS, EDITOR_IMAGE_FIELD, LAYER_IDS, MASK_IDS, UPSCALE_IDS, byIds, isImageEditor, isReframeModel } from './catalog.ts'

const models = raw as unknown as ModelDefinition[]
const byId = (id: string) => models.find((m) => m.id === id)!
const pictureField = (m: ModelDefinition) => m.fields.find((f) => f.type === 'reference' && EDITOR_IMAGE_FIELD.test(f.name))?.name

describe('edit catalogue', () => {
  it('every tool has its models in the catalogue', () => {
    for (const id of [...UPSCALE_IDS, ...BACKGROUND_IDS, ...MASK_IDS, ...LAYER_IDS]) expect(models.some((m) => m.id === id)).toBe(true)
  })

  it('general editors exclude text-only, mask-only and post-processing models', () => {
    const ids = models.filter(isImageEditor).map((m) => m.id)
    expect(ids).toEqual(expect.arrayContaining(['nano-banana-pro', 'gpt-image-2-image-to-image', 'qwen2-1/image-to-image', 'seedream/5-pro-image-to-image', 'flux-2/pro-image-to-image']))
    for (const not of ['ideogram/v3-edit', 'ideogram/character-edit', 'topaz/image-upscale', 'recraft/remove-background', 'seedream/5-pro-layer-decomposition', 'google/nano-banana', 'flux-2/pro-text-to-image'])
      expect(ids).not.toContain(not)
  })

  it('finds the picture field on every editor', () => {
    for (const m of models.filter(isImageEditor)) expect(pictureField(m)).toBeTruthy()
    expect(pictureField(byId('nano-banana-pro'))).toBe('image_input')
    expect(pictureField(byId('gpt-image-2-image-to-image'))).toBe('input_urls')
  })

  it('reframe runs Ideogram V3 Edit (with its mask), not Remix', () => {
    const reframe = models.filter(isReframeModel)
    const ideogram = familiesOf(reframe).find((f) => f.members.some((m) => m.id === 'ideogram/v3-edit'))!
    expect(ideogram.members.map((m) => m.id)).toEqual(['ideogram/v3-edit'])
    expect(variantFor(ideogram, { image: 1 }).id).toBe('ideogram/v3-edit')
  })

  it('inpaint sends the picture and the mask to their own fields', () => {
    const v3 = byId('ideogram/v3-edit')
    const input = buildInput(v3, { prompt: 'a red hat', fields: { image_url: 'https://k/img.png', mask_url: 'https://k/mask.png' } })
    expect(input.image_url).toBe('https://k/img.png')
    expect(input.mask_url).toBe('https://k/mask.png')
    const qwen = byId('qwen2-1/image-to-image')
    const q = buildInput(qwen, { prompt: 'a red hat', fields: { image_urls: 'https://k/img.png', mask_url: 'https://k/mask.png' } })
    expect(q.image_urls).toEqual(['https://k/img.png'])
    expect(q.mask_url).toBe('https://k/mask.png')
    const families = familiesOf(models.filter(byIds(MASK_IDS)))
    expect(families.length).toBe(3)
  })

  it('upscale and layers fill the fields Kie documents', () => {
    const topaz = buildInput(byId('topaz/image-upscale'), { prompt: '', fields: { image_url: 'https://k/a.png' }, values: { upscale_factor: '4' } })
    expect(topaz).toEqual({ image_url: 'https://k/a.png', upscale_factor: '4' })
    const crisp = buildInput(byId('recraft/crisp-upscale'), { prompt: '', fields: { image: 'https://k/a.png' } })
    expect(crisp).toEqual({ image: 'https://k/a.png' })
    const layers = buildInput(byId('seedream/5-pro-layer-decomposition'), { prompt: '', fields: { image_url: 'https://k/a.png' }, values: { size: 'auto', output_format: 'png' } })
    expect(layers).toEqual({ image_url: 'https://k/a.png', size: 'auto', output_format: 'png' })
  })
})
