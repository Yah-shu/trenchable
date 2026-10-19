/**
 * Video's forms, each a RailStudio with its own models, slots and copy: Create Video and
 * Motion Control (two of their three tabs), and the Kie-backed tools of Edit Video — Edit,
 * Extend, Upscale and Lip-sync (EditTools.tsx has the list). GenShitSu, once the special preset
 * of Create Video, is its own lane since 2026-10-19 (GenjutsuSurface.tsx).
 *
 * The rail engine already turns slots into the right fields and options into the model's
 * own rows, so a form is configuration: a model filter, the slots it means, and — for the
 * task tools — a Source clip whose ids go in through `locked`. Filters are module
 * constants or memoised: the generator regroups the catalogue whenever the filter changes.
 *
 * Every form shows the one Video feed (no per-form history filter), so a job from any tab
 * lands in the same List / Grid, as theirs does — all but GenShitSu's clips, which stay in
 * GenShitSu's own History (`useVideoFeed`).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AudioLines, Film, ImagePlus, PersonStanding, Plus, Sparkles, UserRound, Video } from 'lucide-react'
import { isDone, pickModel, useCatalog, useHistory, type HistoryItem, type ModelDefinition } from '../../api.ts'
import { handOff, type Handoff } from '../../handoff.ts'
import { hostForKie } from '../../mentions.ts'
import { applyPreset, presetTag, type Preset } from '../../presets.ts'
import { RailStudio, type RailContext, type RowSpec, type SlotSpec } from '../../RailStudio.tsx'
import { trackJobs } from '../track.ts'
import { useVideoFeed } from './genjutsu/mine.ts'
import { How, Hint, SubSwitch } from './ModeBar.tsx'
import { PresetCard, PresetPicker, loadPreset, savePreset } from './PresetCard.tsx'
import { SourceClip } from './SourceClip.tsx'
import {
  REF_GRID_FIELD,
  clipProblem,
  createInputs,
  extendToolFor,
  isClipLipsync,
  isEditModel,
  isExtender,
  isMotionModel,
  isPhotoLipsync,
  mergeLocked,
  readsReferences,
  sceneField,
  upscaleToolsFor,
  wanScene,
  wanSceneTwin,
  whyNotExtend,
  type SceneSource,
} from './modes.ts'

// Three to a row in a 330px rail, so the labels stay one short word.
const SHOT_ROWS: RowSpec[] = [
  { key: 'duration', label: 'Length' },
  { key: 'aspect', label: 'Ratio' },
  { key: 'resolution', label: 'Quality' },
]
const QUALITY_ROW: RowSpec[] = [{ key: 'resolution', label: 'Quality' }]

const common = { surface: 'video', category: 'video' as const, klass: 'video' as const }

/* ---------- Create ---------- */

/**
 * Frames and a references grid in one rail; which of them shows follows the model family
 * (`createInputs`): Grok Imagine shows only a start frame, Kling a start and end frame,
 * Seedance 2.5 its frames and the grid, HappyHorse R2V the grid alone.
 */
const FRAME_SUB = 'PNG, JPG or Paste from clipboard'
const REF_TILES = 12
const CREATE_SLOTS: SlotSpec[] = [
  { id: 'first', icon: ImagePlus, title: 'Start frame', sub: FRAME_SUB, optional: true, kind: 'image', role: 'first' },
  { id: 'last', icon: Film, title: 'End frame', sub: FRAME_SUB, optional: true, kind: 'image', role: 'last' },
  ...Array.from({ length: REF_TILES }, (_, i): SlotSpec => ({ id: `ref${i + 1}`, icon: Plus, title: 'Add', sub: 'Images or videos, cited as @Image 1, @Video 1', optional: true, group: 'refs', field: REF_GRID_FIELD })),
]

const showCreateSlot = (slot: SlotSpec, members: ModelDefinition[]) => {
  const inputs = createInputs(members)
  if (slot.group) return inputs.refs.length > 0
  if (slot.role === 'first') return inputs.start
  if (slot.role === 'last') return inputs.end
  return true
}

/**
 * A picked preset as a handoff to Create: its recipe into the prompt. A recipe names a model
 * class, not a model: a reference recipe brings a model that reads references when the
 * open one doesn't; otherwise the model you had stays.
 */
