/**
 * The media picker behind the `@` and `+` buttons, with the reference app's tabs: Uploads (every file
 * uploaded through Studio, kept on disk), AI Influencer (your saved characters), Elements (all saved
 * Elements, with a kind filter), Generations (your finished work) and Liked. Every list is filtered
 * to what the current model can actually take, and pages instead of drawing a 999+ library at once.
 * With `onUpload` an "Upload media" tile comes first, so `+` is one place for both.
 *
 * Under the tabs, theirs has **Recent · All** and a **Sort by** menu: Recent is the newest
 * `RECENT_COUNT` things, All is everything (paged); Sort by is Newest / Oldest, plus A–Z where
 * things have names (Elements, AI Influencer). The Elements tab starts with a "New element"
 * tile that opens the library's element editor over the page.
 *
 * From the composer it is a popover above the prompt. From a rail slot (300 px wide, low on the
 * screen) it opens as the reference app's does there: a large centred dialog over the page. `variant`
 * picks; by default it is a dialog whenever it sits inside the rail.
 *
 * Which tab it opens on is the caller's: `+` opens on Uploads, `@` (the button or one typed) on
 * Elements, as theirs do. AI Influencer and Elements only appear when the caller says what picking
 * one does (`onPickElement`): the composer attaches every picture of the element, a rail slot takes
 * its cover. An element with no pictures can't be picked — it would attach nothing.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownUp, Check, Plus, Search, Upload as UploadIcon, X } from 'lucide-react'
import { mediaUrl, useHistory, type MediaAsset, type ModelDefinition, type RefKind } from './api.ts'
import { arrange, dateMs, kindOfMedia, mentionableMedia, refFieldFor, type MentionRef, type PickerScope, type PickerSort } from './mentions.ts'
import { ELEMENT_KINDS, useElements, useUploads, type Element, type ElementKind, type Upload } from './library.ts'
import { elementThumb } from './elements/model.ts'
import { NewElementDialog } from './elements/ElementsPanel.tsx'
import './surfaces/studio-pages.css'

export interface Pick {
  media: MediaAsset
  prompt: string
  /** Which entry it was, kept on the attached reference (`MentionRef.from`) so the entry lights up as used. */
  source?: string
  /** Set when it came from Uploads: the composer can reuse the Kie link it already has (`uploadHosted`). */
  upload?: Upload
}

/** One mentionable file, flattened out of the job (or upload) it came from. */
interface Entry extends Pick {
  key: string
  src: string
  /** When the job finished or the file was uploaded (epoch ms), for Recent and Sort by. */
  date: number
}

const SORT_LABEL: Record<PickerSort, string> = { newest: 'Newest', oldest: 'Oldest', az: 'A–Z' }

export type PickerTab = 'uploads' | 'influencer' | 'elements' | 'work' | 'liked'

/** How many tiles render at once. Their picker froze on a 999+ library; this one pages. */
const PAGE = 60

const KIND_LABEL: Record<ElementKind, string> = {
  character: 'Character',
  product: 'Product',
  location: 'Location',
  style: 'Style',
  other: 'Other',
}

/** An upload as the media a pick carries: the copy on disk (so `hostForKie` can re-host it) plus its Kie link. */
export const uploadAsMedia = (u: Upload): MediaAsset => ({
  kind: u.kind,
  localPath: u.url.replace(/^\/+/, ''),
  ...(u.hostedUrl ? { url: u.hostedUrl } : {}),
  mimeType: u.mime,
  title: u.name,
})

