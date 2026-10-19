/**
 * Trenchable's skin for an app shown inside Trenchable in a frame (OpenCut, the Edit tool's Manual
 * mode). Runs inside the framed page: it marks the page `html.trenchable-solid` (the scope every
 * rule in the app's CSS uses) and appends one stylesheet, the app's Plinth re-skin from
 * board/workspace/editors.ts, kept last in the head so it follows whatever the app loads later.
 * Nothing is drawn by script and there are no page transitions: a route change is a route change.
 */
export interface SkinOptions {
  /** The app's CSS in Plinth (tokens remapped, the few things tokens can't reach restyled). */
  css: string
  /** Kept for callers; panels are no longer measured or drawn. */
  panels?: string
  /** Kept for callers; nothing fades in after a transition any more. */
  words?: string
  /** Kept for callers; there is one look now. */
  look?: 'solid' | 'pixel'
}

/** Scope class: the app's CSS is written against `html.trenchable-solid`. */
const SCOPE = 'trenchable-solid'

/** True when this page is shown inside Trenchable (board.html). */
export function embeddedInJupiter(): boolean {
  try {
    return window.self !== window.top && /board\.html$/.test(window.parent.location.pathname)
  } catch {
    return false
  }
}

export function runPixelSkin(opts: SkinOptions) {
  const html = document.documentElement
  if (html.classList.contains(SCOPE)) return
  html.classList.add(SCOPE)
  const style = document.createElement('style')
  style.dataset.jupiterSkin = ''
  style.textContent = opts.css
  // Last in the head, so it follows the app's own styles (and again if the app adds more later).
  const place = () => {
    if (style.parentElement !== document.head || style.nextElementSibling) document.head.appendChild(style)
  }
  place()
  new MutationObserver(place).observe(document.head, { childList: true })
}
