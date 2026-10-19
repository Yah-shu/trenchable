/**
 * Their archetype B: a left rail you fill in, a right pane that shows what came back.
 * Video, Audio, Effects, Influencer and the tool modes are all this component with a
 * different config.
 *
 * Built on the same generator as the composer (generator.ts), so the rail's rows are
 * the model's own options, a first frame flips a text-to-video pick to its
 * image-to-video sibling, and Generate queues — the canvas shows every job from this
 * surface as it runs, then its result.
 *
 * The canvas bar carries the reference app's Filter and View (FeedBar.tsx): the feed shows as a
 * grid of tiles or as a List — one large card per job with its panel (prompt, refs,
 * settings, Rerun) — which is how Video opens, like theirs. The canvas is its own
 * component (`RailCanvas`) so a surface can show the same feed beside a rail of its own
 * (Video's Edit tool list), or replace it outright (`canvas`).
 *
 * Video's Create rail adds what theirs has: a references grid that grows a tile at a time
 * (`group` slots, cited @Image 1 / @Video 1), an `@ Elements` and an Audio On/Off chip
 * under the prompt, and the duration as a slider when the model's length is a range.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { AtSign, ChevronDown, History as HistoryIcon, Info, ListFilter, Loader2, Volume2, VolumeX, X, type LucideIcon } from 'lucide-react'
import { isDone, recentFailures, useHistory, type HistoryItem, type ModelCategory, type ModelDefinition, type Ref, type RefKind } from './api.ts'
import { AdvancedSection } from './fields.tsx'
import { accepts, familySummary, featuredFirst } from './families.ts'
import { audioFieldOf, durationRange, roleField, type Pill } from './controls.ts'
import { primaryRefFields, promptFieldOf, useGenerator, type Counts } from './generator.ts'
import { useHandoff } from './handoff.ts'
import { hiddenFailures, isActive, useJobs, type Job, type JobMeta } from './jobs.ts'
import { FeedBar, useFeedPrefs } from './FeedBar.tsx'
import { activeFilters, clearFilters, feedDefaults, showFailure, showJob, showResult } from './feed.ts'
import { MentionPicker } from './Mentions.tsx'
import { hostForKie, kindOfMedia } from './mentions.ts'
import { elementRefs, uploadMedia } from './library.ts'
import type { ModelClass } from './presets.ts'
import { Empty, Field, GoButton, Popover, RowPick, SlotTile, Stepper, TabBar } from './parts.tsx'
import { FailedCard, FailedTile, JobCard, JobTile, ResultCard, ResultTile } from './tiles.tsx'
import { openViewer } from './viewer.ts'
import { Sentinel, useIncremental } from './incremental.tsx'
import { feedOrder } from './justified.ts'
import { JustifiedFeed } from './JustifiedFeed.tsx'
import { useEstimate } from './estimate.ts'
import { loadDraft, saveDraft } from './draft.ts'
// The prompt chips and the duration slider are styled with Video's rail pieces.
import './surfaces/video/video.css'

export interface SlotSpec {
  id: string
  icon: LucideIcon
  title: string
  sub?: string
  optional?: boolean
  wide?: boolean
  /** What this slot holds, so it reaches the right field on a multi-reference model. */
  kind?: RefKind
  /**
   * For slots that mean one particular field. Without it a slot is just "another
   * reference", which is right for a character or a product but wrong for a last frame.
   */
  role?: 'first' | 'last'
  /**
   * A named field this slot fills, for tools (`video_url`, `audio_url`, `mask_url`). A slot
   * that takes more than one kind (a references tile) names a field per kind.
   */
  field?: RegExp | Partial<Record<RefKind, RegExp>>
  /**
   * Slots sharing a group are one growing grid: the filled ones, then a single empty tile
   * to add the next. Filled tiles read as their citation, @Image 1 / @Video 1.
   */
  group?: string
}

export interface RowSpec {
  /** Which pill this row shows; its options come from the model, not from here. */
  key: 'aspect' | 'resolution' | 'duration'
  label: string
  /** Preferred starting value, used when the model offers it. */
  initial?: string
}

