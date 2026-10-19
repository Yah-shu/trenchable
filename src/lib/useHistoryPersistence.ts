import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchHistory, putHistory } from './api.ts'
import { capItems } from './history.ts'
import type { HistoryItem } from './models/types.ts'

export type HistoryPersistMode = 'immediate' | 'debounced'

export function useHistoryPersistence({
  items,
  ready,
  onStored,
  onRecovered,
  onError,
}: {
  items: HistoryItem[]
  ready: boolean
  onStored: (items: HistoryItem[]) => void
  onRecovered: (items: HistoryItem[]) => void
  onError: (error: unknown) => void
}) {
  const [request, setRequest] = useState<{
    revision: number
    mode: HistoryPersistMode
  }>({ revision: 0, mode: 'immediate' })
  const itemsRef = useRef(items)
  const onStoredRef = useRef(onStored)
  const onRecoveredRef = useRef(onRecovered)
  const onErrorRef = useRef(onError)
  const writeQueueRef = useRef<Promise<void> | null>(null)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  useEffect(() => {
    onStoredRef.current = onStored
    onRecoveredRef.current = onRecovered
    onErrorRef.current = onError
  }, [onError, onRecovered, onStored])

  const enqueue = useCallback((snapshot: HistoryItem[]) => {
    const capped = capItems(snapshot)
    const queue = writeQueueRef.current ?? Promise.resolve()
    writeQueueRef.current = queue
      .catch(() => undefined)
      .then(async () => {
        try {
          const response = await putHistory(capped)
          onStoredRef.current(response.data.items)
        } catch (error) {
          onErrorRef.current(error)
          try {
            const response = await fetchHistory()
            onRecoveredRef.current(response.data.items)
          } catch {
            // Keep the optimistic state when recovery also fails.
          }
        }
      })
  }, [])

  const requestPersist = useCallback((mode: HistoryPersistMode = 'immediate') => {
    setRequest((previous) => ({
      revision: previous.revision + 1,
      mode,
    }))
  }, [])

  useEffect(() => {
    if (!ready || request.revision === 0) return
    if (request.mode === 'immediate') {
      enqueue(itemsRef.current)
      return
    }
    const timer = window.setTimeout(() => enqueue(itemsRef.current), 400)
    return () => window.clearTimeout(timer)
  }, [enqueue, ready, request])

  return requestPersist
}
