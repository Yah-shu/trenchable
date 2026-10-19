/**
 * Video's six modes as data: which catalogue models each one offers, which past clips the
 * task-based tools can work on, and what each tool needs from that clip.
 *
 * the reference app's Video rail switches between Create, Extend, Motion, Edit, Lip-sync and
 * Upscale. On Kie those are different models with different inputs, and some of them
 * (Veo / Runway / Grok extend, Veo 1080p / 4K, Grok upscale, Seedance 2.5 draft) don't take
 * a file at all — they take the id of a job Kie already ran. So a mode is a model filter,
 * and a task tool is "this clip → this model with these ids filled in". Kept pure so the
 * rules are tested without the network.
 */
import type { HistoryItem, ModelDefinition } from '../../api.ts'
import { isDone, refFieldKind } from '../../api.ts'
import { isTool } from '../../families.ts'

export type VideoMode = 'create' | 'extend' | 'motion' | 'edit' | 'lipsync' | 'upscale'

export const VIDEO_MODES: VideoMode[] = ['create', 'extend', 'motion', 'edit', 'lipsync', 'upscale']

export const isVideoMode = (s: unknown): s is VideoMode => typeof s === 'string' && (VIDEO_MODES as string[]).includes(s)

/* ---------- which models each mode offers ---------- */

const MOTION = /motion-control|animate-(move|replace)/i
const EDIT = /transformation|videoedit|video-edit|video-to-video|^runway\/aleph$/i
const LIPSYNC_CLIP = /lip-?sync/i
/** Photo + voice → talking clip. Omnihuman's detection helpers only find faces for a mask. */
const LIPSYNC_PHOTO = /ai-avatar|infinitalk|^omnihuman-1-5$|speech-to-video/i
const TOPAZ = 'topaz/video-upscale'

export const EXTENDERS = ['veo/extend', 'runway/extend', 'grok-imagine/extend']
const TASK_UPSCALERS = ['veo/1080p', 'veo/4k', 'grok-imagine/upscale', 'bytedance/seedance-2-5-draft']

/** The named reference fields omni models (Seedance 2.x, Wan 3.0, MiniMax H3…) read. */
export const OMNI_FIELD = /^reference_(image|video|audio)(_urls)?$/

/** A generator that reads reference images, clips or audio beyond a first/last frame. */
export const takesReferences = (m: ModelDefinition) => !isTool(m) && m.fields.some((f) => f.type === 'reference' && OMNI_FIELD.test(f.name))

export const isMotionModel = (m: ModelDefinition) => MOTION.test(m.id)
export const isEditModel = (m: ModelDefinition) => EDIT.test(m.id)
export const isClipLipsync = (m: ModelDefinition) => LIPSYNC_CLIP.test(m.id)
export const isPhotoLipsync = (m: ModelDefinition) => LIPSYNC_PHOTO.test(m.id)
export const isExtender = (m: ModelDefinition) => EXTENDERS.includes(m.id)

/** Which results belong in a mode's History tab, by the model that made them. */
export function inMode(mode: VideoMode, item: HistoryItem): boolean {
  const id = item.modelId ?? ''
  switch (mode) {
    case 'create':
      return true
    case 'extend':
      return EXTENDERS.includes(id)
    case 'motion':
      return MOTION.test(id)
    case 'edit':
      return EDIT.test(id)
    case 'lipsync':
      return LIPSYNC_CLIP.test(id) || LIPSYNC_PHOTO.test(id)
    case 'upscale':
      return id === TOPAZ || TASK_UPSCALERS.includes(id)
  }
}

/* ---------- task tools: a past clip → the model that can work on it ---------- */

export interface SourceTool {
  modelId: string
  /** What the tool needs from the clip. `locked` only lands on fields the model has. */
  locked: Record<string, string | number>
}

const idOf = (item: HistoryItem) => item.modelId ?? ''

const isVeo = (item: HistoryItem) => /^veo\/(generate|extend)$/.test(idOf(item)) || (item.provider === 'veo' && /^(generate|extend)$/.test(item.operation ?? 'generate'))
const isRunway = (item: HistoryItem) => /^runway\/(generate|extend)$/.test(idOf(item)) || (item.provider === 'runway' && /^(generate|extend)$/.test(item.operation ?? 'generate'))
const isGrok = (item: HistoryItem) => /^grok-imagine\/(text-to-video|image-to-video|extend)$/.test(idOf(item))
const isSeedanceDraft = (item: HistoryItem) => idOf(item) === 'bytedance/seedance-2-5' && item.input?.draft === true

/** Runway's extend wants the clip's own id as well as the task's. */
const runwayVideoId = (item: HistoryItem) => item.media?.find((m) => m.kind === 'video' && m.providerAssetId)?.providerAssetId

/** How long the clip runs, for "continue from the end". */
export function clipSeconds(item: HistoryItem): number {
  const media = item.media?.find((m) => m.kind === 'video')
  if (media?.duration && media.duration > 0) return Math.round(media.duration)
  const asked = Number(item.input?.duration)
  return Number.isFinite(asked) && asked > 0 ? asked : 6
}

