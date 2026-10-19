// Marketing templates fill a recipe with the chosen product and person. These check the
// catalogue covers the formats the brief names, for stills and clips, and that filling
// never leaves a placeholder behind.
import { describe, expect, it } from 'vitest'
import { fillTemplate, filterTemplates, MARKETING_GROUPS, MARKETING_TEMPLATES, marketingKind } from './templates.ts'

describe('the template catalogue', () => {
  it('has every format, unique ids, and a product in every recipe', () => {
    const groups = new Set(MARKETING_TEMPLATES.map((t) => t.group))
    for (const g of MARKETING_GROUPS) if (g.id !== 'all') expect(groups.has(g.id)).toBe(true)
    expect(new Set(MARKETING_TEMPLATES.map((t) => t.id)).size).toBe(MARKETING_TEMPLATES.length)
    for (const t of MARKETING_TEMPLATES) expect(t.template).toContain('{product}')
  })

  it('offers stills and clips, and filters on both chips', () => {
    expect(filterTemplates(MARKETING_TEMPLATES, 'all', 'video').length).toBeGreaterThanOrEqual(6)
    expect(filterTemplates(MARKETING_TEMPLATES, 'all', 'image').length).toBeGreaterThanOrEqual(10)
    const ugcClips = filterTemplates(MARKETING_TEMPLATES, 'ugc', 'video')
    expect(ugcClips.length).toBeGreaterThan(0)
    expect(ugcClips.every((t) => t.group === 'ugc' && marketingKind(t) === 'video')).toBe(true)
  })
})

describe('fillTemplate', () => {
  const t = { template: 'Selfie of {avatar} holding {product}{avatar_with}. {brief}' }

  it('names the product and person, with their notes', () => {
    const out = fillTemplate(t, { product: { name: 'Ceramic mug', description: 'matte glaze, chunky handle.' }, avatar: { name: 'Maya' }, brief: '20% off this week' })
    expect(out).toBe('Selfie of the person from the reference pictures, Maya holding the product "Ceramic mug (matte glaze, chunky handle)", with the person from the reference pictures, Maya. 20% off this week')
  })

  it('falls back to the reference pictures and an everyday customer, with no placeholders left', () => {
    const out = fillTemplate(t, {})
    expect(out).toBe('Selfie of a relatable everyday customer holding the product in the reference pictures.')
    for (const tpl of MARKETING_TEMPLATES) expect(fillTemplate(tpl, {})).not.toMatch(/[{}]/)
  })
})
