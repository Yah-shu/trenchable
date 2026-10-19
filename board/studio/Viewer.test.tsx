// The viewer, the tiles and the Assets grid, rendered against a stubbed server: stepping with
// the arrow keys, favouriting with F, Regenerate, the inline two-step delete (never
// window.confirm), the failed tile, and Assets' selection, search and incremental drawing.
// No job is ever submitted: the queue's submitJob is replaced, and /api/generate isn't stubbed.
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshHistory, type HistoryItem, type ModelDefinition } from './api.ts'
import { submitJob } from './jobs.ts'
import { takeHandoff } from './handoff.ts'
import { FailedTile, ResultTile } from './tiles.tsx'
import { Viewer } from './Viewer.tsx'
import { AssetsSurface } from './surfaces/AssetsSurface.tsx'
import { closeViewer, openViewer } from './viewer.ts'

vi.mock('./jobs.ts', async (importOriginal) => ({ ...(await importOriginal<typeof import('./jobs.ts')>()), submitJob: vi.fn(() => 'job-test') }))

// The Elements library is its own piece of work (and tested on its own); Assets only mounts it.
vi.mock('./elements/ElementsPanel.tsx', () => ({ ElementsPanel: () => null }))

const day = new Date(2026, 9, 10, 12).getTime()
const items: HistoryItem[] = ['one', 'two', 'three', 'four'].map((word, i) => ({
  taskId: `task-${word}`,
  model: 'nano-banana-pro',
  modelId: 'nano-banana-pro',
  category: 'image',
  state: 'success',
  createdAt: day - i * 60_000,
  prompt: `prompt ${word}`,
  creditsConsumed: 4,
  media: [{ kind: 'image', localPath: `media/task-${word}/0.png` }],
  input: { prompt: `prompt ${word}`, aspect_ratio: '1:1', input_urls: ['https://k/ref.png'] },
}))

const models: ModelDefinition[] = [
  {
    id: 'nano-banana-pro',
    model: 'nano-banana-pro',
    title: 'Nano Banana Pro',
    category: 'image',
    provider: 'market',
    fields: [
      { name: 'prompt', type: 'textarea', label: 'Prompt' },
      { name: 'aspect_ratio', type: 'enum', label: 'Aspect ratio', enum: ['1:1'] },
      { name: 'input_urls', type: 'reference', label: 'Images' },
    ],
  },
]

const calls: { method: string; url: string; body?: unknown }[] = []
/** What the stubbed server's history holds; a test can swap it and call refreshHistory(). */
let serverItems: HistoryItem[] = items

const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })

beforeEach(() => {
  calls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      calls.push({ method, url, body: typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body })
      if (url.startsWith('/api/models')) return ok({ syncedAt: null, source: 'test', models: url.includes('category=image') ? models : [] })
      if (url.startsWith('/api/history')) return ok({ items: serverItems, count: serverItems.length })
      // No price list: Regenerate shows no estimate, which is what an unpriced model does too.
      if (url.startsWith('/api/studio/pricing')) return new Response(JSON.stringify({ error: 'no prices in tests' }), { status: 503 })
      if (url.startsWith('/api/studio/')) return ok({ items: [] })
      if (url.startsWith('/api/credits')) return ok({ credits: 100 })
      // Re-hosting a result for Kie: the archive file, then the upload.
      if (url.startsWith('/media/')) return new Response(new Blob(['png'], { type: 'image/png' }))
      if (url === '/api/upload') return ok({ fileUrl: `https://kie/up/${calls.length}`, originalFileName: '0.png' })
      return new Response(JSON.stringify({ error: `unexpected ${method} ${url}` }), { status: 500 })
    }),
  )
})

afterEach(async () => {
  act(() => closeViewer())
  cleanup()
  if (serverItems !== items) {
    serverItems = items
    await refreshHistory()
  }
  vi.unstubAllGlobals()
})