/** The extend model for a past clip, with its ids filled in; null when nothing can extend it. */
export function extendToolFor(item: HistoryItem | null | undefined): SourceTool | null {
  if (!item || item.category !== 'video' || !isDone(item)) return null
  if (isVeo(item)) return { modelId: 'veo/extend', locked: { taskId: item.taskId } }
  if (isRunway(item)) {
    const videoId = runwayVideoId(item)
    return videoId ? { modelId: 'runway/extend', locked: { taskId: item.taskId, videoId } } : null
  }
  if (isGrok(item)) return { modelId: 'grok-imagine/extend', locked: { task_id: item.taskId, extend_at: Math.max(2, clipSeconds(item)) } }
  return null
}

/** Why a clip can't be extended, in plain words. */
export function whyNotExtend(item: HistoryItem, title = 'This model'): string {
  if (!isDone(item)) return 'That clip never finished, so there is nothing to continue yet.'
  if (isRunway(item)) return 'This Runway clip came back without its video id, so Runway cannot continue it. Extend a newer Runway clip instead.'
  return `${title} clips can't be extended. Kie only continues clips it made with Veo, Runway or Grok Imagine. For anything else, start a new clip in Create with a frame from the end of this one.`
}

/**
 * Every upscaler that works on this clip. Topaz takes any video file; the rest need a job
 * Kie ran: Veo's 1080p / 4K and Grok's upscale take its task id, and a Seedance 2.5 draft
 * can be finished at 1080p from its draft task. Task tools come first, since they are the
 * model's own renderer rather than an after-pass.
 */
export function upscaleToolsFor(item: HistoryItem | null | undefined): SourceTool[] {
  const topaz: SourceTool = { modelId: TOPAZ, locked: {} }
  if (!item || !isDone(item) || item.category !== 'video') return [topaz]
  const out: SourceTool[] = []
  if (isVeo(item)) {
    out.push({ modelId: 'veo/1080p', locked: { taskId: item.taskId } })
    out.push({ modelId: 'veo/4k', locked: { taskId: item.taskId } })
  }
  if (isGrok(item)) out.push({ modelId: 'grok-imagine/upscale', locked: { task_id: item.taskId } })
  if (isSeedanceDraft(item)) out.push({ modelId: 'bytedance/seedance-2-5-draft', locked: { draft_task_id: item.taskId } })
  return [...out, topaz]
}

/** One `locked` for a set of tools: their ids never share a field name, so they merge. */
export const mergeLocked = (tools: SourceTool[]): Record<string, string | number> => Object.assign({}, ...tools.map((t) => t.locked))

/** Mode → the handoff slot that names it, for a surface that receives a bare clip. */
export function modeForHandoff(mode: string | undefined, slots: Record<string, string> | undefined): VideoMode | null {
  if (isVideoMode(mode)) return mode
  if (!mode && slots && (slots.first || slots.last)) return 'create'
  return null
}

/**
 * Edit models all need the clip, but Kling Omni Transformation doesn't mark its video field
 * required, so the rail's own check would let an empty job through. For RailStudio `check`.
 */
export function clipProblem(model: ModelDefinition, input: Record<string, unknown>): string | null {
  const videoFields = model.fields.filter((f) => f.type === 'reference' && refFieldKind(f) === 'video')
  if (!videoFields.length) return null
  const has = videoFields.some((f) => {
    const v = input[f.name]
    return Array.isArray(v) ? v.length > 0 : Boolean(v)
  })
  return has ? null : 'Add the clip to edit first.'
}

/* ---------- the reference app's three tabs ---------- */

/**
 * Their Video page has three tabs: Create Video, Edit Video (a list of tools) and Motion
 * Control. The six modes above live on inside them — Extend, Upscale, Lip-sync and Edit are
 * Edit Video's tools — so old handoffs and old saved tabs still land in the right place.
 */
export type VideoTab = 'create' | 'edit' | 'motion'
export const VIDEO_TABS: VideoTab[] = ['create', 'edit', 'motion']

/** Edit Video's tools: the ones Kie runs, then the ones that need a local tool first. */
export type EditTool = 'edit' | 'extend' | 'upscale' | 'lipsync' | 'reframe' | 'removebg' | 'hdr' | 'fps' | 'depth'
export const EDIT_TOOLS: EditTool[] = ['edit', 'extend', 'reframe', 'upscale', 'lipsync', 'removebg', 'hdr', 'fps', 'depth']
/**
 * Tools that run through Trenchable's own pipeline (LocalTools.tsx): Remove Background, SDR → HDR, FPS Boost
 * and Depth Map on this PC's graphics card, Reframe padded here and filled on Kie. None is "Soon" any more.
 */
export const LOCAL_TOOLS: EditTool[] = ['reframe', 'removebg', 'hdr', 'fps', 'depth']
export const isLocalTool = (t: EditTool) => LOCAL_TOOLS.includes(t)
export const isEditTool = (s: unknown): s is EditTool => typeof s === 'string' && (EDIT_TOOLS as string[]).includes(s)

