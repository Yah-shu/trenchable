/**
 * The largest box of a given shape that fits a container — for the painter, the reframe
 * preview and the layer composite, which must show a picture whole at its own shape
 * while the overlay on top stays pixel-aligned with it.
 */
import { useLayoutEffect, useState, type RefObject } from 'react'

export function useFit(box: RefObject<HTMLElement | null>, ratio: number | null, maxHeight = 640): { w: number; h: number } {
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = box.current
    if (!el || !ratio) return
    const measure = () => {
      const availW = el.clientWidth
      const availH = Math.min(maxHeight, Math.max(240, window.innerHeight - el.getBoundingClientRect().top - 140))
      let w = availW
      let h = w / ratio
      if (h > availH) {
        h = availH
        w = h * ratio
      }
      setSize((s) => (Math.round(s.w) === Math.round(w) && Math.round(s.h) === Math.round(h) ? s : { w, h }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [box, ratio, maxHeight])
  return size
}
