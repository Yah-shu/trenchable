/**
 * Studio's Kie client.
 *
 * Same shape as every other board tool's api.ts: relative paths (Vite proxies /api to
 * the Hono server), unwrap `{ data }`, throw the server's message otherwise.
 *
 * The one piece of real thinking here is `buildInput`: Studio's composer offers a fixed
 * set of controls (prompt, references, aspect, resolution, duration, count) while every
 * Kie model declares its own `fields`. `buildInput` maps the one onto the other, so a
 * surface never has to know which model it ended up using.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { FieldSchema, HistoryItem, MediaAsset, ModelCategory, ModelDefinition, NormalizedTask, Operation, Provider } from '../../src/lib/models/types.ts'
import { onJobFinished, resumeFromHistory } from './jobs.ts'
import type { ModelClass } from './presets.ts'

export type { FieldSchema, HistoryItem, MediaAsset, ModelCategory, ModelDefinition, NormalizedTask, Operation, Provider }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok || body.data === undefined) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.data
}

const send = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const studioApi = {
  health: () => call<{ ok: boolean; hasKey: boolean; catalogSyncedAt?: string | null }>('/api/health'),
  credits: () => call<{ credits: number }>('/api/credits'),
  models: (category: ModelCategory) => call<{ syncedAt: string | null; source: string; models: ModelDefinition[] }>(`/api/models?category=${category}`),
  history: (limit = 60) => call<{ items: HistoryItem[]; count: number }>(`/api/history?limit=${limit}`),
  /** Pinned items are Kie Studio's favourites: kept out of history trimming, shown under Favourites. */
  saveHistory: (items: HistoryItem[]) => call<{ items: HistoryItem[]; count: number }>('/api/history', send('PUT', { items })),
  deleteHistory: (taskId: string) => call<{ items: HistoryItem[]; count: number }>(`/api/history/${encodeURIComponent(taskId)}`, { method: 'DELETE' }),
  /**
   * Veo, Runway and Suno are separate Kie APIs, so the server needs the provider and
   * operation as well as the model name; without them it posts to the market endpoint.
   */
  submit: (model: ModelDefinition, input: Record<string, unknown>) =>
    call<{ taskId: string; task?: NormalizedTask }>(
      '/api/generate',
      send('POST', { model: model.model, input, workflowId: model.id, provider: model.provider, operation: model.operation ?? 'generate' }),
    ),
  /** Kie Studio's prompt assistant (Grok CLI). 503 when it isn't installed. */
  enhance: (prompt: string, modelId?: string) =>
    call<{ optimizedPrompt: string }>('/api/optimize-prompt', send('POST', { prompt, modelId, mode: 'optimize' })),
  enhanceStatus: () => call<{ available: boolean }>('/api/grok/status'),
  /** Set only the favourite flag, server-side, so a stale row in the browser can't overwrite a newer one. */
  favourite: (taskId: string, on: boolean) => call<{ taskId: string; pinned: boolean }>('/api/studio/favourite', send('POST', { taskId, on })),
  /** Archived results (`/media/...`) as one zip. */
  zip: async (items: { path: string; name?: string }[]): Promise<Blob> => {
    const res = await fetch('/api/studio/zip', send('POST', { items }))
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(body.error ?? `Zip failed (${res.status})`)
    }
    return res.blob()
  },
  task: (taskId: string, provider = 'market', operation = 'generate') =>
    call<NormalizedTask>(`/api/task?${new URLSearchParams({ taskId, provider, operation })}`),
  upload: async (file: File) => {
    const form = new FormData()
    form.append('file', file)
    // No Content-Type header: the browser sets the multipart boundary itself.
    return call<{ fileUrl: string; originalFileName: string; expiresAt?: string }>('/api/upload', { method: 'POST', body: form })
  },
  /** Re-host a URL Kie can already reach, instead of pushing the bytes up again. */
  rehost: (fileUrl: string) => call<{ fileUrl: string }>('/api/upload', send('POST', { fileUrl })),
}