export function MentionPicker({
  model,
  canTake,
  kind,
  refs,
  onPick,
  onPickElement,
  onUpload,
  onClose,
  placement = 'up',
  initialTab,
  variant = 'auto',
}: {
  model: ModelDefinition | null
  /** Overrides `model` for "can this go anywhere": a family may switch variant to take it. */
  canTake?: (kind: RefKind) => boolean
  /** Only offer this kind (a rail slot that wants a clip). */
  kind?: RefKind
  refs: MentionRef[]
  onPick: (pick: Pick) => void
  /** Picking a saved Element (character, product…) attaches its images instead. */
  onPickElement?: (el: Element) => void
  /** Puts an "Upload media" tile first in the grid; it opens the file chooser. */
  onUpload?: () => void
  onClose: () => void
  /** Which way it opens: up from a composer pinned low (default), down from a slot or a toolbar. */
  placement?: 'up' | 'down'
  /** The tab it opens on; by default Uploads when it can upload, else Generations. */
  initialTab?: PickerTab
  /** `popover` beside its button, `modal` a large centred dialog, `auto` (default) a dialog inside the rail. */
  variant?: 'auto' | 'popover' | 'modal'
}) {
  const { items } = useHistory()
  const [q, setQ] = useState('')
  const elementTabs = Boolean(onPickElement)
  const usable = initialTab && (elementTabs || (initialTab !== 'elements' && initialTab !== 'influencer'))
  const [tab, setTab] = useState<PickerTab>(usable ? initialTab : onUpload ? 'uploads' : 'work')
  const [limit, setLimit] = useState(PAGE)
  const [elKind, setElKind] = useState<ElementKind | 'all'>('all')
  const [scope, setScope] = useState<PickerScope>('all')
  const [sort, setSort] = useState<PickerSort>('newest')
  const [sorting, setSorting] = useState(false)
  /** The New element dialog is open: clicks and Escape in it belong to it, not to this picker. */
  const [making, setMaking] = useState(false)
  const makingNow = useRef(false)
  makingNow.current = making
  const marker = useRef<HTMLSpanElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [modal, setModal] = useState(variant === 'modal')

  // Squeezed into a 300 px rail it cuts its own tabs off; there it opens as a dialog instead.
  useLayoutEffect(() => {
    if (variant === 'auto' && marker.current?.parentElement?.closest('.st-rail')) setModal(true)
  }, [variant])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      // A dialog closes from its scrim (below); the element editor's clicks are its own.
      if (modal || makingNow.current) return
      if (!marker.current?.parentElement?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !makingNow.current && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose, modal])

  /** Only offer what this model has a slot for, so nothing in the list is a dead end. */
  const fits = (k: RefKind) => !(kind && k !== kind) && (canTake ? canTake(k) : !model || Boolean(refFieldFor(model, k)))

  const entries = useMemo(() => {
    const out: Entry[] = []
    if (tab !== 'work' && tab !== 'liked') return out
    for (const item of items ?? []) {
      if (item.state !== 'success' && item.state !== 'partial') continue
      if (tab === 'liked' && !item.pinned) continue
      for (const [i, media] of mentionableMedia(item).entries()) {
        if (!fits(kindOfMedia(media))) continue
        const src = mediaUrl(media)
        if (src) out.push({ key: `${item.taskId}-${i}`, media, src, prompt: item.prompt ?? item.model, date: dateMs(item.createdAt) })
      }
    }
    return out
  }, [items, model, canTake, kind, tab]) // eslint-disable-line react-hooks/exhaustive-deps

  const named = tab === 'elements' || tab === 'influencer'
  // A–Z only where things have names; elsewhere it reads as Newest.
  const order: PickerSort = sort === 'az' && !named ? 'newest' : sort
  const needle = q.trim().toLowerCase()
  const shown = useMemo(() => arrange(needle ? entries.filter((e) => e.prompt.toLowerCase().includes(needle)) : entries, scope, order, (e) => e.date), [entries, needle, scope, order])
  const tabs: { id: PickerTab; label: string }[] = [
    { id: 'uploads', label: 'Uploads' },
    ...(elementTabs ? [{ id: 'influencer' as const, label: 'AI Influencer' }, { id: 'elements' as const, label: 'Elements' }] : []),
    { id: 'work', label: 'Generations' },
    { id: 'liked', label: 'Liked' },
  ]
  const pick = (t: PickerTab) => {
    setTab(t)
    setLimit(PAGE)
  }
  const emptyNote = entries.length ? 'Nothing matches.' : tab === 'liked' ? 'Nothing liked yet. Favourite a result in the viewer and it shows up here.' : 'Nothing this model can take yet.'
  const placeholder = { uploads: 'Search your uploads…', influencer: 'Search characters…', elements: 'Search elements…', work: 'Search your work…', liked: 'Search what you liked…' }[tab]

  const uploadTile = onUpload && (
    <button type="button" className="st-mention" title="Upload a file from this computer" onClick={onUpload}>
      <span className="st-mention-audio" style={{ gap: 4, alignContent: 'center' }}>
        <UploadIcon size={16} style={{ justifySelf: 'center' }} />
        Upload media
      </span>
    </button>
  )

  const sorts: PickerSort[] = named ? ['newest', 'oldest', 'az'] : ['newest', 'oldest']
  const subBar = (
    <div className="sp-mention-sub">
      <div className="sp-mention-scope" role="tablist" aria-label="Show">
        {(['recent', 'all'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={scope === s}
            className={scope === s ? 'is-active' : ''}
            onClick={() => {
              setScope(s)
              setLimit(PAGE)
            }}
          >
            {s === 'recent' ? 'Recent' : 'All'}
          </button>
        ))}
      </div>
      <div className="sp-mention-sort">
        <button type="button" className="sp-mention-sort-btn" aria-haspopup="menu" aria-expanded={sorting} onClick={() => setSorting((v) => !v)}>
          <ArrowDownUp size={12} />
          Sort by: {SORT_LABEL[order]}
        </button>
        {sorting && (
          <div className="sp-mention-sort-menu" role="menu">
            {sorts.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={order === s}
                onClick={() => {
                  setSort(s)
                  setSorting(false)
                  setLimit(PAGE)
                }}
              >
                {order === s ? <Check size={12} /> : <span style={{ width: 12 }} />}
                {SORT_LABEL[s]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  const body = (
    <>
      <div className="sp-mention-top">
        <div className="pl-tabs st-tabs sp-mention-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`pl-tab ${tab === t.id ? 'is-active' : ''}`} onClick={() => pick(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {modal && (
          <button type="button" className="pl-iconbtn is-quiet sp-mention-x" aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>
      {subBar}
      <label className="st-mention-search">
        <Search size={13} />
        <input
          placeholder={placeholder}
          value={q}
          autoFocus
          onChange={(e) => {
            setQ(e.target.value)
            setLimit(PAGE)
          }}
        />
      </label>
      <div className="sp-mention-body">
        {(tab === 'elements' || tab === 'influencer') && onPickElement ? (
          <ElementList
            q={needle}
            kind={tab === 'influencer' ? 'character' : elKind}
            onKind={tab === 'influencer' ? undefined : setElKind}
            influencer={tab === 'influencer'}
            scope={scope}
            sort={order}
            onPick={onPickElement}
            onNew={tab === 'elements' ? () => setMaking(true) : undefined}
          />
        ) : tab === 'uploads' ? (
          <UploadList q={needle} fits={fits} refs={refs} onPick={onPick} uploadTile={uploadTile} scope={scope} sort={order} />
        ) : !items && !onUpload ? (
          <p className="st-pop-item">Loading…</p>
        ) : !shown.length && !onUpload ? (
          <p className="st-pop-item sp-pop-note">{emptyNote}</p>
        ) : (
          <>
            <div className="st-mention-grid">
              {uploadTile}
              {shown.slice(0, limit).map((e) => (
                <MediaTile key={e.key} entry={e} used={refs.some((r) => r.from === e.key || r.url === e.src)} onPick={onPick} />
              ))}
            </div>
            {onUpload && !shown.length && <p className="st-pop-item sp-pop-note">{items ? emptyNote : 'Loading…'}</p>}
            {shown.length > limit && (
              <button type="button" className="sp-more" onClick={() => setLimit((n) => n + PAGE)}>
                Show more ({shown.length - limit} left)
              </button>
            )}
          </>
        )}
      </div>
      {making && <NewElementDialog kind={elKind === 'all' ? 'character' : elKind} onClose={() => setMaking(false)} />}
    </>
  )

  return (
    <>
      <span ref={marker} hidden />
      {modal ? (
        createPortal(
          <div className="sp-mentions-scrim" onMouseDown={(e) => e.target === e.currentTarget && !makingNow.current && onClose()}>
            <div ref={box} className="st-pop is-mentions sp-mentions is-modal" role="dialog" aria-modal="true" aria-label="Media">
              {body}
            </div>
          </div>,
          document.body,
        )
      ) : (
        <div ref={box} className={`st-pop is-mentions sp-mentions is-${placement}`} style={placement === 'down' ? { top: 'calc(100% + 6px)', bottom: 'auto', left: 0 } : { bottom: 'calc(100% + 6px)', left: 0 }}>
          {body}
        </div>
      )}
    </>
  )
}

/** One file in a grid: a thumbnail (or a muted first frame, or the word Audio). Hides itself if the file is gone. */
function MediaTile({ entry: e, used, onPick }: { entry: Entry; used: boolean; onPick: (p: Pick) => void }) {
  const [gone, setGone] = useState(false)
  const k = kindOfMedia(e.media)
  if (gone) return null
  return (
    <button
      type="button"
      className={`st-mention ${used ? 'is-on' : ''}`}
      title={e.prompt}
      onClick={() => onPick({ media: e.media, prompt: e.prompt, source: e.key, ...(e.upload ? { upload: e.upload } : {}) })}
    >
      {k === 'image' ? (
        <img src={e.src} alt="" loading="lazy" onError={() => setGone(true)} />
      ) : k === 'video' ? (
        <video src={e.src} muted playsInline preload="metadata" onError={() => setGone(true)} />
      ) : (
        <span className="st-mention-audio">Audio</span>
      )}
    </button>
  )
}

/**
 * The Uploads tab: the Upload tile, then the uploads, a page at a time from the server. All + Oldest
 * reads the list from its far end; Recent is the newest few in either order.
 */
function UploadList({
  q,
  fits,
  refs,
  onPick,
  uploadTile,
  scope,
  sort,
}: {
  q: string
  fits: (k: RefKind) => boolean
  refs: MentionRef[]
  onPick: (p: Pick) => void
  uploadTile: ReactNode
  scope: PickerScope
  sort: PickerSort
}) {
  const { items, total, loading, error, more } = useUploads(scope === 'all' && sort === 'oldest' ? 'oldest' : 'newest')
  const [busy, setBusy] = useState(false)
  const matching: Entry[] = items
    .filter((u) => fits(u.kind) && (!q || u.name.toLowerCase().includes(q)))
    .map((u) => ({ key: `upload:${u.id}`, media: uploadAsMedia(u), src: u.kind === 'image' ? (u.thumb ?? u.url) : u.url, prompt: u.name, upload: u, date: dateMs(u.createdAt) }))
  // All keeps the server's order (already newest or oldest first); Recent picks the newest few.
  const entries = scope === 'recent' ? arrange(matching, 'recent', sort, (e) => e.date) : matching
  const left = scope === 'all' ? total - items.length : 0
  return (
    <>
      <div className="st-mention-grid">
        {uploadTile}
        {entries.map((e) => (
          <MediaTile key={e.key} entry={e} used={refs.some((r) => r.from === e.key || (Boolean(e.upload?.hostedUrl) && r.url === e.upload?.hostedUrl))} onPick={onPick} />
        ))}
      </div>
      {loading && !items.length ? (
        <p className="st-pop-item">Loading…</p>
      ) : error && !items.length ? (
        <p className="st-pop-item sp-pop-note">Uploads unavailable: {error}</p>
      ) : !items.length ? (
        <p className="st-pop-item sp-pop-note">Nothing uploaded yet. Files you upload are kept here, so you can attach them again later.</p>
      ) : !entries.length ? (
        <p className="st-pop-item sp-pop-note">{q ? 'Nothing matches.' : 'None of your uploads fit this model.'}</p>
      ) : null}
      {left > 0 && (
        <button
          type="button"
          className="sp-more"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            void more().finally(() => setBusy(false))
          }}
        >
          {busy ? 'Loading…' : `Show more (${left} left)`}
        </button>
      )}
    </>
  )
}

/**
 * The Elements and AI Influencer tabs: kind chips (Elements only), then a card per element, in the
 * sub-tab's scope and the chosen order. Elements starts with a New element tile.
 */
function ElementList({
  q,
  kind,
  onKind,
  influencer,
  scope,
  sort,
  onPick,
  onNew,
}: {
  q: string
  kind: ElementKind | 'all'
  onKind?: (k: ElementKind | 'all') => void
  influencer?: boolean
  scope: PickerScope
  sort: PickerSort
  onPick: (el: Element) => void
  /** Puts a "New element" tile first; it opens the element editor. */
  onNew?: () => void
}) {
  const { items, loading, error } = useElements()
  const kinds = ELEMENT_KINDS.filter((k) => items.some((el) => el.kind === k))
  const matching = items.filter((el) => (kind === 'all' || el.kind === kind) && (!q || `${el.name} ${el.description}`.toLowerCase().includes(q)))
  const shown = arrange(matching, scope, sort, (el) => dateMs(el.createdAt), (el) => el.name)

  if (loading && !items.length) return <p className="st-pop-item">Loading…</p>
  if (error && !items.length) return <p className="st-pop-item">Elements unavailable: {error}</p>
  if (influencer && !items.some((el) => el.kind === 'character')) {
    return (
      <p className="st-pop-item sp-pop-note">
        No characters yet. Make one in <a href="#/gen/influencer">AI Influencer</a> and save it, and it shows up here.
      </p>
    )
  }
  if (!items.length && !onNew) return <p className="st-pop-item sp-pop-note">No elements yet. Save a character, product or place in My elements and it shows up here.</p>

  const newTile = onNew && (
    <button type="button" className="sp-el-pick sp-el-pick-new" title="Make a new element from your photos or past results" onClick={onNew}>
      <span className="sp-el-pick-cover">
        <Plus size={18} />
      </span>
      <span className="sp-el-pick-name">New element</span>
      <span className="sp-el-pick-kind">Character, product, place…</span>
    </button>
  )

  return (
    <>
      {onKind && kinds.length > 1 && (
        <div className="st-chips sp-mention-kinds">
          {(['all', ...kinds] as const).map((k) => (
            <button key={k} type="button" className={`st-chip ${kind === k ? 'is-active' : ''}`} onClick={() => onKind(k)}>
              {k === 'all' ? 'All' : `${KIND_LABEL[k]}s`}
            </button>
          ))}
        </div>
      )}
      {(shown.length > 0 || newTile) && (
        <div className="sp-el-pick-grid">
          {newTile}
          {shown.map((el) => {
            const thumb = elementThumb(el)
            const empty = !el.images.length
            return (
              <button
                key={el.id}
                type="button"
                className="sp-el-pick"
                disabled={empty}
                title={empty ? 'This element has no pictures yet' : `${el.name} — ${el.images.length} ${el.images.length === 1 ? 'picture' : 'pictures'}`}
                onClick={() => onPick(el)}
              >
                <span className="sp-el-pick-cover">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <span>{el.name.slice(0, 1).toUpperCase()}</span>}</span>
                <span className="sp-el-pick-name">{el.name}</span>
                <span className="sp-el-pick-kind">
                  {KIND_LABEL[el.kind]} · {el.images.length}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {!items.length ? (
        <p className="st-pop-item sp-pop-note">No elements yet. Make one here, or save a character, product or place in My elements.</p>
      ) : !shown.length ? (
        <p className="st-pop-item">Nothing matches.</p>
      ) : null}
    </>
  )
}
