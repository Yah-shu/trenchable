/**
 * The state behind every Generate button: which family and variant, the pill values, the
 * Advanced settings, and turning all of it into jobs.
 *
 * The floating composer (archetype A) and the rail form (archetype B) lay this out
 * differently but must behave identically — same model choice, same carry-over of
 * settings when the variant switches under you, same batch rules — so both are thin
 * views over this hook.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { bookFromDraft, bookToDraft, editSettings, leaveFamily, loadDraft, replaceSettings, saveDraft, settingsFor, type SettingsBook } from './draft.ts'
import { buildInput, pickModel, refFieldKind, useModels, type FieldSchema, type Intent, type ModelCategory, type ModelDefinition, type Ref, type RefKind } from './api.ts'
import { carryOver, controlsFor, pillValue, type Pill, type PillKey } from './controls.ts'
import { familiesOf, familyOf, isTool, needsImage, variantFor, type Family } from './families.ts'
import { submitJob, type JobMeta } from './jobs.ts'
import type { ModelClass } from './presets.ts'

export interface GeneratorOptions {
  surface: string
  category: ModelCategory
  klass: ModelClass
  /**
   * Narrow the catalogue (a mode that only makes sense with lip-sync models, say). With a
   * filter, tools are allowed through — the filter is then the whole point.
   */
  filter?: (m: ModelDefinition) => boolean
  locked?: Record<string, unknown>
  meta?: Partial<JobMeta>
  /** How many the stepper starts on (Influencer's Create opens at four variations). */
  initialCount?: number
  /** Where the settings are remembered across reloads; defaults to the surface. */
  draftKey?: string
  /** The model to open on before anything is picked or remembered (overrides the house default). */
  preferModel?: RegExp
}

export type Counts = Partial<Record<RefKind, number>>

/**
 * What each surface opens on before you pick: the house working models (GPT Image 2 for
 * stills, Gemini Omni Flash for clips), then the class's best match from `pickModel`.
 */
const HOUSE_DEFAULT: Partial<Record<ModelClass, RegExp>> = {
  image: /^gpt-image-2-text-to-image$/,
  'image-edit': /^gpt-image-2-image-to-image$/,
  video: /^google\/gemini-omni-flash-1-1$/,
  'video-ref': /^google\/gemini-omni-flash-1-1$/,
  audio: /^market\/elevenlabs-tts$/,
}

/** The family last picked on a surface, so it opens where you left it (as theirs does). */
const remembered = {
  get(surface: string): string | null {
    try {
      return window.localStorage.getItem(`studio.family.${surface}`)
    } catch {
      return null
    }
  },
  set(surface: string, key: string) {
    try {
      window.localStorage.setItem(`studio.family.${surface}`, key)
    } catch {
      // Private mode or storage off: the choice just isn't remembered.
    }
  },
}

/** The field that holds the prompt, by the same rule `buildInput` uses. */
export const promptFieldOf = (m: ModelDefinition): FieldSchema | undefined =>
  m.fields.find((x) => /^prompt$|^text$|^script$|description/i.test(x.name)) ?? m.fields.find((x) => x.type === 'textarea')

/** The first reference field of each kind — the ones the composer's own references fill. */
export function primaryRefFields(m: ModelDefinition): FieldSchema[] {
  const seen = new Set<RefKind>()
  const out: FieldSchema[] = []
  for (const f of m.fields) {
    if (f.type !== 'reference') continue
    const k = refFieldKind(f)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(f)
  }
  return out
}

/** Required fields the input still leaves empty, so Generate can say what is missing. */
export function missingFields(m: ModelDefinition, input: Record<string, unknown>): FieldSchema[] {
  return m.fields.filter((f) => {
    if (!f.required) return false
    const v = input[f.name]
    return v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length)
  })
}

