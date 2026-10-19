/**
 * The Canvas surface on screen, against a fake server: it opens on a wired starter board,
 * adds nodes, refuses a run in plain words before anything is sent, and writes the board
 * to storage — and storage that throws never breaks it. The fake server answers only the
 * catalogue, history and balance; any other request fails the test, so nothing here can
 * reach /api/generate or spend a credit.
 */
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import raw from '../../__fixtures__/models.json'
import { STORAGE_KEY } from './graph.ts'
import { loadBoards, writeBoards } from './store.ts'

let calls: string[] = []

beforeEach(() => {
  calls = []
  window.localStorage.clear()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`)
      const ok = (data: unknown) => new Response(JSON.stringify({ data }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      if (url.startsWith('/api/models')) {
        const category = new URL(url, 'http://x').searchParams.get('category')
        return ok({ syncedAt: null, source: 'test', models: (raw as { category: string }[]).filter((m) => m.category === category) })
      }
      if (url.startsWith('/api/history')) return ok({ items: [], count: 0 })
      if (url.startsWith('/api/credits')) return ok({ credits: 100 })
      throw new Error(`unexpected request in a Canvas test: ${url}`)
    }),
  )
  vi.spyOn(window, 'confirm').mockReturnValue(false)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('storage guards', () => {
  const throwing = {
    getItem: () => {
      throw new Error('SecurityError')
    },
    setItem: () => {
      throw new Error('QuotaExceededError')
    },
  }

  it('a storage that throws gives a fresh board and a refused save, not a crash', () => {
    const s = loadBoards(throwing)
    expect(s.boards).toHaveLength(1)
    expect(writeBoards(s, throwing)).toBe(false)
    expect(loadBoards(null).boards).toHaveLength(1)
    expect(writeBoards(s, null)).toBe(false)
  })

  it('corrupt saved data still opens', () => {
    expect(loadBoards({ getItem: () => '{"boards":[{"nodes":"x"}', setItem: () => {} }).boards).toHaveLength(1)
  })
})

describe('CanvasSurface', () => {
  it('opens on the starter board, adds nodes, refuses an empty run and saves', async () => {
    const { CanvasSurface } = await import('../CanvasSurface.tsx')
    const view = render(<CanvasSurface />)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })

    expect(screen.getByLabelText('Board')).toHaveDisplayValue('Board 1')
    expect(view.container.querySelectorAll('.cv-node')).toHaveLength(3)

    fireEvent.click(screen.getByTitle('Add a node: Upscale'))
    expect(view.container.querySelectorAll('.cv-node')).toHaveLength(4)

    // The starter Prompt is empty, so Run on the generator refuses before any request.
    const gen = view.container.querySelector('.cv-node.is-genImage') as HTMLElement
    const runBtn = [...gen.querySelectorAll('button')].find((b) => b.textContent?.includes('Run'))!
    await act(async () => {
      fireEvent.click(runBtn)
      await new Promise((r) => setTimeout(r, 10))
    })
    expect(gen).toHaveTextContent('The connected Prompt is empty')

    // Run all asks first; declining sends nothing.
    fireEvent.click(screen.getByText('Run all'))
    expect(window.confirm).toHaveBeenCalled()

    view.unmount()
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as { boards: { nodes: unknown[] }[] }
    expect(saved.boards[0]!.nodes).toHaveLength(4)
    expect(calls.filter((c) => !/\/api\/(models|history|credits)/.test(c))).toEqual([])
  })
})
