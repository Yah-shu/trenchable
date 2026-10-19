import { useEffect, useMemo, useState } from 'react'
import { useQueries, useQueryClient } from '@tanstack/react-query'
import type { Dispatch, SetStateAction } from 'react'
import { fetchTask } from './api.ts'
import {
  normalizeTimestamp,
  PENDING_STALE_MS,
  UNKNOWN_STALE_MS,
  upsertInList,
} from './history.ts'
import type { HistoryPersistMode } from './useHistoryPersistence.ts'
import type { HistoryItem } from './models/types.ts'

/** Items worth polling: recent pending, or recently-unknown, tasks. */
function isPendingState(item: HistoryItem): boolean {
  const age = Date.now() - item.createdAt
  if (
    item.state === 'waiting' ||
    item.state === 'queuing' ||
    item.state === 'generating'
  ) {
    return age < PENDING_STALE_MS
  }
  if (item.state === 'unknown') {
    return age < UNKNOWN_STALE_MS
  }
  return false
}

/** Back off polling as a task ages: 2.5s → 5s → 10s. */
function taskPollInterval(createdAt: number): number {
  const age = Date.now() - createdAt
  if (age < 30_000) return 2500
  if (age < 2 * 60_000) return 5000
  return 10_000
}

/**
 * Poll every pending task and fold state/result updates back into `history`.
 * Persists on completion and reports consumed credits via `onCreditsUsed`.
 */
export function useTaskPolling({
  history,
  setHistory,
  requestHistoryPersist,
  onCreditsUsed,
}: {
  history: HistoryItem[]
  setHistory: Dispatch<SetStateAction<HistoryItem[]>>
  requestHistoryPersist: (mode?: HistoryPersistMode) => void
  onCreditsUsed: (credits: number) => void
}): { pendingCount: number; pendingTasks: HistoryItem[] } {
  const queryClient = useQueryClient()
  const [isPageVisible, setIsPageVisible] = useState(
    () => typeof document === 'undefined' || document.visibilityState === 'visible',
  )

  // 非表示中はポーリングを止め、復帰時に即時 refetch する。
  useEffect(() => {
    const onVisibilityChange = () => {
      const visible = document.visibilityState === 'visible'
      setIsPageVisible(visible)
      if (visible) {
        void queryClient.invalidateQueries({ queryKey: ['task'] })
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () =>
      document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [queryClient])

  const pendingTasks = useMemo(
    () => history.filter((item) => isPendingState(item)),
    [history],
  )

  const taskQueries = useQueries({
    queries: pendingTasks.map((item) => ({
      queryKey: [
        'task',
        item.taskId,
        item.provider ?? 'market',
        item.operation ?? 'generate',
      ] as const,
      queryFn: () => fetchTask(
        item.taskId,
        item.provider ?? 'market',
        item.operation ?? 'generate',
      ),
      refetchInterval: isPageVisible
        ? () => taskPollInterval(item.createdAt)
        : false as const,
      refetchIntervalInBackground: false,
      retry: 2,
    })),
  })

  // Serialized change-key for the polling effect below. Structured JSON (not a
  // delimiter-joined string) so field values can't collide with separators.
  const taskSnapshots = JSON.stringify(
    taskQueries.map((query, index) => {
      const data = query.data?.data
      if (!data && query.error) {
        const error = query.error as { message?: unknown; status?: unknown; code?: unknown }
        return {
          taskId: pendingTasks[index]?.taskId ?? 'unknown',
          kind: 'poll-error',
          message: typeof error.message === 'string' ? error.message : String(query.error),
          status: typeof error.status === 'number' ? error.status : null,
          code: typeof error.code === 'number' ? error.code : null,
        }
      }
      if (!data) return null
      return {
        taskId: data.taskId,
        state: data.state,
        resultUrls: data.resultUrls ?? null,
        media: data.media ?? null,
        providerStatus: data.providerStatus ?? null,
        creditsConsumed: data.creditsConsumed ?? null,
        failMsg: data.failMsg ?? null,
      }
    }),
  )

  useEffect(() => {
    const updates = taskQueries
      .map((q) => q.data?.data)
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
    const pollFailures = taskQueries.flatMap((query, index) => {
      if (!query.isError || !query.error) return []
      const pending = pendingTasks[index]
      if (!pending) return []
      const candidate = query.error as { message?: unknown; status?: unknown; code?: unknown }
      return [{
        taskId: pending.taskId,
        message: typeof candidate.message === 'string'
          ? candidate.message
          : String(query.error),
        status: typeof candidate.status === 'number' ? candidate.status : undefined,
        code: typeof candidate.code === 'number' ? candidate.code : undefined,
      }]
    })

    if (updates.length === 0 && pollFailures.length === 0) return

    const completedUpdates = updates.filter(
      (data) =>
        data.state === 'success' ||
        data.state === 'fail' ||
        data.state === 'partial' ||
        data.state === 'expired' ||
        data.state === 'unknown',
    )
    const latestUsed = completedUpdates.reduce<number | null>(
      (latest, data) =>
        data.state === 'success' && typeof data.creditsConsumed === 'number'
          ? data.creditsConsumed
          : latest,
      null,
    )

    setHistory((prev) => {
      let next = prev
      let changed = false

      for (const data of updates) {
        const existing = next.find((h) => h.taskId === data.taskId)
        if (!existing) continue
        if (
          existing.state === data.state &&
          (existing.resultUrls?.join(',') ?? '') ===
            (data.resultUrls?.join(',') ?? '') &&
          JSON.stringify(existing.media ?? []) === JSON.stringify(data.media) &&
          existing.providerStatus === data.providerStatus &&
          existing.creditsConsumed === data.creditsConsumed &&
          (existing.failMsg ?? '') === (data.failMsg ?? '')
        ) {
          continue
        }

        const item: HistoryItem = {
          ...existing,
          state: data.state,
          provider: data.provider,
          operation: data.operation,
          parentTaskId: data.parentTaskId ?? existing.parentTaskId,
          resultUrls: data.resultUrls,
          media: data.media,
          providerStatus: data.providerStatus,
          partial: data.partial,
          expiresAt: data.expiresAt,
          creditsConsumed: data.creditsConsumed,
          failMsg: data.failMsg,
          rawParam: data.rawParam,
          rawResult: data.rawResult,
          createdAt: normalizeTimestamp(data.createTime, existing.createdAt),
        }
        next = upsertInList(next, item)
        changed = true
      }

      for (const failure of pollFailures) {
        const existing = next.find((item) => item.taskId === failure.taskId)
        if (!existing) continue
        const rawResult = {
          pollError: {
            message: failure.message,
            status: failure.status,
            code: failure.code,
            capturedAt: new Date().toISOString(),
          },
          previous: existing.rawResult,
        }
        next = upsertInList(next, {
          ...existing,
          state: 'unknown',
          providerStatus: 'POLL_ERROR',
          failMsg: failure.message,
          rawResult,
        })
        changed = true
      }

      if (!changed) return prev
      return next
    })

    if (completedUpdates.length > 0 || pollFailures.length > 0) {
      requestHistoryPersist('debounced')
    }
    if (latestUsed !== null) onCreditsUsed(latestUsed)
    // taskSnapshots drives this effect; taskQueries is read for latest data
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskSnapshots, onCreditsUsed, requestHistoryPersist, setHistory])

  return { pendingCount: pendingTasks.length, pendingTasks }
}
