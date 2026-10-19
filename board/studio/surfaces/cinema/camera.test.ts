// Cinema's camera, film look, palette and lighting only reach the model as words in the
// prompt, so these words are the whole feature: Auto adds nothing, moves happen in the
// order they were put on the shot and never reach a still, and the user's own text comes
// first, as typed.
import { describe, expect, it } from 'vitest'
import { addMove, APERTURES, AUTO, CAMERAS, dressPrompt, GENRES, LENSES, lookCounts, lookWords, MOVES, removeMove, shiftMove } from './camera.ts'

describe('the Setup wheels and the moves match the reference app', () => {
  it('has their camera, lens and aperture options', () => {
    expect(CAMERAS.map((o) => o.label)).toEqual(['Auto', 'Modern', '35mm Film', '8mm Film', 'DV Camcorder'])
    expect(LENSES.map((o) => o.label)).toEqual(['Auto', 'Clean Sharp', 'Anamorphic', 'Vintage Anamorphic', 'Warm Vintage', 'Halation Vintage'])
    expect(APERTURES.map((o) => o.label)).toEqual(['Auto', 'f/1.4 Wide Open', 'f/4 Moderate', 'f/11 Deep Focus'])
  })

  it('has their named moves with unique ids, and General as the default genre', () => {
    expect(MOVES.length).toBeGreaterThanOrEqual(32)
    expect(new Set(MOVES.map((m) => m.id)).size).toBe(MOVES.length)
    for (const name of ['Snorricam', 'Robot arm', 'Dolly zoom', 'Bullet time', 'Crush zoom', 'Helicopter shot']) expect(MOVES.some((m) => m.label === name)).toBe(true)
    expect(GENRES[0]).toMatchObject({ id: 'general', words: '' })
  })
})

describe('moves on a shot', () => {
  it('adds at the end without doubling, removes, and reorders', () => {
    let moves = addMove(undefined, 'dolly-in')
    moves = addMove(moves, 'whip-pan')
    moves = addMove(moves, 'dolly-in')
    expect(moves).toEqual(['dolly-in', 'whip-pan'])
    expect(shiftMove(moves, 'whip-pan', -1)).toEqual(['whip-pan', 'dolly-in'])
    expect(shiftMove(moves, 'dolly-in', -1)).toEqual(['dolly-in', 'whip-pan'])
    expect(removeMove(moves, 'dolly-in')).toEqual(['whip-pan'])
  })
})

describe('dressPrompt', () => {
  it('leaves the prompt alone when everything is Auto or General', () => {
    expect(dressPrompt('A woman on a pier', {}, 'video')).toBe('A woman on a pier')
    expect(dressPrompt('A woman on a pier', { camera: AUTO, lens: AUTO, genre: 'general', moves: [] }, 'video')).toBe('A woman on a pier')
    expect(lookWords({}, 'image')).toBe('')
  })

  it('writes the kit, the moves in order, the film look, palette and light', () => {
    const out = dressPrompt('A woman on a pier at dawn.', { camera: '35mm', lens: 'anamorphic', aperture: '1.4', moves: ['dolly-in', 'whip-pan'], genre: 'thriller', era: '1970s', tempo: 'slow', palette: 'teal-orange', lighting: 'golden' }, 'video')
    expect(out.startsWith('A woman on a pier at dawn. Shot on 35mm motion picture film with natural grain, anamorphic lens with oval bokeh and horizontal flares, f/1.4 wide open')).toBe(true)
    expect(out).toContain('Camera movement, in this order: 1) a dolly push in towards the subject, then 2) a fast whip pan with motion blur.')
    expect(out).toContain('Film look: tense thriller, suspenseful framing and unease; 1970s New Hollywood era; slow, contemplative pacing with long held moments.')
    expect(out).toContain('Colour palette: teal-and-orange colour palette.')
    expect(out.endsWith('Lighting: warm golden-hour sunlight.')).toBe(true)
  })

  it('never puts moves or tempo into a still', () => {
    const out = dressPrompt('Portrait', { moves: ['drone-orbit'], tempo: 'frantic', lighting: 'neon' }, 'image')
    expect(out).toBe('Portrait. Lighting: coloured neon light.')
  })

  it('works with an empty prompt, one move, and unknown values', () => {
    expect(dressPrompt('  ', { moves: ['static-shot'] }, 'video')).toBe('Camera movement: a locked-off static shot.')
    expect(dressPrompt('X', { camera: 'nope', moves: ['nope'] }, 'video')).toBe('X')
  })

  it('counts what each pill has set, per mode', () => {
    expect(lookCounts({ camera: 'dv', moves: ['pan-left', 'tilt-up'], era: '1980s', tempo: 'brisk', palette: AUTO }, 'video')).toEqual({ camera: 3, film: 2, palette: 0, lighting: 0 })
    expect(lookCounts({ camera: 'dv', moves: ['pan-left'], tempo: 'brisk' }, 'image')).toEqual({ camera: 1, film: 0, palette: 0, lighting: 0 })
  })
})
