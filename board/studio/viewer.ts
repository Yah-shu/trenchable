/**
 * Which result the viewer is showing, if any.
 *
 * Any tile on any surface can open the viewer; it is mounted once by Studio, so the
 * state lives here rather than in whichever grid was clicked. `list` is the run of
 * results around it, for the viewer's previous/next.
 */
import { useSyncExternalStore } from 'react'
import type { HistoryItem } from './api.ts'

export interface ViewerState {
  item: HistoryItem
  list: HistoryItem[]
}

let state: ViewerState | null = null
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

export function openViewer(item: HistoryItem, list: HistoryItem[] = [item]) {
  state = { item, list: list.length ? list : [item] }
  emit()
}

export function closeViewer() {
  state = null
  emit()
}

/** Step through `list`; wraps at neither end. */
export function stepViewer(delta: number) {
  if (!state) return
  const i = state.list.findIndex((x) => x.taskId === state!.item.taskId)
  const next = state.list[i + delta]
  if (next) {
    state = { ...state, item: next }
    emit()
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useViewer = (): ViewerState | null => useSyncExternalStore(subscribe, () => state, () => state)