export interface VideoPlace {
  tab: VideoTab
  /** The Edit Video tool, or null for the tool list. */
  tool: EditTool | null
}

/** Where an old mode (a handoff's, or a tab saved before the three tabs) lands now. */
export function placeForMode(mode: VideoMode): VideoPlace {
  if (mode === 'create' || mode === 'motion') return { tab: mode, tool: null }
  return { tab: 'edit', tool: mode }
}

/** A handoff's place: its mode, or Create for a bare first / last frame. */
export function placeForHandoff(mode: string | undefined, slots: Record<string, string> | undefined): VideoPlace | null {
  const m = modeForHandoff(mode, slots)
  return m ? placeForMode(m) : null
}

/** A saved tab value, old (six modes) or new (three tabs), as a place. */
export function placeForSaved(saved: string | null, tool: string | null): VideoPlace {
  if (saved === 'edit') return { tab: 'edit', tool: isEditTool(tool) ? tool : null }
  if (isVideoMode(saved)) return placeForMode(saved)
  return { tab: 'create', tool: null }
}

/* ---------- Create: the inputs follow the model ---------- */

/** The references grid's field for each kind, best reading first. */
export const REF_GRID_FIELD = {
  image: /^(reference_image(_urls)?|image_urls)$/,
  video: /^reference_video(_urls)?$/,
  audio: /^reference_audio(_urls)?$/,
}

const refsOf = (m: ModelDefinition) => m.fields.filter((f) => f.type === 'reference')

/**
 * Whether a model reads a references grid. A named reference field always counts; a plain
 * `image_urls` only beside a dedicated first-frame field (Gemini Omni: frames *and*
 * references). Grok's lone `image_urls` is its start frame, as theirs shows it.
 */
export function readsReferences(m: ModelDefinition): boolean {
  if (isTool(m)) return false
  const refs = refsOf(m)
  if (refs.some((f) => OMNI_FIELD.test(f.name) || /^reference_(image|video)$/.test(f.name))) return true
  return refs.some((f) => /^first_?frame/i.test(f.name)) && refs.some((f) => f.name === 'image_urls' && (f.maxItems ?? 1) > 1)
}

const FIRST = [/^first_?frame/i, /^(first|start)/i, /^image_?urls?$|^input|^image_url$|^imageUrl$/i]
const LAST = [/^last_?frame/i, /last|end|tail/i]

/** A start-frame field: a named first frame, or the lone image a frame model takes. */
function hasStart(m: ModelDefinition): boolean {
  const refs = refsOf(m).filter((f) => refFieldKind(f) === 'image')
  if (refs.some((f) => FIRST[0].test(f.name) || FIRST[1].test(f.name))) return true
  // A reference model's image list is its grid, not a frame (HappyHorse R2V).
  if (readsReferences(m)) return false
  return refs.some((f) => FIRST[2].test(f.name))
}

const hasEnd = (m: ModelDefinition) => refsOf(m).some((f) => refFieldKind(f) === 'image' && LAST.some((re) => re.test(f.name)))

export interface CreateInputs {
  start: boolean
  end: boolean
  /** The kinds the references grid takes; empty means no grid. */
  refs: ('image' | 'video' | 'audio')[]
}

/** What Create shows for a family: frames for frame models, the grid for reference models. */
export function createInputs(members: ModelDefinition[]): CreateInputs {
  const refs = new Set<'image' | 'video' | 'audio'>()
  for (const m of members) {
    if (!readsReferences(m)) continue
    for (const f of refsOf(m)) {
      for (const k of ['image', 'video', 'audio'] as const) if (REF_GRID_FIELD[k].test(f.name)) refs.add(k)
    }
  }
  return { start: members.some(hasStart), end: members.some(hasEnd), refs: (['image', 'video', 'audio'] as const).filter((k) => refs.has(k)) }
}

/* ---------- Motion Control: scene control ---------- */

/**
 * Their "Scene control mode": where the scene comes from, the motion video or the
 * character image. On Kie it is Kling's `character_orientation` (video / image — Kling
 * 2.6 caps an "image" run at 10 s), and for Wan it is the choice of model: Animate
 * Replace keeps the clip's scene, Animate Move keeps the picture's.
 */
export type SceneSource = 'video' | 'image'

export const sceneField = (m: ModelDefinition | null) => m?.fields.find((f) => f.name === 'character_orientation')

export function wanSceneTwin(m: ModelDefinition | null, want: SceneSource): string | null {
  if (!m || !/^wan\/2-2-animate-(move|replace)$/.test(m.id)) return null
  const id = want === 'video' ? 'wan/2-2-animate-replace' : 'wan/2-2-animate-move'
  return id === m.id ? null : id
}

export const wanScene = (m: ModelDefinition | null): SceneSource | null => (m?.id === 'wan/2-2-animate-replace' ? 'video' : m?.id === 'wan/2-2-animate-move' ? 'image' : null)
