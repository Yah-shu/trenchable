/**
 * Saved motions: clips you marked "Save as motion", for the Motion Library's second tab.
 *
 * The library on disk (library.ts) keeps Elements, which are sets of pictures — it has no
 * kind for a clip — so this is a short list of task ids in localStorage, newest first. The
 * clips themselves stay in history; a saved id whose clip was deleted simply drops out.
 * One store for every component, so a tile's button and the library never disagree.
 */
import { useSyncExternalStore } from 'react'
import { toggleSaved } from './genjutsu.ts'

const KEY = 'studio.video.motions'
/** Enough for a working set; the oldest fall off. */
const MAX = 200

const listeners = new Set<() => void>()
let cache: string[] | null = null

function read(): string[] {
  if (cache) return cache
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown
    cache = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    cache = []
  }
  return cache
}

function write(next: string[]) {
  cache = next.slice(0, MAX)
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Storage off: kept for this visit only.
  }
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export const useSavedMotions = (): string[] => useSyncExternalStore(subscribe, read, read)

export const toggleMotion = (taskId: string) => write(toggleSaved(read(), taskId))