/** An archived result is served from disk and never expires; otherwise use the provider URL. */
export const mediaUrl = (m: MediaAsset): string | undefined => (m.localPath ? `/${m.localPath}` : (m.url ?? m.previewUrl ?? m.streamUrl))

export const firstMedia = (item: HistoryItem): string | undefined => {
  const m = item.media?.[0]
  return m ? mediaUrl(m) : item.resultUrls?.[0]
}

/* ---------- picking a model ---------- */

/**
 * Kie names models by what they do — "Flux-2 - Text to Image" next to "Flux-2 - Image to
 * Image" — so `want` is an ordered list of readings, best first, and the first reading
 * that matches anything wins. `avoid` rules out the models that only post-process
 * something else; an upscaler is an image model, but never what "make an image" means.
 */
const SCORES: Record<ModelClass, { category: ModelCategory; want: RegExp[]; avoid?: RegExp }> = {
  image: {
    category: 'image',
    want: [/text.?to.?image/i, /\bimagen\b/i, /flux|gpt.?image|grok imagine|seedream|ideogram/i],
    avoid: /image.?to.?image|i2i|\bedit\b|inpaint|upscal|background|segment|restore/i,
  },
  'image-edit': {
    category: 'image',
    want: [/image.?to.?image/i, /\bedit\b|kontext/i, /nano.?banana/i],
    avoid: /upscal|segment|background/i,
  },
  video: {
    category: 'video',
    want: [/text.?to.?video/i, /seedance|create a video/i],
    avoid: /image.?to.?video|i2v|extend|upscal|interpolat|lip.?sync|convert to|transform/i,
  },
  'video-ref': {
    category: 'video',
    want: [/image.?to.?video/i, /first.?frame|start.?frame/i],
    avoid: /upscal|extend|interpolat|lip.?sync|convert to/i,
  },
  audio: {
    category: 'audio',
    want: [/text.?to.?speech/i, /narration/i, /speech|voice/i],
    avoid: /song|lyrics|\bcover\b|music|regenerate|extend/i,
  },
}

/** Best current model for a class, or null when the catalogue has nothing suitable. */
export function pickModel(models: ModelDefinition[], klass: ModelClass): ModelDefinition | null {
  const rule = SCORES[klass]
  const pool = models.filter((m) => m.category === rule.category)
  if (!pool.length) return null
  const hay = (m: ModelDefinition) => `${m.id} ${m.model} ${m.title} ${(m.tags ?? []).join(' ')}`
  const allowed = pool.filter((m) => !(rule.avoid && rule.avoid.test(hay(m))))
  for (const want of rule.want) {
    const hit = allowed.find((m) => want.test(hay(m)))
    if (hit) return hit
  }
  return allowed[0] ?? pool[0] ?? null
}

/** Models that take at least one reference image — the ones a slot tile can feed. */
export const takesReference = (m: ModelDefinition) => m.fields.some((f) => f.type === 'reference')

/* ---------- mapping the composer onto a model's fields ---------- */

const find = (fields: FieldSchema[], re: RegExp) => fields.find((f) => re.test(f.name))

/** Mirrors src/lib/form.ts buildDefaultValues, kept local so board stays self-contained. */
function defaultsFor(fields: FieldSchema[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of fields) {
    if (f.default !== undefined) {
      out[f.name] = f.default
      continue
    }
    if (f.type === 'boolean') out[f.name] = false
    else if (f.type === 'reference' || f.type === 'kling_elements') out[f.name] = []
    else if (f.type === 'number') out[f.name] = f.min ?? 0
    // An optional language with no default means "detect it"; its first option is only the
    // alphabet's first (ElevenLabs dialogue's is Afrikaans). Blank, so it is left out below.
    else if (f.type === 'enum' && !f.required && /language/i.test(f.name)) out[f.name] = ''
    // With no declared default, "auto" is the API's own choice where offered: GPT Image 2's
    // background lists "transparent" first, which would cut every photo out.
    else if (f.type === 'enum') out[f.name] = (f.enum?.includes('auto') ? 'auto' : f.enum?.[0]) ?? ''
    else out[f.name] = ''
  }
  return out
}

