/**
 * Masks for the inpaint and outpaint tools.
 *
 * The painter keeps strokes as alpha on a canvas the size of the picture; a model wants a
 * flat black-and-white image instead, and the two mask-taking families disagree on which
 * colour means "change this": Ideogram repaints the black area (Kie's own example mask is
 * black over the part that changes), Qwen 2.1 the white one (its field description says
 * so). Getting that backwards repaints everything except what you painted, so the
 * polarity lives here, next to the pixel code, and is tested.
 */

export type MaskPolarity = 'white-edits' | 'black-edits'

/** Which colour this model reads as "repaint here". */
export const maskPolarity = (modelId: string): MaskPolarity => (/ideogram/i.test(modelId) ? 'black-edits' : 'white-edits')

/** Alpha at or above this counts as painted; soft brush edges below it stay untouched. */
const PAINTED = 128

/**
 * Painted alpha (RGBA, painted where alpha is high) → an opaque black/white mask in the
 * colours this model expects. `invert` flips painted and unpainted first.
 */
export function maskPixels(rgba: Uint8ClampedArray, polarity: MaskPolarity, invert = false): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    const painted = (rgba[i + 3] ?? 0) >= PAINTED
    const edit = invert ? !painted : painted
    const v = (polarity === 'white-edits') === edit ? 255 : 0
    out[i] = v
    out[i + 1] = v
    out[i + 2] = v
    out[i + 3] = 255
  }
  return out
}

/** Flip what is painted, keeping the stroke colour: the painter's Invert button. */
export function invertAlpha(rgba: Uint8ClampedArray, color: [number, number, number]): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(rgba.length)
  for (let i = 0; i < rgba.length; i += 4) {
    out[i] = color[0]
    out[i + 1] = color[1]
    out[i + 2] = color[2]
    out[i + 3] = 255 - (rgba[i + 3] ?? 0)
  }
  return out
}

/** Share of the picture that is painted, 0–1; sampled for speed on big pictures. */
export function paintedShare(rgba: Uint8ClampedArray, step = 1): number {
  let hit = 0
  let seen = 0
  const stride = Math.max(1, Math.floor(step)) * 4
  for (let i = 3; i < rgba.length; i += stride) {
    seen++
    if ((rgba[i] ?? 0) >= PAINTED) hit++
  }
  return seen ? hit / seen : 0
}

/**
 * The mask for an outpaint: everything outside the kept rectangle is to be filled.
 * `overlap` pulls the edit area a few pixels into the original so the seam blends.
 */
export function frameMaskPixels(
  width: number,
  height: number,
  keep: { x: number; y: number; w: number; h: number },
  polarity: MaskPolarity,
  overlap = 0,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(width * height * 4)
  const x0 = keep.x + overlap
  const y0 = keep.y + overlap
  const x1 = keep.x + keep.w - overlap
  const y1 = keep.y + keep.h - overlap
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1
      const edit = !inside
      const v = (polarity === 'white-edits') === edit ? 255 : 0
      const i = (y * width + x) * 4
      out[i] = v
      out[i + 1] = v
      out[i + 2] = v
      out[i + 3] = 255
    }
  }
  return out
}
