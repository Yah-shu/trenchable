/**
 * GenShitSu's right pane, as theirs: History · Motion Library · Styles · How it works.
 *
 * History is GenShitSu's own feed (mine.ts: its clips only; Video's History leaves them out) —
 * RailStudio's own `RailCanvas`, kept mounted so its paging
 * and filters survive a visit to another tab. Its History / How it works bar is swapped
 * for these four tabs by putting them into that bar (a portal), so Filter and View stay
 * where they are. The other tabs are this file's:
 *   Motion Library — "From your videos" (every finished clip, newest first, paged) and
 *                    "Saved motions" (saved.ts); Use fills the reference-video slot.
 *   Styles         — the twelve looks (styles.ts) and Custom, your own style image.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, BookmarkCheck, Clapperboard, ImagePlus, Loader2, Palette } from 'lucide-react'
import { mediaUrl, useHistory, type HistoryItem } from '../../../api.ts'
import { handOff } from '../../../handoff.ts'
import { hostForKie } from '../../../mentions.ts'
import { Chips, Empty, TabBar, type TabDef } from '../../../parts.tsx'
import { indexHistory, presetCover } from '../../../presets.ts'
import { RailCanvas } from '../../../RailStudio.tsx'
import { Sentinel, useIncremental } from '../../../incremental.tsx'
import { useAllTracked } from '../../track.ts'
import { motionClips, savedClips, videoOf } from './genjutsu.ts'
import { useGenjutsuFilters } from './mine.ts'
import { toggleMotion, useSavedMotions } from './saved.ts'
import { CUSTOM, STYLES, styleTag } from './styles.ts'
import './genjutsu.css'

export type CanvasTab = 'history' | 'motion' | 'styles' | 'how'

const TABS: TabDef<CanvasTab>[] = [
  { id: 'history', label: 'History' },
  { id: 'motion', label: 'Motion Library' },
  { id: 'styles', label: 'Styles', badge: 'New' },
  { id: 'how', label: 'How it works' },
]

export interface GenjutsuCanvasProps {
  tab: CanvasTab
  onTab: (t: CanvasTab) => void
  style: string | null
  onStyle: (id: string) => void
  explain: ReactNode
}

export function GenjutsuCanvas({ tab, onTab, style, onStyle, explain }: GenjutsuCanvasProps) {
  const tabs = <TabBar tabs={TABS} value={tab} onPick={onTab} />
  const { mine } = useGenjutsuFilters()
  // RailCanvas's bar, once it is on screen, to put the four tabs into.
  const feed = useRef<HTMLDivElement>(null)
  const [bar, setBar] = useState<Element | null>(null)
  useLayoutEffect(() => {
    setBar(feed.current?.querySelector('.st-canvas-bar') ?? null)
  }, [])

  return (
    <div className="gj-canvas">
      <div ref={feed} className="gj-feed" hidden={tab !== 'history'}>
        <RailCanvas
          surface="genjutsu"
          category="video"
          historyFilter={mine}
          emptyTitle="No GenShitSu clips yet"
          emptySub="Add a reference video and your characters, products or clothes, then generate. Every clip you make in GenShitSu lands here; Video keeps its own."
          tileActions={saveAction}
        />
        {bar && createPortal(<div className="gj-bar-tabs">{tabs}</div>, bar)}
      </div>
      {tab !== 'history' && (
        <section className="st-canvas">
          <div className="st-canvas-bar">{tabs}</div>
          <div className="st-canvas-body">{tab === 'motion' ? <MotionLibrary /> : tab === 'styles' ? <StyleLibrary style={style} onStyle={onStyle} /> : explain}</div>
        </section>
      )}
    </div>
  )
}

/* ---------- Save as motion ---------- */

function SaveMotion({ item }: { item: HistoryItem }) {
  const saved = useSavedMotions().includes(item.taskId)
  return (
    <button type="button" className={`vw-btn is-sm gj-save ${saved ? 'is-on' : ''}`} aria-pressed={saved} title={saved ? 'Remove from Saved motions' : 'Keep this clip in the Motion Library'} onClick={() => toggleMotion(item.taskId)}>
      {saved ? <BookmarkCheck size={12} /> : <Bookmark size={12} />} {saved ? 'Saved motion' : 'Save as motion'}
    </button>
  )
}

/** Under every finished clip in History. */
const saveAction = (item: HistoryItem) => (videoOf(item) ? <SaveMotion item={item} /> : null)

/* ---------- Motion Library ---------- */

type Shelf = 'yours' | 'saved'