export interface RailStudioProps {
  surface: string
  category: ModelCategory
  klass: ModelClass
  /** Narrow the models on offer (a mode's lip-sync models, say). */
  filter?: (m: ModelDefinition) => boolean
  /** Shown above everything in the rail — a preset card, a tab bar, whatever the surface needs. */
  header?: ReactNode
  slots?: SlotSpec[]
  promptLabel?: string
  promptPlaceholder?: string
  /** Seeds the prompt box; changing it replaces what is there. */
  seed?: string
  /** Labels and order for the option rows; without it every option the model has is shown. */
  rows?: RowSpec[]
  locked?: Record<string, unknown>
  /** An extra reason Generate can't run yet, in plain words (Suno's lyric limits, say). */
  check?: (model: ModelDefinition, input: Record<string, unknown>, prompt: string) => string | null
  /** Told whenever the model that would run changes, so a header can follow it. */
  onModel?: (model: ModelDefinition | null) => void
  /** Hide slots the current model has no use for, instead of dimming them. */
  hideUnusableSlots?: boolean
  /** Friendly names for opaque enum values in Advanced settings (voice ids). */
  optionLabels?: Record<string, Record<string, string>>
  /** Copy for the right pane before anything has run. */
  emptyTitle?: string
  emptySub?: string
  /** The "How it works" tab's content. */
  explain?: ReactNode
  goLabel?: string
  meta?: Partial<JobMeta>
  /** Wraps the prompt just before sending (Effects adds its recipe this way). */
  dress?: (prompt: string) => string
  /** Which past results the History tab shows; defaults to this category. */
  historyFilter?: (item: HistoryItem) => boolean
  /** Prefill slots (a handoff can also fill them). */
  initialSlots?: Record<string, string>
  onSubmitted?: (jobIds: string[]) => void
  initialCount?: number
  /** Which running/failed jobs the canvas shows; defaults to every job from this surface. */
  jobFilter?: (job: Job) => boolean
  /** Extra buttons under a finished result (Influencer's "Save as character"). */
  tileActions?: (item: HistoryItem) => ReactNode
  /** Told whenever a slot is filled or cleared. */
  onSlotsChange?: (slots: Record<string, Ref>) => void
  /** Where the prompt, settings and slots are remembered across reloads; defaults to the surface. */
  draftKey?: string
  /** The model to open on (by id) before anything is picked or remembered. */
  preferModel?: RegExp
  /**
   * Replaces the whole right pane (History / How it works) with the surface's own —
   * Audio's dub editor, Video's "Soon" tools. The rail stays as it is.
   */
  canvas?: ReactNode
  /**
   * Which slots the open model family has a use for; the rest are hidden, and what they
   * hold stays put but is not sent (theirs keeps a ref for the models that take it).
   */
  showSlot?: (slot: SlotSpec, members: ModelDefinition[]) => boolean
  /** The prompt's `@ Elements` chip: a saved Element goes into the next free reference tile. */
  elementsChip?: boolean
  /** The prompt's Audio On/Off chip, for models with a sound switch. */
  audioChip?: boolean
  /** The prompt lives under Advanced settings instead of above the Model row (Motion Control). */
  promptInAdvanced?: boolean
  /** Extra controls after the option rows (Motion Control's Scene control). */
  extra?: (ctx: RailContext) => ReactNode
  /** Fields `extra` sets itself, so Advanced settings leaves them out. */
  owns?: (model: ModelDefinition) => string[]
}

/** What `extra` gets to work with. */
export interface RailContext {
  model: ModelDefinition | null
  values: Record<string, unknown>
  setValue: (name: string, value: unknown) => void
  models: ModelDefinition[] | null
  chooseModel: (id: string) => boolean
}

/** The field a slot fills on a model, for a file of this kind (a references tile takes several). */
export const fieldForSlot = (slot: SlotSpec, model: ModelDefinition, kind?: RefKind) => {
  const refFields = model.fields.filter((f) => f.type === 'reference')
  if (slot.field) {
    const res = slot.field instanceof RegExp ? [slot.field] : kind ? [slot.field[kind]].filter(Boolean) : Object.values(slot.field)
    for (const re of res as RegExp[]) {
      // A named slot may also mean a plain URL text field (Wan 2.7 Video Edit's reference_image).
      const hit = refFields.find((f) => re.test(f.name)) ?? model.fields.find((f) => f.type === 'string' && re.test(f.name))
      if (hit) return hit
    }
    return undefined
  }
  if (slot.role) return roleField(model, slot.role)
  return undefined
}

