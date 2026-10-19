/**
 * The composer: their floating prompt bar, and the inline variant their project pages use.
 *
 * The pills are read off the model behind them (controls.ts), the picker lists model
 * families and swaps to the right variant as references come and go (families.ts), and
 * every other setting is one click away under Advanced. Generate queues jobs rather than
 * waiting on one, so you can keep pressing it, like theirs.
 *
 * The bar reshapes to the model, as theirs does: a family that takes no references (Z-Image,
 * Imagen 4) loses `+`, `@` and the reference strip, and the attached files are set aside —
 * kept, not sent — until a model that takes them is picked again. `+` opens the media picker
 * on Uploads (its first tile uploads), `@` (the button or one typed) on Elements. Every file
 * uploaded here is also kept on disk for the Uploads tab (`uploadMedia`). The reference tokens in
 * the prompt (`@image1`) sit on chips drawn behind the textarea, numbered like the thumbnails;
 * the text itself, and what is sent, is unchanged.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AtSign, ImagePlus, Loader2, Plus, Ratio, Scaling, Timer, Undo2, Wand2, X } from 'lucide-react'
import { studioApi, type ModelCategory, type ModelDefinition, type Ref, type RefKind } from './api.ts'
import { AdvancedPill } from './fields.tsx'
import { familySummary, familyTakes, featuredFirst, accepts } from './families.ts'
import { primaryRefFields, promptFieldOf, useGenerator, type Counts } from './generator.ts'
import { useHandoff } from './handoff.ts'
import type { JobMeta } from './jobs.ts'
import { MentionPicker, type Pick } from './Mentions.tsx'
import { hostForKie, insertMentionToken, kindOfMedia, mentionFor, promptSegments, stripMentions, type MentionRef } from './mentions.ts'
import { elementRefs, uploadHosted, uploadMedia, type Element } from './library.ts'
import type { ModelClass } from './presets.ts'
import { ControlPill, GoButton, IconPill, Popover, RowPick, Stepper, type Choice } from './parts.tsx'
import { useEstimate } from './estimate.ts'
import { loadDraft, saveDraft } from './draft.ts'

export interface ComposerProps {
  /** The surface it sits on: tags its jobs, and is the handoff mailbox it reads. */
  surface: string
  category: ModelCategory
  /** Which kind of model to open on; the picker can still be changed by hand. */
  klass: ModelClass
  inline?: boolean
  placeholder?: string
  /** Parameters a preset locks; they win over the pills. */
  locked?: Record<string, unknown>
  /** Text to seed the box with (a preset's recipe, say). */
  seed?: string
  filter?: (m: ModelDefinition) => boolean
  /** Stamped on every job it starts (a project id, a preset's name). */
  meta?: Partial<JobMeta>
  /** Extra controls at the start of the pill row (Cinema's camera pills). */
  before?: ReactNode
  /** Wraps the prompt just before sending — Cinema adds its camera wording this way. */
  dress?: (prompt: string) => string
  onSubmitted?: (jobIds: string[]) => void
  initialCount?: number
  /** References to start with (Marketing's product, Cinema's still), already Kie-hosted. */
  initialRefs?: Ref[]
  /** Where the prompt, settings and attachments are remembered across reloads; defaults to the surface. */
  draftKey?: string
  /** Told whenever the attached references change (Cinema's References n/max pill). */
  onRefsChange?: (refs: Ref[]) => void
  /**
   * Typing `#` opens this list (Cinema's camera moves, as theirs does). Picking one either
   * hands it to `onHashPick` — the `#word` typed is removed — or, without it, writes the
   * item's `insert` text in its place.
   */
  hashItems?: { label: string; insert: string }[]
  onHashPick?: (label: string) => void
  preferModel?: RegExp
}

const ICONS = { aspect: Ratio, resolution: Scaling, duration: Timer } as const

const countsOf = (refs: Ref[]): Counts => {
  const c: Counts = {}
  for (const r of refs) c[r.kind] = (c[r.kind] ?? 0) + 1
  return c
}