/** Closest allowed value for an enum field — exact, then loose, then leave the default. */
function nearestEnum(field: FieldSchema, want: string): string | undefined {
  const options = field.enum ?? []
  if (!options.length) return undefined
  // Every option "includes" the empty string, so a blank would match the first one
  // (a blank language_code became Afrikaans). Blank means "leave the default".
  if (!want.trim()) return options.includes('') ? '' : undefined
  const exact = options.find((o) => o.toLowerCase() === want.toLowerCase())
  if (exact) return exact
  const loose = options.find((o) => o.toLowerCase().includes(want.toLowerCase()) || want.toLowerCase().includes(o.toLowerCase()))
  return loose
}

export type RefKind = 'image' | 'video' | 'audio'

/** A file already hosted somewhere Kie can fetch it, and what sort of file it is. */
export interface Ref {
  url: string
  kind: RefKind
}

/**
 * Which sort of file a reference field wants. Video models routinely declare three of
 * them — stills, clips and audio — so handing every reference to every field would post
 * an image where a soundtrack belongs.
 */
export function refFieldKind(field: FieldSchema): RefKind {
  if (field.mentionStyle === 'at-video') return 'video'
  if (field.mentionStyle === 'at-audio') return 'audio'
  if (field.mentionStyle === 'at-image' || field.mentionStyle === 'bracket-image') return 'image'
  const accept = field.accept ?? ''
  if (accept.includes('video')) return 'video'
  if (accept.includes('audio')) return 'audio'
  // Plenty of fields declare `none` and no accept — Veo's own stills field is one — so
  // the name is the last clue, and it is a reliable one in practice.
  const name = field.name.toLowerCase()
  if (/video|clip|footage/.test(name)) return 'video'
  if (/audio|voice|music|sound|speech/.test(name)) return 'audio'
  return 'image'
}

export interface Intent {
  prompt: string
  /** Files already hosted for Kie, in the order the user added them. */
  refs?: Ref[]
  aspect?: string
  resolution?: string
  duration?: number
  count?: number
  /**
   * References aimed at one named field, for surfaces whose slots mean something
   * specific ("last frame" rather than "another picture"). Beats the general routing.
   */
  fields?: Record<string, string | string[]>
  /** Anything a preset locks; applied last, so it always wins. */
  locked?: Record<string, unknown>
  /**
   * Field values set directly — the pills and Advanced settings hold their state per
   * field name, so they land as-is (after defaults, before references and the prompt).
   */
  values?: Record<string, unknown>
}

