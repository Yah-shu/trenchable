/**
 * The Elements library: saved characters, products, locations and styles.
 *
 * the reference app's Elements are named sets of reference pictures you can @-mention in any
 * job so a face, a product or a place stays the same from shot to shot. This page is
 * where they are made and kept: a grid by kind, and an editor for one element — name,
 * kind, notes, pictures (upload or pick from past results), which picture is the cover
 * (a rail slot takes the cover; the composer's @ attaches them all), and delete with an
 * inline confirm.
 *
 * Embedded by Cinema's "My elements" and Assets' Elements view, so it brings no page
 * chrome beyond its own header.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, ImagePlus, Images, Loader2, Plus, Search, Shapes, Star, Trash2, X } from 'lucide-react'
import { ELEMENT_KINDS, libraryApi, MAX_ELEMENT_IMAGES, useElements, type Element, type ElementKind } from '../library.ts'
import { elementThumb } from './model.ts'
import { Empty } from '../parts.tsx'
import { Btn, QuietBtn } from '../surfaces/pageParts.tsx'
import { countByKind, groupElements, KIND_LABELS, roomLeft } from './model.ts'
import { PastPicker } from './PastPicker.tsx'
import '../surfaces/studio-pages.css'

/** `made` is the element just created, shown until the reloaded list has it. */
type Open = { mode: 'list' } | { mode: 'new'; kind: ElementKind } | { mode: 'edit'; id: string; made?: Element }

