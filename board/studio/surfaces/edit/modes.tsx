/**
 * Edit's six tools, each one ToolStudio configured for a job: which models, which field
 * the picture goes in, what the tool adds to the prompt, and what the canvas shows.
 *
 *   Edit       any image-edit model, your prompt
 *   Inpaint    paint a mask → Ideogram V3 Edit / Qwen 2.1 (mask_url) / Ideogram Character Edit
 *   Reframe    pad onto the new shape (+ a border mask for the mask models) → outpaint
 *   Relight    lighting presets, direction, colour → a relight recipe on an image-edit model
 *   Angles     pick camera angles → one identity-keeping edit per angle (catalog.ts ANGLES)
 *   Upscale    Topaz (×1/×2/×4) or Recraft Crisp
 *   Remove BG  Recraft Remove Background
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { UserRound } from 'lucide-react'
import { studioApi, type HistoryItem, type ModelDefinition } from '../../api.ts'
import { controlsFor } from '../../controls.ts'
import { ToolStudio, HowItWorks } from './ToolStudio.tsx'
import { ImageSlot } from './ImageSlot.tsx'
import { MaskPainter, type PainterHandle } from './MaskPainter.tsx'
import { RefStrip } from './RefStrip.tsx'
import { frameMaskPixels, maskPolarity } from './mask.ts'
import { ANCHOR_OFFSET, coverZoom, dragOffset, framePlacement, nearestAspect, parseAspect, type Anchor, type Offset } from './frame.ts'
import { canvasBlob, readableImage, saveBlob, uploadCanvas, uploadPixels, type SourceImage } from './pixels.ts'
import { useFit } from './useFit.ts'
import {
  ANGLES,
  ANGLES_MARK,
  BACKGROUND_IDS,
  EDITOR_IMAGE_FIELD,
  EDITOR_PREFER,
  IDENTITY_PREFER,
  LIGHT_DIRECTIONS,
  LIGHT_PRESETS,
  LIGHT_STRENGTHS,
  LIGHT_TEMPS,
  LAYER_IDS,
  MASK_IDS,
  REFRAME_ASPECTS,
  REFRAME_MARK,
  RELIGHT_MARK,
  UPSCALE_IDS,
  anglePrompt,
  byIds,
  isImageEditor,
  isReframeModel,
  madeBy,
  pickedAngles,
  reframePrompt,
  relightPrompt,
  takesMask,
  type LightDirection,
} from './catalog.ts'

export interface ModeProps {
  header: ReactNode
  image: SourceImage | null
  onImage: (img: SourceImage | null) => void
}

/* ---------- shared bits ---------- */

/** The picture, whole, at its own shape — with whatever a tool lays over it. */
function PictureStage({ image, children, caption, checker }: { image: SourceImage; children?: ReactNode; caption?: ReactNode; checker?: boolean }) {
  const box = useRef<HTMLDivElement>(null)
  const ratio = image.width && image.height ? image.width / image.height : null
  const fit = useFit(box, ratio)
  return (
    <div className="ed-painter">
      <div ref={box} className="ed-stage">
        {ratio ? (
          <div className={`ed-stage-frame ${checker ? 'is-checker' : ''}`} style={{ width: fit.w, height: fit.h }}>
            <img src={image.local ?? image.url} alt="" draggable={false} />
            {children}
          </div>
        ) : (
          <p className="ed-hint">Loading the picture…</p>
        )}
      </div>
      {caption && <p className="ed-hint">{caption}</p>}
    </div>
  )
}

