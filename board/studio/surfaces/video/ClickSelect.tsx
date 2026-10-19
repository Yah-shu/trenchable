/**
 * The clip slot and the click-to-select step the local tools share (Remove Background, Genjutsu's
 * Guided swap).
 *
 * `ClipPick`: upload a clip (it goes to Kie's file host through uploadMedia, like every pick) or take one
 * of your Video results (its archived `/media/...` copy, so nothing is uploaded again).
 *
 * `ClickSelect`: frame 0 of the clip (the server's frame.py), large, in the canvas. Click on the subject
 * to add a point, Shift-click to mark something to leave out, drag to draw a box around it; Undo and
 * Clear. Points are sent normalised 0–1, so the frame's display size doesn't matter.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { Loader2, MousePointerClick, Undo2, Upload, Video, X } from 'lucide-react'
import { isDone, mediaUrl, useHistory, type HistoryItem } from '../../api.ts'
import { uploadMedia } from '../../library.ts'
import { SourceClip } from './SourceClip.tsx'
import { Hint } from './ModeBar.tsx'
import { boxOf, localApi, toUnit, type Box, type FrameInfo, type Point } from './localtools.ts'
import './localtools.css'

/* ---------- the clip ---------- */

export interface Clip {
  /** What the server fetches: an https upload, or a `/media/...` archived result. */
  url: string
  name?: string
  /** A history row it came from (shown as the picked card). */
  item?: HistoryItem
}

const videoOf = (i: HistoryItem) => i.media?.find((m) => m.kind === 'video')

/** A finished video's best URL for the server: the archived copy when there is one. */
export function clipOfItem(item: HistoryItem): Clip | null {
  const m = videoOf(item)
  const url = m ? mediaUrl(m) : undefined
  return url ? { url, name: m?.title ?? item.prompt?.slice(0, 40), item } : null
}

export function ClipPick({ value, onChange, label = 'Clip', sub = 'MP4 or MOV' }: { value: Clip | null; onChange: (c: Clip | null) => void; label?: string; sub?: string }) {
  const { items } = useHistory('video')
  const clips = useMemo(() => (items ?? []).filter((i) => i.category === 'video' && isDone(i) && videoOf(i)), [items])
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const upload = async (file: File) => {
    setBusy(true)
    setError(null)
    try {
      const up = await uploadMedia(file)
      onChange({ url: up.fileUrl, name: file.name })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="lt-clip">
      <input ref={input} type="file" accept="video/mp4,video/quicktime,video/webm,video/*" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
      {value && !value.item ? (
        <div className="st-src-card">
          <span className="st-src-thumb">
            <video src={value.url} muted playsInline preload="metadata" />
          </span>
          <span className="st-src-body">
            <span className="st-src-title">{value.name ?? 'Your clip'}</span>
            <span className="st-src-sub">Uploaded</span>
          </span>
          <button type="button" className="st-slot-tool" title="Clear" aria-label="Clear" onClick={() => onChange(null)}>
            <X size={12} />
          </button>
        </div>
      ) : (
        <button type="button" className="st-slot is-wide lt-upload" onClick={() => input.current?.click()} disabled={busy}>
          <span className="st-slot-icon">{busy ? <Loader2 size={16} className="lt-spin" /> : <Upload size={16} />}</span>
          <span className="st-slot-title">{busy ? 'Uploading…' : `Upload a ${label.toLowerCase()}`}</span>
          <span className="st-slot-sub">{sub}</span>
        </button>
      )}
      {error && <Hint warn>{error}</Hint>}
      <SourceClip
        label={value?.item ? label : 'Or one of your clips'}
        items={clips}
        value={value?.item ?? null}
        onPick={(i) => onChange(i ? clipOfItem(i) : null)}
        empty="Your finished videos show here."
      />
    </div>
  )
}

/** How long the clip runs, read off its file (metadata only); null until known. */
export function useClipSeconds(url: string | undefined): number | null {
  const [read, setRead] = useState<{ url: string; s: number | null } | null>(null)
  useEffect(() => {
    if (!url) return
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    let live = true
    v.onloadedmetadata = () => live && setRead({ url, s: Number.isFinite(v.duration) ? v.duration : null })
    v.onerror = () => live && setRead({ url, s: null })
    v.src = url
    return () => {
      live = false
      v.removeAttribute('src')
      v.load()
    }
  }, [url])
  return url && read?.url === url ? read.s : null
}

/* ---------- click to select ---------- */

export interface Selection {
  points: Point[]
  box: Box | null
}

export const EMPTY_SELECTION: Selection = { points: [], box: null }
export const hasSubject = (s: Selection) => s.points.some((p) => p.label === 1) || Boolean(s.box)

/** Frame 0 of a clip from the server, once per URL. */
export function useFrame(url: string | undefined): { frame: FrameInfo | null; error: string | null } {
  const [state, setState] = useState<{ url: string; frame: FrameInfo | null; error: string | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let live = true
    localApi
      .frame(url)
      .then((frame) => live && setState({ url, frame, error: null }))
      .catch((e: unknown) => live && setState({ url, frame: null, error: (e as Error).message }))
    return () => {
      live = false
    }
  }, [url])
  return url && state?.url === url ? state : { frame: null, error: null }
}