function MotionLibrary() {
  const { items } = useHistory('video')
  const saved = useSavedMotions()
  const [shelf, setShelf] = useState<Shelf>('yours')
  const yours = useMemo(() => motionClips(items), [items])
  const kept = useMemo(() => savedClips(saved, items), [saved, items])
  const list = shelf === 'saved' ? kept : yours
  const page = useIncremental(list, 24)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Host the clip for Kie and drop it into the reference-video slot. */
  const use = (item: HistoryItem) => {
    const media = videoOf(item)
    if (!media) return
    setBusy(item.taskId)
    setError(null)
    hostForKie(media)
      .then((url) => handOff({ surface: 'genjutsu', slots: { motion: url } }))
      .catch((e: unknown) => setError((e as Error).message))
      .finally(() => setBusy(null))
  }

  return (
    <div className="gj-lib">
      <header className="gj-hero">
        <span className="st-vcard-kicker">Motion Library</span>
        <h2 className="gj-hero-title">Turn one video into many</h2>
        <p className="gj-hero-sub">Take the motion and recast it with your characters, locations, and products, or swap specific elements while keeping the rest untouched.</p>
      </header>
      <Chips
        options={[
          { id: 'yours' as const, label: `From your videos${yours.length ? ` · ${yours.length}` : ''}` },
          { id: 'saved' as const, label: `Saved motions${kept.length ? ` · ${kept.length}` : ''}` },
        ]}
        value={shelf}
        onPick={setShelf}
      />
      {error && <p className="st-hint is-warn">{error}</p>}
      {list.length ? (
        <div className="gj-grid">
          {page.shown.map((item) => (
            <MotionCard key={item.taskId} item={item} busy={busy === item.taskId} onUse={() => use(item)} />
          ))}
          {page.more && <Sentinel count={page.shown.length} onSeen={page.grow} />}
        </div>
      ) : shelf === 'saved' ? (
        <Empty icon={Bookmark} title="No saved motions yet" sub="Press Save as motion under a clip in History or here in From your videos, and it is kept on this shelf." />
      ) : (
        <Empty icon={Clapperboard} title="No clips yet" sub="Every finished clip you make — in Video, GenShitSu or anywhere else — shows up here as a motion to reuse. You can also upload a clip straight into the reference-video slot." />
      )}
    </div>
  )
}

function MotionCard({ item, busy, onUse }: { item: HistoryItem; busy: boolean; onUse: () => void }) {
  const media = videoOf(item)
  const src = media ? mediaUrl(media) : undefined
  const seconds = media?.duration ? `${Math.round(media.duration)} s` : null
  return (
    <div className="gj-card">
      <button type="button" className="gj-card-media" onClick={onUse} disabled={busy} title="Use this motion">
        {src ? (
          <video
            src={src}
            muted
            playsInline
            loop
            preload="metadata"
            onMouseEnter={(e) => void e.currentTarget.play().catch(() => undefined)}
            onMouseLeave={(e) => {
              e.currentTarget.pause()
              e.currentTarget.currentTime = 0
            }}
          />
        ) : (
          <Clapperboard size={20} />
        )}
        {busy && <Loader2 size={16} className="st-spin gj-card-busy" />}
      </button>
      <div className="gj-card-foot">
        <span className="gj-card-text">
          <span className="gj-card-title">{item.model || item.modelId || 'Clip'}</span>
          {seconds && <span className="gj-card-sub">{seconds}</span>}
        </span>
        <SaveMotion item={item} />
        <button type="button" className="vw-btn is-sm" onClick={onUse} disabled={busy}>
          Use
        </button>
      </div>
    </div>
  )
}

/* ---------- Styles ---------- */

type StyleShelf = 'looks' | 'custom'

function StyleLibrary({ style, onStyle }: { style: string | null; onStyle: (id: string) => void }) {
  const [shelf, setShelf] = useState<StyleShelf>(style === CUSTOM ? 'custom' : 'looks')
  const tracked = useAllTracked()
  const { items } = useHistory()
  const index = useMemo(() => indexHistory(items), [items])
  return (
    <div className="gj-lib">
      <header className="gj-hero">
        <span className="st-vcard-kicker">Styles</span>
        <h2 className="gj-hero-title">One video, any style</h2>
        <p className="gj-hero-sub">Pick a style or bring your own image. Every frame takes the look — motion, camera, and framing stay as filmed. Add your characters if you want them in it.</p>
      </header>
      <Chips
        options={[
          { id: 'looks' as const, label: `Built-in · ${STYLES.length}` },
          { id: 'custom' as const, label: 'Custom' },
        ]}
        value={shelf}
        onPick={setShelf}
      />
      {shelf === 'looks' ? (
        <div className="gj-grid is-styles">
          {STYLES.map((s) => {
            const cover = presetCover(tracked[styleTag(s.id)], index)
            const on = style === s.id
            return (
              <button key={s.id} type="button" className={`gj-style ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => onStyle(s.id)}>
                <span className={`gj-style-swatch ${cover ? 'has-cover' : ''}`}>
                  {cover ? cover.video ? <video src={cover.src} muted playsInline preload="metadata" /> : <img src={cover.src} alt="" /> : <Palette size={18} />}
                </span>
                <span className="gj-style-name">{s.name}</span>
                <span className="gj-style-line">{s.line}</span>
                <span className="gj-style-cta">{on ? 'Applied' : 'Apply'}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="gj-grid is-styles">
          <button type="button" className={`gj-style ${style === CUSTOM ? 'is-on' : ''}`} aria-pressed={style === CUSTOM} onClick={() => onStyle(CUSTOM)}>
            <span className="gj-style-swatch">
              <ImagePlus size={18} />
            </span>
            <span className="gj-style-name">Your own style image</span>
            <span className="gj-style-line">A frame, a painting or a still in the look you want. It is sent first, as @image1; your characters follow.</span>
            <span className="gj-style-cta">{style === CUSTOM ? 'Applied — add the image in the rail' : 'Apply'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