export function useGenerator({ surface, category, klass, filter, locked, meta, initialCount, draftKey, preferModel }: GeneratorOptions) {
  const key = draftKey ?? surface
  const [draft] = useState(() => loadDraft(key))
  const { models: all, error } = useModels(category)
  const models = useMemo(() => (all && filter ? all.filter(filter) : all), [all, filter])
  const families = useMemo<Family[]>(() => {
    if (!models) return []
    if (!filter) return familiesOf(models)
    // A filtered list is usually tools, which familiesOf leaves out; group them one each.
    const generators = familiesOf(models)
    const grouped = new Set(generators.flatMap((f) => f.members.map((m) => m.id)))
    const singles = models.filter((m) => !grouped.has(m.id) && m.fields.length && isTool(m)).map((m) => ({ key: `${m.category}:${m.id}`, title: m.title, category: m.category, members: [m] }))
    return [...generators, ...singles]
  }, [models, filter])

  const [familyKey, setFamilyKey] = useState<string | null>(() => remembered.get(key))
  const [preferred, setPreferred] = useState<string | null>(draft.preferred ?? null)
  // Pills and Advanced values are kept per family (draft.ts): each model comes back as you left it.
  const [book, setBook] = useState<SettingsBook>(() => bookFromDraft(draft))
  const [count, setCount] = useState(initialCount ?? draft.count ?? 1)

  const family = useMemo(() => {
    if (!families.length) return null
    const hit = familyKey ? families.find((f) => f.key === familyKey) : null
    if (hit) return hit
    // Open on the house default for this class, else its best match.
    const house = preferModel ?? HOUSE_DEFAULT[klass]
    const preset = house && models?.find((m) => house.test(m.id))
    const best = preset ?? (models ? pickModel(models, klass) : null)
    return familyOf(families, best?.id) ?? families[0]
  }, [families, familyKey, models, klass])

  const open = family?.key ?? null
  const { pills, values } = useMemo(() => settingsFor(book, open) as { pills: Partial<Record<PillKey, string>>; values: Record<string, unknown> }, [book, open])
  useEffect(() => saveDraft(key, { ...bookToDraft(book, open), count, preferred }), [key, book, open, count, preferred])

  /** The member that will run for this many attachments. */
  const variant = useCallback((counts: Counts) => (family ? variantFor(family, counts, preferred) : null), [family, preferred])

  const chooseFamily = (next: string) => {
    // The family being left files its settings away; the one picked brings back its own.
    if (next !== open) setBook((b) => leaveFamily(b, open))
    setFamilyKey(next)
    setPreferred(null)
    remembered.set(draftKey ?? surface, next)
  }

  /** Select one exact model (a handoff's "Reuse"), with its family. */
  const chooseModel = (id: string) => {
    const f = familyOf(families, id)
    if (!f) return false
    if (f.key !== open) setBook((b) => leaveFamily(b, open))
    setFamilyKey(f.key)
    setPreferred(id)
    return true
  }

  /** Pills for a model, with the values they currently show. */
  const pillsFor = (model: ModelDefinition | null) => {
    const controls = controlsFor(model)
    const shown: { pill: Pill; value: string }[] = []
    for (const key of ['aspect', 'resolution', 'duration'] as const) {
      const pill = controls[key]
      if (pill) shown.push({ pill, value: carryOver(pill, pills[key]) })
    }
    return { controls, shown }
  }

  const setPill = (key: PillKey, value: string) => setBook((b) => editSettings(b, open, { pills: { [key]: value } }))
  const setValue = (name: string, value: unknown) => setBook((b) => editSettings(b, open, { values: { [name]: value } }))
  /** Replace the open family's Advanced values (shared ones included); its pills stay. */
  const setValues = (next: Record<string, unknown>) => setBook((b) => replaceSettings(b, open, { pills: settingsFor(b, open).pills, values: next }))

  /** Restore a job's exact settings onto a model: pills from their fields, the rest as values. */
  const restore = (model: ModelDefinition, input: Record<string, unknown>) => {
    const { controls } = pillsFor(model)
    const nextPills: Record<string, string> = {}
    for (const key of ['aspect', 'resolution', 'duration'] as const) {
      const pill = controls[key]
      if (pill && input[pill.field.name] !== undefined) nextPills[key] = String(input[pill.field.name])
    }
    if (controls.count && typeof input[controls.count.field.name] === 'number') setCount(Number(input[controls.count.field.name]))
    const prompt = promptFieldOf(model)?.name
    const refs = new Set(model.fields.filter((f) => f.type === 'reference').map((f) => f.name))
    const rest = Object.fromEntries(Object.entries(input).filter(([k]) => k !== prompt && !refs.has(k) && !controls.owned.includes(k)))
    // Filed under the job's own family: a handoff picks that family in the same breath.
    const target = familyOf(families, model.id)?.key ?? open
    setBook((b) => replaceSettings(b, target, { pills: nextPills, values: rest }))
  }

  /** The exact payload for a model and what is attached. */
  const inputFor = (model: ModelDefinition, prompt: string, refs: Ref[], fields?: Intent['fields']) => {
    const { controls, shown } = pillsFor(model)
    const pillVals: Record<string, unknown> = {}
    for (const { pill, value } of shown) pillVals[pill.field.name] = pillValue(pill, value)
    if (controls.count) pillVals[controls.count.field.name] = pillValue(controls.count, String(Math.min(count, maxCount(model))))
    return buildInput(model, { prompt, refs, fields, values: { ...values, ...pillVals }, locked })
  }

  const maxCount = (model: ModelDefinition | null) => {
    const c = controlsFor(model).count
    if (!c) return 4
    return Math.max(...c.choices.map((x) => Number(x.value)).filter(Number.isFinite), 1)
  }

  /** How many separate jobs one press sends: the model's own count field wins over batching. */
  const jobsPerPress = (model: ModelDefinition | null) => (controlsFor(model).count ? 1 : count)

  /** Why Generate can't run yet, in plain words, or null when it can. */
  const blocker = (model: ModelDefinition | null, input: Record<string, unknown> | null, counts: Counts, prompt: string): string | null => {
    if (!model || !input) return models ? 'No model available here.' : null
    if (needsImage(model) && !(counts.image ?? 0)) return `${family?.title ?? model.title} works from a picture — add one first.`
    const missing = missingFields(model, input).filter((f) => f.type !== 'reference' || refFieldKind(f) !== 'image' || !(counts.image ?? 0))
    if (missing.length) {
      const pf = promptFieldOf(model)
      // An empty prompt is the obvious case; say it the way a person would.
      if (missing.length === 1 && missing[0] === pf && !prompt.trim()) return 'Write a prompt first.'
      return `Still needed: ${missing.map((f) => f.label || f.name).join(', ')}.`
    }
    return null
  }

  const submit = (model: ModelDefinition, input: Record<string, unknown>, extra?: Partial<JobMeta>) => {
    const aspect = pillsFor(model).shown.find((s) => s.pill.key === 'aspect')?.value
    return Array.from({ length: jobsPerPress(model) }, () => submitJob(model, input, { surface, aspect, ...meta, ...extra }))
  }

  return {
    models,
    error,
    families,
    family,
    chooseFamily,
    chooseModel,
    preferred,
    setPreferred,
    variant,
    pillsFor,
    setPill,
    values,
    setValue,
    setValues,
    count,
    setCount,
    maxCount,
    jobsPerPress,
    restore,
    inputFor,
    blocker,
    submit,
  }
}

export type Generator = ReturnType<typeof useGenerator>
