import { useRef, useState } from 'react'
import type { SkinOptions } from '../pixel/skin.ts'

/**
 * An app shown in a frame that fills the content area: the Kie form (Advanced). Kie carries its own
 * Plinth theme (theme/plinth-kie.css); any other app gets `skin` added to its page on every
 * load (which of its elements are panels, and its CSS).
 */
export function AppFrame({
  src,
  title,
  active,
  skin,
  storage,
  className = '',
}: {
  src: string
  title: string
  active: boolean
  skin?: SkinOptions
  storage?: Record<string, string>
  className?: string
  /** Kept for callers; page transitions are retired. */
  transitions?: boolean
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  // Its settings, before it first loads (same origin, so the same browser storage).
  useState(() => {
    try {
      for (const [k, v] of Object.entries(storage ?? {})) if (localStorage.getItem(k) === null) localStorage.setItem(k, v)
    } catch {
      // storage unavailable
    }
    return null
  })

  const onLoad = () => {
    if (!skin) return
    try {
      const win = frame.current?.contentWindow as (Window & { __jupiterSkin?: SkinOptions; __jupiterPixels?: unknown }) | null
      const doc = win?.document
      if (!win || !doc || win.__jupiterPixels) return
      win.__jupiterSkin = skin
      const script = doc.createElement('script')
      script.type = 'module'
      script.src = '/board/pixel/app-skin.ts'
      doc.head.appendChild(script)
    } catch {
      // cross-origin: leave it alone
    }
  }

  return (
    <div className={`ws-generate ${className}`} style={{ display: active ? 'block' : 'none' }}>
      <iframe ref={frame} className="ws-frame" src={src} title={title} onLoad={onLoad} />
    </div>
  )
}
