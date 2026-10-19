/**
 * Reading a Seedream layer decomposition back into layers you can stack.
 *
 * One job returns several pictures: Kie's `resultUrls` list the base image first, then
 * each separated layer, and `resultObject.layers_data` says where each layer sits — a
 * z_index (0 = base) and a bounding box in the base image (absolute pixels and the same
 * box normalised to 0–1000). Separated layers are cropped to their element and rescaled,
 * so a layer drawn without its box lands in the wrong place; the box is what puts it back.
 */
import { mediaUrl, type MediaAsset } from '../../api.ts'

export interface Box {
  /** Fractions of the base image, 0–1. */
  x: number
  y: number
  w: number
  h: number
}

export interface Layer {
  id: string
  /** Stack position from the model: 0 is the base, higher sits on top. */
  z: number
  /** What to show (our archive copy when there is one). */
  src: string
  name: string
  description?: string
  /** Where it sits on the base; null for the base itself (fills the canvas). */
  box: Box | null
  pixelSize?: { w: number; h: number }
}

interface LayerData {
  z_index?: number
  url?: string
  name?: string
  description?: string
  size?: string
  bounding_box?: { absolute?: number[]; normalized?: number[] }
}

const sizeOf = (s?: string) => {
  const m = /^(\d+)x(\d+)$/.exec(s ?? '')
  return m ? { w: Number(m[1]), h: Number(m[2]) } : undefined
}

function boxOf(d: LayerData, base?: { w: number; h: number }): Box | null {
  const n = d.bounding_box?.normalized
  if (n && n.length === 4 && n.every(Number.isFinite)) {
    const [x0, y0, x1, y1] = n as [number, number, number, number]
    return { x: x0 / 1000, y: y0 / 1000, w: Math.max(0, x1 - x0) / 1000, h: Math.max(0, y1 - y0) / 1000 }
  }
  const a = d.bounding_box?.absolute
  if (a && a.length === 4 && base && a.every(Number.isFinite)) {
    const [x0, y0, x1, y1] = a as [number, number, number, number]
    return { x: x0 / base.w, y: y0 / base.h, w: Math.max(0, x1 - x0) / base.w, h: Math.max(0, y1 - y0) / base.h }
  }
  return null
}

/** The layers in one finished decomposition, bottom first. */
export function layersFrom(media: MediaAsset[] | undefined, raw: unknown): Layer[] {
  const list = (media ?? []).filter((m) => mediaUrl(m))
  const display = (url?: string) => {
    const hit = url ? list.find((m) => m.url === url) : undefined
    return hit ? mediaUrl(hit) : url
  }
  const data = (raw as { resultObject?: { layers_data?: LayerData[] } } | null)?.resultObject?.layers_data
  if (Array.isArray(data) && data.length) {
    const baseSize = sizeOf(data.find((d) => d.z_index === 0)?.size)
    const out: Layer[] = []
    data.forEach((d, i) => {
      const src = display(d.url)
      if (!src) return
      const z = typeof d.z_index === 'number' ? d.z_index : i
      out.push({
        id: `z${z}-${i}`,
        z,
        src,
        name: d.name?.trim() || (z === 0 ? 'Background' : `Layer ${z}`),
        description: d.description,
        box: z === 0 ? null : boxOf(d, baseSize),
        pixelSize: sizeOf(d.size),
      })
    })
    return out.sort((a, b) => a.z - b.z)
  }
  // No layout data: the URL order still holds (base first), boxes unknown.
  return list.map((m, i) => ({ id: `z${i}-${i}`, z: i, src: mediaUrl(m)!, name: i === 0 ? 'Background' : `Layer ${i}`, box: null }))
}

/** Move one id up (towards the top, +1) or down within a bottom-first order. */
export function moveLayer(order: string[], id: string, delta: number): string[] {
  const i = order.indexOf(id)
  if (i < 0) return order
  const j = Math.max(0, Math.min(order.length - 1, i + delta))
  if (i === j) return order
  const next = [...order]
  next.splice(i, 1)
  next.splice(j, 0, id)
  return next
}

/** What to draw, bottom first: the layers in `order`, minus hidden ones. */
export function visibleStack(layers: Layer[], order: string[], hidden: ReadonlySet<string>): Layer[] {
  const byId = new Map(layers.map((l) => [l.id, l]))
  const known = order.filter((id) => byId.has(id))
  // Layers the order has not heard of yet go on top, in their own order.
  for (const l of layers) if (!known.includes(l.id)) known.push(l.id)
  return known.map((id) => byId.get(id)!).filter((l) => !hidden.has(l.id))
}

/**
 * A layer's rectangle in a canvas of the base's size. A layer with no box fills the
 * canvas when it is the base, otherwise it is fitted inside, centred, at its own shape.
 */
export function layerRect(layer: Layer, canvasW: number, canvasH: number, natural?: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  if (layer.box) return { x: layer.box.x * canvasW, y: layer.box.y * canvasH, w: layer.box.w * canvasW, h: layer.box.h * canvasH }
  if (layer.z === 0 || !natural || !natural.w || !natural.h) return { x: 0, y: 0, w: canvasW, h: canvasH }
  const s = Math.min(canvasW / natural.w, canvasH / natural.h)
  const w = natural.w * s
  const h = natural.h * s
  return { x: (canvasW - w) / 2, y: (canvasH - h) / 2, w, h }
}
