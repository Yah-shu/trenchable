/**
 * Studio's library client: Elements, Projects and Uploads (server/studio/library.ts holds the data).
 *
 * An Element is a named set of reference images (a character, a product, a location, a style) that can be
 * @-mentioned in any job; a Project is a named group of generations. Same shape as `studioApi`: relative
 * paths, unwrap `{ data }`, throw the server's message otherwise.
 *
 * Every change made through `libraryApi` reloads the matching list once and hands it to every component
 * using `useElements()` / `useProjects()`, so a rail, a picker and a dialog never disagree.
 *
 * `elementRefs` is the bridge to Kie: Kie can't reach our disk, and the URL it gives back for an upload
 * expires within days, so the library keeps its own copy of every image and pushes it up again right
 * before a job (the same idea as `hostForKie` in mentions.ts), reusing an upload for up to 24 hours.
 *
 * Types are written out here rather than imported from the server, so the board stays self-contained;
 * keep them in step with server/studio/library.ts.
 */
import { useEffect, useSyncExternalStore } from 'react'

// ---------- types ----------

export type ElementKind = 'character' | 'product' | 'location' | 'style' | 'other'
export const ELEMENT_KINDS: readonly ElementKind[] = ['character', 'product', 'location', 'style', 'other']
/** Kie's models take at most ~9-14 references, so an element holds up to 12 images. */
export const MAX_ELEMENT_IMAGES = 12

export interface ElementImage {
  n: number
  /** File name inside the element folder, e.g. "3.png". */
  file: string
  /** Same-origin path that serves the image. */
  url: string
  /** Same-origin path that serves its thumbnail. */
  thumb: string
  width?: number
  height?: number
}

export interface Element {
  id: string
  name: string
  kind: ElementKind
  description: string
  createdAt: string
  updatedAt: string
  images: ElementImage[]
  /** The `n` of the cover image; 0 when the element has no images. */
  cover: number
}

/** An https URL, or a same-origin path such as /media/<taskId>/0.png or another element's image url. */
export interface Source {
  url: string
}

export interface ElementInput {
  name: string
  kind: ElementKind
  description?: string
  sources?: Source[]
}

export interface ElementPatch {
  name?: string
  kind?: ElementKind
  description?: string
  /** The `n` of the image to show first. */
  cover?: number
}

export interface Project {
  id: string
  title: string
  notes: string
  createdAt: string
  updatedAt: string
  /** Generations in this project, newest first. */
  taskIds: string[]
}

export interface ProjectPatch {
  title?: string
  notes?: string
}

/** A file uploaded through Studio, kept on disk so the picker's Uploads tab can offer it again. */
export interface Upload {
  id: string
  name: string
  kind: 'image' | 'video' | 'audio'
  mime: string
  file: string
  /** Same-origin path that serves the file. */
  url: string
  /** Same-origin path of an image's thumbnail. */
  thumb?: string
  size: number
  width?: number
  height?: number
  createdAt: string
  /** The Kie link it got when it was uploaded, and when Kie throws it away. */
  hostedUrl?: string
  hostedUntil?: string
}

/** A reference hosted where Kie can fetch it, in the shape Studio's composer takes (`Ref` in api.ts). */
export interface ElementRef {
  url: string
  kind: 'image'
}

// ---------- requests ----------

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok || body.data === undefined) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.data
}

const send = (method: string, body?: unknown): RequestInit =>
  body === undefined ? { method } : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }

const E = '/api/studio/elements'
const P = '/api/studio/projects'
const U = '/api/studio/uploads'
const seg = encodeURIComponent

type Topic = 'elements' | 'projects' | 'uploads'

/** Runs a change, then reloads that list for everyone who shows it. */
async function changing<T>(topic: Topic, run: Promise<T>): Promise<T> {
  const out = await run
  void lists[topic].reload()
  return out
}