function Chips<T extends string>({ value, options, onPick, label }: { value: T; options: readonly { id: T; label: string }[]; onPick: (v: T) => void; label?: string }) {
  return (
    <div className="ed-control">
      {label && <span className="ed-control-label">{label}</span>}
      <div className="st-chips">
        {options.map((o) => (
          <button key={o.id} type="button" className={`st-chip ${o.id === value ? 'is-active' : ''}`} onClick={() => onPick(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Filters are module constants: the generator re-derives its model list when the filter changes.
const inpaintModels = byIds(MASK_IDS)
const upscaleModels = byIds(UPSCALE_IDS)
const backgroundModels = byIds(BACKGROUND_IDS)

const notMarked = (i: HistoryItem) => ![RELIGHT_MARK, REFRAME_MARK, ANGLES_MARK].some((mark) => i.prompt?.startsWith(mark))

/* ---------- Edit with a prompt ---------- */

/** How many pictures this model's picture field takes (1 for a single-URL field). */
const pictureRoom = (m: ModelDefinition | null) => {
  const f = m?.fields.find((x) => x.type === 'reference' && EDITOR_IMAGE_FIELD.test(x.name))
  if (!f) return 0
  return f.scalar ? 1 : (f.maxItems ?? 10)
}

export function PromptTool(props: ModeProps) {
  const [extras, setExtras] = useState<SourceImage[]>([])
  return (
    <ToolStudio
      {...props}
      label="Edit"
      filter={isImageEditor}
      prefer={EDITOR_PREFER}
      imageField={EDITOR_IMAGE_FIELD}
      prompt="required"
      promptLabel="What to change"
      promptPlaceholder="Swap the jacket for a red raincoat, keep everything else. Extra pictures are the 2nd, 3rd… picture."
      controls={(m) => (
        <RefStrip value={extras} onChange={setExtras} max={Math.max(0, Math.min(4, pictureRoom(m) - 1))} disabled={m && pictureRoom(m) <= 1 ? 'This model edits one picture at a time.' : null} />
      )}
      prepare={async ({ model, image, imageField }) => {
        const room = pictureRoom(model)
        return room > 1 && extras.length ? { fields: { [imageField]: [image.url, ...extras.map((x) => x.url)].slice(0, room) } } : {}
      }}
      matchAspect
      stage={(img) => <PictureStage image={img} caption="Say what to change. The rest of the picture is kept as close as the model can." />}
      history={(i) =>
        i.category === 'image' &&
        notMarked(i) &&
        !madeBy([...UPSCALE_IDS, ...BACKGROUND_IDS, ...LAYER_IDS])(i) &&
        !i.input?.mask_url &&
        Object.entries(i.input ?? {}).some(([k, v]) => EDITOR_IMAGE_FIELD.test(k) && (Array.isArray(v) ? v.length > 0 : Boolean(v)))
      }
      emptyTitle="Edit a picture with words"
      emptySub="Add a picture on the left, then say what to change."
      explain={<HowItWorks steps={['Add a picture: upload, drop, or pick something you made (@).', 'Say what to change in plain words.', 'Pick a model: Nano Banana and GPT Image keep the most of the original.', 'Generate. Use "Use" on a result to keep editing from it.']} />}
    />
  )
}

/* ---------- Inpaint ---------- */

/** An empty Inpaint prompt means "take this out", the way their eraser works. */
const REMOVE_PROMPT = 'Remove what is in the marked area and fill it with the surrounding background, so the picture looks as if it was never there.'

export function InpaintTool(props: ModeProps) {
  const painter = useRef<PainterHandle | null>(null)
  const [share, setShare] = useState(0)
  const [character, setCharacter] = useState<SourceImage | null>(null)
  const isCharacter = (m: ModelDefinition | null) => m?.id === 'ideogram/character-edit'
  return (
    <ToolStudio
      {...props}
      label="Inpaint"
      filter={inpaintModels}
      prefer={['ideogram/v3-edit', 'qwen2-1/image-to-image']}
      imageField={/^image_urls?$/}
      prompt="optional"
      promptLabel="What goes there"
      promptPlaceholder="What should appear in the painted area. Leave empty to remove what you painted."
      dress={(text) => text.trim() || REMOVE_PROMPT}
      controls={(m) => (isCharacter(m) ? <ImageSlot title="Character" sub="The person to paint into the marked area" icon={UserRound} value={character} onChange={setCharacter} /> : null)}
      promised={(m) => ({ mask_url: 'mask', ...(isCharacter(m) && character ? { reference_image_urls: character.url } : {}) })}
      check={(m, img) => {
        if (!img.width || !img.height) return 'Loading the picture…'
        if (share <= 0) return 'Paint over the area to change first.'
        if (share >= 0.999) return 'Everything is painted — leave some of the picture as it is.'
        if (isCharacter(m) && !character) return 'Add the character to paint in.'
        return null
      }}
      prepare={async ({ model }) => {
        if (!painter.current) throw new Error('The mask is not ready yet.')
        const blob = await painter.current.exportMask(maskPolarity(model.id))
        const { fileUrl } = await studioApi.upload(new File([blob], 'mask.png', { type: 'image/png' }))
        return { fields: { mask_url: fileUrl, ...(isCharacter(model) && character ? { reference_image_urls: [character.url] } : {}) } }
      }}
      stage={(img) =>
        img.width && img.height ? (
          <MaskPainter image={{ ...img, width: img.width, height: img.height }} handle={painter} onShare={setShare} />
        ) : (
          <p className="ed-hint">Loading the picture…</p>
        )
      }
      history={(i) => madeBy(MASK_IDS)(i) && Boolean(i.input?.mask_url)}
      batch
      emptyTitle="Repaint part of a picture"
      emptySub="Add a picture, paint over what should change, and say what goes there."
      explain={
        <HowItWorks
          steps={[
            'Add a picture.',
            'Paint over the part to change. Eraser takes paint off, Invert swaps painted and unpainted, Ctrl+Z undoes.',
            'Say what should appear there — or leave it empty to remove what you painted.',
            'Generate: the mask goes up at the picture’s exact size, in the colours the model reads (Ideogram repaints black, Qwen repaints white).',
          ]}
          note="Ideogram Character Edit also takes a character picture and paints that person into the marked area."
        />
      }
    />
  )
}

/* ---------- Reframe / outpaint ---------- */

const ANCHORS: { id: Anchor; label: string }[] = [
  { id: 'center', label: 'Centre' },
  { id: 'top', label: 'Top' },
  { id: 'bottom', label: 'Bottom' },
  { id: 'left', label: 'Left' },
  { id: 'right', label: 'Right' },
]

/** A mask model with a required mask can only outpaint from a padded picture. */
const needsMask = (m: ModelDefinition | null) => Boolean(m?.fields.some((f) => f.name === 'mask_url' && f.required))

const UNREADABLE = 'This picture’s link doesn’t let the page redraw it. Pick it again with @ or upload it.'

export function ReframeTool(props: ModeProps) {
  const [aspect, setAspect] = useState('16:9')
  const [zoom, setZoom] = useState(100)
  const [offset, setOffset] = useState<Offset>(ANCHOR_OFFSET.center)
  const anchor = (Object.keys(ANCHOR_OFFSET) as Anchor[]).find((a) => ANCHOR_OFFSET[a].fx === offset.fx && ANCHOR_OFFSET[a].fy === offset.fy) ?? ('' as Anchor)
  const [pad, setPad] = useState(true)
  // Their Expand & Crop: with Fill with AI off nothing is generated — the picture is
  // padded or cropped to the new shape here and saved as a file.
  const [fill, setFill] = useState(true)
  // Padding draws the picture, so it needs a copy whose pixels this page may read; a
  // picture handed over from elsewhere arrives as a Kie upload link, which isn't one.
  const [readable, setReadable] = useState<boolean | null>(null)
  const { image } = props
  useEffect(() => {
    if (!image) {
      setReadable(null)
      return
    }
    let live = true
    setReadable(null)
    void readableImage(image).then((img) => live && setReadable(Boolean(img)))
    return () => {
      live = false
    }
  }, [image?.url, image?.local]) // eslint-disable-line react-hooks/exhaustive-deps
  const ratio = parseAspect(aspect) ?? 1
  const padOn = (m: ModelDefinition | null) => (pad || needsMask(m)) && readable !== false
  // Past 100% the picture is bigger than the frame (a crop) — only without AI fill.
  const cover = image?.width && image.height ? coverZoom(image.width, image.height, ratio) : 1
  const maxZoom = fill ? 100 : Math.min(400, Math.max(200, Math.ceil(cover * 100)))
  const z = Math.min(zoom, maxZoom) / 100

  /** Pad or crop on this computer: transparent where nothing is, full resolution. */
  const render = async (img: SourceImage) => {
    const el = await readableImage(img)
    if (!el) throw new Error(UNREADABLE)
    const pl = framePlacement(el.naturalWidth, el.naturalHeight, ratio, { zoomOut: z, offset, maxSide: 8192 })
    const c = document.createElement('canvas')
    c.width = pl.canvasW
    c.height = pl.canvasH
    const ctx = c.getContext('2d')
    if (!ctx) throw new Error('This browser cannot draw pictures.')
    ctx.drawImage(el, pl.x, pl.y, pl.w, pl.h)
    return c
  }
  const offline = fill
    ? null
    : {
        check: (img: SourceImage) => (!img.width || !img.height ? 'Loading the picture…' : readable === false ? UNREADABLE : null),
        actions: [
          {
            label: 'Download PNG',
            run: async (img: SourceImage) => {
              const c = await render(img)
              saveBlob(await canvasBlob(c), `expand-crop-${c.width}x${c.height}.png`)
            },
          },
          {
            label: 'Keep editing this',
            run: async (img: SourceImage) => {
              const c = await render(img)
              const blob = await canvasBlob(c)
              const { fileUrl } = await studioApi.upload(new File([blob], 'expand-crop.png', { type: 'image/png' }))
              props.onImage({ url: fileUrl, local: URL.createObjectURL(blob), width: c.width, height: c.height })
              setZoom(100)
              setOffset(ANCHOR_OFFSET.center)
            },
          },
        ],
      }
  return (
    <ToolStudio
      {...props}
      label="Reframe"
      filter={isReframeModel}
      prefer={EDITOR_PREFER}
      imageField={EDITOR_IMAGE_FIELD}
      prompt="optional"
      promptLabel="What to add (optional)"
      promptPlaceholder="More beach and sky; a dog running on the left…"
      hidePills={['aspect']}
      dress={(extra, m) => reframePrompt({ aspect, padded: padOn(m), masked: padOn(m) && takesMask(m), extra })}
      patch={(m) => {
        const pill = controlsFor(m).aspect
        const v = pill ? nearestAspect(pill.choices, ratio, false) : null
        return pill && v ? { [pill.field.name]: v } : {}
      }}
      promised={(m): Record<string, string> => (needsMask(m) ? { mask_url: 'mask' } : {})}
      check={(m, img) => {
        if (!img.width || !img.height) return 'Loading the picture…'
        if (needsMask(m) && readable === false) return 'This picture came over as a link the page can’t read, so it can’t be padded for a masked outpaint. Pick it again with @ or upload it — or use a general model.'
        return null
      }}
      prepare={async ({ model, image, prompt, imageField }) => {
        const masked = padOn(model) && takesMask(model)
        if (!padOn(model)) return { prompt: reframePrompt({ aspect, padded: false, masked: false, extra: prompt }) }
        const img = await readableImage(image)
        if (!img) {
          if (needsMask(model)) throw new Error('This picture’s host won’t let the page pad it. Upload it from your computer or pick it from your work — or choose a general model and turn padding off.')
          return { prompt: reframePrompt({ aspect, padded: false, masked: false, extra: prompt }) }
        }
        const pl = framePlacement(img.naturalWidth, img.naturalHeight, ratio, { zoomOut: z, offset })
        const c = document.createElement('canvas')
        c.width = pl.canvasW
        c.height = pl.canvasH
        const ctx = c.getContext('2d')
        if (!ctx) throw new Error('This browser cannot draw pictures.')
        ctx.fillStyle = '#808080'
        ctx.fillRect(0, 0, c.width, c.height)
        ctx.drawImage(img, pl.x, pl.y, pl.w, pl.h)
        const fields: Record<string, string> = { [imageField]: await uploadCanvas(c, 'reframe.jpg', 'image/jpeg') }
        if (masked) {
          const overlap = Math.round(Math.min(pl.w, pl.h) * 0.015)
          fields.mask_url = await uploadPixels(frameMaskPixels(pl.canvasW, pl.canvasH, pl, maskPolarity(model.id), overlap), pl.canvasW, pl.canvasH, 'reframe-mask.png')
        }
        return { fields, prompt: reframePrompt({ aspect, padded: true, masked, extra: prompt }) }
      }}
      offline={offline}
      controls={(m) => (
        <>
          <label className="ed-check ed-fill">
            <input type="checkbox" className="plinth-check plinth-check--sm" checked={fill} onChange={(e) => setFill(e.target.checked)} />
            <span>
              <strong>Fill with AI</strong> — off: just expand or crop and save the file, nothing is generated
            </span>
          </label>
          <Chips label="New shape" value={aspect} options={REFRAME_ASPECTS.map((a) => ({ id: a, label: a }))} onPick={setAspect} />
          <label className="ed-range">
            <span>Picture size</span>
            <input type="range" min={50} max={maxZoom} step={5} value={Math.min(zoom, maxZoom)} onChange={(e) => setZoom(Number(e.target.value))} />
            <span className="ed-range-v">{Math.min(zoom, maxZoom)}%</span>
          </label>
          <p className="ed-hint">{fill ? 'Below 100% leaves room on every side for the model to fill.' : 'Below 100% adds empty canvas; above it crops. Drag the picture to place it.'}</p>
          <Chips label="Keep the picture at" value={anchor} options={ANCHORS} onPick={(a) => setOffset(ANCHOR_OFFSET[a])} />
          {!fill ? null : readable === false ? (
            <p className="ed-hint">This picture can’t be padded here (its link doesn’t allow it), so the model gets the original and the new ratio. Pick it again with @ or upload it to pad it.</p>
          ) : needsMask(m) ? (
            <p className="ed-hint">This model fills a masked border, so the picture is always padded first.</p>
          ) : (
            <label className="ed-check">
              <input type="checkbox" className="plinth-check plinth-check--sm" checked={pad} onChange={(e) => setPad(e.target.checked)} />
              <span>Pad the picture onto the new shape first (keeps it exactly where you put it)</span>
            </label>
          )}
        </>
      )}
      stage={(img, m) => (
        <FramePreview image={img} ratio={ratio} zoom={z} offset={offset} onOffset={setOffset} padded={!fill || padOn(m)} masked={fill && padOn(m) && takesMask(m)} local={!fill} />
      )}
      history={(i) => Boolean(i.prompt?.startsWith(REFRAME_MARK))}
      emptyTitle="Change a picture's shape"
      emptySub="Add a picture, pick the new shape, and the model paints the scene beyond the old edges."
      explain={
        <HowItWorks
          steps={[
            'Add a picture and pick the new shape. Zoom out adds room on every side.',
            'With padding on, the picture is placed on a canvas of the new shape and uploaded; Ideogram V3 Edit and Qwen 2.1 also get a mask of the empty border and fill only that.',
            'General models (Nano Banana, GPT Image…) are told to replace the grey border by extending the scene.',
            'With padding off, the model gets the original and the new ratio, and decides the framing itself.',
            'Fill with AI off is Expand & Crop: below 100% adds transparent canvas, above it crops. Download PNG saves it; Keep editing makes it the picture. Nothing is generated.',
          ]}
          note="Padding needs to read the picture's pixels. Pictures you upload or pick from your work can be read; a few links from elsewhere can't, and then the tool says so."
        />
      }
    />
  )
}

function FramePreview({
  image,
  ratio,
  zoom,
  offset,
  onOffset,
  padded,
  masked,
  local,
}: {
  image: SourceImage
  ratio: number
  zoom: number
  offset: Offset
  onOffset: (o: Offset) => void
  padded: boolean
  masked: boolean
  /** Expand & Crop without AI: the file is made here at full resolution. */
  local?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; start: Offset } | null>(null)
  const fit = useFit(box, ratio, 560)
  const pl = image.width && image.height ? framePlacement(image.width, image.height, ratio, { zoomOut: zoom, offset, maxSide: 1e9 }) : null
  const out = image.width && image.height ? framePlacement(image.width, image.height, ratio, { zoomOut: zoom, offset, maxSide: local ? 8192 : 2048 }) : null
  // Spare room in preview pixels: how far the picture can travel on each axis.
  const roomX = pl ? fit.w * (1 - pl.w / pl.canvasW) : 0
  const roomY = pl ? fit.h * (1 - pl.h / pl.canvasH) : 0
  return (
    <div className="ed-painter">
      <div ref={box} className="ed-stage">
        {pl ? (
          <div className="ed-stage-frame ed-frame" style={{ width: fit.w, height: fit.h }}>
            <img
              src={image.local ?? image.url}
              alt=""
              draggable={false}
              className={Math.abs(roomX) > 1 || Math.abs(roomY) > 1 ? 'is-movable' : ''}
              style={{ left: `${(pl.x / pl.canvasW) * 100}%`, top: `${(pl.y / pl.canvasH) * 100}%`, width: `${(pl.w / pl.canvasW) * 100}%`, height: `${(pl.h / pl.canvasH) * 100}%` }}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId)
                drag.current = { x: e.clientX, y: e.clientY, start: offset }
              }}
              onPointerMove={(e) => {
                const d = drag.current
                if (d) onOffset(dragOffset(d.start, e.clientX - d.x, e.clientY - d.y, roomX, roomY))
              }}
              onPointerUp={() => {
                drag.current = null
              }}
              onPointerCancel={() => {
                drag.current = null
              }}
            />
          </div>
        ) : (
          <p className="ed-hint">Loading the picture…</p>
        )}
      </div>
      {out && (
        <p className="ed-hint">
          {local ? (
            <>
              <strong>
                {out.canvasW} × {out.canvasH}
              </strong>
              {zoom > 1 ? ' — the parts outside the frame are cut off. ' : out.canvasW !== image.width || out.canvasH !== image.height ? ' — the striped area stays transparent. ' : ' '}
            </>
          ) : (
            <>
              {padded ? `Sent as ${out.canvasW}×${out.canvasH}. ` : 'Sent as the original, with the new ratio. '}
              {masked ? 'The striped border is masked and painted in. ' : padded ? 'The striped border is filled by the model. ' : 'The model chooses the framing. '}
            </>
          )}
          {Math.abs(roomX) > 1 || Math.abs(roomY) > 1 ? 'Drag the picture to place it.' : ''}
        </p>
      )}
    </div>
  )
}

/* ---------- Relight ---------- */

const DIR_POS: Record<LightDirection, [number, number]> = {
  'top left': [0, 0],
  above: [50, 0],
  'top right': [100, 0],
  'the left': [0, 50],
  'the front': [50, 50],
  'the right': [100, 50],
  'bottom left': [0, 100],
  below: [50, 100],
  'bottom right': [100, 100],
}

export function RelightTool(props: ModeProps) {
  const [preset, setPreset] = useState(LIGHT_PRESETS[0]!.id)
  const [direction, setDirection] = useState<LightDirection>('the left')
  const [temp, setTemp] = useState<string>('keep')
  const [strength, setStrength] = useState<string>('balanced')
  const [x, y] = DIR_POS[direction]
  const tint = temp === 'warm' ? 'rgba(255, 190, 120, 0.55)' : temp === 'cool' ? 'rgba(140, 190, 255, 0.55)' : 'rgba(255, 255, 255, 0.5)'
  return (
    <ToolStudio
      {...props}
      label="Relight"
      filter={isImageEditor}
      prefer={EDITOR_PREFER}
      imageField={EDITOR_IMAGE_FIELD}
      prompt="optional"
      promptLabel="Anything else (optional)"
      promptPlaceholder="Make the window glow; add a reflection on the table…"
      matchAspect
      dress={(extra) => relightPrompt({ preset, direction, temp, strength, extra })}
      controls={() => (
        <>
          <Chips label="Light" value={preset} options={LIGHT_PRESETS} onPick={setPreset} />
          <div className="ed-control">
            <span className="ed-control-label">Comes from</span>
            <div className="ed-dirpad" role="radiogroup" aria-label="Light direction">
              {LIGHT_DIRECTIONS.map((d) => (
                <button key={d} type="button" role="radio" aria-checked={d === direction} title={d} className={`ed-dir ${d === direction ? 'is-on' : ''}`} onClick={() => setDirection(d)} />
              ))}
            </div>
          </div>
          <Chips label="Colour" value={temp} options={LIGHT_TEMPS} onPick={setTemp} />
          <Chips label="Strength" value={strength} options={LIGHT_STRENGTHS} onPick={setStrength} />
        </>
      )}
      stage={(img) => (
        <PictureStage image={img} caption={`${LIGHT_PRESETS.find((p) => p.id === preset)?.label}, from ${direction}. The glow shows roughly where the light comes from.`}>
          <span className="ed-glow" style={{ background: `radial-gradient(circle at ${x}% ${y}%, ${tint}, transparent 60%)` }} />
        </PictureStage>
      )}
      history={(i) => Boolean(i.prompt?.startsWith(RELIGHT_MARK))}
      emptyTitle="Change the light"
      emptySub="Add a picture, pick a light and where it comes from."
      explain={<HowItWorks steps={['Add a picture.', 'Pick a light, the side it comes from, its colour and how strong.', 'The tool writes the relight instruction; the model keeps everything else as it is.']} note="Nano Banana Pro and GPT Image 2 hold faces and details best." />}
    />
  )
}

/* ---------- Angles ---------- */

const ANGLES_KEY = 'studio.edit.angles'

function loadAngles(): string[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(ANGLES_KEY) ?? 'null') as unknown
    const ids = Array.isArray(v) ? pickedAngles(v.filter((x): x is string => typeof x === 'string')) : []
    return ids.length ? ids : ['left45', 'right45']
  } catch {
    return ['left45', 'right45']
  }
}

/**
 * the reference app's Angles: the picture seen from other camera positions. Pick any of the eight;
 * each is its own job on an editor that keeps the subject (Nano Banana Pro first, see
 * IDENTITY_PREFER), with a recipe that moves the camera and holds everything else.
 */
export function AnglesTool(props: ModeProps) {
  const [picked, setPicked] = useState<string[]>(loadAngles)
  useEffect(() => {
    try {
      window.localStorage.setItem(ANGLES_KEY, JSON.stringify(picked))
    } catch {
      // Storage off: the default pair next time.
    }
  }, [picked])
  const toggle = (id: string) => setPicked((cur) => pickedAngles(cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  const n = picked.length
  return (
    <ToolStudio
      {...props}
      label="Angles"
      filter={isImageEditor}
      prefer={IDENTITY_PREFER}
      imageField={EDITOR_IMAGE_FIELD}
      prompt="optional"
      promptLabel="Anything else (optional)"
      promptPlaceholder="Keep the logo on the cap readable; plain studio wall behind…"
      matchAspect
      batch={false}
      takes={(extra) => picked.map((id) => anglePrompt(id, extra))}
      noTakes="Pick at least one angle."
      goLabel={n > 1 ? `Generate ${n} angles` : 'Generate'}
      controls={() => (
        <div className="ed-control">
          <span className="ed-control-label">Angles · {n ? `${n} picked, one result each` : 'pick one or more'}</span>
          <div className="st-chips" role="group" aria-label="Angles">
            {ANGLES.map((a) => (
              <button key={a.id} type="button" aria-pressed={picked.includes(a.id)} className={`st-chip ${picked.includes(a.id) ? 'is-active' : ''}`} onClick={() => toggle(a.id)}>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
      stage={(img) => <PictureStage image={img} caption={n ? `${ANGLES.filter((a) => picked.includes(a.id)).map((a) => a.label).join(' · ')} — the subject, clothes, setting and light stay as they are.` : 'Pick the angles to see this from.'} />}
      history={(i) => Boolean(i.prompt?.startsWith(ANGLES_MARK))}
      emptyTitle="See it from another angle"
      emptySub="Add a picture and pick the camera angles; each one comes back as its own picture."
      explain={
        <HowItWorks
          steps={[
            'Add a picture: upload, drop, or pick something you made (@).',
            'Pick the angles — Front, Left or Right 45°, either profile, Back, High or Low. Each angle is one job.',
            'The tool writes the camera move for each and tells the model to keep the face, clothes, setting and light.',
            'Generate. Use "Use" on a result to take that view further.',
          ]}
          note="Opens on Nano Banana Pro, which keeps people and products the most alike from view to view; GPT Image 2 is next."
        />
      }
    />
  )
}

/* ---------- Upscale ---------- */

const FACTORS = [
  { id: '1', label: 'x1' },
  { id: '2', label: 'x2' },
  { id: '4', label: 'x4' },
] as const

export function UpscaleTool(props: ModeProps) {
  const [factor, setFactor] = useState<string>('2')
  const isTopaz = (m: ModelDefinition | null) => m?.id === 'topaz/image-upscale'
  return (
    <ToolStudio
      {...props}
      label="Upscale"
      filter={upscaleModels}
      prefer={UPSCALE_IDS}
      imageField={/^image(_url)?$/}
      prompt="none"
      patch={(m) => (isTopaz(m) ? { upscale_factor: factor } : {})}
      skipFields={['upscale_factor']}
      batch={false}
      goLabel="Upscale"
      controls={(m) =>
        isTopaz(m) ? (
          <>
            <Chips label="Scale factor" value={factor} options={FACTORS} onPick={setFactor} />
            <p className="ed-hint">x1 cleans up and sharpens without enlarging. Topaz on Kie goes up to x4.</p>
          </>
        ) : (
          <p className="ed-hint">Recraft Crisp sharpens and enlarges in one step; there is no scale to pick.</p>
        )
      }
      stage={(img, m) => (
        <PictureStage
          image={img}
          caption={img.width && img.height ? (isTopaz(m) ? `${img.width}×${img.height} → ${img.width * Number(factor)}×${img.height * Number(factor)}` : `${img.width}×${img.height}, sharpened and enlarged`) : undefined}
        />
      )}
      history={madeBy(UPSCALE_IDS)}
      emptyTitle="Make a picture bigger and sharper"
      emptySub="Add a picture and pick the scale."
      explain={<HowItWorks steps={['Add a picture (JPG, PNG or WebP, up to 10MB).', 'Topaz: pick x1 to clean up, x2 or x4 to enlarge. Recraft Crisp: one setting.', 'Upscale.']} />}
    />
  )
}

/* ---------- Remove background ---------- */

export function BackgroundTool(props: ModeProps) {
  return (
    <ToolStudio
      {...props}
      label="Remove BG"
      filter={backgroundModels}
      prefer={BACKGROUND_IDS}
      imageField={/^image$/}
      prompt="none"
      batch={false}
      goLabel="Remove background"
      check={(_m, img) => {
        if (!img.width || !img.height) return 'Loading the picture…'
        if (Math.min(img.width, img.height) < 256) return 'Recraft needs the picture at least 256px on each side.'
        if (Math.max(img.width, img.height) > 4096 || img.width * img.height > 16_000_000) return 'Recraft takes up to 4096px a side and 16MP — use a smaller picture.'
        return null
      }}
      stage={(img) => <PictureStage image={img} caption="The result comes back as a PNG with a transparent background." />}
      history={madeBy(BACKGROUND_IDS)}
      emptyTitle="Cut out the subject"
      emptySub="Add a picture; the background comes off."
      explain={<HowItWorks steps={['Add a picture (PNG, JPG or WebP, up to 5MB, 256–4096px a side).', 'Remove background. The result is a transparent PNG.']} note="To put the subject somewhere new, send the result to Edit and describe the scene." />}
    />
  )
}