/** Turn a Studio intent into the `input` object this particular model expects. */
export function buildInput(model: ModelDefinition, intent: Intent): Record<string, unknown> {
  const input = defaultsFor(model.fields)
  const f = model.fields

  for (const [name, value] of Object.entries(intent.values ?? {})) {
    const field = f.find((x) => x.name === name)
    if (value === undefined || !field) continue
    // A value carried over from another model may not be one this model allows
    // ("jpeg" where it offers "jpg"): take the nearest allowed one, or keep the default.
    if (field.type === 'enum' && field.enum?.length && !field.enum.includes(String(value))) {
      const near = nearestEnum(field, String(value))
      if (near !== undefined) input[name] = near
      continue
    }
    input[name] = value
  }

  const promptField = find(f, /^prompt$|^text$|^script$|description/i) ?? f.find((x) => x.type === 'textarea')
  if (promptField) input[promptField.name] = intent.prompt

  const refFields = f.filter((x) => x.type === 'reference')
  const all = intent.refs ?? []
  if (all.length) {
    // Only the first field of each kind gets filled. Most models that declare two image
    // fields mean image + mask, or first frame + last frame — handing the same picture
    // to both would quietly add a mask nobody asked for, or freeze the shot. Anything
    // aimed at a particular one of those comes through `intent.fields` instead.
    const primary = new Map<RefKind, FieldSchema>()
    for (const field of refFields) {
      const kind = refFieldKind(field)
      if (!primary.has(kind)) primary.set(kind, field)
    }
    for (const [kind, field] of primary) {
      // With one field there is nothing to sort into, so everything goes to it.
      const mine = refFields.length === 1 ? all : all.filter((r) => r.kind === kind)
      if (!mine.length) continue
      const urls = mine.map((r) => r.url)
      input[field.name] = field.scalar ? urls[0] : urls.slice(0, field.maxItems ?? urls.length)
    }
  }

  for (const [name, value] of Object.entries(intent.fields ?? {})) {
    const list = Array.isArray(value) ? value : [value]
    const field = refFields.find((x) => x.name === name)
    if (field) {
      input[name] = field.scalar ? list[0] : list.slice(0, field.maxItems ?? list.length)
      continue
    }
    // A few models take a file as a plain URL string (Wan 2.7 Video Edit's reference_image).
    const plain = f.find((x) => x.name === name && x.type === 'string')
    if (plain) input[name] = list[0]
  }

  // Anchored: a bare /ratio/ also matches "duration" and "acceleration".
  const aspect = intent.aspect && find(f, /^aspect|(^|_)ratio|^image_size$/i)
  if (aspect && intent.aspect) {
    const v = aspect.type === 'enum' ? nearestEnum(aspect, intent.aspect) : intent.aspect
    if (v) input[aspect.name] = v
  }

  const res = intent.resolution && find(f, /resolution|image_size|^size$|quality/i)
  if (res && intent.resolution) {
    const v = res.type === 'enum' ? nearestEnum(res, intent.resolution) : intent.resolution
    if (v) input[res.name] = v
  }

  const dur = intent.duration != null ? find(f, /duration|^length$|seconds/i) : undefined
  if (dur && intent.duration != null) {
    const v = dur.type === 'enum' ? nearestEnum(dur, String(intent.duration)) : Math.max(dur.min ?? 1, Math.min(dur.max ?? intent.duration, intent.duration))
    if (v !== undefined) input[dur.name] = dur.type === 'enum' ? v : Number(v)
  }

  const n = intent.count != null ? find(f, /num_images|num_outputs|^n$|count|batch|samples/i) : undefined
  if (n && intent.count != null) input[n.name] = Math.max(n.min ?? 1, Math.min(n.max ?? intent.count, intent.count))

  for (const [k, v] of Object.entries(intent.locked ?? {})) {
    const field = f.find((x) => x.name === k)
    if (field) input[k] = field.type === 'enum' ? (nearestEnum(field, String(v)) ?? input[k]) : v
  }

  // Drop the empty strings/arrays the defaults left behind: Kie rejects some of them,
  // and an omitted optional field is always safer than a blank one.
  for (const field of f) {
    const v = input[field.name]
    if (field.required) continue
    if (v === '' || (Array.isArray(v) && !v.length)) delete input[field.name]
  }
  return input
}

/* ---------- shared stores ---------- */

/**
 * One tiny external store per resource, shared by every surface: the catalogue, history
 * and the balance are each fetched once and refreshed when a job finishes, instead of
 * every component asking the server for its own copy.
 */
function store<T>(load: () => Promise<T>) {
  let value: T | null = null
  let error: string | null = null
  let inflight: Promise<void> | null = null
  const listeners = new Set<() => void>()
  let snap: { value: T | null; error: string | null } = { value, error }
  const emit = () => {
    snap = { value, error }
    for (const l of listeners) l()
  }
  const refresh = () => {
    inflight ??= load()
      .then((v) => {
        value = v
        error = null
      })
      .catch((e: unknown) => {
        error = (e as Error).message
      })
      .finally(() => {
        inflight = null
        emit()
      })
    return inflight
  }
  const subscribe = (l: () => void) => {
    listeners.add(l)
    if (value === null && !inflight) void refresh()
    return () => listeners.delete(l)
  }
  return { subscribe, get: () => snap, refresh }
}

