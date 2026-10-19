/**
 * The rail-and-canvas every Edit tool runs in.
 *
 * Archetype B like RailStudio, but built for working on one picture: the picture stays
 * put while you switch tool, the canvas shows it (with the tool's own stage — a brush, a
 * frame, a light) above that tool's results, and Generate may need a step before the job
 * goes out (upload a painted mask, pad the picture onto a bigger canvas). RailStudio's
 * Generate is synchronous and its canvas is history only, so the tools use the same
 * generator underneath (model families, pills, Advanced settings, the job queue) with
 * this view on top.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ImagePlus, Info, Repeat } from 'lucide-react'
import { isDone, useHistory, type HistoryItem, type ModelDefinition } from '../../api.ts'
import type { PillKey } from '../../controls.ts'
import { AdvancedSection } from '../../fields.tsx'
import { familyAbility } from '../../families.ts'
import { promptFieldOf, useGenerator } from '../../generator.ts'
import { isActive, submitJob, useJobs } from '../../jobs.ts'
import { hostForKie } from '../../mentions.ts'
import { Empty, Field, GoButton, RowPick, Stepper, TabBar } from '../../parts.tsx'
import { JobTile, ResultTile } from '../../tiles.tsx'
import { openViewer } from '../../viewer.ts'
import { useEstimate } from '../../estimate.ts'
import { nearestAspect } from './frame.ts'
import { ImageSlot, useNaturalSize } from './ImageSlot.tsx'
import type { SourceImage } from './pixels.ts'
import '../tools.css'

export interface ToolContext {
  model: ModelDefinition
  image: SourceImage
  prompt: string
  /** The model's picture field, already holding `image.url`. */
  imageField: string
}

export interface Prepared {
  /** Reference fields to fill (a mask, a padded picture in place of the original). */
  fields?: Record<string, string | string[]>
  /** The prompt to send instead of the dressed one. */
  prompt?: string
  /** Field values set last. */
  patch?: Record<string, unknown>
}

export interface ToolStudioProps {
  /** Shown on the job tiles and used to keep each tool's pending jobs apart. */
  label: string
  header: ReactNode
  image: SourceImage | null
  onImage: (img: SourceImage | null) => void
  filter: (m: ModelDefinition) => boolean
  /** Opening model, best first. */
  prefer: string[]
  /** The model's picture field. */
  imageField: RegExp
  imageTitle?: string
  prompt: 'none' | 'optional' | 'required'
  promptLabel?: string
  promptPlaceholder?: string
  /** Wraps the prompt before sending (and before the cost and checks see it). */
  dress?: (prompt: string, model: ModelDefinition) => string
  /** Values this tool sets on whatever model runs (an upscale factor, a ratio). */
  patch?: (model: ModelDefinition) => Record<string, unknown>
  /** Fields `prepare` will fill, so the checks don't call them missing. */
  promised?: (model: ModelDefinition) => Record<string, string>
  /** The step before submitting: upload a mask, pad the picture… */
  prepare?: (ctx: ToolContext) => Promise<Prepared>
  /** The tool's own reason Generate can't run yet, in plain words. */
  check?: (model: ModelDefinition, image: SourceImage) => string | null
  /** Tool controls under the picture. */
  controls?: (model: ModelDefinition | null) => ReactNode
  /** What the canvas shows above the results while a picture is loaded. */
  stage?: (image: SourceImage, model: ModelDefinition | null) => ReactNode
  hidePills?: PillKey[]
  /** Advanced fields this tool sets itself. */
  skipFields?: string[]
  /** Start the ratio pill at the picture's own shape. */
  matchAspect?: boolean
  /** Several takes per press make sense (not for an upscale). Off, one press is one job. */
  batch?: boolean
  /**
   * One job per prompt (Angles: one per angle picked). Given, Generate sends exactly these —
   * the count is not used — and the cost covers them all. The dressed prompt is passed in.
   */
  takes?: (prompt: string, model: ModelDefinition) => string[]
  /** What to say when `takes` has nothing to send. */
  noTakes?: string
  /**
   * Work done on this computer instead of a job (Reframe with Fill with AI off): the
   * rail drops the model settings and the buttons run these. The first is the main one.
   */
  offline?: { actions: { label: string; run: (image: SourceImage) => Promise<void> }[]; check?: (image: SourceImage) => string | null } | null
  history: (item: HistoryItem) => boolean
  goLabel?: string
  emptyTitle: string
  emptySub: string
  explain: ReactNode
}

const MAX_RESULTS = 60

