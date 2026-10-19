/**
 * Handing a result from one surface to another.
 *
 * the reference app's result actions — Animate, Reuse, Use as reference, Upscale, Lip-sync —
 * open another tool already filled in. Here that is a one-slot mailbox: the action posts
 * what to prefill and moves the hash, and the target surface takes it as it mounts (or,
 * if it is already on screen, as soon as it is posted).
 */
import { useEffect, useRef } from 'react'
import type { MediaAsset, Ref } from './api.ts'

export interface Handoff {
  /** The surface id it is for ('image', 'video', 'edit', …). */
  surface: string
  /** A mode or tab inside that surface ('extend', 'lipsync', 'upscale', …). */
  mode?: string
  prompt?: string
  /** Files to attach as ordinary references. */
  refs?: Ref[]
  /** Files for named slots (a rail's 'first', 'last', 'video', 'audio' tiles). */
  slots?: Record<string, string>
  /** The exact catalogue model to select. */
  modelId?: string
  /** Field values to restore — "Reuse" brings back every setting the job ran with. */
  values?: Record<string, unknown>
  /** The job it came from, for tools that work on a Kie task (extend, upscale by task id). */
  sourceTaskId?: string
  /**
   * The original result behind each slot, by slot id. A slot URL is a Kie upload, which
   * the page can't read pixels from (no CORS); the archived copy (`/${localPath}`) is
   * same-origin, so tools that redraw the picture (Reframe's padding) read this instead.
   */
  sources?: Record<string, MediaAsset>
}

let pending: (Handoff & { at: number }) | null = null
const listeners = new Set<() => void>()

/** Post a handoff and go to its surface. */
export function handOff(h: Handoff) {
  pending = { ...h, at: Date.now() }
  for (const l of listeners) l()
  const target = `#/gen/${h.surface}`
  if (window.location.hash !== target) window.location.hash = target
}

/**
 * Read the handoff for a surface. It is not cleared at once: StrictMode mounts twice in
 * development and both mounts must see it. It goes stale after a few seconds instead, so
 * a later visit never replays an old one.
 */
export function takeHandoff(surface: string): Handoff | null {
  if (!pending || pending.surface !== surface || Date.now() - pending.at > 4_000) return null
  return pending
}

/**
 * Apply handoffs for this surface: the one waiting at mount, and any posted while mounted.
 * `ready` holds one back until the surface can use it — a Reuse names a model, and on a
 * fresh mount the catalogue may not have loaded yet.
 */
export function useHandoff(surface: string, apply: (h: Handoff) => void, ready = true) {
  const latest = useRef(apply)
  latest.current = apply
  const isReady = useRef(ready)
  isReady.current = ready
  const seen = useRef<number>(0)
  const held = useRef<Handoff | null>(null)
  useEffect(() => {
    const check = () => {
      const h = takeHandoff(surface)
      if (!h || !pending || pending.at === seen.current) return
      seen.current = pending.at
      if (isReady.current) latest.current(h)
      else held.current = h
    }
    check()
    listeners.add(check)
    return () => {
      listeners.delete(check)
    }
  }, [surface])
  useEffect(() => {
    if (!ready || !held.current) return
    const h = held.current
    held.current = null
    latest.current(h)
  }, [ready])
}