/** Which tiles of each growing group are on screen: every filled one, then one empty tile. */
export function visibleGroupSlots(slots: SlotSpec[], filled: (id: string) => boolean): Set<string> {
  const out = new Set<string>()
  const opened = new Set<string>()
  for (const s of slots) {
    if (!s.group) {
      out.add(s.id)
      continue
    }
    if (filled(s.id)) out.add(s.id)
    else if (!opened.has(s.group)) {
      opened.add(s.group)
      out.add(s.id)
    }
  }
  return out
}

/** "@Image 2" for the second picture in a group, in the order the model receives them. */
export function citationOf(slots: SlotSpec[], uploads: Record<string, Ref>, id: string): string | null {
  const me = slots.find((s) => s.id === id)
  const ref = uploads[id]
  if (!me?.group || !ref) return null
  const same = slots.filter((s) => s.group === me.group && uploads[s.id]?.kind === ref.kind)
  const n = same.findIndex((s) => s.id === id) + 1
  return `@${ref.kind === 'video' ? 'Video' : ref.kind === 'audio' ? 'Audio' : 'Image'} ${n}`
}

export function RailStudio({
  surface,
  category,
  klass,
  filter,
  header,
  slots = [],
  promptLabel = 'Prompt',
  promptPlaceholder = 'Describe what you want…',
  seed,
  rows,
  locked,
  emptyTitle = 'Nothing here yet',
  emptySub = 'Fill in the left, then generate.',
  explain,
  goLabel = 'Generate',
  meta,
  dress,
  historyFilter,
  initialSlots,
  check,
  onModel,
  hideUnusableSlots,
  optionLabels,
  onSubmitted,
  initialCount,
  jobFilter,
  tileActions,
  onSlotsChange,
  draftKey,
  preferModel,
  canvas,
  showSlot,
  elementsChip,
  audioChip,
  promptInAdvanced,
  extra,
  owns,
}: RailStudioProps) {
  const key = draftKey ?? surface
  const gen = useGenerator({ surface, category, klass, filter, locked, meta, initialCount, draftKey: key, preferModel })

  const [prompt, setPrompt] = useState(() => seed ?? loadDraft(key).prompt ?? '')
  const [uploads, setUploads] = useState<Record<string, Ref>>(() => {
    if (initialSlots) return Object.fromEntries(Object.entries(initialSlots).map(([id, url]) => [id, { url, kind: slots.find((s) => s.id === id)?.kind ?? 'image' }]))
    // Only slots this rail still has, so a remembered file never lands in the wrong tile.
    const saved = loadDraft(key).slots ?? {}
    return Object.fromEntries(Object.entries(saved).filter(([id]) => slots.some((s) => s.id === id)))
  })
  useEffect(() => saveDraft(key, { prompt, slots: uploads }), [key, prompt, uploads])
  const [busySlot, setBusySlot] = useState<string | null>(null)
  const [libraryFor, setLibraryFor] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const picking = useRef<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  // Surfaces that build the prompt from their own controls (Effects, Influencer) push a
  // new seed as you change them; uploads and model choice survive it.
  useEffect(() => {
    if (seed !== undefined) setPrompt(seed)
  }, [seed])

  useHandoff(surface, (h) => {
    if (h.modelId) gen.chooseModel(h.modelId)
    if (h.prompt !== undefined) setPrompt(h.prompt)
    if (h.slots) {
      setUploads((u) => {
        const next = { ...u }
        for (const [id, url] of Object.entries(h.slots!)) next[id] = { url, kind: slots.find((s) => s.id === id)?.kind ?? 'image' }
        return next
      })
    }
    if (h.values && h.modelId) {
      const target = gen.models?.find((m) => m.id === h.modelId)
      if (target) gen.restore(target, h.values)
    }
  }, Boolean(gen.models))

  // The slots the open family has a use for; a hidden one keeps its file but sends nothing.
  const members = gen.family?.members
  const live = useMemo(() => (showSlot && members ? slots.filter((s) => showSlot(s, members)) : slots), [slots, showSlot, members])
  const sent = useMemo(() => Object.fromEntries(Object.entries(uploads).filter(([id]) => live.some((s) => s.id === id))), [uploads, live])
  const counts = useMemo(() => {
    const c: Counts = {}
    for (const r of Object.values(sent)) c[r.kind] = (c[r.kind] ?? 0) + 1
    return c
  }, [sent])
  useEffect(() => {
    onSlotsChange?.(uploads)
    // Fires on slot changes only, not on a new callback identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads])
  /** True when every attached reference tile finds its field on this member. */
  const takesGroups = (m: ModelDefinition) => live.every((s) => !s.group || !sent[s.id] || Boolean(fieldForSlot(s, m, sent[s.id].kind)))
  const model = (() => {
    const base = gen.variant(counts)
    // Pictures in the references grid mean the family's reference member (Wan 2.7 R2V),
    // not the image-to-video one the attachment count alone would pick.
    if (!base || !gen.family || takesGroups(base) || (gen.preferred && base.id === gen.preferred)) return base
    return gen.family.members.find((m) => takesGroups(m) && live.every((s) => s.group || !sent[s.id] || !s.role || Boolean(fieldForSlot(s, m)))) ?? base
  })()
  const { shown } = gen.pillsFor(model)
  const rowsShown = rows ? rows.flatMap((r) => shown.filter((s) => s.pill.key === r.key).map((s) => ({ ...s, label: r.label }))) : shown.map((s) => ({ ...s, label: s.pill.field.label }))
  const hasPrompt = Boolean(model && promptFieldOf(model))
  const sound = audioChip ? audioFieldOf(model) : undefined
  const soundOn = sound ? (gen.values[sound.name] ?? sound.default ?? false) === true : false
  const groupOpen = visibleGroupSlots(live, (id) => Boolean(uploads[id]))
  // The tile an Element or a past picture goes into from the prompt's chip.
  const freeGroupSlot = live.find((s) => s.group && !uploads[s.id] && (!s.kind || s.kind === 'image'))
  const [elementsOpen, setElementsOpen] = useState(false)
  const insertCitation = (text: string) => text && setPrompt((p) => (p && !/\s$/.test(p) ? `${p} ${text} ` : `${p}${text} `))

  /** A slot is live when the variant that would run has somewhere to put it. */
  const usable = (slot: SlotSpec) => {
    if (!model) return true
    // A references tile is live when any member of the family reads that grid.
    if (slot.group) return gen.family?.members.some((m) => Boolean(fieldForSlot(slot, m, uploads[slot.id]?.kind))) ?? true
    if (slot.field || slot.role) {
      const after = { ...counts, [slot.kind ?? 'image']: (counts[slot.kind ?? 'image'] ?? 0) + (uploads[slot.id] ? 0 : 1) }
      const target = gen.variant(after)
      return Boolean(target && (fieldForSlot(slot, target) || accepts(target, slot.kind ?? 'image')))
    }
    return gen.family?.members.some((m) => accepts(m, slot.kind ?? 'image')) ?? true
  }

  const setSlot = (slotId: string, ref: Ref | null) =>
    setUploads((u) => {
      const next = { ...u }
      if (ref) next[slotId] = ref
      else delete next[slotId]
      return next
    })

  const uploadTo = async (slotId: string, f: File | undefined) => {
    if (!f) return
    setBusySlot(slotId)
    setNote(null)
    try {
      const { fileUrl } = await uploadMedia(f)
      const kind = slots.find((s) => s.id === slotId)?.kind ?? (f.type.startsWith('video') ? 'video' : f.type.startsWith('audio') ? 'audio' : 'image')
      setSlot(slotId, { url: fileUrl, kind })
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusySlot(null)
    }
  }

  const sendPrompt = dress ? dress(prompt) : prompt

  /** Slots to fields: named slots claim their field, the rest go in as references. */
  const route = (m: ModelDefinition) => {
    const fields: Record<string, string[]> = {}
    const refs: Ref[] = []
    for (const slot of live) {
      const ref = uploads[slot.id]
      if (!ref) continue
      const target = fieldForSlot(slot, m, ref.kind)
      // A references tile with nowhere to go on this model is left out, not sprayed into a frame field.
      if (slot.group && !target) continue
      // Several slots may feed one list field (two reference pictures); keep them all.
      if (target) (fields[target.name] ??= []).push(ref.url)
      else refs.push(ref)
    }
    return { fields, refs }
  }

  const input = model ? (() => {
    const { fields, refs } = route(model)
    return gen.inputFor(model, sendPrompt, refs, fields)
  })() : null
  const blocker = gen.blocker(model, input, counts, prompt) ?? (model && input && check ? check(model, input, prompt) : null)
  useEffect(() => {
    onModel?.(model)
    // Only a change of model matters, not each new function identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model?.id])
  const estimate = useEstimate(model, input, gen.jobsPerPress(model))

  const go = () => {
    if (!model || !input || blocker) return
    setNote(null)
    // Submit first: `onSubmitted?.(gen.submit(...))` skips the submit itself when no
    // callback is passed, because `?.()` doesn't evaluate its arguments.
    const ids = gen.submit(model, input)
    onSubmitted?.(ids)
  }

  const skip = model
    ? [
        promptFieldOf(model)?.name ?? '',
        ...gen.pillsFor(model).controls.owned,
        ...primaryRefFields(model).map((f) => f.name),
        ...slots.flatMap((s) => (s.field && !(s.field instanceof RegExp) ? (['image', 'video', 'audio'] as const).map((k) => fieldForSlot(s, model, k)?.name ?? '') : [fieldForSlot(s, model)?.name ?? ''])),
        ...Object.keys(locked ?? {}),
        ...(sound ? [sound.name] : []),
        ...(owns?.(model) ?? []),
      ]
    : []
  const ctx: RailContext = { model, values: gen.values, setValue: gen.setValue, models: gen.models, chooseModel: gen.chooseModel }
  const promptBox = hasPrompt && (
    <Field label={promptLabel} hint={<span className="st-field-count">{prompt.length}</span>}>
      <textarea rows={5} placeholder={promptPlaceholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
    </Field>
  )
  /** Puts a picked file in the next free references tile and cites it in the prompt. */
  const fillFree = (load: Promise<Ref | null>) => {
    const target = freeGroupSlot?.id
    if (!target) return
    setElementsOpen(false)
    setBusySlot(target)
    void load
      .then((ref) => {
        if (!ref) return
        setSlot(target, ref)
        insertCitation(citationOf(live, { ...uploads, [target]: ref }, target) ?? '')
      })
      .catch((e: unknown) => setNote((e as Error).message))
      .finally(() => setBusySlot(null))
  }
  const showElements = Boolean(elementsChip && freeGroupSlot)
  const chips = (showElements || sound) && (
    <div className="st-prompt-chips">
      {showElements && (
        <span style={{ position: 'relative' }}>
          <button type="button" className={`st-chip ${elementsOpen ? 'is-active' : ''}`} onClick={() => setElementsOpen((v) => !v)} title="Add a saved Element or a past result as a reference">
            <AtSign size={12} /> Elements
          </button>
          {elementsOpen && (
            <MentionPicker
              model={null}
              kind="image"
              placement="down"
              refs={Object.values(uploads)}
              onClose={() => setElementsOpen(false)}
              onPick={({ media }) => fillFree(hostForKie(media).then((url) => ({ url, kind: kindOfMedia(media) })))}
              onPickElement={(el) => fillFree(elementRefs(el).then((list) => (list[0] ? { url: list[0].url, kind: 'image' as const } : null)))}
            />
          )}
        </span>
      )}
      {sound && (
        <button type="button" className={`st-chip ${soundOn ? 'is-active' : ''}`} aria-pressed={soundOn} onClick={() => gen.setValue(sound.name, !soundOn)} title="Generate sound with the clip">
          {soundOn ? <Volume2 size={12} /> : <VolumeX size={12} />} Audio {soundOn ? 'On' : 'Off'}
        </button>
      )}
    </div>
  )
  const variantPick =
    gen.family && gen.family.members.length > 1 ? (
      <RowPick
        label="Variant"
        value={gen.preferred ?? ''}
        choices={[{ value: '', label: 'Automatic', sub: model?.title }, ...gen.family.members.map((m) => ({ value: m.id, label: m.title }))]}
        onPick={(v) => gen.setPreferred(v || null)}
      />
    ) : null

  const renderSlot = (s: SlotSpec) => {
    if (!groupOpen.has(s.id)) return null
    const usableNow = usable(s)
    const ref = uploads[s.id]
    if (!usableNow && hideUnusableSlots && !ref) return null
    const cite = citationOf(live, uploads, s.id)
    return (
      <div
        key={s.id}
        className={`st-slot-wrap ${s.wide ? 'is-wide' : ''} ${s.group ? 'is-ref' : ''} ${usableNow ? '' : 'is-idle'}`}
        // Theirs takes a frame by paste too: focus the tile, then Ctrl+V.
        onPaste={(e) => {
          const f = e.clipboardData.files?.[0]
          if (!f) return
          e.preventDefault()
          void uploadTo(s.id, f)
        }}
        onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
        onDrop={(e) => {
          const f = e.dataTransfer.files?.[0]
          if (!f) return
          e.preventDefault()
          void uploadTo(s.id, f)
        }}
      >
        <SlotTile
          icon={s.icon}
          title={cite ?? s.title}
          sub={usableNow ? s.sub : 'Not used by this model'}
          optional={s.optional}
          wide={s.wide}
          thumb={ref && ref.kind === 'image' ? ref.url : null}
          onPick={() => {
            picking.current = s.id
            file.current?.click()
          }}
        />
        {ref && ref.kind !== 'image' && <span className="st-slot-file">{ref.kind === 'video' ? 'Clip attached' : 'Audio attached'}</span>}
        {busySlot === s.id && <Loader2 size={14} className="st-spin st-slot-busy" />}
        <span className="st-slot-tools">
          <button type="button" className="st-slot-tool" title="Pick from your work" onClick={() => setLibraryFor(libraryFor === s.id ? null : s.id)}>
            <AtSign size={12} />
          </button>
          {ref && (
            <button type="button" className="st-slot-tool" title="Remove" onClick={() => setSlot(s.id, null)}>
              <X size={12} />
            </button>
          )}
        </span>
        {libraryFor === s.id && (
          <MentionPicker
            model={null}
            kind={s.kind ?? 'image'}
            refs={Object.values(uploads)}
            onClose={() => setLibraryFor(null)}
            onPick={({ media }) => {
              setLibraryFor(null)
              setBusySlot(s.id)
              void hostForKie(media)
                .then((url) => setSlot(s.id, { url, kind: kindOfMedia(media) }))
                .catch((e: unknown) => setNote((e as Error).message))
                .finally(() => setBusySlot(null))
            }}
            onPickElement={
              (s.kind ?? 'image') === 'image'
                ? (el) => {
                    // A slot holds one picture: the element's cover.
                    setLibraryFor(null)
                    setBusySlot(s.id)
                    void elementRefs(el)
                      .then((list) => list[0] && setSlot(s.id, { url: list[0].url, kind: 'image' }))
                      .catch((e: unknown) => setNote((e as Error).message))
                      .finally(() => setBusySlot(null))
                  }
                : undefined
            }
          />
        )}
      </div>
    )
  }

  return (
    <div className="st-split">
      <aside className="st-rail">
        {header}

        {live.some((s) => !s.group) && <div className="st-slots">{live.filter((s) => !s.group).map(renderSlot)}</div>}
        {live.some((s) => s.group) && (
          <div className="st-refgrid">
            <span className="st-field-label">References</span>
            <div className="st-refgrid-tiles">{live.filter((s) => s.group).map(renderSlot)}</div>
          </div>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*,video/*,audio/*"
          hidden
          onChange={(e) => {
            if (picking.current) void uploadTo(picking.current, e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {!promptInAdvanced && promptBox}
        {!promptInAdvanced && chips}

        <RowPick
          label="Model"
          value={gen.family?.key ?? ''}
          choices={gen.families.length ? featuredFirst(gen.families).map((f) => ({ value: f.key, label: f.title, sub: familySummary(f) })) : [{ value: '', label: gen.models ? 'No models' : 'Loading…' }]}
          onPick={gen.chooseFamily}
          search
        />

        {rowsShown.length > 0 && (
          <div className="st-row-grid">
            {rowsShown.map(({ pill, value, label }) =>
              durationRange(pill) ? (
                <DurationRow key={pill.key} label={label} pill={pill} value={value} onPick={(v) => gen.setPill(pill.key, v)} />
              ) : (
                <RowPick key={pill.key} label={label} value={value} choices={pill.choices} onPick={(v) => gen.setPill(pill.key, v)} />
              ),
            )}
          </div>
        )}

        {extra?.(ctx)}

        {model && (
          <AdvancedSection
            model={model}
            values={gen.values}
            onChange={gen.setValue}
            skip={skip}
            extra={
              promptInAdvanced && promptBox ? (
                <>
                  {promptBox}
                  {chips}
                  {variantPick}
                </>
              ) : (
                variantPick
              )
            }
            optionLabels={optionLabels}
          />
        )}

        <div className="st-rail-foot">
          {(note || ((prompt.trim() || Object.keys(uploads).length > 0) && blocker)) && <p className="st-note">{note ?? blocker}</p>}
          <div className="st-rail-go">
            <Stepper value={Math.min(gen.count, gen.maxCount(model))} max={gen.maxCount(model)} onChange={gen.setCount} />
            <GoButton label={goLabel} credits={estimate?.credits ?? null} title={estimate?.detail} disabled={Boolean(blocker) || !model || busySlot !== null} wide onClick={go} />
          </div>
        </div>
      </aside>

      {canvas !== undefined ? (
        canvas
      ) : (
        <RailCanvas surface={surface} category={category} emptyTitle={emptyTitle} emptySub={emptySub} explain={explain} historyFilter={historyFilter} jobFilter={jobFilter} tileActions={tileActions} />
      )}
    </div>
  )
}

export interface RailCanvasProps {
  surface: string
  category: ModelCategory
  emptyTitle?: string
  emptySub?: string
  explain?: ReactNode
  historyFilter?: (item: HistoryItem) => boolean
  jobFilter?: (job: Job) => boolean
  tileActions?: (item: HistoryItem) => ReactNode
}

/**
 * The right pane: History / How it works, Filter and View, then this surface's running and
 * failed jobs and its finished results. Exported so a surface whose rail is not a form
 * (Video's Edit tool list) shows the very same feed.
 */
export function RailCanvas({ surface, category, emptyTitle = 'Nothing here yet', emptySub = 'Fill in the left, then generate.', explain, historyFilter, jobFilter, tileActions }: RailCanvasProps) {
  const { items } = useHistory(category)
  const jobs = useJobs()
  const [tab, setTab] = useState<'history' | 'how'>('history')
  const [prefs, setPrefs] = useFeedPrefs(surface, feedDefaults(surface))
  // Audio rows keep their own shape: no List/Grid and no card size, just the filter.
  const audio = category === 'audio'
  const listView = !audio && prefs.layout === 'list'
  const queued = jobs.filter((j) => j.meta.surface === surface && (isActive(j) || j.status === 'error') && (!jobFilter || jobFilter(j)))
  const mine = queued.filter((j) => showJob(j, prefs))
  const feed = useMemo(() => (items ?? []).filter((i) => !historyFilter || historyFilter(i)), [items, historyFilter])
  const done = feed.filter((i) => isDone(i) && showResult(i, prefs))
  const page = useIncremental(done)
  // Hidden: failures a live tile already shows, and ones already retried or dismissed.
  const failed = recentFailures(feed, hiddenFailures(jobs)).filter((i) => showFailure(i, prefs))
  const filteredOut = activeFilters(prefs) > 0 && !mine.length && !done.length && !failed.length && (queued.length > 0 || feed.length > 0)
  const cardSize = { '--st-card': `${prefs.size}px` } as CSSProperties
  const open = (it: HistoryItem) => openViewer(it, done)

  return (
    <section className="st-canvas">
      <div className="st-canvas-bar">
        <TabBar
          tabs={[
            { id: 'history' as const, label: 'History' },
            { id: 'how' as const, label: 'How it works' },
          ]}
          value={tab}
          onPick={setTab}
        />
        <span className="st-canvas-tools">
          {queued.some(isActive) && <span className="st-pill-label">{queued.filter(isActive).length} running</span>}
          {tab === 'history' && <FeedBar prefs={prefs} onChange={setPrefs} items={feed} layouts={!audio} sizable={!audio} />}
        </span>
      </div>
      <div className="st-canvas-body">
        {tab === 'how' ? (
          explain ?? <Empty icon={Info} title="How it works" sub="Fill in the rail on the left and generate. Results land in History and in Assets." />
        ) : filteredOut ? (
          <Empty
            icon={ListFilter}
            title="Nothing matches the filter"
            sub="Widen the models, the dates or the toggles to see the rest."
            cta={
              <button type="button" className="vw-btn is-sm" onClick={() => setPrefs(clearFilters(prefs))}>
                Clear filters
              </button>
            }
          />
        ) : mine.length || done.length || failed.length ? (
          listView ? (
            <div className="st-lfeed" style={cardSize}>
              {mine.map((j) => (
                <JobCard key={j.id} job={j} />
              ))}
              {failed.map((item) => (
                <FailedCard key={item.taskId} item={item} />
              ))}
              {page.shown.map((item) => (
                <ResultCard key={item.taskId} item={item} onOpen={open} extra={tileActions?.(item)} />
              ))}
              {page.more && <Sentinel count={page.shown.length} onSeen={page.grow} />}
            </div>
          ) : !audio ? (
            <JustifiedFeed {...feedOrder({ jobs: mine, failed, done })} size={prefs.size} onOpen={open} tileActions={tileActions} />
          ) : (
            <div className="st-grid is-list">
              {mine.map((j) => (
                <JobTile key={j.id} job={j} />
              ))}
              {failed.map((item) => (
                <FailedTile key={item.taskId} item={item} />
              ))}
              {page.shown.map((item) =>
                tileActions ? (
                  <div key={item.taskId} className="st-tile-with-actions">
                    <ResultTile item={item} onOpen={open} />
                    <div className="st-tile-actions">{tileActions(item)}</div>
                  </div>
                ) : (
                  <ResultTile key={item.taskId} item={item} onOpen={open} />
                ),
              )}
              {page.more && <Sentinel count={page.shown.length} onSeen={page.grow} />}
            </div>
          )
        ) : (
          <Empty icon={HistoryIcon} title={emptyTitle} sub={emptySub} />
        )}
      </div>
    </section>
  )
}

/**
 * Duration as theirs has it when the model's length is a range: the row opens a popover
 * with a slider ("Choose duration"), so 4–30s is one drag instead of a 27-item list.
 */
function DurationRow({ label, pill, value, onPick }: { label: string; pill: Pill; value: string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const range = durationRange(pill)!
  const n = Number(value)
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="st-row" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>{label}</span>
        <span className="st-row-value">
          {Number.isFinite(n) ? `${n}s` : value}
          <ChevronDown size={13} />
        </span>
      </button>
      {open && (
        <Popover down onClose={() => setOpen(false)}>
          <div className="st-duration">
            <span className="st-duration-head">
              Choose duration <b>{Number.isFinite(n) ? `${n}s` : value}</b>
            </span>
            <input
              type="range"
              aria-label="Duration in seconds"
              min={range.min}
              max={range.max}
              step={range.step}
              value={Number.isFinite(n) ? n : range.min}
              onChange={(e) => onPick(e.target.value)}
            />
            <span className="st-duration-ends">
              <span>{range.min}s</span>
              <span>{range.max}s</span>
            </span>
          </div>
        </Popover>
      )}
    </div>
  )
}
