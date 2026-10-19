/**
 * Influencer's Characters tab: the characters you have saved, and the results you
 * made here that could become one.
 *
 * Saving is the reference app's "Save character": tick one or more results (several angles of
 * the same face keep it steadier), name it, and it becomes an Element of kind
 * character — @-mentionable everywhere, and what the Character sheet and Motion tabs
 * start from. A sheet you made later can be added to the character it came from.
 */
import { useMemo, useState } from 'react'
import { Check, Clapperboard, LayoutGrid, Pencil, UserRound, UserRoundPlus } from 'lucide-react'
import { firstMedia, isDone, mediaUrl, useHistory, type HistoryItem } from '../../api.ts'
import { libraryApi, MAX_ELEMENT_IMAGES, useElements, type Element } from '../../library.ts'
import { elementThumb } from '../../elements/model.ts'
import { Empty, SectionHead } from '../../parts.tsx'
import { indexHistory } from '../../presets.ts'
import { openViewer } from '../../viewer.ts'
import { ElementsPanel } from '../../elements/ElementsPanel.tsx'
import { nameFromPrompt } from '../../elements/model.ts'
import { Btn, QuietBtn } from '../pageParts.tsx'
import { useTracked } from '../track.ts'
import { INFLUENCER_TAGS as TAGS } from './traits.ts'
import '../studio-pages.css'

const suggestName = (item: HistoryItem) => nameFromPrompt(item.prompt?.replace(/^photorealistic full-colour photo of (an? )?/i, ''))
const suggestNotes = (item: HistoryItem) => (item.prompt ?? '').split('. ').slice(0, 3).join('. ').slice(0, 400)

/** The library source for a result's first picture: its archived path, else its link. */
const sourceOf = (item: HistoryItem): string | null => {
  const m = item.media?.find((x) => !x.kind || x.kind === 'image')
  return (m && mediaUrl(m)) ?? item.resultUrls?.[0] ?? null
}

/**
 * "Save as character" on a result tile: one press makes a character Element from that
 * picture, named from its prompt (rename it later in Characters → Manage).
 */
export function SaveCharacterButton({ item, onOpen }: { item: HistoryItem; onOpen?: () => void }) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const source = sourceOf(item)
  if (!source || item.category !== 'image') return null
  const save = async () => {
    setState('saving')
    try {
      const el = await libraryApi.createElement({ name: suggestName(item), kind: 'character', description: suggestNotes(item), sources: [{ url: source }] })
      setMessage(`Saved as “${el.name}”`)
      setState('saved')
    } catch (e) {
      setMessage((e as Error).message)
      setState('error')
    }
  }
  if (state === 'saved') {
    return (
      <QuietBtn icon={Check} onClick={() => onOpen?.()} title="Open Characters to rename it or add more pictures">
        {message}
      </QuietBtn>
    )
  }
  return (
    <QuietBtn icon={UserRoundPlus} onClick={() => void save()} disabled={state === 'saving'} title={state === 'error' ? message : 'Make a character Element from this picture'}>
      {state === 'saving' ? 'Saving…' : state === 'error' ? 'Try again' : 'Save as character'}
    </QuietBtn>
  )
}