export function ClickSelect({ clipUrl, value, onChange, title = 'Click on the subject', aside }: { clipUrl: string; value: Selection; onChange: (s: Selection) => void; title?: string; aside?: ReactNode }) {
  const { frame, error } = useFrame(clipUrl)
  const box = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; to: { x: number; y: number }; exclude: boolean } | null>(null)

  const at = (e: { clientX: number; clientY: number }) => toUnit(e.clientX, e.clientY, box.current!.getBoundingClientRect())
  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = at(e)
    setDrag({ from: p, to: p, exclude: e.shiftKey })
  }
  const onMove = (e: PointerEvent) => drag && setDrag({ ...drag, to: at(e) })
  const onUp = (e: PointerEvent) => {
    if (!drag) return
    const to = at(e)
    const b = boxOf(drag.from, to)
    if (b) onChange({ ...value, box: b })
    else onChange({ ...value, points: [...value.points, { x: drag.from.x, y: drag.from.y, label: drag.exclude || e.shiftKey ? 0 : 1 }] })
    setDrag(null)
  }
  const undo = () => (value.points.length ? onChange({ ...value, points: value.points.slice(0, -1) }) : onChange({ ...value, box: null }))
  const live = drag ? boxOf(drag.from, drag.to) : null
  const shown = live ?? value.box
  const pct = (n: number) => `${n * 100}%`

  return (
    <div className="lt-select">
      <div className="lt-select-head">
        <span className="lt-select-title">
          <MousePointerClick size={14} /> {title}
        </span>
        <span className="lt-select-tools">
          <button type="button" className="vw-btn is-sm" onClick={undo} disabled={!value.points.length && !value.box}>
            <Undo2 size={12} /> Undo
          </button>
          <button type="button" className="vw-btn is-sm" onClick={() => onChange(EMPTY_SELECTION)} disabled={!value.points.length && !value.box}>
            Clear
          </button>
        </span>
      </div>
      <p className="st-hint">Click to add a point on it · Shift-click to leave something out · drag to draw a box around it.</p>
      <div className="lt-select-body">
        <div className="lt-frame">
          {error ? (
            <div className="lt-frame-msg is-warn">{error}</div>
          ) : !frame ? (
            <div className="lt-frame-msg">
              <Loader2 size={16} className="lt-spin" /> Reading frame 0…
            </div>
          ) : (
            <div ref={box} className="lt-frame-box" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} style={{ aspectRatio: frame.size[0] && frame.size[1] ? `${frame.size[0]} / ${frame.size[1]}` : undefined }}>
              <img src={frame.image} alt="Frame 0 of the clip" draggable={false} />
              {shown && <span className={`lt-box ${live ? 'is-live' : ''}`} style={{ left: pct(shown[0]), top: pct(shown[1]), width: pct(shown[2] - shown[0]), height: pct(shown[3] - shown[1]) }} />}
              {value.points.map((p, i) => (
                <span key={i} className={`lt-dot ${p.label ? 'is-in' : 'is-out'}`} style={{ left: pct(p.x), top: pct(p.y) }} title={p.label ? 'Subject' : 'Left out'} />
              ))}
            </div>
          )}
          {frame && (
            <span className="lt-frame-meta">
              <Video size={11} /> {frame.size[0]}×{frame.size[1]} · {frame.duration.toFixed(1)} s · {Math.round(frame.fps)} fps · {value.points.filter((p) => p.label).length} in, {value.points.filter((p) => !p.label).length} out{value.box ? ', a box' : ''}
            </span>
          )}
        </div>
        {aside}
      </div>
    </div>
  )
}
