// Voice names: every ElevenLabs id the catalogue offers has a name, and Gemini's two voice
// lists stay what Kie documents. The id list below is the `voice` enum of
// market/elevenlabs-tts as served by /api/models on 2026-10-11.
import { describe, expect, it } from 'vitest'
import { ELEVEN_VOICES, GEMINI_38_VOICES, GEMINI_VOICES, VOICE_USES, elevenOptions, findVoices, geminiOptions, swatchOf, voiceChips, voiceLabel, voiceLabels, voiceName, voicePreviewUrl, voiceUses } from './voices.ts'

const CATALOGUE_IDS =
  'EkK5I93UQWFDigLMpZcX Z3R5wn05IrDiVCyEkUrK NNl6r8mD7vthiJatiJt1 YOq2y2Up4RgXP2HyXjE5 B8gJV1IhpuegLxdpXFOE 2zRM7PkgwBPiau2jvVXc 1SM7GgM6IMuvQlz2BwM3 5l5f8iK3YPeGga21rQIX scOwDtmlUjD3prqpp97I NOpBlnGInO9m6vDvFkFC BZgkqPqms7Kj9ulSkVzn wo6udizrrtpIxWGp2qJk gU0LNdkMOQCOrPrwtbee DGzg6RaUqxGRTHSBjfgF x70vRnQBMBu4FAYhjJbO Sm1seazb4gs7RSlUVw7c P1bg08DkjqiVEzOn76yG qDuRKMlYmrm8trt5QyBn qXpMhyvQqiRxWQs4qSSB TX3LPaxmHKxFdv7VOQHJ N2lVS1w4EtoT3dr4eOWO FGY2WhTYpPnrIDTdsKH5 kPzsL2i3teMYv0FxEYQ6 UgBBYS2sOqTuMpoF3BR0 hpp4J3VqNfWAUOO0d1Us nPczCjzI2devNBz1zQrb uYXf8XasLslADfZ2MB4u gs0tAILXbY5DNrJrsM6F DTKMou8ccj1ZaWGBiotd vBKc2FfBKJfcZNyEt1n6 DYkrAHD8iwork3YSUBbs 56AoDkrOh6qfVPDXZ7Pt eR40ATw9ArzDf9h3v7t7 g6xIsTj2HwM6VR4iXFCw lcMyyd2HUfFzxdCaC4Ta 6aDn1KB0hjpdcocrUkmq Sq93GQT4X1lKDXsQcixO flHkNRp1BlvT73UL6gyz 9yzdeviXkFddZ4Oz8Mok pPdl9cQBQq4p6mRkZy2Z zYcjlYFOd3taleS0gkk3 nzeAacJi50IvxcyDnMXa ruirxsoakN0GWmGNIo04 TC0Zp7WVFzhA8zpTlRqV ljo9gAlSqKOvF6D8sOsX PPzYpIqttlTYA83688JI 8JVbfL6oEdmuxKn5DK2C iCrDUkL56s3C8sCRl7wb wJqPPQ618aTW29mptyoc EiNlNiXeDU1pqqOPrYMO 4YYIPFl9wE5c4L2eu2Gb 6F5Zhi321D3Oq7v1oNT4 YXpFCvM1S3JbWEJhoskW LG95yZDEHg6fCZdQjLqj CeNX9CMwmxDxUF5Q2Inm aD6riP1btT197c6dACmy mtrellq69YZsNwzUSyXh dHd5gvgSOzSfduK4CvEg eVItLK1UvXctxuaRV2Oq esy0r39YPLQjOczyOib8 Tsns2HvNFKfGiNjllgqo 1U02n4nD6AdIZ9CjF053 AeRdCCKzvd23BpJoofzx LruHrtVF6PSyGItzMNHS 1wGbFxmAM3Fgw63G1zZJ hqfrgApggtO1785R4Fsn MJ0RnG71ty4LH3dvNfSd'.split(' ')

