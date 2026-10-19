/**
 * The Elements page's bookkeeping, kept apart from the components so it can be tested
 * without a server: grouping and filtering the library, how many more pictures an
 * element can take, and which past results can become element pictures.
 */
import { isDone, mediaUrl, type HistoryItem } from '../api.ts'
import { ELEMENT_KINDS, MAX_ELEMENT_IMAGES, type Element, type ElementKind } from '../library.ts'

export const KIND_LABELS: Record<ElementKind, { one: string; many: string; hint: string }> = {
  character: { one: 'Character', many: 'Characters', hint: 'A person to keep the same across shots — several angles help.' },
  product: { one: 'Product', many: 'Products', hint: 'Packshots from a few sides, label readable.' },
  location: { one: 'Location', many: 'Locations', hint: 'A place to come back to: wide views and details.' },
  style: { one: 'Style', many: 'Styles', hint: 'Pictures whose look, colour or grade you want to reuse.' },
  other: { one: 'Other', many: 'Other', hint: 'Anything else you want to @-mention: a prop, a pet, a logo.' },
}

/** The element's cover thumbnail, or its first picture, or nothing. */
export const elementThumb = (el: Element): string | null => (el.images.find((i) => i.n === el.cover) ?? el.images[0])?.thumb ?? null

/** Matches a search against name and description. */
export const matches = (el: Element, q: string) => {
  const needle = q.trim().toLowerCase()
  return !needle || `${el.name} ${el.description}`.toLowerCase().includes(needle)
}

/** Elements by kind in the library's fixed order, empty kinds left out. */
export function groupElements(items: Element[], kind: ElementKind | 'all', q = ''): { kind: ElementKind; items: Element[] }[] {
  return ELEMENT_KINDS.filter((k) => kind === 'all' || k === kind)
    .map((k) => ({ kind: k, items: items.filter((el) => el.kind === k && matches(el, q)) }))
    .filter((g) => g.items.length > 0)
}

export const countByKind = (items: Element[]): Record<ElementKind | 'all', number> => {
  const out = { all: items.length } as Record<ElementKind | 'all', number>
  for (const k of ELEMENT_KINDS) out[k] = items.filter((el) => el.kind === k).length
  return out
}

/** How many more pictures fit, given what is already there and what is waiting to be added. */
export const roomLeft = (existing: number, staged = 0) => Math.max(0, MAX_ELEMENT_IMAGES - existing - staged)

export interface PastImage {
  key: string
  /** What the library copies in: /media/... for archived results, else the provider URL. */
  source: string
  prompt: string
  createdAt: number
}

/** Every finished image in history, newest first, in the shape the library takes as a source. */
export function pastImages(items: HistoryItem[] | null | undefined): PastImage[] {
  const out: PastImage[] = []
  for (const item of items ?? []) {
    if (!isDone(item) || item.category !== 'image') continue
    for (const [i, m] of (item.media ?? []).entries()) {
      if (m.kind && m.kind !== 'image') continue
      const source = mediaUrl(m)
      if (source) out.push({ key: `${item.taskId}-${i}`, source, prompt: item.prompt ?? item.model, createdAt: item.createdAt })
    }
    if (!item.media?.length) for (const [i, url] of (item.resultUrls ?? []).entries()) out.push({ key: `${item.taskId}-u${i}`, source: url, prompt: item.prompt ?? item.model, createdAt: item.createdAt })
  }
  return out
}

/** A name for an element made from a result, from the first words of its prompt. */
export function nameFromPrompt(prompt: string | undefined, fallback = 'New character'): string {
  const words = (prompt ?? '')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 5)
  const name = words.join(' ')
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : fallback
}
