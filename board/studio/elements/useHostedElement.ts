/**
 * A saved element's pictures, pushed up where Kie can fetch them, for surfaces that put
 * an element into a rail's slots (Influencer's sheet and motion). `elementRefs` does the
 * uploading and reuses an upload for a day; this hook just follows the chosen element.
 */
import { useEffect, useState } from 'react'
import { elementRefs, type Element } from '../library.ts'

/**
 * An element's pictures pushed up where Kie can fetch them (cover first), for a rail's
 * slots. Re-runs when the element changes; `urls` is null until they are up.
 */
export function useHostedElement(el: Element | null): { urls: string[] | null; busy: boolean; error: string | null } {
  const [state, setState] = useState<{ key: string; urls: string[] | null; error: string | null }>({ key: '', urls: null, error: null })
  const key = el ? `${el.id}:${el.updatedAt}:${el.cover}` : ''
  useEffect(() => {
    if (!el) return
    let live = true
    setState({ key, urls: null, error: null })
    elementRefs(el).then(
      (refs) => live && setState({ key, urls: refs.map((r) => r.url), error: null }),
      (e: unknown) => live && setState({ key, urls: null, error: (e as Error).message }),
    )
    return () => {
      live = false
    }
    // The key says everything about the element that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!el) return { urls: null, busy: false, error: null }
  const current = state.key === key
  return { urls: current ? state.urls : null, busy: !current || (!state.urls && !state.error), error: current ? state.error : null }
}