export const libraryApi = {
  elements: () => call<{ items: Element[] }>(E).then((r) => r.items),
  element: (id: string) => call<Element>(`${E}/${seg(id)}`),
  createElement: (input: ElementInput) => changing('elements', call<Element>(E, send('POST', input))),
  updateElement: (id: string, patch: ElementPatch) => changing('elements', call<Element>(`${E}/${seg(id)}`, send('PATCH', patch))),
  deleteElement: (id: string) => changing('elements', call<{ deleted: true; id: string }>(`${E}/${seg(id)}`, send('DELETE'))),
  /** Upload image files from the user's computer (25 MB each). */
  addImages: (id: string, files: File[]) => {
    const form = new FormData()
    for (const f of files) form.append('file', f)
    // No Content-Type header: the browser sets the multipart boundary itself.
    return changing('elements', call<Element>(`${E}/${seg(id)}/images`, { method: 'POST', body: form }))
  },
  /** Copy in an image from an https link or a same-origin path (a past generation, another element). */
  addImageUrl: (id: string, url: string) => changing('elements', call<Element>(`${E}/${seg(id)}/images`, send('POST', { url }))),
  removeImage: (id: string, n: number) => changing('elements', call<Element>(`${E}/${seg(id)}/images/${n}`, send('DELETE'))),

  projects: () => call<{ items: Project[] }>(P).then((r) => r.items),
  project: (id: string) => call<Project>(`${P}/${seg(id)}`),
  createProject: (title = '', notes?: string) => changing('projects', call<Project>(P, send('POST', notes === undefined ? { title } : { title, notes }))),
  updateProject: (id: string, patch: ProjectPatch) => changing('projects', call<Project>(`${P}/${seg(id)}`, send('PATCH', patch))),
  /** Removes the project only; its generations stay in history. */
  deleteProject: (id: string) => changing('projects', call<{ deleted: true; id: string }>(`${P}/${seg(id)}`, send('DELETE'))),
  /** Pass newest first; ids already in the project move to the top. */
  addToProject: (id: string, taskIds: string[]) => changing('projects', call<Project>(`${P}/${seg(id)}/items`, send('POST', { taskIds }))),
  removeFromProject: (id: string, taskId: string) => changing('projects', call<Project>(`${P}/${seg(id)}/items/${seg(taskId)}`, send('DELETE'))),

  /** A page of uploads, newest first. */
  uploads: (offset = 0, limit = 60) => call<{ items: Upload[]; total: number }>(`${U}?offset=${offset}&limit=${limit}`),
  /** Keep a copy of a file just uploaded for Kie, with the link Kie gave it. */
  saveUpload: (file: File, hosted?: { fileUrl: string; expiresAt?: string }) => {
    const form = new FormData()
    form.append('file', file)
    if (hosted?.fileUrl) form.append('hostedUrl', hosted.fileUrl)
    if (hosted?.expiresAt) form.append('expiresAt', String(hosted.expiresAt))
    return changing('uploads', call<Upload>(U, { method: 'POST', body: form }))
  },
  deleteUpload: (id: string) => changing('uploads', call<{ deleted: true; id: string }>(`${U}/${seg(id)}`, send('DELETE'))),
}

// ---------- shared lists ----------

interface ListState<T> {
  items: T[]
  loaded: boolean
  error: string | null
}

/**
 * One list shared by every component that shows it. Only the newest request may write the state, so a slow
 * answer that started before a change can never overwrite the list fetched after it.
 */
function sharedList<T>(load: () => Promise<T[]>) {
  let state: ListState<T> = { items: [], loaded: false, error: null }
  let latest = 0
  let pending: Promise<void> | null = null
  const subs = new Set<() => void>()
  const emit = () => subs.forEach((f) => f())

  const reload = (): Promise<void> => {
    const mine = ++latest
    const run = load().then(
      (items) => {
        if (mine === latest) state = { items, loaded: true, error: null }
      },
      (e: unknown) => {
        if (mine === latest) state = { ...state, loaded: true, error: e instanceof Error ? e.message : String(e) }
      },
    )
    pending = run.finally(() => {
      if (mine === latest) {
        pending = null
        emit()
      }
    })
    return pending
  }

  return {
    get: () => state,
    subscribe: (f: () => void) => {
      subs.add(f)
      return () => {
        subs.delete(f)
      }
    },
    reload,
    /** First use loads the list; later mounts reuse it (or the load under way), and retry after a failure. */
    ensure: () => (state.loaded && !state.error ? Promise.resolve() : (pending ?? reload())),
  }
}

