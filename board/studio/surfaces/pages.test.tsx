// The library-backed Studio pages rendered against a stubbed server: the Elements page
// (create, inline delete — never window.confirm), the @ picker's Elements tab, and a
// smoke pass over Effects, Presets, Cinema, Influencer and Marketing. Nothing here can
// spend credits: /api/generate is not stubbed, so a stray submit would fail the test.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryItem, ModelDefinition } from '../api.ts'
import type { Element, Project } from '../library.ts'
import { ElementsPanel } from '../elements/ElementsPanel.tsx'
import { MentionPicker } from '../Mentions.tsx'
import { EffectsSurface } from './EffectsSurface.tsx'
import { PresetsSurface } from './PresetsSurface.tsx'
import { CinemaSurface } from './CinemaSurface.tsx'
import { InfluencerSurface } from './InfluencerSurface.tsx'
import { MarketingSurface } from './MarketingSurface.tsx'

const img = (id: string, n = 1) => ({ n, file: `${n}.png`, url: `/api/studio/elements/${id}/files/${n}.png`, thumb: `/api/studio/elements/${id}/files/${n}-thumb.webp` })
const elements: Element[] = [
  { id: 'el-maya', name: 'Maya', kind: 'character', description: 'freckles', createdAt: '', updatedAt: '1', images: [img('el-maya')], cover: 1 },
  { id: 'el-mug', name: 'Ceramic mug', kind: 'product', description: '', createdAt: '', updatedAt: '1', images: [img('el-mug')], cover: 1 },
]
const projects: Project[] = [{ id: 'pr-rain', title: 'Rain scene', notes: '', createdAt: '2026-10-01', updatedAt: '2026-10-02', taskIds: ['task-one'] }]
const items: HistoryItem[] = [{ taskId: 'task-one', model: 'Flux', modelId: 'flux-2/pro-text-to-image', category: 'image', state: 'success', createdAt: 1, prompt: 'a red car', media: [{ kind: 'image', localPath: 'media/task-one/0.png' }] }]

const field = (name: string, type: string, extra: Record<string, unknown> = {}) => ({ name, type, label: name, ...extra })
const models: ModelDefinition[] = [
  { id: 'img/text-to-image', model: 'img/text-to-image', title: 'Img Text to Image', category: 'image', provider: 'market', fields: [field('prompt', 'textarea', { required: true }), field('aspect_ratio', 'enum', { enum: ['1:1', '9:16'] })] },
  { id: 'img/image-to-image', model: 'img/image-to-image', title: 'Img Image to Image', category: 'image', provider: 'market', fields: [field('prompt', 'textarea', { required: true }), field('image_urls', 'reference', { maxItems: 8 })] },
  { id: 'vid/text-to-video', model: 'vid/text-to-video', title: 'Vid Text to Video', category: 'video', provider: 'market', fields: [field('prompt', 'textarea', { required: true }), field('duration', 'enum', { enum: ['5', '10'] })] },
  { id: 'vid/image-to-video', model: 'vid/image-to-video', title: 'Vid Image to Video', category: 'video', provider: 'market', fields: [field('prompt', 'textarea', { required: true }), field('image_url', 'reference', { maxItems: 1, scalar: true, required: true })] },
] as unknown as ModelDefinition[]

