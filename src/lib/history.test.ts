import { describe, expect, it } from 'vitest'
import {
  capItems,
  isTerminalState,
  MAX_PINNED,
  mergeServerHistory,
  normalizeHistoryItems,
} from './history.ts'
import type { HistoryItem } from './models/types.ts'

describe('history migration', () => {
  it('migrates legacy resultUrls into media without losing the URLs', () => {
    const [item] = normalizeHistoryItems([{
      taskId: 'legacy-audio',
      model: 'elevenlabs/tts',
      category: 'audio',
      state: 'success',
      createdAt: Date.now(),
      resultUrls: ['https://cdn.example.com/voice.mp3'],
    }], 'local')
    expect(item?.resultUrls).toEqual(['https://cdn.example.com/voice.mp3'])
    expect(item?.media).toEqual([{ kind: 'audio', url: 'https://cdn.example.com/voice.mp3' }])
    expect(item?.provider).toBe('market')
    expect(item?.operation).toBe('generate')
  })

  it('keeps partial and expired terminal states during import', () => {
    const items = normalizeHistoryItems([
      { taskId: 'partial', model: 'suno', category: 'audio', state: 'partial', createdAt: 1 },
      { taskId: 'expired', model: 'runway', category: 'video', state: 'expired', createdAt: 2 },
    ], 'import')
    expect(items.map((item) => item.state)).toEqual(['expired', 'partial'])
  })
})

function item(
  taskId: string,
  extra: Partial<HistoryItem> = {},
): HistoryItem {
  return {
    taskId,
    model: 'test/model',
    category: 'image',
    state: 'waiting',
    createdAt: 1_000,
    ...extra,
  }
}

describe('capItems', () => {
  it('keeps exactly the pin budget pinned', () => {
    const capped = capItems(
      Array.from({ length: MAX_PINNED }, (_, index) =>
        item(`pinned-${index}`, { pinned: true }),
      ),
    )

    expect(capped).toHaveLength(MAX_PINNED)
    expect(capped.every((entry) => entry.pinned)).toBe(true)
  })

  it('unpinns only the item over the pin budget', () => {
    const capped = capItems(
      Array.from({ length: MAX_PINNED + 1 }, (_, index) =>
        item(`pinned-${index}`, { pinned: true }),
      ),
    )

    expect(capped).toHaveLength(MAX_PINNED + 1)
    expect(capped.slice(0, MAX_PINNED).every((entry) => entry.pinned)).toBe(true)
    expect(capped.at(-1)?.pinned).toBe(false)
  })
})

describe('normalizeHistoryItems boundaries', () => {
  it('returns an empty list for an empty input', () => {
    expect(normalizeHistoryItems([], 'local')).toEqual([])
  })

  it('keeps duplicate task IDs as separate normalized entries', () => {
    const normalized = normalizeHistoryItems([
      item('duplicate', { state: 'success', createdAt: 2_000 }),
      item('duplicate', { state: 'fail', createdAt: 1_000 }),
    ], 'local')

    expect(normalized).toHaveLength(2)
    expect(normalized.map((entry) => entry.taskId)).toEqual(['duplicate', 'duplicate'])
  })

  it('drops invalid elements while retaining valid history items', () => {
    const normalized = normalizeHistoryItems([
      null,
      [],
      { taskId: 'missing-model' },
      { taskId: 'valid', model: 'test/model', category: 'image', state: 'success' },
    ], 'local')

    expect(normalized).toHaveLength(1)
    expect(normalized[0]?.taskId).toBe('valid')
  })
})

describe('isTerminalState', () => {
  it('treats success/fail/partial/expired as terminal', () => {
    expect(isTerminalState('success')).toBe(true)
    expect(isTerminalState('fail')).toBe(true)
    expect(isTerminalState('partial')).toBe(true)
    expect(isTerminalState('expired')).toBe(true)
    expect(isTerminalState('generating')).toBe(false)
    expect(isTerminalState('waiting')).toBe(false)
  })
})

describe('mergeServerHistory', () => {
  it('adds unknown server taskIds into the local list', () => {
    const merged = mergeServerHistory(
      [item('local-only')],
      [item('cli-new', { state: 'generating', createdAt: 2_000 })],
    )
    expect(merged.map((entry) => entry.taskId).sort()).toEqual([
      'cli-new',
      'local-only',
    ])
  })

  it('prefers terminal server state over local pending and keeps the local pin', () => {
    const merged = mergeServerHistory(
      [item('t-1', { state: 'generating', pinned: true })],
      [item('t-1', { state: 'success', resultUrls: ['https://cdn.example.com/a.png'] })],
    )
    expect(merged).toHaveLength(1)
    expect(merged[0]?.state).toBe('success')
    expect(merged[0]?.pinned).toBe(true)
    expect(merged[0]?.resultUrls).toEqual(['https://cdn.example.com/a.png'])
  })

  it('does not let a pending server snapshot overwrite a local terminal item', () => {
    const merged = mergeServerHistory(
      [item('t-1', { state: 'success', resultUrls: ['https://cdn.example.com/a.png'] })],
      [item('t-1', { state: 'generating' })],
    )
    expect(merged[0]?.state).toBe('success')
  })
})
