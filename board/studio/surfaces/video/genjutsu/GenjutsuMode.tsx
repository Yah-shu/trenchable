/**
 * GenShitSu ("Reality manipulation"): the form behind its Motion transfer and Objects swap tabs.
 * GenjutsuSurface.tsx owns the tabs, the remembered state and the handoffs; Guided swap, the
 * third tab, is a rail of its own (GuidedSwap.tsx). Theirs began as a special preset inside
 * Create Video; here it has been its own lane, apart from Video, since 2026-10-19. The rail:
 * the reference-video slot, up to 30 pictures of your characters, products or clothes, the
 * Style row, the Prompt switch (off by default), the model and Quality.
 *
 * It is one RailStudio per route (genjutsu.ts: motion, swap, style), keyed so the right
 * models are on offer; all three share one draft, so the clip, the pictures and the prompt
 * stay when you flip the switch or apply a style, and each route remembers its own model.
 * The prompt that goes out is composed (`composePrompt`): the style's look, a default
 * instruction when you wrote none, then what you typed, with `@image1` written the way the
 * chosen model reads it.
 *
 * The rail's order is theirs — slots first, then Style and Prompt — by flex order in
 * genjutsu.css, since RailStudio puts its header above the slots.
 *
 * Its jobs run as surface `genjutsu` and are tracked under GENJUTSU_TAG, so they show in
 * GenShitSu's History and not in Video's (mine.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { ImagePlus, Palette, Plus, Video, X } from 'lucide-react'
import type { ModelDefinition, Ref } from '../../../api.ts'
import { promptFieldOf } from '../../../generator.ts'
import { loadDraft, saveDraft } from '../../../draft.ts'
import { RailStudio, type RowSpec, type SlotSpec } from '../../../RailStudio.tsx'
import { trackJobs } from '../../track.ts'
import { Hint, How } from '../ModeBar.tsx'
import { clipProblem } from '../modes.ts'
import { GenjutsuCanvas, type CanvasTab } from './GenjutsuCanvas.tsx'
import {
  DRAFT_KEY,
  GENJUTSU_TAG,
  IMAGE_FIELD,
  MAX_IMAGES,
  ROUTE_FILTER,
  VIDEO_FIELD,
  clipLengthProblem,
  composePrompt,
  imageNote,
  preferFor,
  routeOf,
  seedQuality,
  type ClipInfo,
  type GenjutsuState,
  type Route,
} from './genjutsu.ts'
import { CUSTOM, styleName, styleTag } from './styles.ts'
import './genjutsu.css'

/* ---------- slots ---------- */

const pictures: SlotSpec[] = Array.from({ length: MAX_IMAGES }, (_, i) => ({
  id: `img${i + 1}`,
  icon: Plus,
  title: 'Add',
  sub: 'Characters, products, or clothes',
  optional: true,
  kind: 'image' as const,
  group: 'refs',
  field: IMAGE_FIELD,
}))

// On screen the style image sits after the reference video, as theirs does. It is still the
// first picture slot, so it is sent as @image1 and is never the one cut off.
const styleSlot: SlotSpec = { id: 'style', icon: Palette, title: 'Style image', sub: 'Every frame takes this look', kind: 'image', field: IMAGE_FIELD }

const clip = (title: string, sub: string): SlotSpec => ({ id: 'motion', icon: Video, title, sub, wide: true, kind: 'video', field: VIDEO_FIELD })

const SLOTS: Record<Route, SlotSpec[]> = {
  motion: [clip('Add a reference video to extract motion', 'Video, 4–30 s — the moves to copy'), styleSlot, ...pictures],
  swap: [clip('Add a reference video', 'Video, 4–30 s — the clip to change'), styleSlot, ...pictures],
  style: [clip('Add a reference video', 'Video, 4–30 s — the clip to restyle'), styleSlot, ...pictures],
}

// The style slot shows only for a Custom style; hidden, it keeps its file but sends nothing.
const withStyle = () => true
const withoutStyle = (s: SlotSpec) => s.id !== 'style'

// 720p is where every model starts (seedQuality); `initial` says so for the rail too.
const QUALITY: RowSpec[] = [{ key: 'resolution', label: 'Quality', initial: '720p' }]
const EDIT_ROWS: RowSpec[] = [...QUALITY, { key: 'aspect', label: 'Ratio' }]

