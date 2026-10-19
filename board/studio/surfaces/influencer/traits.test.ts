// The AI Influencer builder writes its prompt from trait picks. These pin down what the
// picks say, that limits per group hold, and that switching to an animal type leaves no
// human-only trait behind in the prompt.
import { describe, expect, it } from 'vitest'
import { composeCharacter, DEFAULT_SELECTION, genjutsuPrompt, groupsFor, randomSelection, sheetPrompt, SHEETS, TIERS, TRAIT_GROUPS, toggleTrait } from './traits.ts'

const group = (id: string) => TRAIT_GROUPS.find((g) => g.id === id)!

describe('trait groups', () => {
  it('match the reference app: nine character types and their option counts', () => {
    expect(TIERS.map((t) => t.label)).toEqual(['Average', 'Bold', 'Extreme', 'Insect', 'Frog', 'Cat', 'Dog', 'Rodent', 'Bird'])
    const counts = Object.fromEntries(TRAIT_GROUPS.map((g) => [g.id, g.options.length]))
    expect(counts).toMatchObject({ gender: 5, body_type: 7, hair: 26, hair_colour: 13, aesthetic: 8, ethnicity: 6, age: 3, skin_tone: 8, height: 3, proportions: 5, head: 10, neck: 4, eye_shape: 11, eye_color: 8, features: 25, facial_hair: 8, distinctive: 14, accessory: 6 })
  })

  it('cover what a character builder needs', () => {
    const ids = TRAIT_GROUPS.map((g) => g.id)
    for (const id of ['gender', 'age', 'ethnicity', 'skin_tone', 'head', 'eye_color', 'hair', 'hair_colour', 'body_type', 'height', 'distinctive', 'expression', 'aesthetic', 'setting', 'photo']) expect(ids).toContain(id)
    for (const g of TRAIT_GROUPS) expect(new Set(g.options.map((o) => o.id)).size).toBe(g.options.length)
  })

  it('drop the human-only groups for animal types', () => {
    const cat = groupsFor('cats').map((g) => g.id)
    expect(cat).not.toContain('skin_tone')
    expect(cat).not.toContain('ethnicity')
    expect(cat).toContain('hair_colour')
    expect(groupsFor('normal').map((g) => g.id)).toContain('skin_tone')
  })
})

describe('toggleTrait', () => {
  it('swaps in a single-pick group and unpicks on a second click', () => {
    let s = toggleTrait({}, group('gender'), 'female')
    s = toggleTrait(s, group('gender'), 'male')
    expect(s.gender).toEqual(['male'])
    expect(toggleTrait(s, group('gender'), 'male').gender).toEqual([])
  })

  it('keeps a multi-pick group at its limit by dropping the oldest', () => {
    const g = group('distinctive')
    let s = toggleTrait({}, g, 'df_hetero')
    s = toggleTrait(s, g, 'df_scar')
    s = toggleTrait(s, g, 'df_elf')
    expect(g.max).toBe(2)
    expect(s.distinctive).toEqual(['df_scar', 'df_elf'])
  })
})

describe('composeCharacter', () => {
  it('writes the picks as plain words', () => {
    const out = composeCharacter('normal', { gender: ['female'], age: ['mature'], ethnicity: ['european'], hair: ['hair_long'], hair_colour: ['hc_ginger'], eye_color: ['eye_green'], features: ['fn_freckles'], aesthetic: ['goth'], expression: ['ex_smile'], setting: ['bg_cafe'], photo: ['ph_film'] })
    expect(out).toMatch(/^Photorealistic full-colour photo of a European woman in their late forties\./)
    for (const w of ['green eye colour', 'freckles', 'long hair in ginger', 'wearing a goth outfit', 'a soft, warm smile', 'setting: a cosy café', '35mm film photograph']) expect(out.toLowerCase()).toContain(w)
    expect(out.endsWith('consistent identity.')).toBe(true)
  })

  it('reads well with nothing picked and adds the extra details', () => {
    const out = composeCharacter('normal', {}, 'always wears a red scarf.')
    expect(out).toContain('of a person.')
    expect(out).toContain('Always wears a red scarf.')
  })

  it('leaves out hair colour when bald and human-only traits for animals', () => {
    expect(composeCharacter('normal', { hair: ['hair_bald'], hair_colour: ['hc_blue'] })).not.toContain('blue hair')
    const cat = composeCharacter('cats', { gender: ['female'], skin_tone: ['st_fair'], ethnicity: ['african'], aesthetic: ['streetstyle'] })
    expect(cat).toContain('anthropomorphic cat character')
    expect(cat).toContain('female')
    expect(cat).not.toContain('fair skin')
    expect(cat).not.toContain('African')
  })

  it('says what a stylised type is', () => {
    expect(composeCharacter('freak', DEFAULT_SELECTION)).toContain('They are a striking, unconventional-looking person')
  })
})

describe('randomSelection', () => {
  it('only picks options that exist for the type', () => {
    const seq = [0.1, 0.9, 0.5, 0.3, 0.7]
    let i = 0
    const sel = randomSelection('dogs', () => seq[i++ % seq.length]!)
    const allowed = new Map(groupsFor('dogs').map((g) => [g.id, new Set(g.options.map((o) => o.id))]))
    for (const [gid, picks] of Object.entries(sel)) for (const p of picks) expect(allowed.get(gid)?.has(p)).toBe(true)
    expect(sel.skin_tone).toBeUndefined()
  })
})

describe('sheet and motion prompts', () => {
  it('ask for the same person and carry the character notes', () => {
    const turn = sheetPrompt('turnaround', 'Maya, freckles, red scarf.')
    expect(turn).toContain('front view')
    expect(turn).toContain('back view')
    expect(turn).toContain('About them: Maya, freckles, red scarf.')
    expect(turn).toContain('identical to the references')
    expect(sheetPrompt('expressions')).toContain('surprised')
    expect(SHEETS.length).toBeGreaterThanOrEqual(5)
    expect(sheetPrompt('nope')).toContain('turnaround')
  })

  it('GenShitSu prompts cite @image1 and carry the notes', () => {
    expect(genjutsuPrompt('transfer', 'copy')).toContain('character from @image1')
    expect(genjutsuPrompt('swap', 'product', 'ceramic mug with a chunky handle.')).toContain('About @image1: ceramic mug with a chunky handle.')
    expect(genjutsuPrompt('swap', 'nope')).toContain('Replace the person')
  })
})
