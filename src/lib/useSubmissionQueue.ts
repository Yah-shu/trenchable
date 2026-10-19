import { useRef, useSyncExternalStore } from 'react'
import { SubmissionQueue } from './submissionQueue.ts'

export function useSubmissionQueue() {
  const queueRef = useRef<SubmissionQueue | null>(null)
  if (!queueRef.current) queueRef.current = new SubmissionQueue(20, 10_000, 3)
  const queue = queueRef.current
  const items = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getSnapshot,
  )
  return { queue, items }
}
