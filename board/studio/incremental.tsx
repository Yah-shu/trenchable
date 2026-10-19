/**
 * Feeds that render as you scroll.
 *
 * History holds hundreds of full-size results; putting all of them in the DOM at once
 * (390 images and ~2,000 buttons on the Image feed) is what made the tab sluggish — and
 * the reference app's own picker froze on a large library. A feed shows the first `step`, then
 * another `step` each time the sentinel at its end scrolls into view.
 */
import { useEffect, useRef, useState } from 'react'

export function useIncremental<T>(list: T[], step = 60): { shown: T[]; more: boolean; grow: () => void } {
  const [limit, setLimit] = useState(step)
  return { shown: list.slice(0, limit), more: list.length > limit, grow: () => setLimit((n) => n + step) }
}

/**
 * Put at the end of a feed: grows it when it comes within a screen of view. `count` is
 * how many are shown; observing again on each change catches a sentinel that is still
 * in view after a page was added (an observer only reports changes).
 */
export function Sentinel({ onSeen, count }: { onSeen: () => void; count: number }) {
  const el = useRef<HTMLDivElement>(null)
  const latest = useRef(onSeen)
  latest.current = onSeen
  useEffect(() => {
    const node = el.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && latest.current(), { rootMargin: '800px 0px' })
    io.observe(node)
    return () => io.disconnect()
  }, [count])
  return <div ref={el} className="st-sentinel" aria-hidden />
}