/** Uploads load a page at a time; "Show more" asks for the next page on top of what's shown. */
const UPLOAD_PAGE = 60
/** The most the server hands back in one request (server/studio/library.ts `listUploads`). */
const UPLOAD_MAX = 200

export type UploadOrder = 'newest' | 'oldest'

/**
 * The first `limit` uploads in this order. The server lists newest first, so the oldest are
 * the tail of that list, read in pages from the end and turned round.
 */
export async function loadUploads(
  order: UploadOrder,
  limit: number,
  get: (offset: number, limit: number) => Promise<{ items: Upload[]; total: number }> = libraryApi.uploads,
): Promise<{ items: Upload[]; total: number }> {
  const first = await get(0, Math.min(limit, UPLOAD_MAX))
  const total = first.total
  const want = Math.min(limit, total)
  if (order === 'newest') {
    const items = [...first.items]
    while (items.length < want) {
      const next = await get(items.length, Math.min(UPLOAD_MAX, want - items.length))
      if (!next.items.length) break
      items.push(...next.items)
    }
    return { items, total }
  }
  if (first.items.length >= total) return { items: [...first.items].reverse(), total }
  const items: Upload[] = []
  for (let at = total - want; at < total; at += UPLOAD_MAX) items.push(...(await get(at, Math.min(UPLOAD_MAX, total - at))).items)
  return { items: items.reverse(), total }
}

/** One shared upload list per order, each with its own page count. */
function uploadList(order: UploadOrder) {
  const paging = { limit: UPLOAD_PAGE, total: 0 }
  const list = sharedList(() =>
    loadUploads(order, paging.limit).then((r) => {
      paging.total = r.total
      return r.items
    }),
  )
  return { list, paging }
}

const uploadLists: Record<UploadOrder, ReturnType<typeof uploadList>> = { newest: uploadList('newest'), oldest: uploadList('oldest') }

const lists = {
  elements: sharedList(libraryApi.elements),
  projects: sharedList(libraryApi.projects),
  uploads: {
    /** Both orders follow a change; one nobody has opened yet stays unloaded. */
    reload: () => Promise.all(Object.values(uploadLists).map(({ list }) => (list.get().loaded ? list.reload() : Promise.resolve()))).then(() => undefined),
  },
}

/** Tell every open list to reload, for a change made somewhere other than `libraryApi`. */
export function libraryChanged(topic?: Topic): void {
  if (!topic || topic === 'elements') void lists.elements.reload()
  if (!topic || topic === 'projects') void lists.projects.reload()
  if (!topic || topic === 'uploads') void lists.uploads.reload()
}

function useShared<T>(list: ReturnType<typeof sharedList<T>>): { items: T[]; reload: () => Promise<void>; loading: boolean; error: string | null } {
  const state = useSyncExternalStore(list.subscribe, list.get, list.get)
  useEffect(() => {
    void list.ensure()
  }, [list])
  return { items: state.items, reload: list.reload, loading: !state.loaded, error: state.error }
}

/** Every element, newest first. */
export const useElements = () => useShared(lists.elements)
/** Every project, most recently changed first. */
export const useProjects = () => useShared(lists.projects)

/**
 * Uploads, newest first (or oldest first), a page at a time: `total` is how many there are,
 * `more()` loads the next page.
 */
export function useUploads(order: UploadOrder = 'newest') {
  const { list, paging } = uploadLists[order]
  const s = useShared(list)
  return {
    ...s,
    total: Math.max(paging.total, s.items.length),
    more: () => {
      paging.limit += UPLOAD_PAGE
      return list.reload()
    },
  }
}

