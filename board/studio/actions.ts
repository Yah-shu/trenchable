/**
 * What you can do with a finished result — the viewer's buttons, the tiles' hover actions and
 * the Assets selection bar all run through here.
 *
 * the reference app hangs a dozen actions off every result: download, favourite, reuse the settings,
 * use it as a reference, animate it, upscale it, lip-sync it… Most of them are a handoff to
 * another surface with the file already in place, so the work splits in two:
 *
 *  - pure decisions (which actions fit an image, a clip or a sound; what a download is called;
 *    what each handoff carries; how a job's settings read as a table) — tested in actions.test.ts;
 *  - the few calls that touch the network (re-hosting a file for Kie, downloading, favouriting,
 *    deleting, saving to Elements or a Project).
 *
 * Kie can't reach our disk and its upload links expire, so every file a handoff carries is
 * re-hosted first (`hostOnce`, which also remembers the upload so Animate after Upscale doesn't
 * push the same bytes twice). Each slot also carries the original result (`sources`), so a tool
 * that redraws the picture can read the same-origin archive copy instead of the Kie upload.
 *
 * Regenerate is the one action that spends credits: it re-submits the job exactly as it ran,
 * and only ever on an explicit click.
 */
import { buildInput, refFieldKind, refreshHistory, studioApi, useCatalog, type HistoryItem, type MediaAsset, type ModelDefinition, type Ref, type RefKind } from './api.ts'
import { controlsFor } from './controls.ts'
import { useEstimate, type Estimate } from './estimate.ts'
import { missingFields, promptFieldOf } from './generator.ts'
import { handOff, type Handoff } from './handoff.ts'
import { findJobByTask, settleFailure, submitJob, type Job, type JobMeta } from './jobs.ts'
import { libraryApi, type Element, type ElementKind, type Project } from './library.ts'
import { hostForKie } from './mentions.ts'
import { ANGLES_MARK, BACKGROUND_IDS, EDITOR_IMAGE_FIELD, MASK_IDS, REFRAME_MARK, RELIGHT_MARK, UPSCALE_IDS, type EditMode } from './surfaces/edit/catalog.ts'
import { nearestAspect } from './surfaces/edit/frame.ts'
import { trackJobs, trackedAll } from './surfaces/track.ts'
import { GENJUTSU_TAG, genjutsuTasks, isGenjutsuItem, modeForModel } from './surfaces/video/genjutsu/genjutsu.ts'
import { closeViewer } from './viewer.ts'

export type ResultKind = RefKind

/* ---------- what a result is ---------- */

/** The kind of one file in a result, falling back to the job's category. */
export function kindOf(item: HistoryItem, media?: MediaAsset): ResultKind {
  const k = media?.kind
  if (k === 'image' || k === 'video' || k === 'audio') return k
  return item.category
}

/**
 * The files a result can show. Kie Studio stores `media` for most jobs, but older rows only
 * have `resultUrls`; lyrics and other text attachments aren't something to view or send.
 */
export function mediaOf(item: HistoryItem): MediaAsset[] {
  const media = (item.media ?? []).filter((m) => m.kind !== 'text' && Boolean(m.localPath || m.url || m.streamUrl || m.previewUrl))
  if (media.length) return media
  return (item.resultUrls ?? []).filter(Boolean).map((url) => ({ kind: item.category, url }))
}

/* ---------- downloading ---------- */

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/mp4': 'm4a',
  'audio/flac': 'flac',
}
const DEFAULT_EXT: Record<string, string> = { image: 'png', video: 'mp4', audio: 'mp3' }

