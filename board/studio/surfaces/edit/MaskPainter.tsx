/**
 * Inpaint's brush: paint over the part of the picture to change.
 *
 * The strokes live on a canvas exactly the picture's natural size (the mask models reject
 * a mask that doesn't match the image), shown scaled over the picture. Strokes are kept
 * as a list rather than pixel snapshots, so Undo costs nothing on a 4K picture: it just
 * replays the list. The picture itself is never drawn onto that canvas, so exporting the
 * mask works even when the picture's host forbids reading its pixels.
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import { Brush, Eraser, FlipHorizontal2, RotateCcw, Trash2 } from 'lucide-react'
import { invertAlpha, maskPixels, paintedShare, type MaskPolarity } from './mask.ts'
import { canvasBlob, type SourceImage } from './pixels.ts'
import { useFit } from './useFit.ts'

type Op = { kind: 'paint' | 'erase'; size: number; points: [number, number][] } | { kind: 'invert' } | { kind: 'clear' }

export interface PainterHandle {
  /** The mask as a PNG the picture's size, in the colours this model reads. */
  exportMask: (polarity: MaskPolarity) => Promise<Blob>
  /** Share of the picture painted, 0–1. */
  share: () => number
}

const STROKE: [number, number, number] = [253, 155, 155]
const STROKE_CSS = `rgb(${STROKE.join(',')})`

function drawStroke(ctx: CanvasRenderingContext2D, op: Extract<Op, { points: unknown }>, from = 0) {
  ctx.save()
  ctx.globalCompositeOperation = op.kind === 'erase' ? 'destination-out' : 'source-over'
  ctx.strokeStyle = STROKE_CSS
  ctx.fillStyle = STROKE_CSS
  ctx.lineWidth = op.size
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const pts = op.points
  if (pts.length === 1 || from >= pts.length - 1) {
    const [x, y] = pts[pts.length - 1]!
    ctx.beginPath()
    ctx.arc(x, y, op.size / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    ctx.beginPath()
    ctx.moveTo(pts[from]![0], pts[from]![1])
    for (let i = from + 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1])
    ctx.stroke()
  }
  ctx.restore()
}

function replay(canvas: HTMLCanvasElement, ops: Op[]) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  for (const op of ops) {
    if (op.kind === 'clear') ctx.clearRect(0, 0, canvas.width, canvas.height)
    else if (op.kind === 'invert') {
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
      ctx.putImageData(new ImageData(invertAlpha(data.data, STROKE), canvas.width, canvas.height), 0, 0)
    } else drawStroke(ctx, op)
  }
}

