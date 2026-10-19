/**
 * "Source clip": the past video a task-based tool works on.
 *
 * Veo / Runway / Grok extend and Veo / Grok upscale don't take a file — they take the id
 * of a job Kie ran — so instead of an upload slot the rail shows your own clips that the
 * tool can work on, and the picked one becomes a card with Change, like their preset card.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Film, X } from 'lucide-react'
import { firstMedia, useCatalog, type HistoryItem } from '../../api.ts'
import '../media.css'

const PAGE = 9

const when = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

function Thumb({ item }: { item: HistoryItem }) {
  const src = firstMedia(item)
  if (!src) return <span className="st-src-ph"><Film size={14} /></span>
  return (
    <video
      src={src}
      muted
      playsInline
      preload="metadata"
      onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
      onMouseLeave={(e) => e.currentTarget.pause()}
    />
  )
}

export function SourceClip({
  label,
  items,
  value,
  onPick,
  empty,
  note,
}: {
  label: string
  /** The clips this tool can work on, newest first. */
  items: HistoryItem[]
  value: HistoryItem | null
  onPick: (item: HistoryItem | null) => void
  /** What to say when there is nothing to pick. */
  empty: string
  /** Under the card: what the pick unlocks, or why it can't be used. */
  note?: ReactNode
}) {
  const { models } = useCatalog()
  const [browsing, setBrowsing] = useState(false)
  const [shown, setShown] = useState(PAGE)
  const titleOf = useMemo(() => (i: HistoryItem) => models?.find((m) => m.id === i.modelId)?.title ?? i.modelId ?? i.model, [models])
  const open = browsing || !value

  return (
    <div className="st-src">
      <div className="st-src-head">
        <span className="st-field-label">{label}</span>
        {value && (
          <button type="button" className="st-src-change" onClick={() => setBrowsing((v) => !v)}>
            {browsing ? 'Done' : 'Change'}
          </button>
        )}
      </div>

      {value && (
        <div className="st-src-card">
          <span className="st-src-thumb">
            <Thumb item={value} />
          </span>
          <span className="st-src-body">
            <span className="st-src-title">{titleOf(value)}</span>
            <span className="st-src-sub">{value.prompt ? value.prompt.slice(0, 70) : when(value.createdAt)}</span>
          </span>
          <button type="button" className="st-slot-tool" title="Clear" aria-label="Clear" onClick={() => onPick(null)}>
            <X size={12} />
          </button>
        </div>
      )}
      {note}

      {open &&
        (items.length ? (
          <>
            <div className="st-src-grid">
              {items.slice(0, shown).map((i) => (
                <button
                  key={i.taskId}
                  type="button"
                  className={`st-src-pick ${value?.taskId === i.taskId ? 'is-on' : ''}`}
                  title={`${titleOf(i)} · ${when(i.createdAt)}${i.prompt ? `\n${i.prompt}` : ''}`}
                  onClick={() => {
                    onPick(i)
                    setBrowsing(false)
                  }}
                >
                  <Thumb item={i} />
                  <span className="st-src-tag">{titleOf(i).replace(/\s*[-–—].*$/, '')}</span>
                </button>
              ))}
            </div>
            {items.length > shown && (
              <button type="button" className="st-src-more" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({items.length - shown})
              </button>
            )}
          </>
        ) : (
          <p className="st-hint">{empty}</p>
        ))}
    </div>
  )
}
