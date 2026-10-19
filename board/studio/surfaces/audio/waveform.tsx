/**
 * The waveform on an audio row: the clip decoded once with Web Audio into ~120 bars, cached
 * per URL for the page's life, drawn as SVG, the played part in ink, a click to seek.
 *
 * Decoding needs the bytes, so a file the browser may not read (a provider link without
 * CORS) falls back to a flat bar — still playable and seekable, since <audio> needs no
 * CORS. At most two decode at once, and only the rows a feed page has mounted ask.
 */
import { useEffect, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { PEAKS, peaksOf } from './feed.ts'

export interface Peaks {
  bars: number[]
  /** Seconds, from the decoded buffer. */
  duration: number
}

const cache = new Map<string, Promise<Peaks | null>>()
const RATE = 8000 // plenty for a picture of loudness, and a tenth of the memory of 44.1k
let active = 0
const waiting: (() => void)[] = []
const take = () =>
  new Promise<void>((go) => {
    if (active < 2) {
      active++
      go()
    } else
      waiting.push(() => {
        active++
        go()
      })
  })
const give = () => {
  active--
  waiting.shift()?.()
}

async function decode(url: string): Promise<Peaks | null> {
  await take()
  try {
    const Ctx = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
    if (!Ctx) return null
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = await res.arrayBuffer()
    const audio = await new Ctx(1, 1, RATE).decodeAudioData(buf)
    const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
    return { bars: peaksOf(channels, PEAKS), duration: audio.duration }
  } catch {
    return null
  } finally {
    give()
  }
}

/** The clip's bars, decoded once per URL. Null when it can't be read. */
export function loadPeaks(url: string): Promise<Peaks | null> {
  let hit = cache.get(url)
  if (!hit) {
    hit = decode(url)
    cache.set(url, hit)
  }
  return hit
}

/** `undefined` while decoding, `null` when there is nothing to draw (no file, or no CORS). */
export function usePeaks(url?: string | null, on = true): Peaks | null | undefined {
  const [got, setGot] = useState<{ url: string; peaks: Peaks | null } | null>(null)
  useEffect(() => {
    if (!url || !on) return
    let live = true
    void loadPeaks(url).then((peaks) => live && setGot({ url, peaks }))
    return () => {
      live = false
    }
  }, [url, on])
  if (!url) return null
  return got?.url === url ? got.peaks : undefined
}

const FLAT = Array.from({ length: PEAKS }, () => 0)

/**
 * The bars. `peaks` undefined draws a resting skeleton, null a flat line; `progress` (0–1)
 * inks the played part; `onSeek` makes it a slider (click, or ←/→ by 5%).
 */
export function Waveform({ peaks, progress, onSeek, label = 'Seek', small }: { peaks: Peaks | null | undefined; progress: number; onSeek?: (at: number) => void; label?: string; small?: boolean }) {
  const bars = peaks?.bars ?? FLAT
  const played = Math.round(progress * bars.length)
  const h = small ? 20 : 32
  const click = (e: MouseEvent<HTMLDivElement>) => {
    if (!onSeek) return
    const r = e.currentTarget.getBoundingClientRect()
    if (r.width > 0) onSeek(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)))
  }
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onSeek) return
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault()
      onSeek(Math.min(1, Math.max(0, progress + (e.key === 'ArrowRight' ? 0.05 : -0.05))))
    }
  }
  const cls = ['au-wave', small ? 'is-small' : '', peaks === undefined ? 'is-loading' : '', peaks === null ? 'is-flat' : '', onSeek ? 'is-seekable' : ''].filter(Boolean).join(' ')
  return (
    <div
      className={cls}
      onClick={click}
      onKeyDown={key}
      {...(onSeek ? { role: 'slider', tabIndex: 0, 'aria-label': label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(progress * 100) } : { 'aria-hidden': true })}
    >
      <svg viewBox={`0 0 ${bars.length * 3} ${h}`} preserveAspectRatio="none" aria-hidden>
        {bars.map((p, i) => {
          const bh = Math.max(2, p * (h - 2))
          return <rect key={i} x={i * 3} y={(h - bh) / 2} width={2} height={bh} rx={1} className={i < played ? 'is-played' : undefined} />
        })}
      </svg>
    </div>
  )
}
