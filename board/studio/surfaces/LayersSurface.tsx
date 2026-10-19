/**
 * Layers — the reference app's "flat image → editable layers", on Seedream 5's layer
 * decomposition (Flash or Pro).
 *
 * One job returns a base picture plus one cut-out per element, each with the box it came
 * from (edit/layers.ts reads that back). This page stacks them again in a <canvas> so you
 * can hide, reorder and download layers, save the recombined picture, or send any layer
 * on to Edit to change just that element.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Eye, EyeOff, Layers as LayersIcon, Loader2, PenLine, Upload } from 'lucide-react'
import { buildInput, isDone, useCatalog, useHistory, type HistoryItem, type MediaAsset } from '../api.ts'
import { takeHandoff, handOff, useHandoff } from '../handoff.ts'
import { isActive, submitJob, useJobs } from '../jobs.ts'
import { hostForKie } from '../mentions.ts'
import { Empty, Field, GoButton, TabBar } from '../parts.tsx'
import { JobTile } from '../tiles.tsx'
import { useEstimate } from '../estimate.ts'
import { LAYER_IDS, madeBy } from './edit/catalog.ts'
import { ImageSlot, useNaturalSize } from './edit/ImageSlot.tsx'
import { layerRect, layersFrom, moveLayer, visibleStack, type Layer } from './edit/layers.ts'
import { canvasBlob, imageFromHandoff, loadImage, saveBlob, saveFile, type SourceImage } from './edit/pixels.ts'
import './tools.css'

const MODELS = [
  { id: 'seedream/5-flash-layer-decomposition', label: 'Flash' },
  { id: 'seedream/5-pro-layer-decomposition', label: 'Pro' },
] as const
const SIZES = ['auto', '1K', '1.5K', '2K']

interface Run {
  taskId: string
  media: MediaAsset[]
  raw: unknown
  createdAt: number
  title: string
}

export function LayersSurface() {
  const { models } = useCatalog()
  const { items } = useHistory('image')
  const jobs = useJobs()
  const [image, setImage] = useState<SourceImage | null>(() => imageFromHandoff(takeHandoff('layers')))
  const [modelId, setModelId] = useState<string>(MODELS[0].id)
  const [size, setSize] = useState('auto')
  const [prompt, setPrompt] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  useNaturalSize(image, setImage)
  useHandoff('layers', (h) => {
    const next = imageFromHandoff(h)
    if (next) setImage(next)
  })

  const model = models?.find((m) => m.id === modelId) ?? null
  const input = model && image ? buildInput(model, { prompt: prompt.trim(), fields: { image_url: image.url }, values: { size, output_format: 'png' } }) : null
  const estimate = useEstimate(model, input, 1)
  const blocker = !models ? null : !model ? 'Layer decomposition is not in the Kie catalogue right now.' : !image ? 'Add a picture first.' : null

  const go = () => {
    if (!model || !input || blocker) return
    setNote(null)
    submitJob(model, input, { surface: 'layers', label: 'Layers' })
    setSelected(null)
  }

  const pending = jobs.filter((j) => j.meta.surface === 'layers' && (isActive(j) || j.status === 'error'))
  const runs = useMemo<Run[]>(() => {
    const out: Run[] = (items ?? [])
      .filter((i) => isDone(i) && madeBy(LAYER_IDS)(i))
      .map((i: HistoryItem) => ({ taskId: i.taskId, media: i.media ?? [], raw: i.rawResult, createdAt: i.createdAt, title: i.prompt || 'Layers' }))
    // A job that just finished may not be in history yet; its task carries the same data.
    for (const j of jobs) {
      if (j.meta.surface !== 'layers' || j.status !== 'done' || !j.task || out.some((r) => r.taskId === j.taskId)) continue
      out.unshift({ taskId: j.task.taskId, media: j.task.media, raw: j.task.rawResult, createdAt: j.startedAt, title: j.prompt || 'Layers' })
    }
    return out.sort((a, b) => b.createdAt - a.createdAt)
  }, [items, jobs])
  const current = runs.find((r) => r.taskId === selected) ?? runs[0] ?? null

  return (
    <div className="st-split ed-root">
      <aside className="st-rail">
        <div className="ed-rail-title">
          <LayersIcon size={16} />
          <span>Split into layers</span>
        </div>
        <ImageSlot value={image} onChange={setImage} onError={setNote} />
        <div className="ed-control">
          <span className="ed-control-label">Model</span>
          <TabBar tabs={MODELS.map((m) => ({ id: m.id, label: `Seedream 5 ${m.label}` }))} value={modelId} onPick={setModelId} />
        </div>
        <div className="ed-control">
          <span className="ed-control-label">Size</span>
          <div className="st-chips">
            {SIZES.map((s) => (
              <button key={s} type="button" className={`st-chip ${s === size ? 'is-active' : ''}`} onClick={() => setSize(s)}>
                {s === 'auto' ? 'Same as picture' : s}
              </button>
            ))}
          </div>
        </div>
        <Field label="How to split it" hint={<span className="st-field-count">Optional</span>}>
          <textarea rows={4} placeholder="Separate the headline, the product and the background…" value={prompt} onChange={(e) => setPrompt(e.target.value)} />
        </Field>
        <div className="st-rail-foot">
          {(note || (image && blocker)) && <p className="st-note">{note ?? blocker}</p>}
          <div className="st-rail-go">
            <GoButton label="Split into layers" credits={estimate?.credits ?? null} title={estimate?.detail} disabled={Boolean(blocker)} wide onClick={go} />
          </div>
        </div>
      </aside>

      <section className="st-canvas">
        <div className="st-canvas-bar">
          <span className="ed-bar-title">Layers</span>
          {pending.some(isActive) && <span className="st-pill-label" style={{ marginLeft: 'auto' }}>{pending.filter(isActive).length} running</span>}
        </div>
        <div className="st-canvas-body">
          {pending.some((j) => j.status === 'error') && (
            <div className="st-grid ly-failed">
              {pending
                .filter((j) => j.status === 'error')
                .map((j) => (
                  <JobTile key={j.id} job={j} />
                ))}
            </div>
          )}
          {(pending.some(isActive) || runs.length > 1) && (
            <div className="ly-runs">
              {pending.filter(isActive).map((j) => (
                <div key={j.id} className="ly-run-job">
                  <JobTile job={j} />
                </div>
              ))}
              {runs.map((r) => {
                const cover = layersFrom(r.media, r.raw)[0]?.src
                return (
                  <button key={r.taskId} type="button" className={`ly-run ${current?.taskId === r.taskId ? 'is-on' : ''}`} onClick={() => setSelected(r.taskId)} title={r.title}>
                    {cover ? <img src={cover} alt="" /> : <LayersIcon size={16} />}
                  </button>
                )
              })}
            </div>
          )}
          {current ? (
            <LayerBoard key={current.taskId} run={current} />
          ) : image ? (
            <div className="ly-source">
              <img src={image.local ?? image.url} alt="" />
              <p className="ed-hint">Split it to get the background and one layer per element.</p>
            </div>
          ) : (
            <Empty
              icon={LayersIcon}
              title="Turn a flat picture into layers"
              sub="Add a picture on the left and split it. You get the background plus one layer per element — hide, reorder, download, or send one to Edit."
            />
          )}
        </div>
      </section>
    </div>
  )
}

/** One decomposition: the stacked preview and the layer list. */
function LayerBoard({ run }: { run: Run }) {
  const layers = useMemo(() => layersFrom(run.media, run.raw), [run])
  const [order, setOrder] = useState<string[]>(() => layers.map((l) => l.id))
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const [tainted, setTainted] = useState(false)
  const [drawing, setDrawing] = useState(true)
  const [sending, setSending] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const cache = useRef(new Map<string, HTMLImageElement>())
  const stack = visibleStack(layers, order, hidden)

  /** Load once; a readable copy if the host allows, otherwise a display-only one. */
  const load = async (src: string) => {
    const hit = cache.current.get(src)
    if (hit) return hit
    let img: HTMLImageElement
    try {
      img = await loadImage(src, true)
    } catch {
      img = await loadImage(src)
      setTainted(true)
    }
    cache.current.set(src, img)
    return img
  }

  useEffect(() => {
    let live = true
    const c = canvas.current
    const base = layers.find((l) => l.z === 0) ?? layers[0]
    if (!c || !base) return
    setDrawing(true)
    void (async () => {
      try {
        const baseImg = await load(base.src)
        const W = baseImg.naturalWidth
        const H = baseImg.naturalHeight
        const imgs = await Promise.all(stack.map((l) => load(l.src).catch(() => null)))
        if (!live) return
        c.width = W
        c.height = H
        const ctx = c.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, W, H)
        stack.forEach((l, i) => {
          const img = imgs[i]
          if (!img) return
          const r = layerRect(l, W, H, { w: img.naturalWidth, h: img.naturalHeight })
          ctx.drawImage(img, r.x, r.y, r.w, r.h)
        })
      } catch (e) {
        if (live) setNote((e as Error).message)
      } finally {
        if (live) setDrawing(false)
      }
    })()
    return () => {
      live = false
    }
  }, [layers, order, hidden]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (id: string) =>
    setHidden((h) => {
      const next = new Set(h)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const fileName = (l: Layer, i: number) => `layer-${String(i).padStart(2, '0')}-${l.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layer'}.png`

  const saveComposite = async () => {
    if (!canvas.current) return
    try {
      saveBlob(await canvasBlob(canvas.current), `layers-${run.taskId.slice(0, 8)}.png`)
    } catch {
      setNote('This browser would not export the combined picture; download the layers one by one.')
    }
  }

  const saveAll = async () => {
    for (const [i, l] of layers.entries()) {
      await saveFile(l.src, fileName(l, i))
      await new Promise((r) => setTimeout(r, 250))
    }
  }

  const sendToEdit = async (l: Layer, mode: string) => {
    setSending(l.id)
    setNote(null)
    try {
      const media: MediaAsset = l.src.startsWith('/') ? { kind: 'image', localPath: l.src.slice(1) } : { kind: 'image', url: l.src }
      const url = await hostForKie(media)
      handOff({ surface: 'edit', mode, slots: { image: url } })
    } catch (e) {
      setNote((e as Error).message)
    } finally {
      setSending(null)
    }
  }

  // Top of the stack first, the way layer panels read.
  const listed = [...order].reverse().map((id) => layers.find((l) => l.id === id)).filter((l): l is Layer => Boolean(l))

  return (
    <div className="ly-board">
      <div className="ly-preview">
        <div className="ly-canvas-wrap is-checker">
          <canvas ref={canvas} className="ly-canvas" />
          {drawing && <Loader2 size={18} className="st-spin ly-canvas-busy" />}
        </div>
        <div className="ly-actions">
          <button type="button" className="plinth-btn plinth-btn--sm plinth-btn--ghost" disabled={tainted || drawing} title={tainted ? 'These files are not readable here; download the layers instead.' : undefined} onClick={() => void saveComposite()}>
            <span className="plinth-btn__face">
              <Download size={14} />
              <span className="plinth-btn__label">Save combined PNG</span>
            </span>
          </button>
          <button type="button" className="plinth-btn plinth-btn--sm plinth-btn--ghost" onClick={() => void saveAll()}>
            <span className="plinth-btn__face">
              <Download size={14} />
              <span className="plinth-btn__label">Download all ({layers.length})</span>
            </span>
          </button>
        </div>
        {note && <p className="st-note">{note}</p>}
      </div>

      <div className="ly-list pl-panel">
        <div className="ly-list-head">
          <span>{layers.length} layers</span>
          <span className="ed-hint">Top of the stack first</span>
        </div>
        {listed.map((l) => {
          const pos = order.indexOf(l.id)
          const off = hidden.has(l.id)
          return (
            <div key={l.id} className={`ly-row ${off ? 'is-off' : ''}`}>
              <button type="button" className="pl-iconbtn ed-iconbtn" title={off ? 'Show' : 'Hide'} aria-label={off ? 'Show layer' : 'Hide layer'} onClick={() => toggle(l.id)}>
                {off ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <span className="ly-thumb is-checker">
                <img src={l.src} alt="" loading="lazy" />
              </span>
              <span className="ly-name" title={l.description ?? l.name}>
                {l.name}
                {l.z === 0 && <span className="pl-badge pl-badge--quiet">Base</span>}
              </span>
              <span className="ly-tools">
                <button type="button" className="pl-iconbtn ed-iconbtn" title="Move up" aria-label="Move up" disabled={pos >= order.length - 1} onClick={() => setOrder((o) => moveLayer(o, l.id, 1))}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" className="pl-iconbtn ed-iconbtn" title="Move down" aria-label="Move down" disabled={pos <= 0} onClick={() => setOrder((o) => moveLayer(o, l.id, -1))}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" className="pl-iconbtn ed-iconbtn" title="Download" aria-label="Download layer" onClick={() => void saveFile(l.src, fileName(l, layers.indexOf(l)))}>
                  <Download size={14} />
                </button>
                <SendMenu busy={sending === l.id} onPick={(mode) => void sendToEdit(l, mode)} />
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

const SEND: { mode: string; label: string }[] = [
  { mode: 'prompt', label: 'Edit with a prompt' },
  { mode: 'inpaint', label: 'Inpaint part of it' },
  { mode: 'background', label: 'Remove background' },
  { mode: 'upscale', label: 'Upscale' },
  { mode: 'relight', label: 'Relight' },
]

function SendMenu({ busy, onPick }: { busy: boolean; onPick: (mode: string) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <span ref={box} className="ly-send">
      <button type="button" className="pl-iconbtn ed-iconbtn" title="Send this layer to Edit" aria-label="Send to Edit" disabled={busy} onClick={() => setOpen((v) => !v)}>
        {busy ? <Loader2 size={14} className="st-spin" /> : <PenLine size={14} />}
      </button>
      {open && (
        <span className="st-pop ly-send-pop">
          {SEND.map((s) => (
            <button
              key={s.mode}
              type="button"
              className="st-pop-item"
              onClick={() => {
                setOpen(false)
                onPick(s.mode)
              }}
            >
              <Upload size={13} />
              <span>{s.label}</span>
            </button>
          ))}
        </span>
      )}
    </span>
  )
}
