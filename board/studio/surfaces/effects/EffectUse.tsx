/**
 * An effect's form, as the reference app's `/effects/use/<slug>`: the rail is the effect's card (its
 * name over your newest result, with Change), the picture it works from, a Prompt switch
 * (off: the picture speaks for itself; on: extra direction), Resolution and Aspect Ratio, and
 * Generate with its live cost. The model is the recipe's class's best (api.ts `pickModel`),
 * changeable under "Model" for when a different one is wanted.
 *
 * Built on the same generator as every other rail (generator.ts), so the picture flips a
 * text-to-video pick to its image-to-video sibling, the recipe's locked parameters win, and
 * Generate queues. The recipe wraps the typed words on the way out (`applyPreset`); the
 * canvas is the shared History feed narrowed to this effect's results, and before there are
 * any it shows how the effect works in three steps.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AtSign, History as HistoryIcon, Image as ImageIcon, Info, Loader2, MapPin, Package, RefreshCw, SlidersHorizontal, UserRound, Video, Wand2, X } from 'lucide-react'
import type { HistoryItem, Ref } from '../../api.ts'
import { useEstimate } from '../../estimate.ts'
import { familySummary, featuredFirst } from '../../families.ts'
import { useGenerator, type Counts } from '../../generator.ts'
import { useJobs, type Job } from '../../jobs.ts'
import { MentionPicker } from '../../Mentions.tsx'
import { hostForKie, kindOfMedia } from '../../mentions.ts'
import { elementRefs, uploadMedia } from '../../library.ts'
import { Empty, GoButton, RowPick, SlotTile, TabBar } from '../../parts.tsx'
import { RailCanvas, fieldForSlot, type SlotSpec } from '../../RailStudio.tsx'
import { loadDraft, saveDraft } from '../../draft.ts'
import { applyPreset, categoryOf, groupLabel, jobOfRecipe, lockedLabels, presetKind, presetTag, recipeOfItem, recipeResults, type Preset, type PresetSlot } from '../../presets.ts'
import { trackJobs } from '../track.ts'
import { EffectCover } from './EffectCover.tsx'
import { loadPrompt, savePrompt, useEffectIndex } from './data.ts'
import { goEffect } from './route.ts'

/** The recipe's inputs as rail tiles. The start frame is the reference app's "Image". */
const SLOTS: Record<PresetSlot, SlotSpec> = {
  frame: { id: 'frame', icon: ImageIcon, title: 'Image', sub: 'Select a PNG or JPG from your device', role: 'first', optional: true, wide: true },
  end: { id: 'end', icon: ImageIcon, title: 'End frame', sub: 'Optional — where the shot lands', role: 'last', optional: true },
  character: { id: 'character', icon: UserRound, title: 'Character', sub: 'Select a PNG or JPG from your device', optional: true },
  location: { id: 'location', icon: MapPin, title: 'Location', optional: true },
  product: { id: 'product', icon: Package, title: 'Product', sub: 'Select a PNG or JPG from your device', optional: true, wide: true },
  video: { id: 'video', icon: Video, title: 'Video', wide: true, kind: 'video' },
}