// Kling 2.6 insists on an orientation: follow the clip, as theirs does. Kling Omni makes no
// sound from a clip. Each lands only on a model that has the field.
const MOTION_LOCK = { character_orientation: 'video' }
const EDIT_LOCK = { audio: false }

const common = { surface: 'genjutsu', category: 'video' as const, klass: 'video' as const }

/* ---------- the reference video's length ---------- */

const READ_MS = 10_000

/**
 * The clip's length and size, read off its file (metadata only), so a clip the model won't
 * take is caught before Generate. 'reading' while it loads; null when there is no clip or
 * it can't be read in time — then Kie decides.
 */
function useClipInfo(url: string | undefined): ClipInfo | 'reading' | null {
  const [read, setRead] = useState<{ url: string; info: ClipInfo | null } | null>(null)
  useEffect(() => {
    if (!url) return
    let live = true
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const done = (info: ClipInfo | null) => {
      if (!live) return
      live = false
      window.clearTimeout(timer)
      setRead({ url, info })
    }
    const timer = window.setTimeout(() => done(null), READ_MS)
    v.onloadedmetadata = () => done({ seconds: v.duration, width: v.videoWidth, height: v.videoHeight })
    v.onerror = () => done(null)
    v.src = url
    return () => {
      live = false
      window.clearTimeout(timer)
      v.removeAttribute('src')
      v.load()
    }
  }, [url])
  if (!url) return null
  return read?.url === url ? read.info : 'reading'
}

/** Writes 720p into the draft for models whose Quality was never picked (seedQuality). */
function startAt720() {
  const next = seedQuality(loadDraft(DRAFT_KEY))
  if (next) saveDraft(DRAFT_KEY, next)
}

/* ---------- the rail ---------- */