export function ElementsPanel({ initialKind = 'all', title = 'Elements' }: { initialKind?: ElementKind | 'all'; title?: string }) {
  const { items, loading, error, reload } = useElements()
  const [kind, setKind] = useState<ElementKind | 'all'>(initialKind)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Open>({ mode: 'list' })

  const counts = useMemo(() => countByKind(items), [items])
  const groups = useMemo(() => groupElements(items, kind, q), [items, kind, q])

  if (open.mode === 'new') {
    return <ElementEditor key="new" initialKind={open.kind} onBack={() => setOpen({ mode: 'list' })} onCreated={(el) => setOpen({ mode: 'edit', id: el.id, made: el })} />
  }
  if (open.mode === 'edit') {
    const el = items.find((x) => x.id === open.id) ?? open.made
    if (el) return <ElementEditor key={el.id} element={el} onBack={() => setOpen({ mode: 'list' })} onDeleted={() => setOpen({ mode: 'list' })} />
  }

  return (
    <div className="sp-elements">
      <div className="sp-head">
        <div>
          <h2 className="sp-title">{title}</h2>
          <p className="sp-sub">Saved characters, products, places and styles. @-mention one in any prompt to keep it the same from shot to shot.</p>
        </div>
        <Btn icon={Plus} onClick={() => setOpen({ mode: 'new', kind: kind === 'all' ? 'character' : kind })}>
          New element
        </Btn>
      </div>

      <div className="sp-toolbar">
        <div className="pl-tabs st-tabs" role="tablist">
          {(['all', ...ELEMENT_KINDS] as const).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={kind === k} className={`pl-tab ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
              {k === 'all' ? 'All' : KIND_LABELS[k].many}
              <span className="pl-tab__count">{counts[k]}</span>
            </button>
          ))}
        </div>
        <label className="st-mention-search sp-search">
          <Search size={13} />
          <input placeholder="Search elements…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>

      {error && !items.length ? (
        <Empty icon={Shapes} title="The library didn't answer" sub={error} cta={<Btn ghost onClick={() => void reload()}>Try again</Btn>} />
      ) : loading && !items.length ? (
        <p className="sp-hint">
          <Loader2 size={13} className="st-spin" /> Loading elements…
        </p>
      ) : !groups.length ? (
        <Empty
          icon={Shapes}
          title={q.trim() ? 'Nothing matches that' : kind === 'all' ? 'No elements yet' : `No ${KIND_LABELS[kind].many.toLowerCase()} yet`}
          sub={q.trim() ? 'Search looks at names and notes.' : kind === 'all' ? 'Make one from your own photos or past results, then @-mention it anywhere.' : KIND_LABELS[kind].hint}
          cta={
            !q.trim() ? (
              <Btn icon={Plus} onClick={() => setOpen({ mode: 'new', kind: kind === 'all' ? 'character' : kind })}>
                New {kind === 'all' ? 'element' : KIND_LABELS[kind].one.toLowerCase()}
              </Btn>
            ) : undefined
          }
        />
      ) : (
        groups.map((g) => (
          <section key={g.kind} className="sp-el-group">
            {kind === 'all' && (
              <p className="sp-group-head">
                {KIND_LABELS[g.kind].many}
                <span className="st-pill-label">{g.items.length}</span>
              </p>
            )}
            <div className="sp-el-grid">
              {g.items.map((el) => (
                <ElementCard key={el.id} el={el} onOpen={() => setOpen({ mode: 'edit', id: el.id })} />
              ))}
              <button type="button" className="sp-el-new" onClick={() => setOpen({ mode: 'new', kind: g.kind })}>
                <Plus size={16} />
                New {KIND_LABELS[g.kind].one.toLowerCase()}
              </button>
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/**
 * The New element flow on its own, over whatever opened it (the media picker's "New element"
 * tile): the same editor as the library page, closing once the element is made.
 */
export function NewElementDialog({ kind = 'character', onClose, onCreated }: { kind?: ElementKind; onClose: () => void; onCreated?: (el: Element) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  // Into <body>: a composer or rail can be a containing block that would trap a fixed scrim.
  return createPortal(
    <div className="sp-modal-scrim sp-el-dialog-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sp-modal is-wide pl-panel" role="dialog" aria-modal="true" aria-label="New element">
        <div className="sp-modal-body">
          <ElementEditor
            initialKind={kind}
            backLabel="Back"
            onBack={onClose}
            onCreated={(el) => {
              onCreated?.(el)
              onClose()
            }}
          />
        </div>
      </div>
    </div>,
    document.body,
  )
}

function ElementCard({ el, onOpen }: { el: Element; onOpen: () => void }) {
  const thumb = elementThumb(el)
  return (
    <button type="button" className="pl-press sp-el-card" onClick={onOpen}>
      <span className="pl-panel sp-el-face">
        <span className="sp-el-cover">{thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="sp-el-initial">{el.name.slice(0, 1).toUpperCase()}</span>}</span>
        <span className="sp-el-body">
          <span className="sp-el-name">{el.name}</span>
          <span className="sp-el-meta">
            <span className="pl-badge pl-badge--quiet">{KIND_LABELS[el.kind].one}</span>
            <span>
              <Images size={11} /> {el.images.length}
            </span>
          </span>
        </span>
      </span>
    </button>
  )
}

/* ---------- one element ---------- */

interface Staged {
  key: string
  /** A file from the computer, previewed locally until the element exists. */
  file?: File
  preview: string
  /** Or a past result / link the library copies in. */
  source?: string
}

/**
 * Create or edit one element. In create mode pictures are staged locally and sent with
 * Create; in edit mode every change goes straight to the library.
 */
function ElementEditor({
  element,
  initialKind = 'character',
  backLabel = 'All elements',
  onBack,
  onCreated,
  onDeleted,
}: {
  element?: Element
  initialKind?: ElementKind
  backLabel?: string
  onBack: () => void
  onCreated?: (el: Element) => void
  onDeleted?: () => void
}) {
  const [name, setName] = useState(element?.name ?? '')
  const [kind, setKind] = useState<ElementKind>(element?.kind ?? initialKind)
  const [description, setDescription] = useState(element?.description ?? '')
  const [staged, setStaged] = useState<Staged[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const previews = useRef<string[]>([])

  // Local previews hold memory until revoked; they are only shown while this editor is.
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), [])
  const preview = (f: File) => {
    const url = URL.createObjectURL(f)
    previews.current.push(url)
    return url
  }

  const existing = element?.images.length ?? 0
  const room = roomLeft(existing, staged.length)
  const dirty = element ? name.trim() !== element.name || kind !== element.kind || description !== element.description : false

  const run = async (label: string, job: () => Promise<unknown>) => {
    setBusy(label)
    setNote(null)
    try {
      await job()
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const addFiles = (list: FileList | File[] | null) => {
    const files = [...(list ?? [])].filter((f) => f.type.startsWith('image/'))
    if (!files.length) return
    const fit = files.slice(0, room)
    const over = fit.length < files.length ? `An element holds up to ${MAX_ELEMENT_IMAGES} pictures; ${files.length - fit.length} left out.` : null
    if (element) {
      if (fit.length) void run('upload', () => libraryApi.addImages(element.id, fit)).then(() => over && setNote(over))
      else setNote(over)
      return
    }
    setNote(over)
    setStaged((s) => [...s, ...fit.map((f, i) => ({ key: `f-${Date.now()}-${i}`, file: f, preview: preview(f) }))])
  }

  const addSources = async (sources: string[]) => {
    setPicking(false)
    if (!sources.length) return
    if (element) {
      await run('past', async () => {
        for (const url of sources.slice(0, room)) await libraryApi.addImageUrl(element.id, url)
      })
      return
    }
    setStaged((s) => [...s, ...sources.slice(0, room).map((url, i) => ({ key: `s-${Date.now()}-${i}`, source: url, preview: url }))])
  }

  const create = () =>
    run('create', async () => {
      const sources = staged.filter((s) => s.source).map((s) => ({ url: s.source as string }))
      const made = await libraryApi.createElement({ name: name.trim(), kind, description: description.trim(), sources })
      const files = staged.flatMap((s) => (s.file ? [s.file] : []))
      const done = files.length ? await libraryApi.addImages(made.id, files) : made
      setStaged([])
      onCreated?.(done)
    })

  const save = () => element && run('save', () => libraryApi.updateElement(element.id, { name: name.trim(), kind, description }))

  return (
    <div className="sp-elements sp-editor">
      <div className="sp-head">
        <button type="button" className="sp-back" onClick={onBack}>
          <ArrowLeft size={14} />
          {backLabel}
        </button>
        <div className="sp-head-actions">
          {element ? (
            confirmDelete ? (
              <span className="sp-confirm" role="alert">
                Delete “{element.name}” and its {existing} {existing === 1 ? 'picture' : 'pictures'}? This can't be undone.
                <Btn onClick={() => void run('delete', () => libraryApi.deleteElement(element.id).then(() => onDeleted?.()))} disabled={busy !== null}>
                  {busy === 'delete' ? 'Deleting…' : 'Delete'}
                </Btn>
                <Btn ghost onClick={() => setConfirmDelete(false)}>
                  Keep it
                </Btn>
              </span>
            ) : (
              <QuietBtn icon={Trash2} danger onClick={() => setConfirmDelete(true)} title="Delete this element">
                Delete
              </QuietBtn>
            )
          ) : null}
        </div>
      </div>

      <div className="sp-editor-body">
        <div className="sp-editor-form pl-panel">
          <label className="sp-label">
            Name
            <input className="sp-input" value={name} maxLength={80} placeholder={kind === 'character' ? 'e.g. Maya, 30s runner' : kind === 'product' ? 'e.g. Ceramic mug' : 'Give it a name'} onChange={(e) => setName(e.target.value)} />
          </label>
          <div className="sp-label">
            Kind
            <div className="st-chips">
              {ELEMENT_KINDS.map((k) => (
                <button key={k} type="button" className={`st-chip ${kind === k ? 'is-active' : ''}`} onClick={() => setKind(k)}>
                  {KIND_LABELS[k].one}
                </button>
              ))}
            </div>
            <span className="sp-hint">{KIND_LABELS[kind].hint}</span>
          </div>
          <label className="sp-label">
            Notes
            <textarea
              className="sp-input"
              rows={4}
              value={description}
              maxLength={2000}
              placeholder="What matters about it — features to keep, the exact colour, what it should never look like."
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          {element ? (
            <div className="sp-row-end">
              <Btn onClick={() => void save()} disabled={!dirty || !name.trim() || busy !== null}>
                {busy === 'save' ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
              </Btn>
            </div>
          ) : (
            <div className="sp-row-end">
              <Btn ghost onClick={onBack}>
                Cancel
              </Btn>
              <Btn onClick={() => void create()} disabled={!name.trim() || busy !== null} title={!name.trim() ? 'Give it a name first' : undefined}>
                {busy === 'create' ? 'Creating…' : 'Create element'}
              </Btn>
            </div>
          )}
          {note && <p className="st-note">{note}</p>}
        </div>

        <div
          className={`sp-editor-images pl-panel ${dragging ? 'is-drop' : ''}`}
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes('Files')) return
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            setDragging(false)
            if (!e.dataTransfer.files.length) return
            e.preventDefault()
            addFiles(e.dataTransfer.files)
          }}
        >
          <div className="sp-head is-tight">
            <p className="sp-panel-title">
              Pictures <span className="st-pill-label">{existing + staged.length}/{MAX_ELEMENT_IMAGES}</span>
            </p>
            <div className="sp-head-actions">
              <QuietBtn icon={ImagePlus} onClick={() => file.current?.click()} disabled={!room || busy !== null} title="Upload pictures from your computer">
                Upload
              </QuietBtn>
              <QuietBtn icon={Images} onClick={() => setPicking((v) => !v)} disabled={!room || busy !== null} title="Pick from your past results">
                From your work
              </QuietBtn>
            </div>
          </div>
          <input
            ref={file}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />

          {picking && <PastPicker max={room} busy={busy === 'past'} onAdd={(s) => void addSources(s)} onCancel={() => setPicking(false)} />}

          {existing + staged.length === 0 ? (
            <button type="button" className="sp-dropzone" onClick={() => file.current?.click()}>
              <ImagePlus size={20} />
              <span className="sp-dropzone-title">Drop pictures here</span>
              <span className="sp-hint">PNG, JPG or WebP, up to 25 MB each. The first one becomes the cover.</span>
            </button>
          ) : (
            <div className="sp-img-grid">
              {element?.images.map((img) => {
                const isCover = img.n === element.cover
                return (
                  <figure key={img.n} className={`sp-img ${isCover ? 'is-cover' : ''}`}>
                    <img src={img.thumb} alt="" loading="lazy" />
                    {isCover && <span className="sp-img-badge">Cover</span>}
                    {confirmRemove === img.n ? (
                      <span className="sp-img-confirm">
                        Remove?
                        <button type="button" onClick={() => void run('remove', () => libraryApi.removeImage(element.id, img.n)).then(() => setConfirmRemove(null))}>
                          Yes
                        </button>
                        <button type="button" onClick={() => setConfirmRemove(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <span className="sp-img-tools">
                        {!isCover && (
                          <button type="button" title="Use as cover" aria-label="Use as cover" disabled={busy !== null} onClick={() => void run('cover', () => libraryApi.updateElement(element.id, { cover: img.n }))}>
                            <Star size={12} />
                          </button>
                        )}
                        <button type="button" title="Remove picture" aria-label="Remove picture" disabled={busy !== null} onClick={() => setConfirmRemove(img.n)}>
                          <X size={12} />
                        </button>
                      </span>
                    )}
                  </figure>
                )
              })}
              {staged.map((s, i) => (
                <figure key={s.key} className={`sp-img is-staged ${i === 0 && !existing ? 'is-cover' : ''}`}>
                  <img src={s.preview} alt="" />
                  {i === 0 && !existing && <span className="sp-img-badge">Cover</span>}
                  <span className="sp-img-tools">
                    <button type="button" title="Leave out" aria-label="Leave out" onClick={() => setStaged((all) => all.filter((x) => x.key !== s.key))}>
                      <X size={12} />
                    </button>
                  </span>
                </figure>
              ))}
              {(busy === 'upload' || busy === 'past') && (
                <figure className="sp-img is-busy">
                  <Loader2 size={16} className="st-spin" />
                </figure>
              )}
            </div>
          )}
          <p className="sp-hint">
            {element
              ? 'The star sets the cover: a rail slot takes the cover, the @ in a prompt attaches every picture.'
              : 'Pictures are sent when you press Create. The first becomes the cover; you can change it after.'}
          </p>
        </div>
      </div>
    </div>
  )
}