export function ToolStudio(p: ToolStudioProps) {
  const gen = useGenerator({ surface: 'edit', category: 'image', klass: 'image-edit', filter: p.filter, meta: { label: p.label } })
  const { items } = useHistory('image')
  const jobs = useJobs()
  const [prompt, setPrompt] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<'history' | 'how'>('history')
  const aspectTouched = useRef(false)
  const picked = useRef(false)
  const { image, onImage } = p

  useNaturalSize(image, onImage)

  // Open on the model that does this best; after that the choice is yours.
  useEffect(() => {
    if (picked.current || !gen.families.length) return
    picked.current = true
    for (const id of p.prefer) if (gen.chooseModel(id)) break
  }, [gen.families]) // eslint-disable-line react-hooks/exhaustive-deps

  const model = gen.variant({ image: image ? 1 : 0 })
  const field = model?.fields.find((f) => f.type === 'reference' && p.imageField.test(f.name)) ?? null
  const { shown, controls } = gen.pillsFor(model)
  const rows = shown.filter((s) => !(p.hidePills ?? []).includes(s.pill.key))
  const hasPrompt = p.prompt !== 'none' && Boolean(model && promptFieldOf(model))

  // A picture edit should come back the shape it went in, unless you pick another.
  const ratio = image?.width && image.height ? image.width / image.height : null
  const aspectPill = controls.aspect
  useEffect(() => {
    if (!p.matchAspect || aspectTouched.current || !aspectPill || !ratio) return
    const best = nearestAspect(aspectPill.choices, ratio)
    if (best) gen.setPill('aspect', best)
  }, [model?.id, ratio, p.matchAspect]) // eslint-disable-line react-hooks/exhaustive-deps

  const dressed = model && p.dress ? p.dress(prompt, model) : prompt
  const takes = model && p.takes ? p.takes(dressed, model) : null
  // With takes, the first one stands in for all of them in the checks and the cost.
  const sendPrompt = takes ? (takes[0] ?? dressed) : dressed
  const patch = model && p.patch ? p.patch(model) : {}
  /** Jobs one press sends: one per take, one when batching is off, else the count. */
  const perPress = takes ? takes.length : p.batch === false ? 1 : gen.jobsPerPress(model)

  // Recomputed each render: it reads the generator's live values.
  const input = (() => {
    if (!model || !field) return null
    const fields: Record<string, string> = { ...(image ? { [field.name]: image.url } : {}), ...(p.promised?.(model) ?? {}) }
    const out = gen.inputFor(model, sendPrompt, [], fields)
    for (const [k, v] of Object.entries(patch)) if (model.fields.some((f) => f.name === k)) out[k] = v
    return out
  })()

  const offline = p.offline ?? null
  const blocker = (() => {
    if (offline) return !image ? 'Add a picture first.' : (offline.check?.(image) ?? null)
    if (!model) return gen.models ? 'No model here can do this.' : null
    if (!image) return 'Add a picture first.'
    if (!field) return `${model.title} has no picture field.`
    const own = p.check?.(model, image)
    if (own) return own
    if (p.prompt === 'required' && !prompt.trim()) return 'Write a prompt first.'
    if (takes && !takes.length) return p.noTakes ?? 'Pick at least one first.'
    return gen.blocker(model, input, { image: 1 }, sendPrompt)
  })()
  const estimate = useEstimate(model, input, perPress)

  /** One job, as `gen.submit` sends it but exactly once (it would repeat it by the count). */
  const submitOne = (m: ModelDefinition, input: Record<string, unknown>) => {
    const aspect = gen.pillsFor(m).shown.find((x) => x.pill.key === 'aspect')?.value
    submitJob(m, input, { surface: 'edit', aspect, label: p.label })
  }

  const go = async () => {
    if (!model || !image || !field || blocker || busy) return
    setBusy(true)
    setNote(null)
    try {
      const prep = p.prepare ? await p.prepare({ model, image, prompt, imageField: field.name }) : {}
      const fields = { [field.name]: image.url, ...(prep.fields ?? {}) }
      const build = (text: string) => {
        const final = gen.inputFor(model, text, [], fields)
        for (const [k, v] of Object.entries({ ...patch, ...(prep.patch ?? {}) })) if (model.fields.some((f) => f.name === k)) final[k] = v
        return final
      }
      if (takes) for (const text of takes) submitOne(model, build(text))
      else if (p.batch === false) submitOne(model, build(prep.prompt ?? sendPrompt))
      else gen.submit(model, build(prep.prompt ?? sendPrompt), { label: p.label })
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const runOffline = async (run: (image: SourceImage) => Promise<void>) => {
    if (!image || blocker || busy) return
    setBusy(true)
    setNote(null)
    try {
      await run(image)
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const reuse = async (item: HistoryItem) => {
    const media = item.media?.[0]
    if (!media) return
    setNote(null)
    try {
      const url = await hostForKie(media)
      const local = media.localPath ? `/${media.localPath}` : media.url
      onImage({ url, local })
    } catch (e) {
      setNote((e as Error).message)
    }
  }

  const mine = jobs.filter((j) => j.meta.surface === 'edit' && j.meta.label === p.label && (isActive(j) || j.status === 'error'))
  const done = (items ?? []).filter((i) => isDone(i) && p.history(i)).slice(0, MAX_RESULTS)
  const skip = model
    ? [
        promptFieldOf(model)?.name ?? '',
        ...controls.owned,
        ...model.fields.filter((f) => f.type === 'reference' && (p.imageField.test(f.name) || /mask/i.test(f.name))).map((f) => f.name),
        ...Object.keys(patch),
        ...(p.skipFields ?? []),
      ]
    : []
  const variantPick =
    gen.family && gen.family.members.length > 1 ? (
      <RowPick
        label="Variant"
        value={gen.preferred ?? ''}
        choices={[{ value: '', label: 'Automatic', sub: model?.title }, ...gen.family.members.map((m) => ({ value: m.id, label: m.title }))]}
        onPick={(v) => gen.setPreferred(v || null)}
      />
    ) : null

  return (
    <div className="st-split ed-root">
      <aside className="st-rail">
        {p.header}
        <ImageSlot title={p.imageTitle ?? 'Image'} value={image} onChange={onImage} onError={setNote} />
        {p.controls?.(model)}

        {!offline && hasPrompt && (
          <Field label={p.promptLabel ?? 'Prompt'} hint={<span className="st-field-count">{p.prompt === 'optional' ? 'Optional' : prompt.length}</span>}>
            <textarea rows={4} placeholder={p.promptPlaceholder} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </Field>
        )}

        {!offline && (
          <>
            <RowPick
              label="Model"
              value={gen.family?.key ?? ''}
              choices={gen.families.length ? gen.families.map((f) => ({ value: f.key, label: f.title, sub: familyAbility(f) })) : [{ value: '', label: gen.models ? 'No models' : 'Loading…' }]}
              onPick={gen.chooseFamily}
              search={gen.families.length > 8}
            />

            {rows.length > 0 && (
              <div className="st-row-grid">
                {rows.map(({ pill, value }) => (
                  <RowPick
                    key={pill.key}
                    label={pill.key === 'aspect' ? 'Ratio' : pill.key === 'resolution' ? 'Size' : pill.field.label}
                    value={value}
                    choices={pill.choices}
                    onPick={(v) => {
                      if (pill.key === 'aspect') aspectTouched.current = true
                      gen.setPill(pill.key, v)
                    }}
                  />
                ))}
              </div>
            )}

            {model && <AdvancedSection model={model} values={gen.values} onChange={gen.setValue} skip={skip} extra={variantPick} />}
          </>
        )}

        <div className="st-rail-foot">
          {(note || (image && blocker)) && <p className="st-note">{note ?? blocker}</p>}
          {offline ? (
            <div className="st-rail-go ed-offline-go">
              {offline.actions.map((a, i) => (
                <button
                  key={a.label}
                  type="button"
                  className={`plinth-btn plinth-btn--sm plinth-btn--block ${i ? 'plinth-btn--ghost' : ''}`}
                  disabled={Boolean(blocker) || busy}
                  onClick={() => void runOffline(a.run)}
                >
                  <span className="plinth-btn__face">
                    <span className="plinth-btn__label">{busy && !i ? 'Working…' : a.label}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="st-rail-go">
              {p.batch !== false && <Stepper value={Math.min(gen.count, gen.maxCount(model))} max={gen.maxCount(model)} onChange={gen.setCount} />}
              <GoButton label={p.goLabel ?? 'Generate'} credits={estimate?.credits ?? null} title={estimate?.detail} busy={busy} disabled={Boolean(blocker) || !model} wide onClick={() => void go()} />
            </div>
          )}
        </div>
      </aside>

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
          {mine.some(isActive) && <span className="st-pill-label" style={{ marginLeft: 'auto' }}>{mine.filter(isActive).length} running</span>}
        </div>
        <div className="st-canvas-body">
          {tab === 'how' ? (
            p.explain
          ) : (
            <>
              {image ? p.stage?.(image, model) : <Empty icon={ImagePlus} title={p.emptyTitle} sub={p.emptySub} />}
              {(mine.length > 0 || done.length > 0) && (
                <>
                  <h3 className="ed-results-title">Results</h3>
                  <div className="st-grid">
                    {mine.map((j) => (
                      <JobTile key={j.id} job={j} />
                    ))}
                    {done.map((item) => (
                      <div key={item.taskId} className="ed-result">
                        <ResultTile item={item} onOpen={(it) => openViewer(it, done)} />
                        <button type="button" className="ed-result-use" title="Keep editing this result" onClick={() => void reuse(item)}>
                          <Repeat size={12} />
                          Use
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export const HowItWorks = ({ steps, note }: { steps: string[]; note?: string }) => (
  <div className="ed-how pl-panel">
    <ol>
      {steps.map((s) => (
        <li key={s}>{s}</li>
      ))}
    </ol>
    {note && (
      <p className="ed-how-note">
        <Info size={13} /> {note}
      </p>
    )}
  </div>
)
