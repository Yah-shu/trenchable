/**
 * The boards, held at module level like jobs.ts holds the queue.
 *
 * A run outlives the surface: pictures upload, Run all waits minutes on each job, and you
 * may well switch lane meanwhile. If the boards lived in component state, a run would
 * keep patching a dead copy that then overwrites the live one on save. Here there is one
 * copy: every patch lands in it, the surface subscribes to it, and it is written to
 * localStorage (debounced; every access guarded — no storage just means no memory).
 */
import { useSyncExternalStore } from 'react'
import { parseBoards, serialiseBoards, STORAGE_KEY, type Board, type Boards, type NodeData } from './graph.ts'

/** The bits of Storage this needs, so tests can hand in one that throws. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

const local = (): StorageLike | null => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Read the saved boards; anything unreadable or unavailable gives a fresh board. */
export function loadBoards(storage: StorageLike | null = local()): Boards {
  let raw: string | null = null
  try {
    raw = storage?.getItem(STORAGE_KEY) ?? null
  } catch {
    // Blocked storage: start fresh, still usable for this visit.
  }
  return parseBoards(raw)
}

/** Write the boards; false when the browser refused (quota, private mode, blocked). */
export function writeBoards(state: Boards, storage: StorageLike | null = local()): boolean {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, serialiseBoards(state))
    return true
  } catch {
    return false
  }
}

/* ---------- the store ---------- */

export type RunAllState = { boardId: string; line: string }

type Snapshot = { boards: Boards; saveFailed: boolean; sending: ReadonlySet<string>; runAll: RunAllState | null }

let snap: Snapshot | null = null
let timer = 0
let stopAsked = false
const listeners = new Set<() => void>()

function current(): Snapshot {
  if (!snap) {
    snap = { boards: loadBoards(), saveFailed: false, sending: new Set(), runAll: null }
    // Whatever the debounce still holds goes out with the page.
    try {
      window.addEventListener('beforeunload', flush)
    } catch {
      // No window (tests): nothing to flush on.
    }
  }
  return snap
}

function set(next: Partial<Snapshot>) {
  snap = { ...current(), ...next }
  for (const l of listeners) l()
}

export function flush() {
  window.clearTimeout(timer)
  timer = 0
  const ok = writeBoards(current().boards)
  if (ok !== !current().saveFailed) set({ saveFailed: !ok })
}

/** Replace the boards. Return the same object to change nothing. */
export function updateBoards(fn: (s: Boards) => Boards) {
  const prev = current().boards
  const next = fn(prev)
  if (next === prev) return
  set({ boards: next })
  window.clearTimeout(timer)
  timer = window.setTimeout(flush, 400)
}

export function updateBoard(boardId: string, fn: (b: Board) => Board) {
  updateBoards((s) => {
    let changed = false
    const boards = s.boards.map((b) => {
      if (b.id !== boardId) return b
      const nb = fn(b)
      if (nb === b) return b
      changed = true
      return { ...nb, updatedAt: Date.now() }
    })
    return changed ? { ...s, boards } : s
  })
}

/** Merge into one node's data. Silently nothing when the node (or board) is gone. */
export function patchNode(boardId: string, nodeId: string, data: Partial<NodeData>) {
  updateBoard(boardId, (b) => (b.nodes.some((n) => n.id === nodeId) ? { ...b, nodes: b.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n)) } : b))
}

export const getBoard = (boardId: string): Board | undefined => current().boards.boards.find((b) => b.id === boardId)

/** Nodes whose Run was pressed and whose pictures are still going up. */
export function setSending(nodeId: string, on: boolean) {
  const next = new Set(current().sending)
  if (on) next.add(nodeId)
  else next.delete(nodeId)
  set({ sending: next })
}

/** Run all's progress line (null when it isn't running) and its stop request. */
export function setRunAll(state: RunAllState | null) {
  if (state && !current().runAll) stopAsked = false
  set({ runAll: state })
}
export const askStop = () => {
  stopAsked = true
}
export const stopRequested = () => stopAsked

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useCanvasStore(): Snapshot {
  return useSyncExternalStore(subscribe, current, current)
}
