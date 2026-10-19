// The last tab of a surface with modes survives a reload, and a stale one is ignored.
// Each model family keeps its own pills and Advanced values; the seed is shared.
import { afterEach, describe, expect, it } from 'vitest'
import { bookFromDraft, bookToDraft, editSettings, leaveFamily, loadDraft, loadMode, replaceSettings, saveDraft, saveMode, settingsFor } from './draft.ts'

afterEach(() => window.localStorage.clear())

describe('loadMode / saveMode', () => {
  it('brings back the tab a surface was last on', () => {
    expect(loadMode('video', ['create', 'extend', 'lipsync'])).toBeNull()
    saveMode('video', 'lipsync')
    expect(loadMode('video', ['create', 'extend', 'lipsync'])).toBe('lipsync')
    // Per surface: Audio's tab is its own.
    expect(loadMode('audio', ['tts', 'music'])).toBeNull()
  })

  it('ignores a tab that no longer exists', () => {
    saveMode('edit', 'outpaint')
    expect(loadMode('edit', ['prompt', 'inpaint'])).toBeNull()
  })
})

describe('settings per family', () => {
  const GPT = 'image:gpt image 2'
  const Z = 'image:z image'

  it('brings a family back as it was left: GPT Image → Z-Image → GPT Image', () => {
    let book = bookFromDraft({})
    book = editSettings(book, GPT, { pills: { aspect: '9:16', resolution: '4K' }, values: { quality: 'high', seed: 7 } })
    book = leaveFamily(book, GPT)
    // A first visit starts from the pills on screen, with fresh Advanced values but the shared seed.
    expect(settingsFor(book, Z)).toEqual({ pills: { aspect: '9:16', resolution: '4K' }, values: { seed: 7 } })
    book = editSettings(book, Z, { pills: { aspect: '1:1' }, values: { seed: 9 } })
    book = leaveFamily(book, Z)
    expect(settingsFor(book, GPT)).toEqual({ pills: { aspect: '9:16', resolution: '4K' }, values: { quality: 'high', seed: 9 } })
    book = leaveFamily(book, GPT)
    expect(settingsFor(book, Z).pills).toEqual({ aspect: '1:1', resolution: '4K' })
  })

  it('a family only opened, never changed, still comes back as it showed', () => {
    let book = editSettings(bookFromDraft({}), GPT, { pills: { aspect: '16:9' } })
    book = leaveFamily(book, GPT)
    book = leaveFamily(book, Z) // Z opened and left untouched
    book = editSettings(book, GPT, { pills: { aspect: '3:4' } })
    book = leaveFamily(book, GPT)
    expect(settingsFor(book, Z).pills.aspect).toBe('16:9')
  })

  it('restoring a job replaces that family only', () => {
    let book = editSettings(bookFromDraft({}), GPT, { pills: { aspect: '9:16' }, values: { quality: 'high' } })
    book = leaveFamily(book, GPT)
    book = replaceSettings(book, Z, { pills: { aspect: '4:3' }, values: { steps: 30 } })
    expect(settingsFor(book, Z)).toEqual({ pills: { aspect: '4:3' }, values: { steps: 30 } })
    expect(settingsFor(book, GPT).values.quality).toBe('high')
  })

  it('survives a reload through the draft', () => {
    let book = editSettings(bookFromDraft({}), GPT, { pills: { aspect: '9:16' }, values: { quality: 'high' } })
    book = leaveFamily(book, GPT)
    book = editSettings(book, Z, { pills: { aspect: '1:1' }, values: { seed: 3 } })
    saveDraft('image', bookToDraft(book, Z))
    const again = bookFromDraft(loadDraft('image'))
    expect(settingsFor(again, Z)).toEqual({ pills: { aspect: '1:1' }, values: { seed: 3 } })
    expect(settingsFor(again, GPT)).toEqual({ pills: { aspect: '9:16' }, values: { quality: 'high', seed: 3 } })
  })

  it('still loads an older draft: its one set of settings goes to the family that opens', () => {
    window.localStorage.setItem('studio.draft.image', JSON.stringify({ prompt: 'a cat', pills: { aspect: '2:3' }, values: { quality: 'low' }, count: 2 }))
    const d = loadDraft('image')
    expect(d.prompt).toBe('a cat')
    const book = bookFromDraft(d)
    expect(settingsFor(book, GPT)).toEqual({ pills: { aspect: '2:3' }, values: { quality: 'low' } })
    // Saved before the catalogue loaded (no family yet), the values are not lost either.
    const again = bookFromDraft({ ...d, ...bookToDraft(book, null) })
    expect(settingsFor(again, GPT).values.quality).toBe('low')
  })
})