describe('Viewer', () => {
  it('shows the result, its model and settings, and steps with the arrow keys', async () => {
    render(<Viewer />)
    act(() => openViewer(items[0]!, items))
    expect(screen.getAllByText('prompt one').length).toBeGreaterThan(0)
    expect(await screen.findAllByText('Nano Banana Pro')).not.toHaveLength(0)
    expect(screen.getByText('1 of 4')).toBeInTheDocument()
    expect(screen.getByText('Aspect ratio')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Animate/ })).toBeInTheDocument()

    fireEvent.keyDown(window, { key: 'ArrowRight' })
    expect(screen.getByText('2 of 4')).toBeInTheDocument()
    expect(screen.getAllByText('prompt two').length).toBeGreaterThan(0)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('favourites with F', async () => {
    render(<Viewer />)
    act(() => openViewer(items[0]!, items))
    fireEvent.keyDown(window, { key: 'f' })
    await waitFor(() => expect(calls.some((c) => c.url === '/api/studio/favourite')).toBe(true))
    const fav = calls.find((c) => c.url === '/api/studio/favourite')
    expect(fav).toMatchObject({ method: 'POST', body: { taskId: 'task-one', on: true } })
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('offers Turn to video on a still, and Regenerate runs the same job once the models are in', async () => {
    // A fresh job: its Kie uploads are still live, so Regenerate sends them as they are
    // (an older one re-hosts them first — the fixed dates above would make this test age).
    const fresh = { ...items[0]!, createdAt: Date.now() }
    serverItems = [fresh, ...items.slice(1)]
    await refreshHistory()
    render(<Viewer />)
    act(() => openViewer(fresh, serverItems))
    expect(screen.getByRole('button', { name: /Turn to video/ })).toBeInTheDocument()
    const again = screen.getByRole('button', { name: /Regenerate/ })
    await waitFor(() => expect(again).not.toBeDisabled())
    fireEvent.click(again)
    await waitFor(() => expect(submitJob).toHaveBeenCalledTimes(1))
    expect(vi.mocked(submitJob).mock.calls[0]?.[1]).toEqual(fresh.input)
    expect(vi.mocked(submitJob).mock.calls[0]?.[2]).toMatchObject({ surface: 'image' })
    expect(await screen.findByText(/Running again/)).toBeInTheDocument()
    expect(calls.some((c) => c.url.startsWith('/api/generate'))).toBe(false)
  })

  it('deletes only after an inline confirm, then moves to the next result', async () => {
    const confirm = vi.spyOn(window, 'confirm')
    render(<Viewer />)
    act(() => openViewer(items[0]!, items))
    fireEvent.click(screen.getByRole('button', { name: /Delete…/ }))
    expect(screen.getByText(/Delete this result for good/)).toBeInTheDocument()
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /^Delete$/ }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/history/task-one')).toBe(true))
    await waitFor(() => expect(screen.getByText('1 of 3')).toBeInTheDocument())
    expect(screen.getAllByText('prompt two').length).toBeGreaterThan(0)
    expect(confirm).not.toHaveBeenCalled()
  })
})

describe('Assets', () => {
  it('ticks one, shift-ticks a run, and offers the bulk actions', async () => {
    render(<AssetsSurface />)
    const boxes = await screen.findAllByRole('checkbox', { name: 'Select' })
    expect(boxes).toHaveLength(4)
    fireEvent.click(boxes[0]!)
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('checkbox', { name: /^(Unselect|Select)$/ })[2]!, { shiftKey: true })
    expect(screen.getByText('3 selected')).toBeInTheDocument()
    const bar = within(screen.getByRole('toolbar', { name: 'Selected results' }))
    for (const name of ['Download', 'Favourite', 'Add to project', 'Delete…']) {
      expect(bar.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument()
    }
    fireEvent.click(bar.getByRole('button', { name: /Delete…/ }))
    expect(screen.getByText(/Delete 3 results for good/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep them' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }))
    expect(screen.queryByText(/selected/)).toBeNull()
  })

  it('searches prompts and dates', async () => {
    render(<AssetsSurface />)
    await screen.findAllByRole('checkbox', { name: 'Select' })
    const box = screen.getByLabelText('Search prompts or dates')
    fireEvent.change(box, { target: { value: 'three' } })
    expect(screen.getAllByRole('checkbox', { name: 'Select' })).toHaveLength(1)
    fireEvent.change(box, { target: { value: '2026-10-10' } })
    expect(screen.getAllByRole('checkbox', { name: 'Select' })).toHaveLength(4)
    fireEvent.change(box, { target: { value: 'October 9' } })
    expect(screen.queryAllByRole('checkbox', { name: 'Select' })).toHaveLength(0)
  })

  it('draws a big library in steps but selects all of it', async () => {
    serverItems = Array.from({ length: 130 }, (_, i) => ({ ...items[0]!, taskId: `bulk-${i}`, createdAt: day - i * 60_000, prompt: `bulk ${i}` }))
    await act(() => refreshHistory())
    render(<AssetsSurface />)
    expect(await screen.findAllByRole('checkbox', { name: 'Select' })).toHaveLength(120)
    expect(screen.getByText('Showing 120 of 130')).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    expect(screen.getByText('130 selected')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }))
    expect(screen.getAllByRole('checkbox', { name: 'Unselect' })).toHaveLength(130)
  })

  it('switches to masonry and one run without dates, and remembers it', async () => {
    render(<AssetsSurface />)
    await screen.findAllByRole('checkbox', { name: 'Select' })
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    fireEvent.click(screen.getByRole('radio', { name: /Masonry/ }))
    fireEvent.click(screen.getByRole('switch', { name: /Split by date/ }))
    expect(document.querySelector('.vw-masonry')).not.toBeNull()
    expect(screen.queryByText('October 10, 2026')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('st-assets-view') ?? '{}')).toMatchObject({ layout: 'masonry', split: false })
    window.localStorage.removeItem('st-assets-view')
  })

  it('filters by a date range', async () => {
    render(<AssetsSurface />)
    await screen.findAllByRole('checkbox', { name: 'Select' })
    fireEvent.change(screen.getByLabelText('Date range'), { target: { value: 'custom' } })
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-11' } })
    expect(screen.queryAllByRole('checkbox', { name: 'Select' })).toHaveLength(0)
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-10' } })
    expect(screen.getAllByRole('checkbox', { name: 'Select' })).toHaveLength(4)
  })
})

