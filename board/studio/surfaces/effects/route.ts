/**
 * Effects' three levels, each its own address, so back/forward and a reload keep your place:
 *
 *   #/gen/effects             the home: hero, name cloud, the masonry of effects
 *   #/gen/effects/<id>        an effect's page: what it does, Generate, every result made with it
 *   #/gen/effects/<id>/use    its form: the rail that runs it, with its own History
 *
 * the reference app's own spellings (`/effects/examples/<slug>`, `/effects/use/<slug>`) are read too,
 * and anything unknown (an effect renamed or removed) lands on the home. The shell hands Studio
 * only `studio/effects` (main.tsx), so the levels are read straight off the hash here.
 */
import { useSyncExternalStore } from 'react'

export type EffectView = { level: 'home' } | { level: 'page'; id: string } | { level: 'use'; id: string }

export const EFFECTS_HASH = '#/gen/effects'

const HOME: EffectView = { level: 'home' }

/** Where a hash points inside Effects. `known` says which ids exist; an unknown one is the home. */
export function effectView(hash: string, known: (id: string) => boolean): EffectView {
  const parts = hash
    .split('?')[0]
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((p) => {
      try {
        return decodeURIComponent(p)
      } catch {
        return p
      }
    })
  // `gen/effects/…`, and the pre-v2 `studio/effects/…` while it redirects.
  if (!(parts[0] === 'gen' || parts[0] === 'studio') || parts[1] !== 'effects') return HOME
  const rest = parts.slice(2)
  if ((rest[0] === 'use' || rest[0] === 'examples') && rest[1]) {
    return known(rest[1]) ? { level: rest[0] === 'use' ? 'use' : 'page', id: rest[1] } : HOME
  }
  const [id, sub] = rest
  if (!id || !known(id)) return HOME
  return sub === 'use' ? { level: 'use', id } : { level: 'page', id }
}

/** The address of a view. */
export function effectHref(view: EffectView): string {
  if (view.level === 'home') return EFFECTS_HASH
  const at = `${EFFECTS_HASH}/${encodeURIComponent(view.id)}`
  return view.level === 'use' ? `${at}/use` : at
}

/** Go to a view: a real hash change, so it is one step in the browser's history. */
export function goEffect(view: EffectView) {
  const to = effectHref(view)
  if (window.location.hash !== to) window.location.hash = to
}

const subscribe = (l: () => void) => {
  window.addEventListener('hashchange', l)
  return () => window.removeEventListener('hashchange', l)
}
const readHash = () => window.location.hash

/** The current view, live with the hash. */
export function useEffectView(known: (id: string) => boolean): EffectView {
  const hash = useSyncExternalStore(subscribe, readHash, () => '')
  return effectView(hash, known)
}
