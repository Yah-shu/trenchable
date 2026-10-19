import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HistorySheets } from './HistorySheets.tsx'
import { AudioPlayerProvider } from './audio/AudioPlayer.tsx'
import type { HistoryItem } from '../lib/models/types.ts'

vi.mock('../lib/api.ts', () => ({
  createPersona: vi.fn(),
  downloadArchive: vi.fn(),
  fetchDownloadUrl: vi.fn().mockResolvedValue({ downloadUrl: '' }),
  fetchPersonas: vi.fn().mockResolvedValue([]),
  fetchTimestampedLyrics: vi.fn().mockResolvedValue({ alignedWords: [] }),
}))

function successItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    taskId: 'task-1',
    model: 'market/flux',
    modelId: 'market/flux',
    category: 'image',
    state: 'success',
    createdAt: Date.now(),
    prompt: 'a red fox',
    input: { prompt: 'a red fox' },
    resultUrls: ['https://cdn.example.com/fox.png'],
    media: [{ kind: 'image', url: 'https://cdn.example.com/fox.png' }],
    ...overrides,
  }
}

function renderSheets(
  overrides: Partial<Parameters<typeof HistorySheets>[0]> = {},
) {
  const handlers = {
    onCloseViewer: vi.fn(),
    onCloseCompare: vi.fn(),
    onReuse: vi.fn(),
    onRetry: vi.fn(),
    onSendToInput: vi.fn(),
    onUpdateItem: vi.fn(),
    onQuickAction: vi.fn(),
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <AudioPlayerProvider>
        <HistorySheets
          active={null}
          showViewer={false}
          compareItems={[]}
          showCompare={false}
          items={[]}
          {...handlers}
          {...overrides}
        />
      </AudioPlayerProvider>
    </QueryClientProvider>,
  )
  return handlers
}

describe('HistorySheets', () => {
  afterEach(cleanup)

  it('renders no dialog while the viewer is closed', () => {
    renderSheets()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens the viewer for the active item and closes on request', () => {
    const active = successItem()
    const { onCloseViewer } = renderSheets({ active, showViewer: true })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const closeButton = screen.getByRole('button', {
      name: (_name, el) => el.hasAttribute('data-sheet-initial-focus'),
    })
    fireEvent.click(closeButton)
    expect(onCloseViewer).toHaveBeenCalledTimes(1)
  })

  it('reuses the active item when its input can be restored', () => {
    const active = successItem()
    const { onReuse } = renderSheets({ active, showViewer: true })
    fireEvent.click(screen.getByRole('button', { name: /設定ごと再利用/ }))
    expect(onReuse).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' }),
    )
  })

  it('offers a retry for a failed item', () => {
    const active = successItem({ state: 'fail', failMsg: 'boom' })
    const { onRetry } = renderSheets({ active, showViewer: true })
    fireEvent.click(screen.getByRole('button', { name: '同じ入力で再実行' }))
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1' }),
    )
  })
})