describe('ElevenLabs voices', () => {
  it('names every voice the catalogue offers, once each', () => {
    expect(CATALOGUE_IDS).toHaveLength(67)
    const named = new Set(ELEVEN_VOICES.map((v) => v.id))
    expect(CATALOGUE_IDS.filter((id) => !named.has(id))).toEqual([])
    expect(named.size).toBe(ELEVEN_VOICES.length)
  })

  it('reads names and notes', () => {
    expect(voiceName('EkK5I93UQWFDigLMpZcX')).toBe('James')
    expect(voiceLabel('EkK5I93UQWFDigLMpZcX')).toBe('James · Husky, Engaging and Bold')
    expect(voiceLabel('wo6udizrrtpIxWGp2qJk')).toBe('Northern Terry')
  })

  it('falls back to "Voice n" for an id nobody has named', () => {
    expect(voiceName('newVoiceId', ['EkK5I93UQWFDigLMpZcX', 'newVoiceId'])).toBe('Voice 2')
    expect(voiceLabels(['EkK5I93UQWFDigLMpZcX', 'zzz'])).toEqual({ EkK5I93UQWFDigLMpZcX: 'James · Husky, Engaging and Bold', zzz: 'Voice 2' })
  })

  it('previews from Kie’s CDN', () => {
    expect(voicePreviewUrl('N2lVS1w4EtoT3dr4eOWO')).toBe('https://static.aiquickdraw.com/elevenlabs/voice/N2lVS1w4EtoT3dr4eOWO.mp3')
  })
})

describe('Gemini voices', () => {
  it('2.5 / 3.1 have 30 voices, 3.8 has 70 and keeps all 30', () => {
    expect(GEMINI_VOICES).toHaveLength(30)
    expect(GEMINI_38_VOICES).toHaveLength(70)
    const v38 = new Set(GEMINI_38_VOICES.map((v) => v.name))
    expect(GEMINI_VOICES.filter((v) => !v38.has(v.name))).toEqual([])
    expect(v38.has('Fola')).toBe(true)
  })
})

describe('the voice picker', () => {
  const all = elevenOptions(CATALOGUE_IDS)

  it('makes one card per id, with its name, note, preview and the uses its words say', () => {
    expect(all).toHaveLength(67)
    const james = all[0]!
    expect(james).toMatchObject({ id: 'EkK5I93UQWFDigLMpZcX', name: 'James', note: 'Husky, Engaging and Bold', preview: voicePreviewUrl('EkK5I93UQWFDigLMpZcX') })
    expect(james.tags).toEqual(['Deep'])
    // A voice with no note still gets chips from its name.
    expect(all.find((v) => v.name === 'British Football Announcer')!.tags).toEqual(['Announcer', 'British'])
    expect(voiceUses('Calm, Soothing and Meditative')).toEqual(['Calm'])
  })

  it('searches every word across name, note and chips, inside the picked chip', () => {
    expect(findVoices(all, 'brian', null).map((v) => v.name)).toEqual(['Brian'])
    expect(findVoices(all, 'deep narrator', null).map((v) => v.name)).toEqual(['Hank'])
    const calm = findVoices(all, '', 'Calm')
    expect(calm.length).toBeGreaterThan(5)
    expect(calm.every((v) => v.tags.includes('Calm'))).toBe(true)
    expect(findVoices(all, 'zzz', null)).toEqual([])
  })

  it('offers only the chips a list has, in a fixed order, with counts', () => {
    const chips = voiceChips(all)
    expect(chips.map((c) => c.tag)).toEqual(VOICE_USES.filter((u) => chips.some((c) => c.tag === u)))
    expect(chips.every((c) => c.count > 0)).toBe(true)
    expect(voiceChips(geminiOptions(GEMINI_VOICES))).toEqual([])
    expect(voiceChips(geminiOptions(GEMINI_38_VOICES)).find((c) => c.tag === 'Tutor')?.count).toBe(7)
  })

  it('gives each name the same swatch every time', () => {
    expect(swatchOf('James')).toBe(swatchOf('James'))
    expect(swatchOf('James')).not.toBe(swatchOf('Bella'))
    expect(swatchOf('James')).toMatch(/^hsl\(\d+ 70% 84%\)$/)
  })
})
