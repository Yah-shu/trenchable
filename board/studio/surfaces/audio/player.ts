/**
 * One clip at a time across Audio.
 *
 * The feed's rows, the rail's voice card, the picker's previews and the line editors all
 * play through this one element, so starting anything stops whatever was playing (as on
 * the reference app). Rows read only their own slice — "is my clip playing", "how far in" — so a
 * playing clip re-renders one row, not the list.
 */
import { useSyncExternalStore } from 'react'

let el: HTMLAudioElement | null = null
let current: string | null = null
let playing = false
let frac = 0
let seconds = 0
let raf = 0
const listeners = new Set<() => void>()
const emit = () => {
  for (const l of listeners) l()
}

const read = () => {
  if (!el) return
  seconds = el.currentTime
  frac = el.duration > 0 && Number.isFinite(el.duration) ? el.currentTime / el.duration : 0
}

function tick() {
  read()
  emit()
  if (playing) raf = requestAnimationFrame(tick)
}

function halt() {
  playing = false
  cancelAnimationFrame(raf)
}

/** Play `url` (from `at`, a fraction of its length, when given). Stops anything else. */
export function play(url: string, at?: number) {
  if (current !== url || !el) {
    el?.pause()
    const a = new Audio(url)
    el = a
    current = url
    frac = 0
    seconds = 0
    a.onended = () => {
      if (el !== a) return
      halt()
      frac = 0
      seconds = 0
      emit()
    }
    a.onerror = () => {
      if (el !== a) return
      halt()
      emit()
    }
  }
  const a = el
  if (at != null) {
    const to = () => {
      if (a.duration > 0 && Number.isFinite(a.duration)) a.currentTime = Math.min(0.999, Math.max(0, at)) * a.duration
      read()
      emit()
    }
    if (a.readyState >= 1) to()
    else a.addEventListener('loadedmetadata', to, { once: true })
  }
  playing = true
  emit()
  void a
    .play()
    .then(() => {
      if (el !== a || !playing) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(tick)
    })
    .catch(() => {
      if (el !== a) return
      halt()
      emit()
    })
}

export function pause() {
  el?.pause()
  halt()
  read()
  emit()
}

/** ▶ / ❚❚ on one clip. */
export function toggle(url: string) {
  if (current === url && playing) pause()
  else play(url)
}

/** Click on a waveform: jump there and play. */
export const seek = (url: string, at: number) => play(url, at)

/** Leaving the surface: nothing keeps talking in the background. */
export function stop() {
  el?.pause()
  halt()
  el = null
  current = null
  frac = 0
  seconds = 0
  emit()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

/** Whether this clip is the one playing. */
export const usePlaying = (url?: string | null): boolean => useSyncExternalStore(subscribe, () => Boolean(url) && current === url && playing)

/** How far into this clip the player is (0 when it is another clip). Kept while paused. */
export const useProgress = (url?: string | null): number => useSyncExternalStore(subscribe, () => (url && current === url ? frac : 0))

/** Seconds into this clip, for the row's clock. */
export const usePosition = (url?: string | null): number => useSyncExternalStore(subscribe, () => (url && current === url ? seconds : 0))

/** The clip playing right now, if any (the older editors' "which ▶ is on"). */
export const usePlayingUrl = (): string | null => useSyncExternalStore(subscribe, () => (playing ? current : null))
