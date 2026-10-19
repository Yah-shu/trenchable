/**
 * An effect's face: your own newest result made with it — a clip plays muted while the
 * pointer is over it, as the reference app's previews do — or, until you have one, a sample animation of
 * the effect drawn in code (EffectDemo.tsx) under its name, and a line saying your first run becomes
 * its cover. No stock previews, no media files and no spend to make them.
 */
import { useRef } from 'react'
import type { Cover } from '../../presets.ts'
import { EffectDemo } from './EffectDemo.tsx'

/** Placeholder shapes, picked by id so the masonry has rhythm and a card never jumps. */
const SHAPES = ['4 / 5', '1 / 1', '3 / 4', '5 / 6', '4 / 5']
const shapeOf = (id: string) => SHAPES[[...id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 7) % SHAPES.length]

export function EffectCover({
  id,
  title,
  kicker,
  note,
  cover,
  play = 'hover',
  compact,
}: {
  id: string
  title: string
  kicker?: string
  note?: string
  cover: Cover | null
  /** `hover` plays a clip under the pointer; `always` loops it (the rail's card). */
  play?: 'hover' | 'always'
  /** The rail's card: a fixed short frame instead of the masonry's shape. */
  compact?: boolean
}) {
  const vid = useRef<HTMLVideoElement>(null)
  if (cover) {
    return (
      <span
        className={`ef-cover ${compact ? 'is-compact' : ''}`}
        onMouseEnter={() => {
          if (play === 'hover') void vid.current?.play().catch(() => {})
        }}
        onMouseLeave={() => {
          if (play !== 'hover' || !vid.current) return
          vid.current.pause()
          vid.current.currentTime = 0
        }}
      >
        {cover.video ? (
          <video ref={vid} src={cover.src} muted loop playsInline preload="metadata" autoPlay={play === 'always'} />
        ) : (
          <img src={cover.src} alt="" loading="lazy" />
        )}
        <span className="ef-cover-name">{title}</span>
      </span>
    )
  }
  return (
    <span className={`ef-cover is-empty has-demo ${compact ? 'is-compact' : ''}`} style={compact ? undefined : { aspectRatio: shapeOf(id) }}>
      <EffectDemo id={id} />
      {kicker && <span className="ef-cover-kicker">{kicker}</span>}
      <span className="ef-cover-title">{title}</span>
      {note && !compact && <span className="ef-cover-note">{note}</span>}
      {!compact && <span className="ef-cover-hint">Sample · your first run replaces it</span>}
    </span>
  )
}