export function MaskPainter({
  image,
  handle,
  onShare,
}: {
  image: SourceImage & { width: number; height: number }
  handle: MutableRefObject<PainterHandle | null>
  onShare?: (share: number) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const ops = useRef<Op[]>([])
  const live = useRef<Extract<Op, { points: unknown }> | null>(null)
  const [tool, setTool] = useState<'paint' | 'erase'>('paint')
  const [size, setSize] = useState(40)
  const [count, setCount] = useState(0)
  const [share, setShare] = useState(0)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)
  const fit = useFit(box, image.width / image.height)
  const report = useRef(onShare)
  report.current = onShare
  const scale = fit.w ? image.width / fit.w : 1

  // Measured on a small copy: reading every pixel of a 4K mask after each stroke is slow.
  const measure = useCallback(() => {
    const c = canvas.current
    if (!c) return 0
    const k = Math.min(1, 256 / Math.max(c.width, c.height))
    const probe = document.createElement('canvas')
    probe.width = Math.max(1, Math.round(c.width * k))
    probe.height = Math.max(1, Math.round(c.height * k))
    const ctx = probe.getContext('2d', { willReadFrequently: true })
    if (!ctx) return 0
    ctx.drawImage(c, 0, 0, probe.width, probe.height)
    const s = paintedShare(ctx.getImageData(0, 0, probe.width, probe.height).data)
    setShare(s)
    report.current?.(s)
    return s
  }, [])

  const commit = (op: Op) => {
    ops.current = [...ops.current, op]
    setCount(ops.current.length)
    if (op.kind !== 'paint' && op.kind !== 'erase' && canvas.current) replay(canvas.current, ops.current)
    measure()
  }

  const undo = useCallback(() => {
    if (!ops.current.length || !canvas.current) return
    ops.current = ops.current.slice(0, -1)
    setCount(ops.current.length)
    replay(canvas.current, ops.current)
    measure()
  }, [measure])

  // A new picture starts a new mask.
  useEffect(() => {
    ops.current = []
    setCount(0)
    if (canvas.current) replay(canvas.current, [])
    setShare(0)
    report.current?.(0)
  }, [image.url, image.width, image.height])

  useEffect(() => {
    handle.current = {
      share: () => share,
      exportMask: async (polarity) => {
        const c = canvas.current
        const ctx = c?.getContext('2d', { willReadFrequently: true })
        if (!c || !ctx) throw new Error('The mask is not ready yet.')
        const out = document.createElement('canvas')
        out.width = c.width
        out.height = c.height
        const octx = out.getContext('2d')
        if (!octx) throw new Error('This browser cannot draw pictures.')
        octx.putImageData(new ImageData(maskPixels(ctx.getImageData(0, 0, c.width, c.height).data, polarity), c.width, c.height), 0, 0)
        return canvasBlob(out)
      },
    }
    return () => {
      handle.current = null
    }
  }, [handle, share])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo])

  const at = (e: ReactPointerEvent): [number, number] => {
    const r = canvas.current!.getBoundingClientRect()
    return [((e.clientX - r.left) * image.width) / r.width, ((e.clientY - r.top) * image.height) / r.height]
  }

  return (
    <div className="ed-painter">
      <div className="ed-toolbar">
        <div className="st-chips">
          <button type="button" className={`st-chip ${tool === 'paint' ? 'is-active' : ''}`} onClick={() => setTool('paint')}>
            <Brush size={12} />
            Brush
          </button>
          <button type="button" className={`st-chip ${tool === 'erase' ? 'is-active' : ''}`} onClick={() => setTool('erase')}>
            <Eraser size={12} />
            Eraser
          </button>
        </div>
        <label className="ed-range">
          <span>Size</span>
          <input type="range" min={6} max={200} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          <span className="ed-range-v">{size}</span>
        </label>
        <span className="ed-toolbar-gap" />
        <button type="button" className="pl-iconbtn ed-iconbtn" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!count} onClick={undo}>
          <RotateCcw size={15} />
        </button>
        <button type="button" className="pl-iconbtn ed-iconbtn" title="Invert: paint everything you didn't" aria-label="Invert" onClick={() => commit({ kind: 'invert' })}>
          <FlipHorizontal2 size={15} />
        </button>
        <button type="button" className="pl-iconbtn ed-iconbtn" title="Clear the mask" aria-label="Clear" disabled={!share} onClick={() => commit({ kind: 'clear' })}>
          <Trash2 size={15} />
        </button>
        <span className="pl-badge pl-badge--quiet">{Math.round(share * 100)}% marked</span>
      </div>
      <div ref={box} className="ed-stage">
        <div className="ed-stage-frame" style={{ width: fit.w, height: fit.h }}>
          <img src={image.local ?? image.url} alt="" draggable={false} />
          <canvas
            ref={canvas}
            width={image.width}
            height={image.height}
            className="ed-mask-canvas"
            onPointerDown={(e) => {
              if (e.button !== 0) return
              e.currentTarget.setPointerCapture(e.pointerId)
              const op = { kind: tool, size: size * scale, points: [at(e)] }
              live.current = op
              const ctx = canvas.current?.getContext('2d', { willReadFrequently: true })
              if (ctx) drawStroke(ctx, op)
            }}
            onPointerMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect()
              setCursor({ x: e.clientX - r.left, y: e.clientY - r.top })
              const op = live.current
              if (!op) return
              op.points.push(at(e))
              const ctx = canvas.current?.getContext('2d', { willReadFrequently: true })
              if (ctx) drawStroke(ctx, op, op.points.length - 2)
            }}
            onPointerUp={() => {
              const op = live.current
              live.current = null
              if (op) commit(op)
            }}
            onPointerCancel={() => {
              const op = live.current
              live.current = null
              if (op) commit(op)
            }}
            onPointerLeave={() => setCursor(null)}
          />
          {cursor && <span className="ed-cursor" style={{ left: cursor.x, top: cursor.y, width: size, height: size }} />}
        </div>
      </div>
      <p className="ed-hint">Paint over what should change. Everything you leave unpainted stays as it is.</p>
    </div>
  )
}