const useStore = <T,>(s: ReturnType<typeof store<T>>) => useSyncExternalStore(s.subscribe, s.get, s.get)

/**
 * A few catalogue entries sit under the wrong category upstream: two Wan image models are
 * filed as video, PixVerse's frame-to-frame transition as image. Studio files them where
 * their output lands.
 */
const CATEGORY_FIX: Record<string, ModelCategory> = {
  'wan/2-7-image': 'image',
  'wan/2-7-image-pro': 'image',
  'pixverse-v6/transition': 'video',
}

const catalog = store(async () => {
  const lists = await Promise.all((['image', 'video', 'audio'] as ModelCategory[]).map((c) => studioApi.models(c)))
  return lists.flatMap((l) => l.models).map((m) => (CATEGORY_FIX[m.id] ? { ...m, category: CATEGORY_FIX[m.id] } : m))
})

/**
 * Any finished job changes history and (usually) the balance. Hooked on first use, not at
 * import: jobs.ts imports this module too, and a top-level call would run before it exists.
 */
let hooked = false
const hookJobs = () => {
  if (hooked) return
  hooked = true
  onJobFinished(() => {
    void history.refresh()
    void credits.refresh()
  })
}

const HISTORY_DEPTH = 1000
const history = store(async () => {
  hookJobs()
  const { items } = await studioApi.history(HISTORY_DEPTH)
  resumeFromHistory(items)
  return items
})

const credits = store(async () => {
  hookJobs()
  return (await studioApi.credits()).credits
})

export const refreshHistory = () => history.refresh()

/* ---------- hooks ---------- */

export function useCredits(): number | null {
  return useStore(credits).value
}

/** Every model in the catalogue, all categories. */
export function useCatalog(): { models: ModelDefinition[] | null; error: string | null } {
  const { value, error } = useStore(catalog)
  return { models: value, error }
}

export function useModels(category: ModelCategory) {
  const { models: all, error } = useCatalog()
  const models = useMemo(() => all?.filter((m) => m.category === category) ?? null, [all, category])
  return { models, error }
}

/**
 * Past work, newest first, optionally one category. One deep fetch feeds every view, and
 * it refreshes itself whenever a job finishes, so nothing has to remember to reload.
 */
export function useHistory(category?: ModelCategory, limit?: number) {
  const { value } = useStore(history)
  const items = useMemo(() => {
    if (!value) return null
    const mine = category ? value.filter((i) => i.category === category) : value
    return limit ? mine.slice(0, limit) : mine
  }, [value, category, limit])
  return { items, reload: refreshHistory }
}

export const isDone = (i: HistoryItem) => i.state === 'success' || i.state === 'partial'

const FAILED_SHOWN_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Failed jobs worth keeping in a feed: recent ones (the reference app leaves them in place,
 * marked refunded), minus any the queue is already showing as a live failed tile.
 */
export function recentFailures(items: HistoryItem[] | null, liveTaskIds: Set<string>, now = Date.now()): HistoryItem[] {
  return (items ?? []).filter((i) => (i.state === 'fail' || i.state === 'expired') && now - i.createdAt < FAILED_SHOWN_MS && !liveTaskIds.has(i.taskId))
}

/** Favourite or un-favourite a result (Kie Studio's pin, capped at 30 there). */
export async function setFavourite(item: HistoryItem, on: boolean) {
  await studioApi.favourite(item.taskId, on)
  await refreshHistory()
}

/** Remove a result from history and its archived files with it. */
export async function deleteResult(taskId: string) {
  await studioApi.deleteHistory(taskId)
  await refreshHistory()
}

/** Keep pages that only need the balance once from holding a subscription. */
export function useRefreshCreditsOnMount() {
  useEffect(() => {
    void credits.refresh()
  }, [])
}