export function GenjutsuMode({ header, state, setState }: { header: ReactNode; state: GenjutsuState; setState: Dispatch<SetStateAction<GenjutsuState>> }) {
  const route = routeOf(state.mode, state.style)
  // Each route mounts its own rail, which reads the draft as it mounts; seed it first.
  const seeded = useRef<Route | null>(null)
  if (seeded.current !== route) {
    seeded.current = route
    startAt720()
  }
  const [model, setModel] = useState<ModelDefinition | null>(null)
  const [uploads, setUploads] = useState<Record<string, Ref>>({})
  const [tab, setTab] = useState<CanvasTab>('history')

  const patch = (p: Partial<GenjutsuState>) => setState((s) => ({ ...s, ...p }))
  const applyStyle = (style: string | null) => patch({ style })

  const onModel = useCallback(
    (m: ModelDefinition | null) => {
      setModel(m)
      if (m) setState((s) => (s.models[route] === m.id ? s : { ...s, models: { ...s.models, [route]: m.id } }))
    },
    [route, setState],
  )

  const count = Object.keys(uploads).filter((id) => id.startsWith('img')).length
  const custom = state.style === CUSTOM
  const styleImage = custom && Boolean(uploads.style)
  const hasPrompt = Boolean(model && promptFieldOf(model))
  const promptShown = state.promptOn && hasPrompt
  const note = imageNote(model, count, styleImage)
  const clipInfo = useClipInfo(uploads.motion?.url)

  const dress = useCallback(
    (prompt: string) => composePrompt({ route, mode: state.mode, style: state.style, prompt, promptOn: state.promptOn, pictures: count }, model),
    [route, state.mode, state.style, state.promptOn, count, model],
  )
  const check = (m: ModelDefinition, input: Record<string, unknown>) => {
    const noClip = clipProblem(m, input)
    if (noClip) return 'Add the reference video first.'
    if (clipInfo === 'reading') return 'Reading the reference video…'
    const length = clipLengthProblem(m, clipInfo)
    if (length) return length
    if (custom && !uploads.style) return 'Add your style image — the Style image tile in the rail.'
    if (route === 'swap' && !count && !promptShown) return 'Add a picture of what goes into the clip, or turn on Prompt and describe it.'
    return null
  }
  const tag = state.style ? styleTag(state.style) : null
  const onSubmitted = useCallback((ids: string[]) => trackJobs(ids, tag ? [GENJUTSU_TAG, tag] : GENJUTSU_TAG), [tag])
  const meta = useMemo(() => ({ label: state.style ? `GenShitSu · ${styleName(state.style)}` : state.mode === 'swap' ? 'GenShitSu · Objects swap' : 'GenShitSu · Motion transfer' }), [state.style, state.mode])
  const prefer = useMemo(() => preferFor(route, state.models), [route, state.models])

  const name = styleName(state.style)
  const head = (
    <>
      <div className="gj-top">{header}</div>
      <div className={`gj-mid ${promptShown ? '' : 'is-prompt-off'}`}>
        {note && <Hint warn>{note}</Hint>}
        <div className="gj-line">
          <span className="gj-line-label">
            Style <span className="gj-new">New</span>
          </span>
          <span className="gj-line-value">{name ?? 'None'}</span>
          {state.style ? (
            <>
              <button type="button" className="vw-btn is-sm" onClick={() => setTab('styles')}>
                Change
              </button>
              <button type="button" className="gj-x" aria-label="Remove the style" title="Remove the style" onClick={() => applyStyle(null)}>
                <X size={13} />
              </button>
            </>
          ) : (
            <button type="button" className="vw-btn is-sm" onClick={() => setTab('styles')}>
              Apply
            </button>
          )}
        </div>
        {custom && !uploads.style && (
          <Hint>
            <ImagePlus size={11} /> Put your style image in the Style image tile above.
          </Hint>
        )}
        <div className="gj-line">
          <span className="gj-line-label">Prompt</span>
          <span className="gj-line-value">{hasPrompt ? (state.promptOn ? 'On' : 'Off') : 'Not used'}</span>
          <button
            type="button"
            role="switch"
            aria-checked={promptShown}
            aria-label="Prompt"
            disabled={!hasPrompt}
            className={`st-switch ${promptShown ? 'is-on' : ''}`}
            onClick={() => patch({ promptOn: !state.promptOn })}
          >
            <span />
          </button>
        </div>
        {!hasPrompt && model && <Hint>{model.title} takes no prompt: the clip and the picture say it all.</Hint>}
      </div>
    </>
  )

  return (
    <RailStudio
      key={`genjutsu:${route}`}
      {...common}
      draftKey={DRAFT_KEY}
      preferModel={prefer}
      filter={ROUTE_FILTER[route]}
      header={head}
      slots={SLOTS[route]}
      showSlot={custom && route === 'style' ? withStyle : withoutStyle}
      hideUnusableSlots
      elementsChip
      locked={route === 'motion' ? MOTION_LOCK : EDIT_LOCK}
      meta={meta}
      dress={dress}
      check={check}
      onModel={onModel}
      onSlotsChange={setUploads}
      onSubmitted={onSubmitted}
      promptLabel="Prompt"
      promptPlaceholder="Describe your new scene — e.g. 'the character from @image1 dancing on a rooftop' or 'same moves, new location: Tokyo at night'. Mention attached images or videos using @…"
      rows={route === 'motion' ? QUALITY : EDIT_ROWS}
      canvas={<GenjutsuCanvas tab={tab} onTab={setTab} style={state.style} onStyle={applyStyle} explain={explain} />}
    />
  )
}

const explain = (
  <How
    title="GenShitSu"
    steps={[
      'Add a reference video — upload one, pick one from the Motion Library, or press Use the motion on any clip.',
      'Add your characters, products or clothes (up to 30). Each model takes as many as it can, in order; the rail says when some are not sent. Cite them in the prompt as @image1, @image2…',
      'Motion transfer puts your character through the clip’s moves (Kling 3.0 Motion Control; Kling 2.6 and Wan Animate Move on offer — one character each).',
      'Objects swap replaces a thing in the clip with your picture (HappyHorse Video Edit, up to 5 pictures; Kling 3.0 Omni, Wan 2.7 Video Edit, or Wan Animate Replace for a person).',
      'A Style redraws every frame in a look while the motion, camera and framing stay as filmed. Custom uses your own style image, sent first as @image1.',
      'The Prompt switch is off by default: the references carry the detail. Turn it on to describe the new scene.',
    ]}
    foot="the reference app runs all of this on one model; on Kie each job goes to the model built for it, so the model row changes with the tab and the style. Clips made here stay in GenShitSu's History, apart from Video's."
  />
)