const calls: { method: string; url: string; body?: unknown }[] = []
const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  calls.length = 0
  // jsdom has no layout; the pages scroll the composer into view after a pick.
  window.HTMLElement.prototype.scrollIntoView = () => {}
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined
      calls.push({ method, url, body })
      if (url.startsWith('/api/models')) {
        const cat = /category=(\w+)/.exec(url)?.[1]
        return ok({ syncedAt: null, source: 'test', models: models.filter((m) => m.category === cat) })
      }
      if (url.startsWith('/api/history')) return ok({ items, count: items.length })
      if (url.startsWith('/api/credits')) return ok({ credits: 100 })
      if (url.startsWith('/api/grok/status')) return ok({ available: false })
      if (url === '/api/studio/elements' && method === 'GET') return ok({ items: elements })
      if (url === '/api/studio/elements' && method === 'POST') return ok({ ...elements[0], id: 'el-new', name: body?.name, kind: body?.kind, images: [] })
      if (url.startsWith('/api/studio/elements/') && method === 'DELETE') return ok({ deleted: true, id: url.split('/').pop() })
      if (url === '/api/studio/projects' && method === 'GET') return ok({ items: projects })
      return new Response(JSON.stringify({ error: `unexpected ${method} ${url}` }), { status: 500 })
    }),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ElementsPanel', () => {
  it('groups elements by kind and creates a new one', async () => {
    render(<ElementsPanel />)
    expect(await screen.findByText('Maya')).toBeInTheDocument()
    expect(screen.getByText('Ceramic mug')).toBeInTheDocument()
    expect(screen.getAllByText('Characters').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /New element/ }))
    fireEvent.change(screen.getByPlaceholderText(/e\.g\. Maya/), { target: { value: 'zz-test Leo' } })
    fireEvent.click(screen.getByRole('button', { name: /Create element/ }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/studio/elements')).toBe(true))
    expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ name: 'zz-test Leo', kind: 'character' })
  })

  it('deletes only after an inline confirm', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    render(<ElementsPanel />)
    fireEvent.click(await screen.findByText('Maya'))
    fireEvent.click(screen.getByTitle('Delete this element'))
    expect(screen.getByText(/can't be undone/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/studio/elements/el-maya')).toBe(true))
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('MentionPicker', () => {
  it('offers an Elements tab only when picking one does something', async () => {
    const onPickElement = vi.fn()
    const { unmount } = render(<MentionPicker model={null} refs={[]} onPick={() => {}} onPickElement={onPickElement} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Elements' }))
    fireEvent.click(await screen.findByTitle(/Maya/))
    expect(onPickElement).toHaveBeenCalledWith(expect.objectContaining({ id: 'el-maya' }))
    unmount()
    render(<MentionPicker model={null} refs={[]} onPick={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('tab', { name: 'Elements' })).toBeNull()
  })
})

describe('pages', () => {
  it('Effects goes home → effect page → its form, each level on its own address', async () => {
    window.location.hash = '#/gen/effects'
    render(<EffectsSurface />)
    expect(screen.getByText('Visual effects')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Dolly zoom', { selector: '.ef-cloud-chip' }))
    expect(await screen.findByRole('heading', { name: 'Dolly zoom' })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/gen/effects/cam-dolly-zoom')
    expect(screen.getByText('See the recipe')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^Generate$/ }))
    expect(await screen.findByRole('button', { name: /Change/ })).toBeInTheDocument()
    expect(window.location.hash).toBe('#/gen/effects/cam-dolly-zoom/use')
    const toggle = screen.getByRole('switch', { name: 'Prompt' })
    expect(toggle).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('switch', { name: 'Prompt' })).toHaveAttribute('aria-checked', 'true')
    expect(calls.some((c) => c.url.startsWith('/api/generate'))).toBe(false)
    window.location.hash = ''
  })

  it('Presets loads a recipe into the composer', async () => {
    render(<PresetsSurface />)
    fireEvent.click(screen.getByText('Film noir', { selector: '.sp-preset-title' }))
    await waitFor(() => expect((screen.getByPlaceholderText('Describe the subject…') as HTMLTextAreaElement).value).toContain('film noir'))
  })

  it('Cinema lists projects; a project has their attribute pills and the Camera modal puts moves on the shot', async () => {
    render(<CinemaSurface />)
    fireEvent.click(await screen.findByTitle('Rain scene'))
    expect(await screen.findByText('In this project')).toBeInTheDocument()
    for (const pill of ['References', 'Film look', 'Camera', 'Color palette', 'Lighting']) expect(screen.getAllByText(pill).length).toBeGreaterThan(0)

    fireEvent.click(screen.getByTitle('Camera'))
    expect(screen.getByRole('dialog', { name: 'Camera' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'DV Camcorder' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('option', { name: '35mm Film' }))
    fireEvent.click(screen.getByRole('tab', { name: /Movement/ }))
    fireEvent.click(screen.getAllByRole('button', { name: /Put on prompt/ })[0]!)
    expect(screen.getByText(/On the shot · 1/)).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('Camera moves')).toBeInTheDocument()
    expect(screen.getByText(/35mm Film · 1 move/)).toBeInTheDocument()

    // Typing # offers the moves; a pick goes on the shot and leaves no #word behind.
    const box = screen.getByPlaceholderText(/# for camera moves/) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'A chase #whip' } })
    fireEvent.click(await screen.findByRole('button', { name: /Whip pan/ }))
    expect(screen.getByText(/35mm Film · 2 moves/)).toBeInTheDocument()
    expect(box.value).toBe('A chase ')
  })

  it('the @ picker has a Liked tab and pages long lists', async () => {
    const many: HistoryItem[] = Array.from({ length: 70 }, (_, i) => ({ taskId: `t${i}`, model: 'm', category: 'image', state: 'success', createdAt: 100 - i, prompt: `p${i}`, pinned: i < 2, media: [{ kind: 'image', url: `https://x/${i}.png` }] }))
    items.splice(0, items.length, ...many)
    const { refreshHistory } = await import('../api.ts')
    await refreshHistory()
    render(<MentionPicker model={null} refs={[]} onPick={() => {}} onClose={() => {}} placement="down" />)
    expect(await screen.findByRole('button', { name: /Show more \(10 left\)/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Liked' }))
    expect(screen.queryByRole('button', { name: /Show more/ })).toBeNull()
    expect(screen.getAllByTitle(/^p[01]$/)).toHaveLength(2)
  })

  it('Influencer builds from traits and moves between tabs', async () => {
    render(<InfluencerSurface />)
    expect(screen.getByText('Character type')).toBeInTheDocument()
    await waitFor(() => expect((screen.getByPlaceholderText('The character to build…') as HTMLTextAreaElement).value).toContain('Photorealistic'))
    fireEvent.click(screen.getByRole('tab', { name: 'Characters' }))
    expect(await screen.findByText('Saved characters')).toBeInTheDocument()
    expect(await screen.findByText('Maya')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Sheet' }))
    expect(await screen.findByRole('button', { name: /Make sheet/ })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Motion' }))
    expect(await screen.findByRole('tab', { name: 'Motion transfer' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Objects swap' }))
    expect(await screen.findByText('Video to change')).toBeInTheDocument()
  })

  it('Marketing seeds the composer from a template', async () => {
    render(<MarketingSurface />)
    fireEvent.click(screen.getByText('Listing main image', { selector: '.sp-preset-title' }))
    await waitFor(() => expect((screen.getByPlaceholderText(/Edit the recipe/) as HTMLTextAreaElement).value).toContain('pure white background'))
  })
})