export function presetHandoff(p: Preset, models: ModelDefinition[] | null, current: ModelDefinition | null): Handoff {
  const video = (models ?? []).filter((m) => m.category === 'video')
  const target = p.modelClass === 'video-ref' && !(current && readsReferences(current)) ? pickModel(video.filter(readsReferences), 'video-ref') : null
  return { surface: 'video', mode: 'create', prompt: applyPreset(p, ''), ...(target ? { modelId: target.id } : {}) }
}

export function CreateMode({ header }: { header: ReactNode }) {
  const { models } = useCatalog()
  const feed = useVideoFeed()
  const [preset, setPreset] = useState<Preset | null>(loadPreset)
  const [model, setModel] = useState<ModelDefinition | null>(null)
  const [picking, setPicking] = useState(false)
  useEffect(() => savePreset(preset), [preset])

  const pick = (p: Preset | null) => {
    setPicking(false)
    setPreset(p)
    if (p) handOff(presetHandoff(p, models, model))
  }
  const tag = preset ? presetTag(preset.id) : null
  const onSubmitted = useCallback((ids: string[]) => tag && trackJobs(ids, tag), [tag])

  return (
    <>
      <RailStudio
        key="create"
        {...common}
      historyFilter={feed}
        draftKey="video.create"
        header={
          <>
            {header}
            <PresetCard preset={preset} model={model} onChange={() => setPicking(true)} />
          </>
        }
        slots={CREATE_SLOTS}
        showSlot={showCreateSlot}
        hideUnusableSlots
        elementsChip
        audioChip
        locked={preset?.params}
        meta={preset ? { label: preset.title } : undefined}
        onModel={setModel}
        onSubmitted={onSubmitted}
        promptLabel="Prompt"
        promptPlaceholder="Describe the shot — what moves, how the camera moves, and how @Image 1 or @Video 1 is used…"
        rows={SHOT_ROWS}
        emptyTitle="No clips yet"
        emptySub="Describe a shot, or give it a start frame or references, then generate. Every clip you make in Video lands here."
        explain={
          <How
            title="Create Video"
            steps={[
              'Optional: pick a preset with Change — its recipe fills the prompt.',
              'The inputs follow the model: a start (and end) frame for frame models, a references grid for reference models — cite them as @Image 1, @Video 1.',
              'Pick the duration, aspect and resolution, then generate. A first frame switches the model to its image-to-video version by itself.',
            ]}
          />
        }
      />
      {picking && (
        <PresetPicker current={preset} onPick={pick} onClose={() => setPicking(false)} />
      )}
    </>
  )
}

/* ---------- Extend ---------- */

function useClips() {
  const { items } = useHistory('video')
  return useMemo(() => (items ?? []).filter(isDone), [items])
}

