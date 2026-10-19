/**
 * Edit and Layers mounted against a fake server (catalogue fixture, canned history), to
 * catch what the type checker can't: a tool that opens on the wrong model, a handoff that
 * lands in the wrong tool, a layer list that doesn't come back from a finished job.
 * Nothing here can reach Kie — fetch is replaced, and Generate is never pressed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import raw from '../../__fixtures__/models.json'
import { handOff } from '../../handoff.ts'
import { EditSurface } from '../EditSurface.tsx'
import { LayersSurface } from '../LayersSurface.tsx'

// The picker is its own component with its own tests; here it only has to exist.
vi.mock('../../Mentions.tsx', () => ({ MentionPicker: () => null }))
// Prices come from their own store and tests (pricing.test.ts).
vi.mock('../../estimate.ts', () => ({ useEstimate: () => null }))

const layerItem = {
  taskId: 'task-layers-1',
  model: 'seedream/5-flash-layer-decomposition',
  modelId: 'seedream/5-flash-layer-decomposition',
  category: 'image',
  state: 'success',
  createdAt: Date.now(),
  media: [
    { kind: 'image', url: 'https://x/0.png' },
    { kind: 'image', url: 'https://x/1.png' },
  ],
  rawResult: {
    resultObject: {
      layers_data: [
        { z_index: 0, size: '1000x1000', url: 'https://x/0.png' },
        { z_index: 1, size: '200x100', url: 'https://x/1.png', name: 'Headline text', bounding_box: { normalized: [100, 100, 300, 200] } },
      ],
    },
  },
}

beforeEach(() => {
  // A spy, not a global stub: unstubbing globals would also take away the setup's
  // ResizeObserver stand-in, which the picture stages need.
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async (path: string | URL | Request) => {
      const url = String(path)
      const data = url.startsWith('/api/models')
        ? { syncedAt: null, source: 'fixture', models: (raw as { category: string }[]).filter((m) => url.endsWith(`category=${m.category}`)) }
        : url.startsWith('/api/history')
          ? { items: [layerItem], count: 1 }
          : url.startsWith('/api/credits')
            ? { credits: 100 }
            : {}
      return new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    },
  )
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Edit', () => {
  it('opens each tool on the model that does it', async () => {
    render(<EditSurface />)
    expect(await screen.findByText('Nano Banana Pro')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Inpaint' }))
    expect(await screen.findByText('Ideogram V3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Upscale' }))
    expect(await screen.findByText('Topaz - Image Upscale')).toBeInTheDocument()
    expect(screen.getByText('x4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Relight' }))
    expect(await screen.findByText('Golden hour')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Reframe' }))
    expect(await screen.findByText('21:9')).toBeInTheDocument()
  })

  it('lands a handoff in its tool with the picture loaded', async () => {
    handOff({ surface: 'edit', mode: 'upscale', slots: { image: 'https://kie.example/up.png' } })
    const { container } = render(<EditSurface />)
    expect(screen.getByRole('tab', { name: 'Upscale' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('img[src="https://kie.example/up.png"]')).not.toBeNull()
    // The picture survives a switch of tool.
    fireEvent.click(screen.getByRole('tab', { name: 'Inpaint' }))
    expect(container.querySelector('img[src="https://kie.example/up.png"]')).not.toBeNull()
  })
})

describe('Edit, more', () => {
  it('reads a handed-over picture from its archive copy when the handoff names the result', () => {
    handOff({ surface: 'edit', mode: 'reframe', slots: { image: 'https://kie.example/up.png' }, sources: { image: { kind: 'image', url: 'https://x/r.png', localPath: 'media/t1/0.png' } } })
    const { container } = render(<EditSurface />)
    expect(screen.getByRole('tab', { name: 'Reframe' })).toHaveAttribute('aria-selected', 'true')
    expect(container.querySelector('img[src="/media/t1/0.png"]')).not.toBeNull()
  })

  it('Reframe without AI fill drops the model and offers a local download', async () => {
    render(<EditSurface />)
    fireEvent.click(screen.getByRole('tab', { name: 'Reframe' }))
    expect(await screen.findByText('Model')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: /Fill with AI/ }))
    expect(screen.queryByText('Model')).toBeNull()
    expect(screen.getByRole('button', { name: 'Download PNG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep editing this' })).toBeInTheDocument()
  })

  it('Upscale offers x1, x2 and x4 like theirs', async () => {
    render(<EditSurface />)
    fireEvent.click(screen.getByRole('tab', { name: 'Upscale' }))
    for (const x of ['x1', 'x2', 'x4']) expect(await screen.findByRole('button', { name: x })).toBeInTheDocument()
  })
})

describe('Layers', () => {
  it('lists the layers of a finished decomposition, top first', async () => {
    render(<LayersSurface />)
    expect(await screen.findByText('Headline text')).toBeInTheDocument()
    expect(screen.getByText('Background')).toBeInTheDocument()
    const names = [...document.querySelectorAll('.ly-name')].map((n) => n.textContent)
    expect(names[0]).toContain('Headline text')
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]!)
    const after = [...document.querySelectorAll('.ly-name')].map((n) => n.textContent)
    expect(after[0]).toContain('Background')
  })
})