export function EffectUse({ preset }: { preset: Preset }) {
  const kind = presetKind(preset)
  const category = categoryOf(preset)
  // One draft per kind of effect: the model, its settings and the picture carry from one
  // effect to the next (Change keeps your photo); the prompt is each effect's own.
  const draftKey = `effects.${kind}`
  const gen = useGenerator({ surface: 'effects', category, klass: preset.modelClass, locked: preset.params, meta: { label: preset.title }, initialCount: 1, draftKey })
  const slots = useMemo(() => (preset.slots ?? []).map((s) => SLOTS[s]), [preset.slots])

  const [uploads, setUploads] = useState<Record<string, Ref>>(() => {
    const saved = loadDraft(draftKey).slots ?? {}
    return Object.fromEntries(Object.entries(saved).filter(([id]) => slots.some((s) => s.id === id)))
  })
  // Merged with what other effects of this kind left, so one effect never wipes another's tile.
  useEffect(() => saveDraft(draftKey, { slots: { ...(loadDraft(draftKey).slots ?? {}), ...uploads } }), [draftKey, uploads])
  const [prompt, setPrompt] = useState(() => loadPrompt(preset.id, !slots.length))
  useEffect(() => savePrompt(preset.id, prompt), [preset.id, prompt])

  const [busySlot, setBusySlot] = useState<string | null>(null)
  const [libraryFor, setLibraryFor] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const picking = useRef<string | null>(null)
  const file = useRef<HTMLInputElement>(null)

  const counts = useMemo(() => {
    const c: Counts = {}
    for (const r of Object.values(uploads)) c[r.kind] = (c[r.kind] ?? 0) + 1
    return c
  }, [uploads])
  const model = gen.variant(counts)
  const words = prompt.on ? prompt.text : ''
  const sent = applyPreset(preset, words)

  const setSlot = (id: string, ref: Ref | null) =>
    setUploads((u) => {
      const next = { ...u }
      if (ref) next[id] = ref
      else delete next[id]
      return next
    })
  // A slot that was cleared must not come back from the merged draft.
  const clearSlot = (id: string) => {
    setSlot(id, null)
    const saved = { ...(loadDraft(draftKey).slots ?? {}) }
    delete saved[id]
    saveDraft(draftKey, { slots: saved })
  }

  const uploadTo = async (id: string, f: File | undefined) => {
    if (!f) return
    setBusySlot(id)
    setNote(null)
    try {
      const { fileUrl } = await uploadMedia(f)
      setSlot(id, { url: fileUrl, kind: slots.find((s) => s.id === id)?.kind ?? 'image' })
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusySlot(null)
    }
  }

  const input = model
    ? (() => {
        // Named slots (the start frame) claim their field; the rest go in as references.
        const fields: Record<string, string[]> = {}
        const refs: Ref[] = []
        for (const s of slots) {
          const ref = uploads[s.id]
          if (!ref) continue
          const target = fieldForSlot(s, model, ref.kind)
          if (target) (fields[target.name] ??= []).push(ref.url)
          else refs.push(ref)
        }
        return gen.inputFor(model, sent, refs, fields)
      })()
    : null
  const blocker = gen.blocker(model, input, counts, sent)
  const estimate = useEstimate(model, input, gen.jobsPerPress(model))

  const go = () => {
    if (!model || !input || blocker) return
    setNote(null)
    const ids = gen.submit(model, input)
    // Recorded under the effect's tag as each job gets its task id: its History and cover.
    trackJobs(ids, presetTag(preset.id))
  }

  // Resolution and Aspect Ratio, as theirs; a length the recipe doesn't lock shows too.
  const locks = lockedLabels(preset.params)
  const lockedAspect = preset.params && (preset.params.aspect_ratio ?? preset.params.aspectRatio ?? preset.params.ratio)
  const { shown } = gen.pillsFor(model)
  const pill = (key: 'resolution' | 'aspect' | 'duration') => shown.find((s) => s.pill.key === key)
  const rows: ReactNode[] = []
  const res = pill('resolution')
  if (res) rows.push(<RowPick key="res" label="Resolution" value={res.value} choices={res.pill.choices} onPick={(v) => gen.setPill('resolution', v)} />)
  const asp = pill('aspect')
  if (asp)
    rows.push(
      lockedAspect !== undefined ? (
        <RowPick key="asp" label="Aspect Ratio" value={String(lockedAspect)} choices={[{ value: String(lockedAspect), label: String(lockedAspect) }]} onPick={() => {}} disabled />
      ) : (
        <RowPick key="asp" label="Aspect Ratio" value={asp.value} choices={asp.pill.choices} onPick={(v) => gen.setPill('aspect', v)} />
      ),
    )
  // Theirs opens on 9:16. Once per kind of effect, the first time a model offers it; after
  // that the aspect is whatever you last picked (the generator remembers it per model).
  const aspField = asp?.pill.field.name
  useEffect(() => {
    if (!asp || lockedAspect !== undefined || !asp.pill.choices.some((c) => c.value === '9:16')) return
    if (firstAspectDone(kind)) return
    gen.setPill('aspect', '9:16')
    // Only when a model with an aspect first shows up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspField])
  const dur = pill('duration')
  if (dur && preset.params?.duration === undefined) rows.push(<RowPick key="dur" label="Duration" value={dur.value} choices={dur.pill.choices} onPick={(v) => gen.setPill('duration', v)} />)

  const { items, byTask, covers } = useEffectIndex()
  const cover = covers.get(preset.id) ?? null
  const jobs = useJobs()
  const mine = (j: Job) => j.meta.surface === 'effects' && jobOfRecipe(j, preset)
  const hasAny = jobs.some(mine) || recipeResults(items, preset.id, byTask).length > 0
  const historyFilter = useCallback((item: HistoryItem) => recipeOfItem(item, byTask) === preset.id, [byTask, preset.id])
  const explain = <HowItWorks preset={preset} slots={slots} />

  const renderSlot = (s: SlotSpec) => {
    const ref = uploads[s.id]
    return (
      <div
        key={s.id}
        className={`st-slot-wrap ${s.wide ? 'is-wide' : ''}`}
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
          title={s.title}
          sub={s.sub}
          optional={s.optional}
          wide={s.wide}
          thumb={ref && ref.kind === 'image' ? ref.url : null}
          onPick={() => {
            picking.current = s.id
            file.current?.click()
          }}
        />
        {ref && ref.kind !== 'image' && <span className="st-slot-file">Clip attached</span>}
        {busySlot === s.id && <Loader2 size={14} className="st-spin st-slot-busy" />}
        <span className="st-slot-tools">
          <button type="button" className="st-slot-tool" title="Pick from your work" onClick={() => setLibraryFor(libraryFor === s.id ? null : s.id)}>
            <AtSign size={12} />
          </button>
          {ref && (
            <button type="button" className="st-slot-tool" title="Remove" onClick={() => clearSlot(s.id)}>
              <X size={12} />
            </button>
          )}
        </span>
        {libraryFor === s.id && (
          <MentionPicker
            model={null}
            kind={s.kind ?? 'image'}
            placement="down"
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
    <div className="st-split ef-use">
      <aside className="st-rail">
        <div className="st-card ef-rail-card">
          <EffectCover id={preset.id} title={preset.title} kicker={groupLabel(preset.group)} cover={cover} play="always" compact />
          <button type="button" className="st-card-change" onClick={() => goEffect({ level: 'home' })} title="Choose another effect">
            <RefreshCw size={11} />
            Change
          </button>
        </div>
        <button type="button" className="ef-rail-about" onClick={() => goEffect({ level: 'page', id: preset.id })}>
          {preset.note ?? preset.title}
          {locks.length ? ` · ${locks.join(' · ')}` : ''}
        </button>

        {slots.length > 0 && <div className="st-slots">{slots.map(renderSlot)}</div>}
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/webp,video/*"
          hidden
          onChange={(e) => {
            if (picking.current) void uploadTo(picking.current, e.target.files?.[0])
            e.target.value = ''
          }}
        />

        <div className="ef-line">
          <span className="ef-line-label">Prompt</span>
          <span className="ef-line-value">{prompt.on ? 'On' : 'Off'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={prompt.on}
            aria-label="Prompt"
            className={`st-switch ${prompt.on ? 'is-on' : ''}`}
            onClick={() => setPrompt((p) => ({ ...p, on: !p.on }))}
          >
            <span />
          </button>
        </div>
        {prompt.on && (
          <label className="st-field ef-prompt">
            <textarea
              rows={4}
              autoFocus={!prompt.text}
              placeholder="Who or what it is applied to, and any detail — the effect's recipe is added for you"
              value={prompt.text}
              onChange={(e) => setPrompt((p) => ({ ...p, text: e.target.value }))}
            />
          </label>
        )}

        {rows.length > 0 && <div className="st-row-grid ef-rows">{rows}</div>}

        <details className="ef-more">
          <summary>
            <SlidersHorizontal size={12} />
            Model <span className="ef-more-value">{gen.family?.title ?? (gen.models ? 'None' : 'Loading…')}</span>
          </summary>
          <RowPick
            label="Model"
            value={gen.family?.key ?? ''}
            choices={gen.families.length ? featuredFirst(gen.families).map((f) => ({ value: f.key, label: f.title, sub: familySummary(f) })) : [{ value: '', label: gen.models ? 'No models' : 'Loading…' }]}
            onPick={gen.chooseFamily}
            search
          />
          {model && <p className="sp-hint">Runs on {model.title}.</p>}
          <details className="sp-recipe">
            <summary>What will be sent</summary>
            <p>{sent}</p>
          </details>
        </details>

        <div className="st-rail-foot">
          {(note || (blocker && (prompt.text.trim() || Object.keys(uploads).length > 0))) && <p className="st-note">{note ?? blocker}</p>}
          <div className="st-rail-go">
            <GoButton label="Generate" credits={estimate?.credits ?? null} title={estimate?.detail} disabled={Boolean(blocker) || !model || busySlot !== null} wide onClick={go} />
          </div>
        </div>
      </aside>

      {hasAny ? (
        <RailCanvas
          surface="effects"
          category={category}
          explain={explain}
          historyFilter={historyFilter}
          jobFilter={(j) => jobOfRecipe(j, preset)}
          emptyTitle={preset.title}
          emptySub="Nothing made with this effect matches yet."
        />
      ) : (
        <FirstRunCanvas explain={explain} />
      )}
    </div>
  )
}

/** True when this kind of effect has had its first-visit aspect already; marks it done either way. */
function firstAspectDone(kind: string): boolean {
  const key = `studio.effects.aspect-set.${kind}`
  try {
    if (window.localStorage.getItem(key)) return true
    window.localStorage.setItem(key, '1')
  } catch {
    // Storage off: nothing is remembered anyway, so each visit opens on 9:16.
  }
  return false
}

/** The canvas before an effect's first run: History says so, How it works shows the steps. */
function FirstRunCanvas({ explain }: { explain: ReactNode }) {
  const [tab, setTab] = useState<'history' | 'how'>('history')
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
      </div>
      <div className="st-canvas-body">
        {tab === 'how' ? (
          explain
        ) : (
          <>
            {explain}
            <Empty icon={HistoryIcon} title="No history yet" sub="Your first result appears here, and becomes this effect's cover on the Effects page." />
          </>
        )}
      </div>
    </section>
  )
}

/** the reference app's how-it-works, as three still steps (no demo clips: nothing is generated to make them). */
function HowItWorks({ preset, slots }: { preset: Preset; slots: SlotSpec[] }) {
  const first = slots[0]
  const steps = [
    {
      icon: first?.icon ?? Info,
      title: first ? `Add ${first.title === 'Image' ? 'an image' : `a ${first.title.toLowerCase()}`}` : 'Describe it',
      sub: first ? 'A PNG or JPG from your device, or @ to pick from your work. The Prompt switch adds extra direction.' : 'Turn on Prompt and say who or what it is for.',
    },
    { icon: SlidersHorizontal, title: 'Pick aspect and resolution', sub: 'Resolution and Aspect Ratio as the model offers them; the recipe locks the rest.' },
    { icon: Wand2, title: 'Generate', sub: `${preset.title} is wrapped around your input on the way out. The result lands in History.` },
  ]
  return (
    <ol className="ef-how">
      {steps.map((s, i) => {
        const Icon = s.icon
        return (
          <li key={s.title} className="ef-how-step">
            <span className="ef-how-num">{i + 1}</span>
            <span className="ef-how-icon">
              <Icon size={18} />
            </span>
            <span className="ef-how-title">{s.title}</span>
            <span className="ef-how-sub">{s.sub}</span>
          </li>
        )
      })}
    </ol>
  )
}