export function ExtendMode({ header, sourceId, setSourceId, stray }: { header: ReactNode; sourceId: string | null; setSourceId: (id: string | null) => void; stray: boolean }) {
  const feed = useVideoFeed()
  const clips = useClips()
  const { models } = useCatalog()
  const source = clips.find((i) => i.taskId === sourceId) ?? null
  const tool = extendToolFor(source)
  const toolId = tool?.modelId ?? null
  const filter = useMemo(() => (toolId ? (m: ModelDefinition) => m.id === toolId : isExtender), [toolId])
  const candidates = useMemo(() => clips.filter((i) => extendToolFor(i)), [clips])
  const [from, setFrom] = useState<number | null>(null)
  useEffect(() => setFrom(null), [sourceId])

  const title = (i: HistoryItem) => models?.find((m) => m.id === i.modelId)?.title ?? i.modelId ?? 'This model'
  const locked = tool ? { ...tool.locked, ...(from != null && 'extend_at' in tool.locked ? { extend_at: from } : {}) } : undefined
  const problem = sourceId && !source && clips.length ? 'That clip is not in your history any more.' : source && !tool ? whyNotExtend(source, title(source)) : null

  const head = (
    <>
      {header}
      <SourceClip
        label="Clip to continue"
        items={candidates}
        value={source}
        onPick={(i) => setSourceId(i?.taskId ?? null)}
        empty="Nothing to extend yet. Make a clip with Veo, Runway or Grok Imagine in Create, then continue it here."
        note={problem ? <Hint warn>{problem}</Hint> : tool ? <Hint>Continues with {models?.find((m) => m.id === tool.modelId)?.title ?? tool.modelId}.</Hint> : null}
      />
      {stray && !source && <Hint warn>Kie can only continue clips it made itself, so a clip from elsewhere can't be extended. Pick one of yours above, or start a new shot in Create with a frame from its end.</Hint>}
      {tool && 'extend_at' in tool.locked && (
        <label className="st-field st-inline-field">
          <span className="st-field-label">Continue from (seconds)</span>
          <input type="number" min={2} value={from ?? Number(tool.locked.extend_at)} onChange={(e) => setFrom(e.target.value === '' ? null : Math.max(2, Number(e.target.value)))} />
        </label>
      )}
    </>
  )

  return (
    <RailStudio
      key="extend"
      {...common}
      historyFilter={feed}
      draftKey="video.extend"
      filter={filter}
      locked={locked}
      header={head}
      promptLabel="What happens next"
      promptPlaceholder="The next beat of the shot — action, camera, sound…"
      goLabel="Extend"
      emptyTitle="No extensions yet"
      emptySub="Pick one of your clips on the left and say what happens next."
      explain={<How title="Extend a clip" steps={['Pick a clip you made with Veo, Runway or Grok Imagine.', 'Say what happens next.', 'The right extend model is chosen from the clip: Veo continues Veo, Runway continues Runway.']} foot="Kie extends by job id, so only clips it made can be continued. Uploaded clips can't." />}
    />
  )
}

/* ---------- Motion control ---------- */

// Their order: the motion to copy first, then the character who performs it.
const MOTION_SLOTS: SlotSpec[] = [
  { id: 'motion', icon: PersonStanding, title: 'Add motion to copy', sub: 'Video, 3–30 s', kind: 'video', field: /^(video_urls|video_url)$/ },
  { id: 'character', icon: UserRound, title: 'Add your character', sub: 'Image with a visible face and body', kind: 'image', field: /^(input_urls|image_url)$/ },
]

/** A UI flag kept with the model's values (never sent: it is no field of the model). */
const SCENE_OFF = 'scene_control'

/**
 * Their "Scene control mode": a toggle, on by default, with a Video / Image switch for where
 * the scene comes from. Kling: `character_orientation` (off leaves Kie's default, the
 * video). Wan: the switch picks Animate Replace (the clip's scene) or Animate Move (the
 * picture's), so it is always on.
 */
function SceneControl({ ctx }: { ctx: RailContext }) {
  const field = sceneField(ctx.model)
  const wan = wanScene(ctx.model)
  const required = Boolean(field?.required)
  const value = ctx.values[field?.name ?? ''] as string | undefined
  const missing = Boolean(field && required && !value)
  // Kling 2.6 insists on a value: start it on the video, as theirs does.
  useEffect(() => {
    if (missing && field) ctx.setValue(field.name, 'video')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [missing, field?.name])
  if (!field && !wan) return null
  const on = Boolean(wan) || required || ctx.values[SCENE_OFF] !== false
  const source: SceneSource = wan ?? (value === 'image' ? 'image' : 'video')
  const choose = (next: SceneSource) => {
    if (wan) {
      const twin = wanSceneTwin(ctx.model, next)
      if (twin) ctx.chooseModel(twin)
      return
    }
    if (field) ctx.setValue(field.name, next)
  }
  const toggle = () => {
    if (!field || required || wan) return
    if (on) {
      ctx.setValue(SCENE_OFF, false)
      ctx.setValue(field.name, undefined)
    } else {
      ctx.setValue(SCENE_OFF, true)
      ctx.setValue(field.name, source)
    }
  }
  const cap = field && /max 10s/i.test(field.description ?? '') && source === 'image'
  return (
    <div className="st-scene">
      <div className="st-scene-head">
        <span className="st-field-label">Scene control mode</span>
        <button type="button" role="switch" aria-checked={on} aria-label="Scene control mode" disabled={required || Boolean(wan)} className={`st-switch ${on ? 'is-on' : ''}`} onClick={toggle}>
          <span />
        </button>
      </div>
      <p className="st-hint">Choose where the scene should come from: the motion video or the character image.</p>
      {on && (
        <SubSwitch
          options={[
            { id: 'video' as const, label: 'Video' },
            { id: 'image' as const, label: 'Image' },
          ]}
          value={source}
          onPick={choose}
        />
      )}
      {cap && <Hint warn>Following the image, Kling 2.6 keeps the result to 10 s.</Hint>}
    </div>
  )
}

const sceneExtra = (ctx: RailContext) => <SceneControl ctx={ctx} />
const sceneOwns = () => ['character_orientation']

export function MotionMode({ header }: { header: ReactNode }) {
  const feed = useVideoFeed()
  return (
    <RailStudio
      key="motion"
      {...common}
      historyFilter={feed}
      draftKey="video.motion"
      preferModel={/^kling-3\.0\/motion-control$/}
      filter={isMotionModel}
      header={header}
      slots={MOTION_SLOTS}
      promptLabel="Prompt"
      promptPlaceholder="Describe background and scene…"
      promptInAdvanced
      rows={QUALITY_ROW}
      extra={sceneExtra}
      owns={sceneOwns}
      emptyTitle="No motion clips yet"
      emptySub="Add a clip of the moves and a photo of your character; the character performs them."
      explain={<How title="Motion Control" steps={['Add a 3–30 s clip of the moves to copy.', 'Add your character: a photo with a visible face and body.', 'Scene control picks where the scene comes from — the motion video or the character image. Kling 3.0 is the default; Kling 2.6 and Wan Animate are on offer.']} foot="The scene prompt is under Advanced settings." />}
    />
  )
}

/* ---------- Edit video ---------- */

const EDIT_SLOTS: SlotSpec[] = [
  { id: 'video', icon: Video, title: 'Video', sub: 'The clip to change', kind: 'video', field: /^(video_?urls?|videoUrl)$/i },
  { id: 'reference', icon: ImagePlus, title: 'Reference image', sub: 'A look, outfit or object to bring in', optional: true, kind: 'image', field: /^(reference_image|image_urls)$/ },
]

export function EditMode({ header }: { header: ReactNode }) {
  const feed = useVideoFeed()
  return (
    <RailStudio
      key="edit"
      {...common}
      historyFilter={feed}
      draftKey="video.edit"
      preferModel={/^kling-3\.0-omni\/transformation$/}
      filter={isEditModel}
      header={header}
      slots={EDIT_SLOTS}
      hideUnusableSlots
      check={clipProblem}
      promptLabel="The change"
      promptPlaceholder="What to change — restyle it, swap the jacket for @image1, make it night…"
      rows={SHOT_ROWS}
      goLabel="Edit"
      emptyTitle="No edits yet"
      emptySub="Add a clip and say what should change."
      explain={<How title="Edit a video" steps={['Add the clip.', 'Optional: a reference picture for the new look or object.', 'Say what changes. Kling Omni Transformation, Wan 2.7 Video Edit, Wan 2.6 video-to-video, HappyHorse and Runway Aleph all work this way.']}/>}
    />
  )
}

/* ---------- Lip-sync / talking ---------- */

export type LipKind = 'clip' | 'photo'

const CLIP_SLOTS: SlotSpec[] = [
  { id: 'video', icon: Video, title: 'Video', sub: 'A clip of the person talking', kind: 'video', field: /^video_url$/ },
  { id: 'audio', icon: AudioLines, title: 'Voice', sub: 'The speech to sync to', kind: 'audio', field: /^audio_url$/ },
]
const PHOTO_SLOTS: SlotSpec[] = [
  { id: 'face', icon: UserRound, title: 'Face', sub: 'A clear photo of who speaks', kind: 'image', field: /^image_url$/ },
  { id: 'audio', icon: AudioLines, title: 'Voice', sub: 'The speech to say', kind: 'audio', field: /^audio_url$/ },
]

export function LipsyncMode({ header, kind, setKind }: { header: ReactNode; kind: LipKind; setKind: (k: LipKind) => void }) {
  const feed = useVideoFeed()
  const head = (
    <>
      {header}
      <SubSwitch
        options={[
          { id: 'clip' as const, label: 'From a clip' },
          { id: 'photo' as const, label: 'From a photo' },
        ]}
        value={kind}
        onPick={setKind}
      />
    </>
  )
  return (
    <RailStudio
      key={`lipsync:${kind}`}
      {...common}
      historyFilter={feed}
      draftKey={`video.lipsync.${kind}`}
      filter={kind === 'clip' ? isClipLipsync : isPhotoLipsync}
      header={head}
      slots={kind === 'clip' ? CLIP_SLOTS : PHOTO_SLOTS}
      promptLabel="Expression and camera"
      promptPlaceholder="Warm, nodding slightly, slow push-in…"
      rows={QUALITY_ROW}
      goLabel={kind === 'clip' ? 'Lip-sync' : 'Make it talk'}
      emptyTitle="No talking clips yet"
      emptySub={kind === 'clip' ? 'Add a clip and the voice; the mouth is re-timed to the speech.' : 'Add a face photo and the voice; it comes back as a talking clip.'}
      explain={
        <How
          title={kind === 'clip' ? 'Lip-sync a clip' : 'Talking photo'}
          steps={
            kind === 'clip'
              ? ['Add a clip of the person.', 'Add the voice — clean speech works best.', 'Volcengine re-times the mouth to the audio; Lite loops the clip if the audio runs longer.']
              : ['Add a clear photo of the face.', 'Add the voice (Omnihuman takes up to 60 seconds).', 'Describe the expression and camera. Kling AI Avatar, Infinitalk, Omnihuman 1.5 and Wan 2.2 Speech-to-video are on offer.']
          }
        />
      }
    />
  )
}

/* ---------- Upscale ---------- */

const UPSCALE_SLOTS: SlotSpec[] = [{ id: 'video', icon: Sparkles, title: 'Clip', sub: 'Any video — Topaz sharpens it up to 4×', wide: true, kind: 'video', field: /^video_url$/ }]

export function UpscaleMode({ header, sourceId, setSourceId }: { header: ReactNode; sourceId: string | null; setSourceId: (id: string | null) => void }) {
  const feed = useVideoFeed()
  const clips = useClips()
  const { models } = useCatalog()
  const source = clips.find((i) => i.taskId === sourceId) ?? null
  const tools = upscaleToolsFor(source)
  const ids = tools.map((t) => t.modelId).join(' ')
  const filter = useMemo(() => {
    const allowed = ids.split(' ')
    return (m: ModelDefinition) => allowed.includes(m.id)
  }, [ids])
  const locked = mergeLocked(tools)

  // Topaz takes the file itself, so a picked clip also goes up to Kie and into the slot.
  const [hosted, setHosted] = useState<{ taskId: string; url: string } | null>(null)
  const [hostError, setHostError] = useState<string | null>(null)
  // Keyed on the task id, not the item: history refreshes hand back new objects, and the
  // clip should go up once per pick, not once per refresh.
  const media = source?.media?.find((m) => m.kind === 'video') ?? null
  const mediaRef = useRef(media)
  mediaRef.current = media
  const sourceTask = media ? source?.taskId ?? null : null
  useEffect(() => {
    setHostError(null)
    const current = mediaRef.current
    if (!sourceTask || !current) return
    let live = true
    hostForKie(current)
      .then((url) => live && setHosted({ taskId: sourceTask, url }))
      .catch((e: unknown) => live && setHostError((e as Error).message))
    return () => {
      live = false
    }
  }, [sourceTask])

  const extra = tools.filter((t) => t.modelId !== 'topaz/video-upscale').map((t) => models?.find((m) => m.id === t.modelId)?.title ?? t.modelId)
  const head = (
    <>
      {header}
      <SourceClip
        label="Your clip (optional)"
        items={clips}
        value={source}
        onPick={(i) => setSourceId(i?.taskId ?? null)}
        empty="No clips yet. Upload one below instead."
        note={source ? <Hint warn={Boolean(hostError)}>{hostError ?? (extra.length ? `Also available for this clip: ${extra.join(', ')}.` : 'Topaz upscales it.')}</Hint> : <Hint>Pick a clip you made, or upload one below. Veo and Grok clips can also be re-rendered at 1080p or 4K by their own model.</Hint>}
      />
    </>
  )
  const slotted = hosted && hosted.taskId === source?.taskId ? hosted : null

  return (
    <RailStudio
      key={`upscale:${slotted?.taskId ?? 'none'}`}
      {...common}
      historyFilter={feed}
      draftKey="video.upscale"
      filter={filter}
      locked={locked}
      header={head}
      slots={UPSCALE_SLOTS}
      hideUnusableSlots
      initialSlots={slotted ? { video: slotted.url } : undefined}
      rows={QUALITY_ROW}
      goLabel="Upscale"
      emptyTitle="No upscales yet"
      emptySub="Pick or upload a clip on the left."
      explain={<How title="Upscale a clip" steps={['Pick one of your clips, or upload any video.', 'Topaz works on any file (2× or 4×). Veo clips also get Veo 1080p / 4K, Grok clips Grok upscale, and a Seedance 2.5 draft its 1080p finish.', 'Choose the model and upscale.']} />}
    />
  )
}
