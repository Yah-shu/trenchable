// The Elements page's bookkeeping: grouping by kind in a fixed order, the 12-picture
// limit, and which past results can be copied into an element.
import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '../api.ts'
import type { Element } from '../library.ts'
import { countByKind, groupElements, nameFromPrompt, pastImages, roomLeft } from './model.ts'

const el = (id: string, kind: Element['kind'], name = id, description = ''): Element => ({ id, name, kind, description, createdAt: '', updatedAt: '', images: [], cover: 0 })

describe('groupElements', () => {
  const items = [el('p1', 'product', 'Bottle'), el('c1', 'character', 'Maya', 'red scarf'), el('c2', 'character', 'Tom'), el('s1', 'style')]

  it('groups in the library order and leaves empty kinds out', () => {
    expect(groupElements(items, 'all').map((g) => [g.kind, g.items.map((x) => x.id)])).toEqual([
      ['character', ['c1', 'c2']],
      ['product', ['p1']],
      ['style', ['s1']],
    ])
  })

  it('filters by kind and searches names and notes', () => {
    expect(groupElements(items, 'product').map((g) => g.kind)).toEqual(['product'])
    expect(groupElements(items, 'all', 'SCARF').flatMap((g) => g.items.map((x) => x.id))).toEqual(['c1'])
    expect(groupElements(items, 'location')).toEqual([])
  })

  it('counts per kind', () => {
    expect(countByKind(items)).toMatchObject({ all: 4, character: 2, product: 1, location: 0, style: 1, other: 0 })
  })
})

describe('roomLeft', () => {
  it('counts what is there and what is waiting against the limit of 12', () => {
    expect(roomLeft(0)).toBe(12)
    expect(roomLeft(10, 1)).toBe(1)
    expect(roomLeft(11, 4)).toBe(0)
  })
})

describe('pastImages', () => {
  const items: HistoryItem[] = [
    { taskId: 'a', model: 'm', category: 'image', state: 'success', createdAt: 3, prompt: 'red car', media: [{ kind: 'image', url: 'https://x/a.png', localPath: 'media/a/0.png' }] },
    { taskId: 'v', model: 'm', category: 'video', state: 'success', createdAt: 2, media: [{ kind: 'video', url: 'https://x/v.mp4' }] },
    { taskId: 'f', model: 'm', category: 'image', state: 'fail', createdAt: 1, media: [{ kind: 'image', url: 'https://x/f.png' }] },
    { taskId: 'u', model: 'Flux', category: 'image', state: 'success', createdAt: 1, resultUrls: ['https://x/u.png'] },
  ]

  it('offers finished images only, archived path first', () => {
    expect(pastImages(items).map((p) => [p.source, p.prompt])).toEqual([
      ['/media/a/0.png', 'red car'],
      ['https://x/u.png', 'Flux'],
    ])
    expect(pastImages(null)).toEqual([])
  })
})

describe('nameFromPrompt', () => {
  it('takes the first words, capitalised', () => {
    expect(nameFromPrompt('a European woman in her late forties, freckles')).toBe('A European woman in her')
    expect(nameFromPrompt('   ')).toBe('New character')
    expect(nameFromPrompt(undefined, 'Product')).toBe('Product')
  })
})