describe('ResultTile hover bar', () => {
  it('sends a still to the composer as a reference, and to Video as the end frame', async () => {
    const still = { ...items[0]!, media: [{ kind: 'image' as const, localPath: 'media/tile-bar/0.png' }] }
    const open = vi.fn()
    render(<ResultTile item={still} onOpen={open} />)
    fireEvent.click(screen.getByRole('button', { name: /Reference/ }))
    await waitFor(() => expect(window.location.hash).toBe('#/gen/image'))
    expect(takeHandoff('image')?.refs?.[0]?.url).toMatch(/^https:\/\/kie\/up\//)
    fireEvent.click(screen.getByRole('button', { name: /Animate/ }))
    expect(screen.getByRole('menu', { name: 'Frame placement' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'End frame' }))
    await waitFor(() => expect(window.location.hash).toBe('#/gen/video'))
    expect(takeHandoff('video')).toMatchObject({ mode: 'create', sources: { last: still.media[0] } })
    expect(open).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(open).toHaveBeenCalledWith(still)
  })

  it('gives a clip Extend and Upscale', () => {
    const clip: HistoryItem = { ...items[0]!, category: 'video', media: [{ kind: 'video', localPath: 'media/clip/0.mp4' }] }
    render(<ResultTile item={clip} onOpen={() => {}} />)
    expect(screen.getByRole('button', { name: /Extend/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Upscale/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Reference/ })).toBeNull()
  })
})

describe('FailedTile', () => {
  const failed: HistoryItem = { ...items[0]!, taskId: 'task-failed', state: 'fail', creditsConsumed: 0, failMsg: 'Content flagged', media: [] }

  it('says the credits came back, and removes only after a confirm', async () => {
    render(<FailedTile item={failed} />)
    expect(screen.getByText('Failed · Credits refunded')).toBeInTheDocument()
    expect(screen.getByText('Content flagged')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Remove/ }))
    await waitFor(() => expect(calls.some((c) => c.method === 'DELETE' && c.url === '/api/history/task-failed')).toBe(true))
  })

  it('retries the same job', async () => {
    render(<FailedTile item={{ ...failed, creditsConsumed: 3 }} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    const retry = screen.getByRole('button', { name: /Retry/ })
    await waitFor(() => expect(retry).not.toBeDisabled())
    fireEvent.click(retry)
    await waitFor(() => expect(submitJob).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('Sent again.')).toBeInTheDocument()
  })
})