export function CharactersPage({ onSheet, onAnimate, onCreate, prePick }: { onSheet: (el: Element) => void; onAnimate: (el: Element) => void; onCreate: () => void; prePick?: string | null }) {
  const { items: elements } = useElements()
  const characters = elements.filter((el) => el.kind === 'character')
  const { items: history } = useHistory()
  const byTask = useMemo(() => indexHistory(history), [history])
  const made = useTracked(TAGS.create)
  const sheets = useTracked(TAGS.sheet)
  const [editing, setEditing] = useState(false)

  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: HistoryItem[] = []
    for (const t of [...made, ...sheets]) {
      const item = byTask.get(t)
      if (!item || seen.has(t) || !isDone(item) || item.category !== 'image') continue
      seen.add(t)
      out.push(item)
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }, [made, sheets, byTask])

  if (editing) {
    return (
      <div className="st-page">
        <QuietBtn onClick={() => setEditing(false)}>← Back to my characters</QuietBtn>
        <ElementsPanel initialKind="character" title="Characters" />
      </div>
    )
  }

  return (
    <div className="st-page">
      <div className="st-section" style={{ marginTop: 0 }}>
        <SectionHead
          title="Saved characters"
          right={
            <QuietBtn icon={Pencil} onClick={() => setEditing(true)} title="Rename, add pictures, change the cover">
              Manage
            </QuietBtn>
          }
        />
        {characters.length ? (
          <div className="sp-el-grid">
            {characters.map((el) => (
              <div key={el.id} className="pl-panel sp-char">
                <span className="sp-el-cover">{elementThumb(el) ? <img src={elementThumb(el) ?? ''} alt="" loading="lazy" /> : <span className="sp-el-initial">{el.name.slice(0, 1).toUpperCase()}</span>}</span>
                <span className="sp-el-body">
                  <span className="sp-el-name">{el.name}</span>
                  <span className="sp-el-meta">
                    {el.images.length} {el.images.length === 1 ? 'picture' : 'pictures'}
                  </span>
                </span>
                <span className="sp-char-actions">
                  <QuietBtn icon={LayoutGrid} onClick={() => onSheet(el)} disabled={!el.images.length} title="Make a turnaround or expression sheet">
                    Sheet
                  </QuietBtn>
                  <QuietBtn icon={Clapperboard} onClick={() => onAnimate(el)} disabled={!el.images.length} title="Animate this character">
                    Animate
                  </QuietBtn>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <Empty icon={UserRound} title="No characters saved yet" sub="Create a few faces, tick the one you like below, and save it as a character." cta={<Btn onClick={onCreate}>Create a character</Btn>} />
        )}
      </div>

      <RecentCreations items={recent} characters={characters} prePick={prePick} />
    </div>
  )
}

function RecentCreations({ items, characters, prePick }: { items: HistoryItem[]; characters: Element[]; prePick?: string | null }) {
  // Arriving from Create's "Save as character" starts with that result picked.
  const first = prePick ? items.find((i) => i.taskId === prePick) : undefined
  const [picked, setPicked] = useState<string[]>(first ? [first.taskId] : [])
  const [name, setName] = useState(first ? suggestName(first) : '')
  const [notes, setNotes] = useState(first ? suggestNotes(first) : '')
  const [target, setTarget] = useState<string>('new')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const pickedItems = items.filter((i) => picked.includes(i.taskId))
  const existing = characters.find((c) => c.id === target)
  const room = existing ? MAX_ELEMENT_IMAGES - existing.images.length : MAX_ELEMENT_IMAGES

  const toggle = (item: HistoryItem) => {
    setNote(null)
    const next = picked.includes(item.taskId) ? picked.filter((t) => t !== item.taskId) : [...picked, item.taskId].slice(0, MAX_ELEMENT_IMAGES)
    // The first pick suggests a name and notes from its prompt; both stay editable.
    if (!picked.length && next.length && !name) {
      setName(suggestName(item))
      setNotes(suggestNotes(item))
    }
    setPicked(next)
  }

  const save = async () => {
    const sources = pickedItems.map(sourceOf).filter((s): s is string => Boolean(s)).slice(0, room)
    if (!sources.length) return
    setBusy(true)
    setNote(null)
    try {
      if (existing) {
        for (const url of sources) await libraryApi.addImageUrl(existing.id, url)
        setNote(`Added ${sources.length} to ${existing.name}.`)
      } else {
        const el = await libraryApi.createElement({ name: name.trim() || 'New character', kind: 'character', description: notes.trim(), sources: sources.map((url) => ({ url })) })
        setNote(`Saved “${el.name}”. It is in your Elements now — @-mention it in any prompt.`)
        setName('')
        setNotes('')
      }
      setPicked([])
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="st-section">
      <SectionHead title="Recent creations" right={<span className="st-pill-label">{items.length}</span>} />
      {!items.length ? (
        <Empty icon={UserRoundPlus} title="Nothing made here yet" sub="Results from Create and Character sheet show up here, ready to save as a character." />
      ) : (
        <>
          <p className="sp-hint">Tick the pictures that show the same person, then save them as a character. Several angles keep the face steadier.</p>
          {picked.length > 0 && (
            <div className="pl-panel sp-save-bar">
              <span className="sp-save-count">{picked.length} picked</span>
              <select className="sp-input sp-save-target" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="new">New character</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    Add to {c.name}
                  </option>
                ))}
              </select>
              {target === 'new' && (
                <>
                  <input className="sp-input" placeholder="Name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
                  <input className="sp-input sp-grow" placeholder="Notes: what to keep the same" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
                </>
              )}
              <Btn icon={UserRoundPlus} onClick={() => void save()} disabled={busy || (target === 'new' && !name.trim()) || room <= 0}>
                {busy ? 'Saving…' : target === 'new' ? 'Save as character' : 'Add pictures'}
              </Btn>
              <QuietBtn onClick={() => setPicked([])}>Clear</QuietBtn>
            </div>
          )}
          {note && <p className="st-note">{note}</p>}
          <div className="st-grid sp-results">
            {items.map((item) => {
              const on = picked.includes(item.taskId)
              return (
                <figure key={item.taskId} className={`st-tile sp-pickable ${on ? 'is-on' : ''}`} style={{ margin: 0 }}>
                  <button type="button" className="st-tile-open" onClick={() => openViewer(item, items)} aria-label="Open">
                    <img src={firstMedia(item)} alt={item.prompt ?? ''} loading="lazy" />
                  </button>
                  <button type="button" className={`sp-tick ${on ? 'is-on' : ''}`} aria-pressed={on} title={on ? 'Unpick' : 'Pick for a character'} onClick={() => toggle(item)}>
                    <Check size={13} />
                  </button>
                  <figcaption className="st-tile-meta">{item.prompt?.slice(0, 90) ?? item.model}</figcaption>
                </figure>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
