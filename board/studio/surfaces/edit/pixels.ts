/**
 * Browser-side picture plumbing shared by Edit and Layers: load a picture, read its
 * pixels, send a canvas up to Kie, save a file.
 *
 * Kie can't reach our disk, so a mask or a padded canvas is uploaded and its URL sent.
 * Reading pixels needs a same-origin or CORS-open copy: our archive (`/media/…`) and
 * Kie's result host are fine, Kie's upload host is not — so a tool keeps the local copy
 * of what you upload and says so plainly when a picture can't be read.
 */
import { mediaUrl, studioApi } from '../../api.ts'
import type { Handoff } from '../../handoff.ts'

export interface SourceImage {
  /** Hosted where Kie can fetch it — what goes into the job. */
  url: string
  /** A copy this page can read pixels from (object URL, archive path), when there is one. */
  local?: string
  width?: number
  height?: number
}

/**
 * The picture a handoff brings: the slot's Kie upload to send, and — when the handoff says
 * which result it came from — that result's archive copy (or its CORS-open result URL) to
 * read pixels from, so Reframe can pad a picture sent from the viewer.
 */
export function imageFromHandoff(h: Handoff | null | undefined): SourceImage | null {
  if (!h) return null
  const url = h.slots?.image ?? h.refs?.find((r) => r.kind === 'image')?.url
  if (!url) return null
  const source = h.sources?.image
  const local = source ? mediaUrl(source) : undefined
  return local && local !== url ? { url, local } : { url }
}

/** Load a picture; with `cors`, ask for a readable copy (fails on hosts that refuse). */
export function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (cors && !src.startsWith('blob:') && !src.startsWith('data:') && !src.startsWith('/')) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('That picture could not be loaded.'))
    img.src = src
  })
}

/** The picture's natural size, from whichever copy loads. */
export async function naturalSize(src: SourceImage): Promise<{ width: number; height: number }> {
  const img = await loadImage(src.local ?? src.url)
  return { width: img.naturalWidth, height: img.naturalHeight }
}

/** A copy of the picture whose pixels this page may read, or null when no host allows it. */
export async function readableImage(src: SourceImage): Promise<HTMLImageElement | null> {
  for (const candidate of [src.local, src.url]) {
    if (!candidate) continue
    try {
      const img = await loadImage(candidate, true)
      // A tainted canvas only shows itself on read; probe one pixel.
      const c = document.createElement('canvas')
      c.width = 1
      c.height = 1
      const ctx = c.getContext('2d')
      ctx?.drawImage(img, 0, 0, 1, 1)
      ctx?.getImageData(0, 0, 1, 1)
      return img
    } catch {
      // try the next copy
    }
  }
  return null
}

export function canvasBlob(canvas: HTMLCanvasElement, type = 'image/png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not export the picture.'))), type, quality)
  })
}

/** RGBA pixels → a PNG Kie can fetch. */
export async function uploadPixels(pixels: Uint8ClampedArray, width: number, height: number, name: string): Promise<string> {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('This browser cannot draw pictures.')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0)
  return uploadCanvas(c, name)
}

/** A canvas → a file Kie can fetch. JPEG keeps a big padded photo under the models' 10MB caps. */
export async function uploadCanvas(canvas: HTMLCanvasElement, name: string, type: 'image/png' | 'image/jpeg' = 'image/png'): Promise<string> {
  const blob = await canvasBlob(canvas, type, type === 'image/jpeg' ? 0.92 : undefined)
  const { fileUrl } = await studioApi.upload(new File([blob], name, { type }))
  return fileUrl
}

/**
 * Save a file to the computer. Cross-origin links ignore `download`, so fetch it into a
 * blob first; if even that is refused, open it in a new tab.
 */
export async function saveFile(src: string, name: string) {
  try {
    const res = await fetch(src)
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    saveBlob(blob, name)
  } catch {
    window.open(src, '_blank', 'noopener')
  }
}

export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
