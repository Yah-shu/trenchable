/**
 * A feed in the reference app's justified rows (justified.ts): the Image feed, and the rail
 * surfaces' Grid view.
 *
 * It watches its own width (ResizeObserver) and turns the View menu's card size into a
 * target row height (feed.ts `rowHeight`). Tiles sit in absolute boxes, so a reflow — a new
 * job taking the head of row 1, the card size slider, the window — moves them without
 * remounting (no reloaded images, no lost hover or menu). A row whose aspect isn't known
 * yet lays out square, and the layout runs again (once a frame at most) when the file
 * says what it is.
 *
 * Running jobs come first, then the time-ordered rest, which pages as you scroll
 * (incremental.tsx).
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { HistoryItem } from './api.ts'
import { rowHeight } from './feed.ts'
import { Sentinel, useIncremental } from './incremental.tsx'
import { entryKey, itemAspect, jobAspect, placeRows, rememberAspect, rowsFor, type FeedEntry } from './justified.ts'
import { FailedTile, JobTile, ResultTile } from './tiles.tsx'

const GAP = 2

export interface JustifiedFeedProps {
  /** Running jobs, newest first: always shown, at the head. */
  pending: FeedEntry[]
  /** Results, failures and failed jobs, newest first: paged. */
  timeline: FeedEntry[]
  /** The View menu's card size. */
  size: number
  onOpen: (item: HistoryItem) => void
  /** Buttons a surface hangs under each result, and the room they need. */
  tileActions?: (item: HistoryItem) => ReactNode
  actionsHeight?: number
}

export function JustifiedFeed({ pending, timeline, size, onOpen, tileActions, actionsHeight = 40 }: JustifiedFeedProps) {
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [, setMeasured] = useState(0)
  const page = useIncremental(timeline)
  const entries = [...pending, ...page.shown]

  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const read = () => setWidth(Math.floor(el.clientWidth))
    read()
    if (typeof ResizeObserver === 'undefined') return
    // A frame later: re-laying out inside the callback would resize the box it watches
    // ("ResizeObserver loop" warnings). Its height changing again reads the same width.
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(read)
    })
    ro.observe(el)
    return () => {
      ro.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  // Rows that don't know their shape measure the file once it loads; one re-layout a frame.
  // Listening from mount, before any tile exists, so no load is missed.
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    let raf = 0
    const take = (media: Element | null) => {
      const cell = media?.closest<HTMLElement>('[data-jf-measure]')
      const id = cell?.dataset.jfMeasure
      if (!id) return
      const w = media instanceof HTMLImageElement ? media.naturalWidth : media instanceof HTMLVideoElement ? media.videoWidth : 0
      const h = media instanceof HTMLImageElement ? media.naturalHeight : media instanceof HTMLVideoElement ? media.videoHeight : 0
      if (rememberAspect(id, w, h) && !raf) {
        raf = requestAnimationFrame(() => {
          raf = 0
          setMeasured((n) => n + 1)
        })
      }
    }
    const on = (e: Event) => take(e.target as Element)
    el.addEventListener('load', on, true)
    el.addEventListener('loadedmetadata', on, true)
    return () => {
      el.removeEventListener('load', on, true)
      el.removeEventListener('loadedmetadata', on, true)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  // Cheap enough to redo every render (a few hundred numbers); `setMeasured` re-renders when a file reports its size.
  const aspects = entries.map((e) => {
    const a = e.kind === 'job' ? jobAspect(e.job) : itemAspect(e.item)
    return { a: a ?? 1, known: a !== null }
  })
  const extra = tileActions ? actionsHeight : 0
  const layout = placeRows(
    rowsFor(
      aspects.map((x) => x.a),
      width,
      rowHeight(size, width),
      GAP,
    ),
    GAP,
    extra,
  )

  return (
    <>
      <div ref={box} className="st-jfeed" style={{ height: layout.height }}>
        {layout.boxes.map((b) => {
          const e = entries[b.index]
          const unknown = e.kind !== 'job' && !aspects[b.index].known
          return (
            <div
              key={entryKey(e)}
              className="st-jf-cell"
              data-jf-measure={unknown ? e.item.taskId : undefined}
              style={{ left: b.x, top: b.y, width: b.width, height: b.height + extra }}
            >
              {e.kind === 'job' ? (
                <JobTile job={e.job} />
              ) : e.kind === 'failed' ? (
                <FailedTile item={e.item} />
              ) : tileActions ? (
                <div className="st-tile-with-actions">
                  <div style={{ height: b.height }}>
                    <ResultTile item={e.item} onOpen={onOpen} fill />
                  </div>
                  <div className="st-tile-actions">{tileActions(e.item)}</div>
                </div>
              ) : (
                <ResultTile item={e.item} onOpen={onOpen} fill />
              )}
            </div>
          )
        })}
      </div>
      {page.more && <Sentinel count={page.shown.length} onSeen={page.grow} />}
    </>
  )
}