const kindOfFile = (f: File): RefKind => (f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : 'image')

// Asked once per page: the prompt helper is a local CLI that may not be installed.
let enhanceAvailable: Promise<boolean> | null = null
const canEnhance = () => (enhanceAvailable ??= studioApi.enhanceStatus().then((s) => s.available).catch(() => false))

export function Composer({ surface, category, klass, inline, placeholder = 'Describe what you want to make…', locked, seed, filter, meta, before, dress, onSubmitted, initialCount, initialRefs, draftKey, onRefsChange, hashItems, onHashPick, preferModel }: ComposerProps) {
  const key = draftKey ?? surface
  const gen = useGenerator({ surface, category, klass, filter, locked, meta, initialCount, draftKey: key, preferModel })
  const [prompt, setPrompt] = useState(() => seed ?? loadDraft(key).prompt ?? '')
  const [refs, setRefs] = useState<MentionRef[]>(() => initialRefs ?? loadDraft(key).refs ?? [])
  useEffect(() => saveDraft(key, { prompt, refs }), [key, prompt, refs])
  useEffect(() => {
    onRefsChange?.(refs)
    // Fires on reference changes only, not on a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs])

  // The `#word` being typed at the caret, while the # menu is open.
  const [hash, setHash] = useState<{ start: number; query: string } | null>(null)
  const [hashIndex, setHashIndex] = useState(0)
  const hashShown = hash && hashItems ? hashItems.filter((i) => i.label.toLowerCase().includes(hash.query.toLowerCase())).slice(0, 8) : []
  const readHash = (text: string, caretAt: number | null) => {
    if (!hashItems?.length || caretAt == null) return setHash(null)
    const m = /(^|\s)#([^\s#]*)$/.exec(text.slice(0, caretAt))
    setHash(m ? { start: caretAt - m[2].length - 1, query: m[2] } : null)
    setHashIndex(0)
  }
  const pickHash = (item: { label: string; insert: string }) => {
    if (!hash) return
    const end = hash.start + 1 + hash.query.length
    const fill = onHashPick ? '' : item.insert
    const next = prompt.slice(0, hash.start) + fill + prompt.slice(end)
    const cursor = hash.start + fill.length
    setPrompt(next)
    setHash(null)
    onHashPick?.(item.label)
    window.requestAnimationFrame(() => {
      box.current?.focus()
      box.current?.setSelectionRange(cursor, cursor)
    })
  }
  const [busyRef, setBusyRef] = useState(false)
  // The media picker, and what opened it: `+` (add) or `@` (the button, or one typed).
  const [picker, setPicker] = useState<'add' | 'mention' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [enhancing, setEnhancing] = useState(false)
  const [undo, setUndo] = useState<string | null>(null)
  const [enhanceOk, setEnhanceOk] = useState(false)
  const [dragging, setDragging] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const hl = useRef<HTMLDivElement>(null)
  // Where the caret was before the prompt lost focus to a button.
  const caret = useRef<number | null>(null)
  // Where an `@` was typed to open the picker; the first token picked takes its place.
  const typedAt = useRef<number | null>(null)

  useEffect(() => {
    if (seed !== undefined) setPrompt(seed)
  }, [seed])

  useEffect(() => {
    let live = true
    void canEnhance().then((ok) => live && setEnhanceOk(ok))
    return () => {
      live = false
    }
  }, [])

  const canRef = gen.family ? familyTakes(gen.family) : false
  /** Whether any variant of the family can take this kind of file. */
  const takes = (kind: RefKind) => (gen.family ? familyTakes(gen.family, kind) : false)
  // What this family can use; the rest stay attached for the next model that can.
  const live = useMemo(() => refs.filter((r) => takes(r.kind)), [refs, gen.family]) // eslint-disable-line react-hooks/exhaustive-deps
  const setAside = refs.length - live.length
  const counts = useMemo(() => countsOf(live), [live])
  const model = gen.variant(counts)
  const { shown } = gen.pillsFor(model)
  // A note about the last model ("works from text only…") is stale once another is picked.
  useEffect(() => setNote(null), [gen.family?.key])
  /** Whether one more file of this kind would find a field, on the variant it would switch to. */
  const canTake = (kind: RefKind) => {
    const target = gen.variant({ ...counts, [kind]: (counts[kind] ?? 0) + 1 })
    return Boolean(target && accepts(target, kind))
  }

  // Reuse / Use as reference / Animate from another surface.
  useHandoff(surface, (h) => {
    if (h.modelId) gen.chooseModel(h.modelId)
    if (h.prompt !== undefined) setPrompt(h.prompt)
    if (h.refs) setRefs(h.refs)
    if (h.values && h.modelId) {
      const target = gen.models?.find((m) => m.id === h.modelId)
      if (target) gen.restore(target, h.values)
    }
    window.requestAnimationFrame(() => box.current?.focus())
  }, Boolean(gen.models))

  const rememberCaret = () => {
    caret.current = box.current?.selectionStart ?? null
  }

  /**
   * Put the token in the prompt and leave the caret after it, ready to keep typing. An `@`
   * typed to open the picker is replaced by it (or just removed, for a model without tokens).
   */
  const writeToken = (token: string) => {
    const at = typedAt.current
    typedAt.current = null
    if (!token && at === null) return
    setPrompt((text) => {
      let current = text
      let from = caret.current
      if (at !== null && text[at] === '@') {
        current = text.slice(0, at) + text.slice(at + 1)
        from = at
      }
      if (!token) return current
      const { next, cursor } = insertMentionToken(current, token, from)
      caret.current = cursor
      window.requestAnimationFrame(() => {
        box.current?.focus()
        box.current?.setSelectionRange(cursor, cursor)
      })
      return next
    })
  }

  /**
   * Attach one hosted file. The token comes from the variant that will run once it is
   * attached — adding a first image is what turns a text-to-image pick into its
   * image-to-image sibling, and that sibling's field decides the token.
   */
  const attach = (url: string, kind: RefKind, current: MentionRef[], from?: string): MentionRef[] | null => {
    // Counted from `current`, not state: several files can be attached in one go.
    const after = countsOf(current.filter((r) => takes(r.kind)))
    after[kind] = (after[kind] ?? 0) + 1
    const target = gen.variant(after)
    if (!target || !accepts(target, kind)) {
      setNote(`${gen.family?.title ?? 'This model'} has nowhere to put ${kind === 'image' ? 'an image' : `a ${kind} clip`}.`)
      return null
    }
    const { token, accepted } = mentionFor(target, kind, current)
    if (!accepted) {
      setNote('This model has no room for another reference.')
      return null
    }
    writeToken(token)
    return [...current, from ? { url, kind, from } : { url, kind }]
  }

  /** Said instead of dropping a file on the floor when the model takes none. */
  const textOnly = `${gen.family?.title ?? 'This model'} works from text only, so it can't take a file. Pick a model that takes references to use one.`

  const addFiles = async (list: FileList | File[] | null) => {
    const files = list ? [...list] : []
    if (!files.length) return
    if (!canRef) {
      typedAt.current = null
      setNote(textOnly)
      return
    }
    setBusyRef(true)
    setNote(null)
    try {
      let current = refs
      for (const f of files) {
        // Kept on disk as well, so it shows up in the picker's Uploads tab next time.
        const { fileUrl } = await uploadMedia(f)
        const next = attach(fileUrl, kindOfFile(f), current)
        if (!next) break
        current = next
        setRefs(next)
      }
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      typedAt.current = null
      setBusyRef(false)
    }
  }

  /** A past result, re-hosted so Kie can fetch it, attached and named in the prompt. */
  const addMention = async ({ media, source, upload }: Pick) => {
    setPicker(null)
    setBusyRef(true)
    setNote(null)
    try {
      // An upload still has a fresh Kie link more often than not; a past result is re-hosted.
      const url = upload ? await uploadHosted(upload) : await hostForKie(media)
      const next = attach(url, kindOfMedia(media), refs, source)
      if (next) setRefs(next)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      typedAt.current = null
      setBusyRef(false)
    }
  }

  /** A saved Element: every one of its pictures, cover first, as references. */
  const addElement = async (el: Element) => {
    setPicker(null)
    setBusyRef(true)
    setNote(null)
    try {
      let current = refs
      for (const r of await elementRefs(el)) {
        const next = attach(r.url, 'image', current)
        if (!next) break
        current = next
      }
      setRefs(current)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      typedAt.current = null
      setBusyRef(false)
    }
  }

  /** Closed without a pick: a typed `@` stays as text, and typing carries on after it. */
  const closePicker = () => {
    setPicker(null)
    if (typedAt.current === null) return
    typedAt.current = null
    window.requestAnimationFrame(() => {
      box.current?.focus()
      if (caret.current !== null) box.current?.setSelectionRange(caret.current, caret.current)
    })
  }

  /** The picker's Upload tile: the computer's file chooser, as `+` used to open directly. */
  const uploadFromPicker = () => {
    setPicker(null)
    file.current?.click()
  }

  /** An `@` just typed at the start of a word opens the picker, as theirs does. */
  const readAt = (before: string, text: string, caretAt: number | null) => {
    if (!canRef || caretAt === null || text.length !== before.length + 1 || text[caretAt - 1] !== '@') return
    const startsWord = caretAt === 1 || /\s/.test(text[caretAt - 2] ?? '')
    const endsWord = caretAt === text.length || /\s/.test(text[caretAt] ?? '')
    if (!startsWord || !endsWord) return
    typedAt.current = caretAt - 1
    setPicker('mention')
  }

  const enhance = async () => {
    if (!prompt.trim() || enhancing) return
    setEnhancing(true)
    setNote(null)
    try {
      const { optimizedPrompt } = await studioApi.enhance(prompt, model?.id)
      setUndo(prompt)
      setPrompt(optimizedPrompt)
    } catch (e) {
      setNote(`Enhance failed: ${(e as Error).message}`)
    } finally {
      setEnhancing(false)
    }
  }

  // Tokens of set-aside files stay on screen but aren't sent as text to a model that can't take them.
  const asideKinds = [...new Set(refs.filter((r) => !takes(r.kind)).map((r) => r.kind))]
  const plain = asideKinds.length ? stripMentions(prompt, asideKinds) : prompt
  const sendPrompt = dress ? dress(plain) : plain
  const input = model ? gen.inputFor(model, sendPrompt, live) : null
  const blocker = gen.blocker(model, input, counts, plain)
  const estimate = useEstimate(model, input, gen.jobsPerPress(model))

  const go = () => {
    if (!model || !input || blocker) return
    setNote(null)
    // Submit first: `onSubmitted?.(gen.submit(...))` skips the submit itself when no
    // callback is passed, because `?.()` doesn't evaluate its arguments.
    const ids = gen.submit(model, input)
    onSubmitted?.(ids)
  }

  const familyChoices: Choice[] = featuredFirst(gen.families).map((f) => ({ value: f.key, label: f.title, sub: familySummary(f) }))
  const skip = model ? [promptFieldOf(model)?.name ?? '', ...gen.pillsFor(model).controls.owned, ...primaryRefFields(model).map((f) => f.name), ...Object.keys(locked ?? {})] : []
  const variantPick =
    gen.family && gen.family.members.length > 1 ? (
      <RowPick
        label="Variant"
        value={gen.preferred ?? ''}
        choices={[{ value: '', label: 'Automatic', sub: model?.title }, ...gen.family.members.map((m) => ({ value: m.id, label: m.title }))]}
        onPick={(v) => gen.setPreferred(v || null)}
      />
    ) : null

  const aside =
    setAside > 0
      ? canRef
        ? `${gen.family?.title ?? 'This model'} can't use ${setAside === 1 ? 'one of your references' : `${setAside} of your references`} — kept for a model that can.`
        : `${gen.family?.title ?? 'This model'} works from text only — your ${setAside === 1 ? 'reference is' : `${setAside} references are`} kept for a model that takes them.`
      : null
  // The prompt as text and tokens, for the chips behind the textarea.
  const segments = useMemo(() => (canRef ? promptSegments(prompt, counts) : []), [canRef, prompt, counts])
  const hasTokens = segments.some((s) => s.ref)
  const chipTitle = segments
    .filter((s) => s.ref)
    .map((s) => `${s.text} = ${s.ref!.kind === 'image' ? 'Image' : s.ref!.kind === 'video' ? 'Video' : 'Audio'} ${s.ref!.n}${s.ref!.attached ? '' : ' (not attached)'}`)
    .join(' · ')
  const message = note ?? (gen.error ? `Models unavailable: ${gen.error}` : (prompt.trim() || live.length ? blocker : null) ?? aside)

  return (
    <div
      className={`st-composer pl-panel ${inline ? 'is-inline' : ''} ${dragging ? 'is-drop' : ''}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return
        // Taken even by a text-only model, so the browser doesn't open the file instead.
        e.preventDefault()
        if (canRef) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        setDragging(false)
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        void addFiles(e.dataTransfer.files)
      }}
    >
      <div className="st-composer-top">
        {canRef && (
          <div className="st-refs">
            {refs.map((ref, i) =>
              takes(ref.kind) ? (
                <span key={`${ref.url}-${i}`} className="st-ref" title={`${ref.kind === 'image' ? 'Image' : ref.kind === 'video' ? 'Video' : 'Audio'} ${refs.slice(0, i + 1).filter((r) => r.kind === ref.kind && takes(r.kind)).length}`}>
                  {ref.kind === 'image' ? <img src={ref.url} alt="" /> : <span className="st-ref-kind">{ref.kind === 'video' ? 'Clip' : 'Audio'}</span>}
                  {/* Numbered like the prompt's chips: the second image here is @image2 there. */}
                  <span className="st-ref-n" aria-hidden="true">
                    {refs.slice(0, i + 1).filter((r) => r.kind === ref.kind && takes(r.kind)).length}
                  </span>
                  <button type="button" className="st-ref-x" aria-label="Remove reference" onClick={() => setRefs(refs.filter((_, n) => n !== i))}>
                    <X size={10} />
                  </button>
                </span>
              ) : null,
            )}
            <button type="button" className="st-ref st-ref-drop" title="Add a reference (or drop / paste one)" onClick={() => file.current?.click()}>
              {busyRef ? <Loader2 size={16} className="st-spin" /> : <ImagePlus size={16} />}
            </button>
            <input
              ref={file}
              type="file"
              accept="image/*,video/*,audio/*"
              multiple
              hidden
              onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </div>
        )}
        <div className="st-prompt-wrap">
        {/* The `@Image 1` chips: the same characters drawn behind the textarea, the tokens on a chip,
            so typing and the caret are the textarea's own. */}
        {hasTokens && (
          <div ref={hl} className="st-prompt st-prompt-hl" aria-hidden="true">
            {segments.map((s, i) =>
              s.ref ? (
                <span key={i} className={`st-prompt-chip ${s.ref.attached ? '' : 'is-missing'}`}>
                  {s.text}
                </span>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
            {'​'}
          </div>
        )}
        <textarea
          ref={box}
          className={`st-prompt ${hasTokens ? 'has-chips' : ''}`}
          title={hasTokens ? chipTitle : undefined}
          onScroll={(e) => {
            if (hl.current) hl.current.scrollTop = e.currentTarget.scrollTop
          }}
          placeholder={placeholder}
          value={prompt}
          rows={2}
          onChange={(e) => {
            typedAt.current = null
            readAt(prompt, e.target.value, e.target.selectionStart)
            setPrompt(e.target.value)
            setUndo(null)
            rememberCaret()
            readHash(e.target.value, e.target.selectionStart)
          }}
          onKeyUp={rememberCaret}
          onBlur={rememberCaret}
          onClick={rememberCaret}
          onPaste={(e) => {
            const pasted = [...e.clipboardData.files]
            if (!pasted.length) return
            // A text-only model: a picture with no text alongside it gets the plain-words note.
            if (!canRef && e.clipboardData.getData('text')) return
            e.preventDefault()
            void addFiles(pasted)
          }}
          onKeyDown={(e) => {
            if (hash && hashShown.length) {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                setHashIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : hashShown.length - 1)) % hashShown.length)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                pickHash(hashShown[hashIndex] ?? hashShown[0])
                return
              }
              if (e.key === 'Escape') {
                setHash(null)
                return
              }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go()
          }}
        />
        {hash && hashShown.length > 0 && (
          <Popover onClose={() => setHash(null)}>
            {hashShown.map((item, i) => (
              <button key={item.label} type="button" className={`st-pop-item ${i === hashIndex ? 'is-on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => pickHash(item)}>
                <span>#</span>
                <span>{item.label}</span>
              </button>
            ))}
          </Popover>
        )}
        </div>
      </div>

      <div className="st-composer-controls">
        {/* A text-only model has nowhere to put a reference: like theirs, the two buttons
            go rather than sit there disabled. */}
        {canRef && (
          <div style={{ position: 'relative', display: 'flex', gap: 'inherit' }}>
            <IconPill icon={Plus} title="Add a reference: upload, or pick from your work" on={picker === 'add'} onClick={() => (picker ? closePicker() : setPicker('add'))} />
            <IconPill icon={AtSign} title="Mention something you already made (or type @)" on={picker === 'mention'} onClick={() => (picker ? closePicker() : setPicker('mention'))} />
            {picker && (
              <MentionPicker
                model={model}
                canTake={canTake}
                refs={refs}
                onPick={(p) => void addMention(p)}
                onPickElement={(el) => void addElement(el)}
                onUpload={uploadFromPicker}
                onClose={closePicker}
                initialTab={picker === 'add' ? 'uploads' : 'elements'}
              />
            )}
          </div>
        )}
        {before}
        <ControlPill
          label="Model"
          value={gen.family?.key ?? ''}
          choices={familyChoices.length ? familyChoices : [{ value: '', label: gen.models ? 'No models' : 'Loading…' }]}
          onPick={gen.chooseFamily}
          wide
          search
          disabled={!gen.models}
        />
        {shown.map(({ pill, value }) => (
          <ControlPill key={pill.key} value={value} choices={pill.choices} onPick={(v) => gen.setPill(pill.key, v)} icon={ICONS[pill.key as keyof typeof ICONS]} label={pill.field.label} />
        ))}
        {gen.maxCount(model) > 1 && <Stepper value={Math.min(gen.count, gen.maxCount(model))} max={gen.maxCount(model)} onChange={gen.setCount} />}
        {model && <AdvancedPill model={model} values={gen.values} onChange={gen.setValue} skip={skip} extra={variantPick} />}
        {enhanceOk && (
          <IconPill
            icon={enhancing ? Loader2 : undo !== null ? Undo2 : Wand2}
            title={undo !== null ? 'Undo enhance' : 'Enhance the prompt'}
            disabled={enhancing || (!prompt.trim() && undo === null)}
            onClick={() => {
              if (undo !== null) {
                setPrompt(undo)
                setUndo(null)
              } else void enhance()
            }}
          />
        )}
        <GoButton credits={estimate?.credits ?? null} disabled={Boolean(blocker) || !model || busyRef} onClick={go} title={estimate?.detail} />
      </div>

      {message && <p className="st-message">{message}</p>}
    </div>
  )
}
