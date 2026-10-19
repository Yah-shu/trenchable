import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { migrateHistory } from './api.ts'
import { mergeHistory } from './history.ts'
import type { HistoryItem } from './models/types.ts'
import {
  readPersistedRaw,
  removePersisted,
  writePersistedRaw,
} from './usePersistedState.ts'

const LS_HISTORY_KEY = 'kie-studio-history'
const LS_MIGRATED_KEY = 'kie-studio-history-migrated'

/**
 * One-shot hydration: once the server history query succeeds, migrate any
 * legacy localStorage payload into SQLite (once), merge with in-memory updates
 * that landed during the await, and mark persistence ready.
 */
export function useHistoryMigration({
  isSuccess,
  data,
  setHistory,
  queryClient,
  onReady,
  onError,
}: {
  isSuccess: boolean
  data: HistoryItem[] | undefined
  setHistory: Dispatch<SetStateAction<HistoryItem[]>>
  queryClient: QueryClient
  onReady: () => void
  onError: (error: unknown) => void
}): void {
  const hydratedRef = useRef(false)
  const onReadyRef = useRef(onReady)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onReadyRef.current = onReady
    onErrorRef.current = onError
  }, [onReady, onError])

  useEffect(() => {
    if (!isSuccess || hydratedRef.current) return
    hydratedRef.current = true

    let cancelled = false
    void (async () => {
      let items = data ?? []
      try {
        if (readPersistedRaw(LS_MIGRATED_KEY) !== '1') {
          const raw = readPersistedRaw(LS_HISTORY_KEY)
          if (raw) {
            const parsed = JSON.parse(raw) as unknown
            if (Array.isArray(parsed) && parsed.length > 0) {
              const res = await migrateHistory(parsed)
              items = res.data.items
              removePersisted(LS_HISTORY_KEY)
            }
          }
          writePersistedRaw(LS_MIGRATED_KEY, '1')
        }
      } catch (e) {
        if (!cancelled) onErrorRef.current(e)
      }
      if (!cancelled) {
        // Prefer in-memory updates that landed during migrate await
        setHistory((prev) => {
          const next = prev.length === 0 ? items : mergeHistory(prev, items)
          queryClient.setQueryData(['history'], next)
          return next
        })
        onReadyRef.current()
      }
    })()

    return () => {
      cancelled = true
    }
  }, [isSuccess, data, setHistory, queryClient])
}
