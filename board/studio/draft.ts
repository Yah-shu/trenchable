/**
 * What a surface remembers across reloads: prompt, pills, Advanced values, count and the
 * attached files — the reference app keeps all of these, so a reload never throws work away.
 *
 * Kept in localStorage per surface (a per-browser convenience; nothing here is needed to
 * run). Attached files are Kie upload links, which Kie deletes after a few days, so
 * they are dropped once they are two days old rather than restored dead.
 */
import type { Ref } from './api.ts'

/** One model family's own settings: its pill values and its Advanced values. */
export interface FamilySettings {
  pills: Record<string, string>
  values: Record<string, unknown>
}

export interface Draft {
  prompt?: string
  /** The open family's pills and values (what older drafts held for the whole surface). */
  pills?: Record<string, string>
  values?: Record<string, unknown>
  /** Every family's own settings, by family key. */
  byFamily?: Record<string, FamilySettings>
  /** The family the top-level pills and values belong to; absent in older drafts. */
  family?: string | null
  count?: number
  preferred?: string | null
  refs?: Ref[]
  slots?: Record<string, Ref>
  /** When the attached files were last changed. */
  filesAt?: number
}

const FILE_LIFE_MS = 2 * 24 * 60 * 60 * 1000
const keyOf = (surface: string) => `studio.draft.${surface}`

export function loadDraft(surface: string, now = Date.now()): Draft {
  try {
    const raw = window.localStorage.getItem(keyOf(surface))
    if (!raw) return {}
    const d = JSON.parse(raw) as Draft
    if (!d || typeof d !== 'object') return {}
    if (!d.filesAt || now - d.filesAt > FILE_LIFE_MS) {
      delete d.refs
      delete d.slots
    }
    return d
  } catch {
    return {}
  }
}

/**
 * The tab a surface with modes (Video, Audio, Edit) was last on, so a reload lands back on
 * it — each mode keeps its own draft, which is no use if the reload always opens the first.
 * `allowed` guards against a tab that has since been renamed or removed.
 */
export function loadMode<T extends string>(surface: string, allowed: readonly T[]): T | null {
  try {
    const m = window.localStorage.getItem(`studio.mode.${surface}`)
    return m && (allowed as readonly string[]).includes(m) ? (m as T) : null
  } catch {
    return null
  }
}

export function saveMode(surface: string, mode: string) {
  try {
    window.localStorage.setItem(`studio.mode.${surface}`, mode)
  } catch {
    // ignore
  }
}

/**
 * Settings remembered per model family, the way the reference app keeps one store per model:
 * GPT Image → Z-Image → back to GPT Image brings back GPT Image's own aspect, quality
 * and Advanced values instead of whatever Z-Image was set to. What belongs to the form
 * rather than the model — the prompt, the attached files and the count, which live
 * elsewhere, and the seed among the Advanced values — is shared by every family.
 */
export interface SettingsBook {
  byFamily: Record<string, FamilySettings>
  /**
   * Where a family opened for the first time starts: the pills that were on screen when
   * you left the last one (the nearest match is shown, see `carryOver`), with its own
   * Advanced values fresh — another model's style or quality value means nothing here.
   */
  start: FamilySettings
  /** Advanced values every family shares. */
  shared: Record<string, unknown>
}

/** Advanced values that belong to the form, not the model: the seed, as theirs does, and the negative prompt you typed. */
export const SHARED_VALUES = /^(seed|negative_prompt)$/i

function splitShared(values: Record<string, unknown>) {
  const own: Record<string, unknown> = {}
  const shared: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(values)) (SHARED_VALUES.test(k) ? shared : own)[k] = v
  return { own, shared }
}

export function bookFromDraft(d: Draft): SettingsBook {
  const { own, shared } = splitShared(d.values ?? {})
  const byFamily = { ...(d.byFamily ?? {}) }
  // A draft that names its family filed those values under it; an older one (one set
  // of settings per surface) belongs to whichever family opens first, as it always did.
  const start = { pills: d.pills ?? {}, values: d.family ? {} : own }
  if (d.family && !byFamily[d.family]) byFamily[d.family] = { pills: d.pills ?? {}, values: own }
  return { byFamily, start, shared }
}

const ownOf = (book: SettingsBook, family: string | null) => (family && book.byFamily[family]) || book.start

/** What a family shows: its own settings, or where a first visit starts, with the shared values on top. */
export function settingsFor(book: SettingsBook, family: string | null): FamilySettings {
  const own = ownOf(book, family)
  return { pills: own.pills, values: { ...own.values, ...book.shared } }
}

function put(book: SettingsBook, family: string | null, next: FamilySettings, shared: Record<string, unknown>): SettingsBook {
  // Before the catalogue loads there is no family yet; the change lands on the start.
  if (!family) return { ...book, start: next, shared }
  return { ...book, byFamily: { ...book.byFamily, [family]: next }, shared }
}

/** Change some of a family's settings; a shared value changes for every family. */
export function editSettings(book: SettingsBook, family: string | null, patch: { pills?: Record<string, string>; values?: Record<string, unknown> }): SettingsBook {
  const base = ownOf(book, family)
  const { own, shared } = splitShared(patch.values ?? {})
  return put(book, family, { pills: { ...base.pills, ...patch.pills }, values: { ...base.values, ...own } }, { ...book.shared, ...shared })
}

/** Replace a family's settings outright (restoring a past job's exact settings). */
export function replaceSettings(book: SettingsBook, family: string | null, next: { pills: Record<string, string>; values: Record<string, unknown> }): SettingsBook {
  const { own, shared } = splitShared(next.values)
  return put(book, family, { pills: next.pills, values: own }, shared)
}

/** Leave a family: it keeps what it showed, and the next family never opened before starts from its pills. */
export function leaveFamily(book: SettingsBook, family: string | null): SettingsBook {
  if (!family) return book
  const own = ownOf(book, family)
  return { ...book, byFamily: { ...book.byFamily, [family]: own }, start: { pills: own.pills, values: {} } }
}

/** The book as draft fields: the open family's settings at the top level (older drafts' shape), every family's below. */
export function bookToDraft(book: SettingsBook, family: string | null): Pick<Draft, 'pills' | 'values' | 'byFamily' | 'family'> {
  const { pills, values } = settingsFor(book, family)
  const byFamily = family ? { ...book.byFamily, [family]: ownOf(book, family) } : book.byFamily
  return { pills, values, byFamily, family }
}

/** Merge a change into the stored draft. Storage off or full: the draft just isn't kept. */
export function saveDraft(surface: string, patch: Draft) {
  try {
    const current = loadDraft(surface)
    const touchesFiles = 'refs' in patch || 'slots' in patch
    const next: Draft = { ...current, ...patch, ...(touchesFiles ? { filesAt: Date.now() } : {}) }
    window.localStorage.setItem(keyOf(surface), JSON.stringify(next))
  } catch {
    // ignore
  }
}
