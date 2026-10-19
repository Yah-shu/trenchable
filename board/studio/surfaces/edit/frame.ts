/**
 * Geometry for Reframe (outpaint): where the original sits on a bigger canvas of the new
 * shape, and which of a model's ratio options is closest to the one wanted.
 *
 * Pure numbers so the preview, the padded upload and the mask can never disagree about
 * where the original picture is.
 */

export type Anchor = 'center' | 'top' | 'bottom' | 'left' | 'right'

/**
 * Where the picture sits in the spare room: 0 = against the left/top edge, 1 = the
 * right/bottom, 0.5 = centred. What dragging the picture in the preview sets.
 */
export interface Offset {
  fx: number
  fy: number
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5)

/** The anchors as offsets, for the chips. */
export const ANCHOR_OFFSET: Record<Anchor, Offset> = {
  center: { fx: 0.5, fy: 0.5 },
  top: { fx: 0.5, fy: 0 },
  bottom: { fx: 0.5, fy: 1 },
  left: { fx: 0, fy: 0.5 },
  right: { fx: 1, fy: 0.5 },
}

/**
 * The offset after dragging the picture by (dx, dy) preview pixels, given the preview's
 * spare room on each axis (preview size minus the picture's size there; negative when the
 * picture overflows a crop, which makes the same drag move it the same way).
 */
export function dragOffset(start: Offset, dx: number, dy: number, roomX: number, roomY: number): Offset {
  return {
    fx: Math.abs(roomX) >= 1 ? clamp01(start.fx + dx / roomX) : start.fx,
    fy: Math.abs(roomY) >= 1 ? clamp01(start.fy + dy / roomY) : start.fy,
  }
}

export interface Placement {
  canvasW: number
  canvasH: number
  /** The original picture's box on that canvas. */
  x: number
  y: number
  w: number
  h: number
}

/** "16:9" → 1.777…; size words Kie uses ("landscape_16_9") read the same way. */
export function parseAspect(a: string | undefined | null): number | null {
  if (!a) return null
  const words: Record<string, string> = {
    square: '1:1',
    square_hd: '1:1',
    portrait_4_3: '3:4',
    portrait_3_2: '2:3',
    portrait_16_9: '9:16',
    landscape_4_3: '4:3',
    landscape_3_2: '3:2',
    landscape_16_9: '16:9',
    landscape_21_9: '21:9',
  }
  const m = /^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)/.exec(words[a] ?? a)
  if (!m) return null
  const w = Number(m[1])
  const h = Number(m[2])
  return w > 0 && h > 0 ? w / h : null
}

/**
 * The canvas for a new shape. At `zoomOut` 1 it just holds the whole original; below 1 it
 * adds room on every side (0.5 = the original takes half the width or height); above 1 it
 * is smaller than the original, which then overflows and is cropped (Expand & Crop). The
 * long side is capped so an upload stays within what models accept.
 */
export function framePlacement(
  srcW: number,
  srcH: number,
  aspect: number,
  opts: { zoomOut?: number; anchor?: Anchor; maxSide?: number; offset?: Offset } = {},
): Placement {
  const zoom = Math.min(4, Math.max(0.25, opts.zoomOut ?? 1))
  const anchor = opts.anchor ?? 'center'
  const maxSide = opts.maxSide ?? 2048
  const src = srcW / srcH
  let cw = src > aspect ? srcW : srcH * aspect
  let ch = src > aspect ? srcW / aspect : srcH
  cw /= zoom
  ch /= zoom
  const scale = Math.min(1, maxSide / Math.max(cw, ch))
  const canvasW = Math.max(1, Math.round(cw * scale))
  const canvasH = Math.max(1, Math.round(ch * scale))
  // Expanding, rounding must never push the picture past the canvas; cropping, it does by design.
  const w = zoom <= 1 ? Math.min(canvasW, Math.round(srcW * scale)) : Math.round(srcW * scale)
  const h = zoom <= 1 ? Math.min(canvasH, Math.round(srcH * scale)) : Math.round(srcH * scale)
  const midX = Math.round((canvasW - w) / 2)
  const midY = Math.round((canvasH - h) / 2)
  const off = opts.offset
  const x = off ? Math.round(clamp01(off.fx) * (canvasW - w)) : anchor === 'left' ? 0 : anchor === 'right' ? canvasW - w : midX
  const y = off ? Math.round(clamp01(off.fy) * (canvasH - h)) : anchor === 'top' ? 0 : anchor === 'bottom' ? canvasH - h : midY
  return { canvasW, canvasH, x, y, w, h }
}

/** The zoom at which the picture just covers the new shape: past it, nothing is left empty. */
export function coverZoom(srcW: number, srcH: number, aspect: number): number {
  const src = srcW / srcH
  const cw = src > aspect ? srcW : srcH * aspect
  const ch = src > aspect ? srcW / aspect : srcH
  return Math.max(cw / srcW, ch / srcH)
}

/**
 * The option closest to a ratio, comparing on a log scale so 2:1 is as far from 1:1 as
 * 1:2 is. `auto` wins when allowed (it means "keep the picture's own shape").
 */
export function nearestAspect(choices: { value: string; label?: string }[], ratio: number, allowAuto = true): string | null {
  if (!choices.length) return null
  if (allowAuto) {
    const auto = choices.find((c) => /^(auto|adaptive)$/i.test(c.value))
    if (auto) return auto.value
  }
  let best: string | null = null
  let gap = Infinity
  for (const c of choices) {
    const r = parseAspect(c.value) ?? parseAspect(c.label)
    if (!r) continue
    const d = Math.abs(Math.log(r) - Math.log(ratio))
    if (d < gap) {
      gap = d
      best = c.value
    }
  }
  return best
}