/**
 * Upload a file for Kie, as `studioApi.upload` does, and keep a copy for the Uploads tab. The copy is
 * saved in the background: a failure there never fails the upload the job is waiting on.
 */
export async function uploadMedia(file: File): Promise<{ fileUrl: string; expiresAt?: string }> {
  const form = new FormData()
  form.append('file', file)
  const up = await call<{ fileUrl: string; expiresAt?: string }>('/api/upload', { method: 'POST', body: form })
  libraryApi.saveUpload(file, up).catch((e: unknown) => console.warn('[studio] upload not kept for the Uploads tab:', e))
  return up
}

/** Kie keeps an upload about three days; one without a date is trusted for two. */
const UPLOAD_FRESH_MS = 2 * 24 * 60 * 60 * 1000

/**
 * An upload as a link Kie can fetch: the one it got when uploaded while that is still fresh, otherwise
 * the copy on disk pushed up again (remembered for the day, like an element image).
 */
export function uploadHosted(up: Upload, now = Date.now()): Promise<string> {
  const until = up.hostedUntil ? Date.parse(up.hostedUntil) - 60 * 60 * 1000 : Date.parse(up.createdAt) + UPLOAD_FRESH_MS
  if (up.hostedUrl && Number.isFinite(until) && now < until) return Promise.resolve(up.hostedUrl)
  return hostFile(`upload/${up.id}`, up.url, up.name, up.mime)
}

// ---------- handing an element to Kie ----------

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const hosted = new Map<string, { url: string; until: number }>()
const hosting = new Map<string, Promise<string>>()

/** A same-origin library file pushed up to Kie, or the upload from earlier today. `key` names the bytes for good. */
function hostFile(key: string, src: string, name: string, type: string, missing = 'That file is missing from the library.'): Promise<string> {
  const hit = hosted.get(key)
  if (hit && Date.now() < hit.until) return Promise.resolve(hit.url)
  const busy = hosting.get(key)
  if (busy) return busy
  const job = (async () => {
    const res = await fetch(src)
    if (!res.ok) throw new Error(missing)
    const blob = await res.blob()
    const form = new FormData()
    form.append('file', new File([blob], name, { type: blob.type || type }))
    const up = await call<{ fileUrl: string; expiresAt?: string }>('/api/upload', { method: 'POST', body: form })
    const expires = up.expiresAt ? Date.parse(up.expiresAt) - HOUR : Number.NaN
    hosted.set(key, { url: up.fileUrl, until: Math.min(Date.now() + DAY, Number.isFinite(expires) ? expires : Number.POSITIVE_INFINITY) })
    return up.fileUrl
  })().finally(() => hosting.delete(key))
  hosting.set(key, job)
  return job
}

/** One element image pushed up to Kie. Keyed by file: `n` is never reused. */
const hostImage = (el: Element, img: ElementImage): Promise<string> =>
  hostFile(`${el.id}/${img.file}`, img.url, `${el.id}-${img.file}`, 'image/png', `An image of "${el.name}" is missing from the library. Remove it and add it again.`)

/**
 * The element's images as references a job can use, cover first (so `@image1` is the cover), then in the
 * order they were added. Uploads run four at a time; one that fails fails the whole call, because a job
 * missing one of its references would quietly lose the likeness it was meant to keep.
 */
export async function elementRefs(el: Element): Promise<ElementRef[]> {
  const ordered = [...el.images.filter((i) => i.n === el.cover), ...el.images.filter((i) => i.n !== el.cover)]
  const urls: string[] = new Array<string>(ordered.length)
  let next = 0
  const worker = async () => {
    while (next < ordered.length) {
      const i = next++
      urls[i] = await hostImage(el, ordered[i] as ElementImage)
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, ordered.length) }, worker))
  return urls.map((url) => ({ url, kind: 'image' as const }))
}