/** The file's own extension (archive path first, then the provider URL), else one from its type. */
export function extOf(media: MediaAsset): string {
  for (const p of [media.localPath, media.url, media.streamUrl, media.previewUrl]) {
    if (!p) continue
    const last = p.split(/[?#]/)[0]?.split('/').pop() ?? ''
    const m = /\.([a-z0-9]{2,5})$/i.exec(last)
    if (m?.[1]) return m[1].toLowerCase()
  }
  if (media.mimeType && EXT_BY_MIME[media.mimeType]) return EXT_BY_MIME[media.mimeType] as string
  return DEFAULT_EXT[media.kind] ?? 'bin'
}

/** A few words of text as a filename: lowercase, dashes, cut on a word boundary. */
export function slugOf(text: string, max = 48): string {
  const words = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
  let out = ''
  for (const w of words) {
    const next = out ? `${out}-${w}` : w
    if (next.length > max) break
    out = next
  }
  return out || (words[0] ?? '').slice(0, max)
}

/**
 * What a downloaded file is called: the start of the prompt (so a folder of downloads still
 * says what each one is), the task id's head (so two runs of one prompt don't collide), and the
 * output number when the job made several.
 */
export function fileNameFor(item: HistoryItem, media: MediaAsset, index = 0, total = 1): string {
  const words = slugOf(item.prompt ?? '') || slugOf(item.model ?? '') || 'trenchable'
  const id = item.taskId.replace(/[^a-z0-9]/gi, '').slice(0, 8)
  return `${words}${id ? `-${id}` : ''}${total > 1 ? `-${index + 1}` : ''}.${extOf(media)}`
}

/**
 * Where the bytes come from. The archived copy is served by our own server (same origin, never
 * expires, and the browser honours `download` on it); otherwise it's the provider's link.
 */
export function downloadSource(media: MediaAsset): { href: string; local: boolean } | null {
  if (media.localPath) return { href: `/${media.localPath.replace(/^\/+/, '')}`, local: true }
  const remote = media.url ?? media.streamUrl ?? media.previewUrl
  return remote ? { href: remote, local: false } : null
}

function clickLink(href: string, name: string, newTab = false) {
  const a = document.createElement('a')
  a.href = href
  a.download = name
  if (newTab) {
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
  }
  document.body.appendChild(a)
  a.click()
  a.remove()
}

/** Save one file of a result to the computer. */
export async function downloadMedia(item: HistoryItem, media: MediaAsset, index = 0, total = 1): Promise<void> {
  const src = downloadSource(media)
  if (!src) throw new Error('This result has no file to download.')
  const name = fileNameFor(item, media, index, total)
  if (src.local) {
    clickLink(src.href, name)
    return
  }
  // A provider link is cross-origin, so the browser would ignore `download` and just play it;
  // Kie's download-url route (the one Kie Studio's history uses) hands back a link to the file.
  const res = await fetch('/api/download-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: src.href }),
  })
  const body = (await res.json().catch(() => ({}))) as { data?: { downloadUrl?: string }; error?: string }
  const link = body.data?.downloadUrl
  if (!res.ok || !link) throw new Error(body.error ?? 'Kie would not give a download link for this file. It may have expired.')
  clickLink(link, name, true)
}

/** The server zips at most this many files per request. */
export const ZIP_MAX = 200

/**
 * One zip instead of a download per file — possible only when every file is archived on our
 * disk (the server zips `/media/...` paths, nothing remote). Null for a single file, which is
 * better saved as itself, or when anything lives only at the provider.
 */
export function zipPlan(items: HistoryItem[]): { path: string; name: string }[] | null {
  const out: { path: string; name: string }[] = []
  for (const item of items) {
    const files = mediaOf(item)
    for (const [i, m] of files.entries()) {
      const src = downloadSource(m)
      if (!src?.local) return null
      out.push({ path: src.href, name: fileNameFor(item, m, i, files.length) })
    }
  }
  return out.length > 1 ? out : null
}

/** What a zip is called: the day it was made, plus a part number when it took several. */
export const zipName = (now: Date, part = 0, parts = 1): string => {
  const pad = (n: number) => String(n).padStart(2, '0')
  const day = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  return `trenchable-assets-${day}${parts > 1 ? `-part${part + 1}` : ''}.zip`
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  clickLink(url, name)
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Every file of every result: as zips (200 files each) when they are all archived, otherwise
 * one after another (browsers drop downloads fired in the same tick).
 */
export async function downloadItems(items: HistoryItem[]): Promise<void> {
  const plan = zipPlan(items)
  if (plan) {
    const parts = Math.ceil(plan.length / ZIP_MAX)
    const now = new Date()
    for (let p = 0; p < parts; p++) {
      const blob = await studioApi.zip(plan.slice(p * ZIP_MAX, (p + 1) * ZIP_MAX))
      saveBlob(blob, zipName(now, p, parts))
    }
    return
  }
  const failed: string[] = []
  let first = true
  for (const item of items) {
    const files = mediaOf(item)
    for (const [i, m] of files.entries()) {
      if (!first) await new Promise((r) => setTimeout(r, 300))
      first = false
      try {
        await downloadMedia(item, m, i, files.length)
      } catch {
        failed.push(item.taskId)
      }
    }
  }
  if (failed.length) throw new Error(`${failed.length} ${failed.length === 1 ? 'file' : 'files'} could not be downloaded; the provider link may have expired.`)
}

/* ---------- copying ---------- */

/** Copy text, falling back to the old textarea trick where the clipboard API is refused. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    return
  } catch {
    // Not a secure context, or permission refused — fall through.
  }
  const box = document.createElement('textarea')
  box.value = text
  box.setAttribute('readonly', '')
  box.style.position = 'fixed'
  box.style.opacity = '0'
  document.body.appendChild(box)
  box.select()
  const ok = document.execCommand('copy')
  box.remove()
  if (!ok) throw new Error('The browser would not copy that.')
}

/* ---------- favourites and deleting ---------- */

/**
 * Favourite (or un-favourite) several results: only the flag goes to the server (never the whole
 * row, which might be older than what the server holds), all at once, then one refresh.
 */
export async function setFavourites(items: HistoryItem[], on: boolean): Promise<void> {
  const changed = items.filter((i) => Boolean(i.pinned) !== on)
  if (!changed.length) return
  const done = await Promise.allSettled(changed.map((i) => studioApi.favourite(i.taskId, on)))
  await refreshHistory()
  const failures = done.filter((d): d is PromiseRejectedResult => d.status === 'rejected')
  if (!failures.length) return
  if (changed.length === 1) throw new Error((failures[0]?.reason as Error | undefined)?.message || 'That did not save.')
  throw new Error(`${failures.length} of ${changed.length} did not save.`)
}

/** Delete results and their archived files. Carries on past a failure and reports it at the end. */
export async function deleteItems(taskIds: string[]): Promise<void> {
  let failed = 0
  for (const id of taskIds) {
    try {
      await studioApi.deleteHistory(id)
    } catch {
      failed++
    }
  }
  await refreshHistory()
  if (failed) throw new Error(`${failed} of ${taskIds.length} could not be deleted.`)
}

/* ---------- handing a file to Kie ---------- */

/** Which upload `hostForKie` will make for this file, or null when there's nothing to send. */
export function hostPlan(media: MediaAsset): { via: 'upload' | 'rehost'; from: string } | null {
  if (media.localPath) return { via: 'upload', from: `/${media.localPath.replace(/^\/+/, '')}` }
  if (media.url) return { via: 'rehost', from: media.url }
  return null
}

const HOST_TTL = 6 * 60 * 60 * 1000
const hosted = new Map<string, { url: string; at: number }>()
const hosting = new Map<string, Promise<string>>()

/** `hostForKie`, remembered for a few hours so a second action on the same file is instant. */
export function hostOnce(media: MediaAsset): Promise<string> {
  const plan = hostPlan(media)
  if (!plan) return Promise.reject(new Error('That result has no file to send.'))
  const hit = hosted.get(plan.from)
  if (hit && Date.now() - hit.at < HOST_TTL) return Promise.resolve(hit.url)
  const busy = hosting.get(plan.from)
  if (busy) return busy
  const job = hostForKie(media)
    .then((url) => {
      hosted.set(plan.from, { url, at: Date.now() })
      return url
    })
    .finally(() => hosting.delete(plan.from))
  hosting.set(plan.from, job)
  return job
}

/* ---------- the tools a result can go to ---------- */

export type ToolId =
  | 'reference'
  | 'animate'
  | 'upscale'
  | 'background'
  | 'inpaint'
  | 'reframe'
  | 'relight'
  | 'angles'
  | 'layers'
  | 'extend'
  | 'upscale-video'
  | 'lipsync'
  | 'edit-video'
  | 'motion'
  | 'lipsync-audio'
  | 'last-frame'
  | 'isolate'
  | 'cover'
  | 'change-voice'
  | 'translate'

export interface ToolSpec {
  id: ToolId
  label: string
  /** One line on what happens, for the button's title. */
  hint: string
}

const TOOLS: Record<ResultKind, ToolSpec[]> = {
  image: [
    { id: 'reference', label: 'Use as reference', hint: 'Start a new image with this one attached' },
    { id: 'animate', label: 'Animate', hint: 'Make a video that starts on this frame' },
    { id: 'last-frame', label: 'Use as last frame', hint: 'Make a video that ends on this frame' },
    { id: 'upscale', label: 'Upscale', hint: 'Open Edit with this image, ready to upscale' },
    { id: 'background', label: 'Remove background', hint: 'Open Edit with this image, ready to cut out' },
    { id: 'inpaint', label: 'Inpaint', hint: 'Paint over a part and describe what goes there' },
    { id: 'reframe', label: 'Reframe', hint: 'Change the aspect ratio and fill the new edges' },
    { id: 'relight', label: 'Relight', hint: 'Change the light on this image' },
    { id: 'angles', label: 'Angles', hint: 'See this from other camera angles, one picture per angle' },
    { id: 'layers', label: 'Layers', hint: 'Split this image into layers' },
  ],
  video: [
    { id: 'extend', label: 'Extend', hint: 'Carry the clip on for a few more seconds' },
    { id: 'upscale-video', label: 'Upscale', hint: 'Make the clip sharper and larger' },
    { id: 'lipsync', label: 'Lip-sync', hint: 'Make the person in this clip say new words' },
    { id: 'edit-video', label: 'Edit video', hint: 'Change something in this clip with a prompt' },
    { id: 'motion', label: 'Use the motion', hint: 'Open GenShitSu with this clip, to put a character of your own through its moves' },
    { id: 'change-voice', label: 'Change voice', hint: 'Same words and timing, read in another voice' },
    { id: 'translate', label: 'Translate', hint: 'Dub the clip into another language, lip-synced' },
  ],
  audio: [
    { id: 'lipsync-audio', label: 'Lip-sync with this', hint: 'Make a face or clip speak this audio' },
    { id: 'isolate', label: 'Isolate voice', hint: 'Pull the voice out of the music and noise' },
    { id: 'cover', label: 'Cover as a song', hint: 'Suno keeps the melody and sings it again' },
  ],
}

/** The tools that fit this kind of file, in the order the viewer shows them. */
export const toolsFor = (kind: ResultKind): ToolSpec[] => TOOLS[kind]

/** Elements hold reference images, so only a still can become one. */
export const canSaveElement = (kind: ResultKind): boolean => kind === 'image'

/**
 * The prefill a tool's handoff carries, given the file already hosted for Kie. With the original
 * `media`, every slot also names it in `sources` (STUDIO-ENGINE.md: tools that redraw pixels
 * read the archive copy, since a Kie upload can't be read back by the page).
 */
export function handoffFor(id: ToolId, item: HistoryItem, url: string, media?: MediaAsset): Handoff {
  const h = baseHandoff(id, item, url)
  if (!media || !h.slots) return h
  return { ...h, sources: Object.fromEntries(Object.keys(h.slots).map((slot) => [slot, media])) }
}

function baseHandoff(id: ToolId, item: HistoryItem, url: string): Handoff {
  switch (id) {
    case 'reference':
      return { surface: 'image', refs: [{ url, kind: 'image' }] }
    case 'animate':
      return { surface: 'video', mode: 'create', slots: { first: url } }
    case 'last-frame':
      return { surface: 'video', mode: 'create', slots: { last: url } }
    case 'upscale':
    case 'background':
    case 'inpaint':
    case 'reframe':
    case 'relight':
    case 'angles':
      return { surface: 'edit', mode: id, slots: { image: url } }
    case 'layers':
      return { surface: 'layers', slots: { image: url } }
    case 'extend':
      return { surface: 'video', mode: 'extend', slots: { video: url }, sourceTaskId: item.taskId }
    case 'upscale-video':
      return { surface: 'video', mode: 'upscale', slots: { video: url }, sourceTaskId: item.taskId }
    case 'lipsync':
      return { surface: 'video', mode: 'lipsync', slots: { video: url } }
    case 'edit-video':
      return { surface: 'video', mode: 'edit', slots: { video: url } }
    case 'motion':
      return { surface: 'genjutsu', mode: 'transfer', slots: { motion: url } }
    case 'lipsync-audio':
      return { surface: 'video', mode: 'lipsync', slots: { audio: url } }
    case 'isolate':
      return { surface: 'audio', mode: 'isolate', slots: { audio: url } }
    case 'cover':
      return { surface: 'audio', mode: 'music', slots: { audio: url } }
    case 'change-voice':
      return { surface: 'audio', mode: 'change', slots: { video: url } }
    case 'translate':
      return { surface: 'audio', mode: 'translate', slots: { video: url } }
  }
}

/** Host the file, post the handoff, close the viewer — the target surface opens filled in. */
export async function runTool(id: ToolId, item: HistoryItem, media: MediaAsset): Promise<void> {
  const url = await hostOnce(media)
  handOff(handoffFor(id, item, url, media))
  closeViewer()
}

/* ---------- the viewer's Edit tab ---------- */

/** The picture field an image editor reads (Nano Banana's image_input, GPT Image's input_urls…). */
export const editorField = (model: ModelDefinition | null) => model?.fields.find((f) => f.type === 'reference' && EDITOR_IMAGE_FIELD.test(f.name))

/** How many pictures that field takes: 1 for a single-URL field, 0 when there is none. */
export function editorRoom(model: ModelDefinition | null): number {
  const f = editorField(model)
  if (!f) return 0
  return f.scalar ? 1 : (f.maxItems ?? 10)
}

/**
 * The job the viewer's Edit tab sends: this picture first, the extra references after it (as
 * many as the model takes), the prompt, and the picture's own shape — `auto` where the model
 * offers it, else the nearest ratio. The rest is the model's defaults. Null without a picture field.
 */
export function imageEditInput(model: ModelDefinition, prompt: string, urls: string[], ratio: number | null): Record<string, unknown> | null {
  const field = editorField(model)
  if (!field) return null
  const pill = controlsFor(model).aspect
  const aspect = pill ? nearestAspect(pill.choices, ratio && ratio > 0 ? ratio : 1) : null
  return buildInput(model, {
    prompt: prompt.trim(),
    fields: { [field.name]: urls.slice(0, editorRoom(model)) },
    values: pill && aspect ? { [pill.field.name]: aspect } : {},
  })
}

/** Why the Edit tab can't send yet, in plain words, or null. */
export function imageEditBlocker(model: ModelDefinition | null, input: Record<string, unknown> | null, prompt: string): string | null {
  if (!model) return 'No image editor is on offer here.'
  if (!prompt.trim()) return 'Describe the edit first.'
  if (!input) return `${model.title} has no picture field.`
  const missing = missingFields(model, input)
  return missing.length ? `Still needed: ${missing.map((f) => f.label || f.name).join(', ')}.` : null
}

/* ---------- Reuse ---------- */

const hay = (item: HistoryItem) => `${item.modelId ?? ''} ${item.model ?? ''}`.toLowerCase()

/**
 * Which Edit tool made a still, or null for an ordinary image job. History doesn't record the
 * surface, so it is read the way the tools tell their own History apart (edit/catalog.ts): by
 * model for Upscale, Remove BG and Inpaint (a mask model given a mask), and by the words
 * Relight's, Reframe's and Angles' recipes start with. The prompt-only Edit tool runs the same models
 * as the image composer, so its results Reuse into Image — with the picture as a reference.
 */
export function editToolOf(item: HistoryItem): EditMode | null {
  if (item.category !== 'image') return null
  const by = (ids: string[]) => ids.includes(item.modelId ?? '') || ids.includes(item.model)
  const prompt = item.prompt ?? ''
  if (prompt.startsWith(RELIGHT_MARK)) return 'relight'
  if (prompt.startsWith(REFRAME_MARK)) return 'reframe'
  if (prompt.startsWith(ANGLES_MARK)) return 'angles'
  if (by(UPSCALE_IDS)) return 'upscale'
  if (by(BACKGROUND_IDS)) return 'background'
  if (by(MASK_IDS) && item.input?.mask_url) return 'inpaint'
  return null
}

/** Whether a job was GenShitSu's (its tracked tags, or the guided swap's model): it goes back there, not to Video. */
export const ofGenjutsu = (item: HistoryItem): boolean => isGenjutsuItem(item, genjutsuTasks(trackedAll()))

/** The surface Reuse lands on: an Edit tool's result goes back to Edit, GenShitSu's to GenShitSu, the rest to their category's. */
export const reuseSurface = (item: HistoryItem): string => (editToolOf(item) ? 'edit' : ofGenjutsu(item) ? 'genjutsu' : item.category)

/** Which tab of its surface a job came from, read off its model, so Reuse lands on the same one. */
export function reuseMode(item: HistoryItem): string | undefined {
  const tool = editToolOf(item)
  if (tool) return tool
  if (ofGenjutsu(item)) return modeForModel(item.modelId)
  const h = hay(item)
  if (item.category === 'video') {
    if (/extend/.test(h)) return 'extend'
    if (/lip.?sync|infinite.?talk|talking|avatar/.test(h)) return 'lipsync'
    if (/upscal/.test(h)) return 'upscale'
    if (/motion.?control/.test(h)) return 'motion'
    if (/aleph|video.?edit|\bedit\b/.test(h)) return 'edit'
    return 'create'
  }
  if (item.category === 'audio') {
    if (/dialog/.test(h)) return 'dialogue'
    if (/music|suno|song|lyric/.test(h)) return 'music'
    if (/isolat|separat|stem/.test(h)) return 'isolate'
    return 'tts'
  }
  return undefined
}

export const isUrl = (v: unknown): v is string => typeof v === 'string' && /^(https?:\/\/|\/media\/|data:)/i.test(v.trim())

/** A URL's kind by its extension; 'file' when it doesn't say. */
export function urlKind(url: string): RefKind | 'file' {
  const last = url.split(/[?#]/)[0]?.split('/').pop()?.toLowerCase() ?? ''
  if (/\.(png|jpe?g|webp|gif|avif|bmp)$/.test(last)) return 'image'
  if (/\.(mp4|webm|mov|m4v)$/.test(last)) return 'video'
  if (/\.(mp3|wav|ogg|m4a|flac|aac)$/.test(last)) return 'audio'
  return 'file'
}

export interface ReuseSource {
  /** The input field it came from. */
  key: string
  url: string
  kind: RefKind
  /** The handoff slot it fills; none means an ordinary reference. */
  slot?: string
}

/** Which slot a file from a past job fills on its surface (the slot ids of STUDIO-ENGINE.md). */
function slotFor(surface: string, mode: string | undefined, key: string, kind: RefKind): string | undefined {
  if (surface === 'image') return undefined
  if (surface === 'edit') return kind === 'image' ? 'image' : undefined
  if (surface === 'audio') return kind === 'audio' ? 'audio' : undefined
  // GenShitSu: the clip; its pictures fill img1, img2… in order (reuseSources).
  if (surface === 'genjutsu') return kind === 'video' ? 'motion' : undefined
  if (kind === 'audio') return 'audio'
  if (kind === 'video') return mode === 'motion' ? 'motion' : 'video'
  if (/last|end|tail/i.test(key)) return mode === 'create' ? 'last' : undefined
  if (mode === 'lipsync') return 'face'
  if (mode === 'motion') return 'character'
  if (mode === 'edit') return 'reference'
  return 'first'
}

/**
 * The files a job was given, sorted into what Reuse should put back: references for Image,
 * slots for the rail surfaces (one file per slot; the first one wins).
 */
export function reuseSources(item: HistoryItem, model?: ModelDefinition | null): ReuseSource[] {
  const input = item.input ?? {}
  const surface = reuseSurface(item)
  const mode = reuseMode(item)
  const fields = model?.fields.filter((f) => f.type === 'reference')
  const keys = fields ? fields.map((f) => f.name) : Object.keys(input)
  const out: ReuseSource[] = []
  const taken = new Set<string>()
  let picture = 0
  for (const key of keys) {
    // Edit's tools work on one picture; a painted mask is drawn again, never carried as a file.
    if (surface === 'edit' && /mask/i.test(key)) continue
    const raw = input[key]
    const urls = (Array.isArray(raw) ? raw : [raw]).filter(isUrl)
    const field = fields?.find((f) => f.name === key)
    for (const url of urls) {
      const guessed = urlKind(url)
      const kind: RefKind = field ? refFieldKind(field) : guessed === 'file' ? 'image' : guessed
      const slot = surface === 'genjutsu' && kind === 'image' ? `img${++picture}` : slotFor(surface, mode, key, kind)
      if (slot) {
        if (taken.has(slot)) continue
        taken.add(slot)
      }
      out.push({ key, url, kind, ...(slot ? { slot } : {}) })
    }
  }
  return out
}

/** The Reuse handoff: same surface, same tab, same model, every setting, the files it had. */
export function reuseHandoff(item: HistoryItem, files: ReuseSource[] = []): Handoff {
  const refs: Ref[] = files.filter((f) => !f.slot).map((f) => ({ url: f.url, kind: f.kind }))
  const slots: Record<string, string> = {}
  for (const f of files) if (f.slot) slots[f.slot] = f.url
  const mode = reuseMode(item)
  return {
    surface: reuseSurface(item),
    ...(mode ? { mode } : {}),
    ...(item.prompt !== undefined ? { prompt: item.prompt } : {}),
    ...(item.modelId ? { modelId: item.modelId } : {}),
    ...(item.input ? { values: item.input } : {}),
    ...(refs.length ? { refs } : {}),
    ...(Object.keys(slots).length ? { slots } : {}),
  }
}

/** Kie keeps an upload for about three days; past two, re-host a reference before reusing it. */
const FRESH_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Reuse a job. Its reference files are Kie upload links: young ones still work as they are,
 * older ones are re-hosted, and any Kie has already thrown away are left out — `dropped` says
 * how many, so the viewer can ask before going ahead without them.
 */
export async function prepareReuse(item: HistoryItem, model?: ModelDefinition | null): Promise<{ handoff: Handoff; dropped: number }> {
  const sources = reuseSources(item, model)
  if (Date.now() - item.createdAt < FRESH_MS || !sources.length) return { handoff: reuseHandoff(item, sources), dropped: 0 }
  const settled = await Promise.allSettled(sources.map((s) => (s.url.startsWith('/') ? Promise.resolve(s.url) : studioApi.rehost(s.url).then((r) => r.fileUrl))))
  const kept: ReuseSource[] = []
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') kept.push({ ...(sources[i] as ReuseSource), url: r.value })
  })
  return { handoff: reuseHandoff(item, kept), dropped: sources.length - kept.length }
}

/** Post a prepared Reuse and close the viewer. */
export function sendReuse(handoff: Handoff) {
  handOff(handoff)
  closeViewer()
}

/**
 * Their Recreate, on a failed job: the prompt, model, every setting and the files it had,
 * back in the form — Reuse by another name, and like Reuse it spends nothing. Resolves to how
 * many of its files Kie had already thrown away (those are left out).
 */
export async function recreate(item: HistoryItem, model?: ModelDefinition | null): Promise<number> {
  const { handoff, dropped } = await prepareReuse(item, model)
  sendReuse(handoff)
  return dropped
}

/** A job in the queue as the history row it becomes, so a live failed tile can Recreate like a failed row. */
export function itemOfJob(job: Job): HistoryItem {
  return {
    taskId: job.taskId ?? job.id,
    model: job.modelTitle,
    modelId: job.modelId,
    category: job.category,
    state: job.status === 'error' ? 'fail' : job.status === 'done' ? 'success' : (job.phase ?? 'waiting'),
    createdAt: job.startedAt,
    provider: job.provider,
    operation: job.operation,
    input: job.input,
    ...(job.prompt ? { prompt: job.prompt } : {}),
    ...(job.error ? { failMsg: job.error } : {}),
  }
}

/* ---------- the settings table ---------- */

export interface SettingRow {
  key: string
  label: string
  value: string
}

export interface SettingFiles {
  key: string
  label: string
  urls: string[]
  /** What the field takes, when the model says; otherwise each URL's extension decides. */
  kind?: RefKind
}

/** `aspect_ratio` → "Aspect ratio", `firstFrameUrl` → "First frame url". */
export function humanize(key: string): string {
  const words = key
    .replace(/^_+/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  return words ? words[0]!.toUpperCase() + words.slice(1) : key
}

function formatValue(key: string, v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null
  if (typeof v === 'boolean') return v ? 'On' : 'Off'
  if (typeof v === 'number') return /duration|seconds/i.test(key) ? `${v}s` : String(v)
  if (typeof v === 'string') return v
  if (Array.isArray(v)) {
    if (!v.length) return null
    if (v.every((x) => ['string', 'number', 'boolean'].includes(typeof x))) return v.map(String).join(', ')
  }
  const json = JSON.stringify(v)
  if (!json || json === '{}' || json === '[]') return null
  return json.length > 200 ? `${json.slice(0, 199)}…` : json
}

/**
 * A job's input as something a person can read: one row per setting, in the model's own order
 * and with its own labels when the model is known, the prompt left out (it has its own block),
 * and any file links pulled out to show as thumbnails instead of as long URLs.
 */
export function settingRows(item: HistoryItem, model?: ModelDefinition | null): { rows: SettingRow[]; files: SettingFiles[] } {
  const input = item.input ?? {}
  const promptKey = model ? promptFieldOf(model)?.name : undefined
  const prompt = (item.prompt ?? '').trim()
  const order = model ? [...model.fields.map((f) => f.name).filter((k) => k in input), ...Object.keys(input).filter((k) => !model.fields.some((f) => f.name === k))] : Object.keys(input)
  const rows: SettingRow[] = []
  const files: SettingFiles[] = []
  for (const key of order) {
    if (key.startsWith('_') || key === promptKey) continue
    const v = input[key]
    if (typeof v === 'string' && ((prompt && v.trim() === prompt) || (!promptKey && key === 'prompt'))) continue
    const field = model?.fields.find((f) => f.name === key)
    const label = field?.label || humanize(key)
    const list = Array.isArray(v) ? v : [v]
    if (list.length && list.every(isUrl)) {
      files.push({ key, label, urls: list as string[], ...(field?.type === 'reference' ? { kind: refFieldKind(field) } : {}) })
      continue
    }
    const value = formatValue(key, v)
    if (value !== null) rows.push({ key, label, value })
  }
  return { rows, files }
}

/* ---------- Regenerate ---------- */

const FRESH_INPUT_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Why a job can't run again as it was, in plain words, or null when it can. The catalogue has
 * to be loaded (that's where the model's provider and price come from) and still hold the model.
 */
export function regenerateBlocker(item: HistoryItem, models: ModelDefinition[] | null): string | null {
  if (!models) return 'Loading the models…'
  if (!item.input || !Object.keys(item.input).length) return "This job's settings weren't recorded, so it can't run again exactly. Use Reuse instead."
  if (!item.modelId || !models.some((m) => m.id === item.modelId)) return "This job's model isn't in Kie's catalogue any more. Use Reuse to pick another."
  return null
}

/** Where a re-run lands: the surface that ran it (if the queue still knows), else GenShitSu for its jobs, else its category. */
export function regenerateMeta(item: HistoryItem, job?: Pick<Job, 'meta'>): JobMeta {
  const aspect = item.input?.aspect_ratio ?? item.input?.aspectRatio ?? item.input?.image_size
  return {
    surface: job?.meta.surface ?? (ofGenjutsu(item) ? 'genjutsu' : item.category),
    ...(job?.meta.label ? { label: job.meta.label } : {}),
    ...(typeof aspect === 'string' ? { aspect } : {}),
    ...(job?.meta.projectId ? { projectId: job.meta.projectId } : {}),
  }
}

/** The input keys that hold files: the model's reference fields, or anything that is a link. */
function fileKeys(input: Record<string, unknown>, model: ModelDefinition): string[] {
  const refs = model.fields.filter((f) => f.type === 'reference').map((f) => f.name)
  return Object.keys(input).filter((k) => {
    const v = input[k]
    return refs.includes(k) || (Array.isArray(v) ? v.some(isUrl) : isUrl(v))
  })
}

/**
 * The job's input, ready to send again. Its files are Kie uploads: fresh ones go as they are,
 * older ones are re-hosted, and if Kie has already thrown one away the job can't run as it was.
 */
export async function regenerateInput(item: HistoryItem, model: ModelDefinition): Promise<Record<string, unknown>> {
  const input = { ...(item.input ?? {}) }
  if (Date.now() - item.createdAt < FRESH_INPUT_MS) return input
  let lost = 0
  const fresh = async (u: unknown): Promise<unknown> => {
    if (!isUrl(u) || u.startsWith('/')) return u
    try {
      return (await studioApi.rehost(u)).fileUrl
    } catch {
      lost++
      return u
    }
  }
  for (const key of fileKeys(input, model)) {
    const v = input[key]
    input[key] = Array.isArray(v) ? await Promise.all(v.map(fresh)) : await fresh(v)
  }
  if (lost) {
    const one = lost === 1
    throw new Error(`${lost} of the files this job was given ${one ? 'has' : 'have'} expired on Kie, so it can't run again as it was. Use Reuse to swap ${one ? 'it' : 'them'}.`)
  }
  return input
}

/** Run a job again, exactly as it went out. Returns the new job's id. Spends credits. */
export async function regenerate(item: HistoryItem, model: ModelDefinition): Promise<string> {
  const input = await regenerateInput(item, model)
  const id = submitJob(model, input, regenerateMeta(item, findJobByTask(item.taskId)))
  // A GenShitSu job's re-run stays in GenShitSu's History.
  if (ofGenjutsu(item)) trackJobs([id], GENJUTSU_TAG)
  return id
}

/**
 * Retry a failed history row: the same job again, and the old row settled (jobs.ts) so it
 * leaves the feed instead of sitting next to the new one. Spends credits.
 */
export async function retryFailed(item: HistoryItem, model: ModelDefinition): Promise<string> {
  const id = await regenerate(item, model)
  settleFailure(item.taskId)
  return id
}

/** Regenerate's button state: the model, why it can't run, and the price of one more run. */
export function useRegenerate(item: HistoryItem): { model: ModelDefinition | null; blocker: string | null; estimate: Estimate | null } {
  const { models } = useCatalog()
  const model = models?.find((m) => m.id === item.modelId) ?? null
  const estimate = useEstimate(model, item.input ?? null, 1)
  return { model, blocker: regenerateBlocker(item, models), estimate }
}

/* ---------- library filters ---------- */

/** the reference app's "Enhanced" type: results of an upscaler or restorer rather than a fresh generation. */
export const isEnhanced = (item: HistoryItem): boolean => /upscal|enhanc|topaz|super.?res|restor/.test(hay(item))

export type AssetType = 'all' | ResultKind | 'enhanced'

export const matchesType = (item: HistoryItem, type: AssetType): boolean =>
  type === 'all' ? true : type === 'enhanced' ? isEnhanced(item) : item.category === type

export type DateRange = { kind: 'all' | 'today' | '7d' | '30d' } | { kind: 'custom'; from?: string; to?: string }

/** The start of a local day, `shift` days on — by the calendar, so a DST change can't move it an hour. */
const dayStart = (d: Date, shift = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + shift).getTime()
/** 'YYYY-MM-DD' (what a date input gives) as that local day, or null. */
const parseDay = (s?: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? '')
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/**
 * Their Date range filter. "Last 7 days" is today and the six days before it, by the calendar
 * rather than 168 hours back; a custom range includes both of its end days.
 */
export function inDateRange(createdAt: number, range: DateRange, now = new Date()): boolean {
  if (range.kind !== 'custom') {
    if (range.kind === 'all') return true
    const back = range.kind === 'today' ? 0 : range.kind === '7d' ? 6 : 29
    return createdAt >= dayStart(now, -back)
  }
  const from = parseDay(range.from)
  const to = parseDay(range.to)
  if (from && createdAt < dayStart(from)) return false
  if (to && createdAt >= dayStart(to, 1)) return false
  return true
}

/** The ways a day can be typed into search: "october 7, 2026", "oct 7", "2026-10-07", "10/7/2026", "tuesday". */
export function dateWords(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  const long = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const short = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const iso = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const us = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
  const weekday = d.toLocaleDateString('en-US', { weekday: 'long' })
  return `${long} | ${short} | ${iso} | ${us} | ${weekday}`.toLowerCase()
}

/**
 * Their search box: "Now you can search by date and prompt". The whole query can match the prompt
 * or the date ("october 7"); otherwise every word has to match one or the other ("cat oct 7").
 */
export function matchesSearch(item: HistoryItem, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!q) return true
  const prompt = (item.prompt ?? '').toLowerCase()
  const dates = dateWords(item.createdAt)
  if (prompt.includes(q) || dates.includes(q)) return true
  return q.split(' ').every((w) => prompt.includes(w) || dates.includes(w))
}

/* ---------- multi-select ---------- */

/**
 * The selection after a click in a grid. A plain click toggles one; a shift-click adds the
 * whole run between the last click (`anchor`) and this one, in the order the grid shows them.
 */
export function selectRange(order: string[], selected: ReadonlySet<string>, anchor: string | null, id: string, shift: boolean): Set<string> {
  const next = new Set(selected)
  if (shift && anchor && anchor !== id) {
    const a = order.indexOf(anchor)
    const b = order.indexOf(id)
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a]
      for (const x of order.slice(lo, hi + 1)) next.add(x)
      return next
    }
  }
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/* ---------- Elements and Projects ---------- */

/**
 * What the library copies an element image from: the archived file by its same-origin path
 * (the server reads it off disk), else the provider's https link.
 */
export function elementSource(media: MediaAsset): string | null {
  if (media.localPath) return `/${media.localPath.replace(/^\/+/, '')}`
  const url = media.url ?? media.previewUrl
  return url && /^https:\/\//i.test(url) ? url : null
}

export const ELEMENT_CHOICES: { id: ElementKind; label: string }[] = [
  { id: 'character', label: 'Character' },
  { id: 'product', label: 'Product' },
  { id: 'location', label: 'Location' },
  { id: 'style', label: 'Style' },
]

/** Save one still as a new Element. */
export async function saveAsElement(media: MediaAsset, name: string, kind: ElementKind, description?: string): Promise<Element> {
  const url = elementSource(media)
  if (!url) throw new Error('Only a result with a file on disk or an https link can become an Element.')
  const clean = name.trim()
  if (!clean) throw new Error('Give the element a name.')
  return libraryApi.createElement({ name: clean, kind, ...(description?.trim() ? { description: description.trim() } : {}), sources: [{ url }] })
}

/** Add results to a project, or to a new one made on the spot. Newest first, as the server wants. */
export async function addToProject(target: { id: string } | { title: string }, items: HistoryItem[]): Promise<Project> {
  const id = 'id' in target ? target.id : (await libraryApi.createProject(target.title.trim())).id
  const ids = [...items].sort((a, b) => b.createdAt - a.createdAt).map((i) => i.taskId)
  return libraryApi.addToProject(id, ids)
}
