/**
 * Edit Video's five tools Kie has no model for, now working: Depth Map, Remove Background, FPS Boost and
 * SDR → HDR run on this PC's graphics card (server/studio/localtools.ts → extras/local-tools), free;
 * Reframe pads the clip here and has a Kie video-edit model fill the new edges, at Kie's price.
 *
 * Each tool is a rail — the tool card, the clip, its options, its runs (progress, Retry, Dismiss) and Go —
 * beside the Video feed filtered to that tool's results. Remove Background has a second step in the canvas:
 * click on the subject in frame 0, Preview mask (free) to see it tinted over the clip, then Export.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Cpu, Loader2, RotateCcw, X } from 'lucide-react'
import { useCatalog, type HistoryItem } from '../../api.ts'
import { useEstimate } from '../../estimate.ts'
import { usePricing } from '../../pricing.ts'
import { Chips, GoButton } from '../../parts.tsx'
import { RailCanvas } from '../../RailStudio.tsx'
import { ClickSelect, ClipPick, EMPTY_SELECTION, hasSubject, useClipSeconds, type Clip, type Selection } from './ClickSelect.tsx'
import { Hint, How } from './ModeBar.tsx'
import { LOCAL_MODEL_ID, REFRAME_MODELS, localApi, localRuns, notReady, perSecondCost, reframeEstimateInput, useDoctor, type Aspect, type LocalRequest, type LocalRun, type ReframeModel } from './localtools.ts'
import './localtools.css'

export type LocalEditTool = 'depth' | 'removebg' | 'fps' | 'hdr' | 'reframe'
export const LOCAL_EDIT_TOOLS: LocalEditTool[] = ['reframe', 'removebg', 'hdr', 'fps', 'depth']
export const isLocalEditTool = (t: string): t is LocalEditTool => (LOCAL_EDIT_TOOLS as string[]).includes(t)

/** The CLIs each tool needs, by doctor.py's names (Reframe needs none: ffmpeg and Kie). */
const NEEDS: Record<LocalEditTool, string[]> = { depth: ['depth'], removebg: ['segment', 'frame'], fps: ['rife'], hdr: ['hdr'], reframe: [] }

/** "Runs on your PC · free", or for Reframe what Kie charges. */
export const RUNS_ON: Record<LocalEditTool, string> = { depth: 'Runs on your PC · free', removebg: 'Runs on your PC · free', fps: 'Runs on your PC · free', hdr: 'Runs on your PC · free', reframe: 'Runs on Kie · from 16 cr/s' }

/* ---------- a tool's runs, in the rail ---------- */

export function RunRow({ run, onRetry, onDismiss, children }: { run: { id: string; status: string; step: string; progress?: number; error?: string }; onRetry: () => void; onDismiss: () => void; children?: ReactNode }) {
  return (
    <div className={`lt-run is-${run.status}`} data-run={run.id}>
      <div className="lt-run-line">
        {run.status === 'running' && <Loader2 size={13} className="lt-spin" />}
        <span className="lt-run-step">{run.status === 'failed' ? run.error : run.step}</span>
        {run.status !== 'running' && (
          <span className="lt-run-acts">
            {run.status === 'failed' && (
              <button type="button" className="vw-btn is-sm" onClick={onRetry}>
                <RotateCcw size={11} /> Retry
              </button>
            )}
            <button type="button" className="gj-x" aria-label="Dismiss" title="Dismiss" onClick={onDismiss}>
              <X size={13} />
            </button>
          </span>
        )}
      </div>
      {run.status === 'running' && typeof run.progress === 'number' && (
        <span className="lt-bar">
          <span style={{ width: `${run.progress}%` }} />
        </span>
      )}
      {children}
    </div>
  )
}

function useToolRuns(tool: LocalEditTool, clip: Clip | null) {
  const all = localRuns.use()
  // This tool's runs, plus Remove Background's mask previews (shown in its canvas, not here).
  return useMemo(() => all.filter((r) => r.request.tool === tool && !(r.status === 'done' && r.taskId)), [all, tool, clip])
}

const act = async (f: () => Promise<unknown>, setError: (e: string | null) => void) => {
  setError(null)
  try {
    await f()
  } catch (e) {
    setError((e as Error).message)
  }
}

/* ---------- the rail ---------- */

const ASPECT_OPTIONS: { id: Aspect; label: string }[] = [
  { id: '9:16', label: '9:16' },
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '4:5', label: '4:5' },
]

export function LocalToolMode({ header, tool }: { header: ReactNode; tool: LocalEditTool }) {
  const [clip, setClip] = useState<Clip | null>(null)
  const [colormap, setColormap] = useState<'turbo' | 'gray'>('turbo')
  const [fps, setFps] = useState<'30' | '48' | '60'>('60')
  const [aspect, setAspect] = useState<Aspect>('9:16')
  const [model, setModel] = useState<ReframeModel>('wan/2-7-videoedit')
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p')
  const [green, setGreen] = useState(true)
  const [sel, setSel] = useState<Selection>(EMPTY_SELECTION)
  const [maskRun, setMaskRun] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const doc = useDoctor()
  const runs = useToolRuns(tool, clip)
  const all = localRuns.use()
  const seconds = useClipSeconds(clip?.url)
  const { models } = useCatalog()
  const kieModel = models?.find((m) => m.id === model) ?? null

  // A new clip or new clicks: the old preview no longer applies.
  useEffect(() => setSel(EMPTY_SELECTION), [clip?.url])
  useEffect(() => setMaskRun(null), [clip?.url, sel])
  // 4:5 is HappyHorse's only (Wan 2.7 has no 4:5 frame).
  useEffect(() => {
    if (!REFRAME_MODELS[model].aspects.includes(aspect)) setModel('happyhorse/video-edit')
  }, [aspect, model])

  const generic = useEstimate(tool === 'reframe' ? kieModel : null, tool === 'reframe' && seconds ? reframeEstimateInput(model, aspect, resolution, seconds) : null, 1)
  const pricing = usePricing()
  const listed = tool === 'reframe' && pricing && seconds ? perSecondCost(pricing.rows, model, resolution, seconds) : null
  const estimate = generic ?? (listed ? { credits: listed.credits, detail: `About ${listed.credits} credits — ${listed.perSecond}/s × ${Math.max(1, Math.round(seconds!))}s, ${resolution} (Kie price list)` } : null)
  const missing = tool === 'reframe' ? null : notReady(doc, NEEDS[tool])
  const preview = maskRun ? all.find((r) => r.id === maskRun) ?? null : null

  const request = (over: Partial<LocalRequest> = {}): LocalRequest => ({
    tool,
    clipUrl: clip!.url,
    name: clip?.name,
    ...(tool === 'depth' ? { colormap } : {}),
    ...(tool === 'fps' ? { fps: Number(fps) } : {}),
    ...(tool === 'removebg' ? { points: sel.points, ...(sel.box ? { box: sel.box } : {}), green, ...(preview?.status === 'done' ? { maskRun: preview.id } : {}) } : {}),
    ...(tool === 'reframe' ? { aspect, model, resolution } : {}),
    ...over,
  })

  const blocker = !clip
    ? 'Add your clip first.'
    : missing
      ? missing
      : tool === 'removebg' && !hasSubject(sel)
        ? 'Click on the subject in frame 0 (right) first.'
        : tool === 'reframe' && seconds && seconds > REFRAME_MODELS[model].maxSeconds + 0.25
          ? `${REFRAME_MODELS[model].title} takes clips up to ${REFRAME_MODELS[model].maxSeconds} s; this one is ${Math.round(seconds)} s.`
          : null

  const go = () =>
    void act(async () => {
      setSending(true)
      try {
        localRuns.put(await localApi.start(request()))
      } finally {
        setSending(false)
      }
    }, setError)

  const previewMask = () =>
    void act(async () => {
      const run = await localApi.start(request({ tool: 'mask', green: undefined, maskRun: undefined }))
      setMaskRun(run.id)
      localRuns.put(run)
    }, setError)

  const LABEL: Record<LocalEditTool, string> = { depth: 'Make depth map', removebg: 'Export cut-out', fps: `Boost to ${fps} fps`, hdr: 'Convert to HDR', reframe: `Reframe to ${aspect}` }

  const rail = (
    <aside className="st-rail">
      {header}
      <ClipPick value={clip} onChange={setClip} />
      {tool === 'depth' && (
        <div className="lt-opt">
          <span className="st-field-label">Colours</span>
          <Chips options={[{ id: 'turbo' as const, label: 'Turbo' }, { id: 'gray' as const, label: 'Gray' }]} value={colormap} onPick={setColormap} />
          <Hint>Turbo: near is red, far is blue. Gray: near is white — what compositing tools and ControlNets read.</Hint>
        </div>
      )}
      {tool === 'fps' && (
        <div className="lt-opt">
          <span className="st-field-label">Frame rate</span>
          <Chips options={(['30', '48', '60'] as const).map((f) => ({ id: f, label: `${f} fps` }))} value={fps} onPick={setFps} />
          <Hint>RIFE draws the in-between frames; the sound is kept as it was.</Hint>
        </div>
      )}
      {tool === 'hdr' && <Hint>Makes an HDR10 copy (BT.2020, PQ, 10-bit HEVC). It looks right only on an HDR screen — on an ordinary one it plays washed out, and some browsers won’t show it at all. Upload it where HDR is supported (YouTube, Instagram on recent phones).</Hint>}
      {tool === 'removebg' && (
        <div className="lt-opt">
          <label className="lt-check">
            <input type="checkbox" checked={green} onChange={(e) => setGreen(e.target.checked)} /> Also a green-screen MP4
          </label>
          <Hint>You always get a transparent WebM (VP9 with alpha) — it drops straight into CapCut, Premiere or After Effects. The green MP4 is for editors that can’t read alpha.</Hint>
        </div>
      )}
      {tool === 'reframe' && (
        <div className="lt-opt">
          <span className="st-field-label">New ratio</span>
          <Chips options={ASPECT_OPTIONS} value={aspect} onPick={setAspect} />
          <span className="st-field-label">Fills the edges</span>
          <Chips
            options={(Object.keys(REFRAME_MODELS) as ReframeModel[]).filter((m) => REFRAME_MODELS[m].aspects.includes(aspect)).map((m) => ({ id: m, label: REFRAME_MODELS[m].title }))}
            value={model}
            onPick={setModel}
          />
          <Hint>{REFRAME_MODELS[model].sub}.</Hint>
          <span className="st-field-label">Quality</span>
          <Chips options={[{ id: '720p' as const, label: '720p' }, { id: '1080p' as const, label: '1080p' }]} value={resolution} onPick={setResolution} />
          <Hint>Your clip is padded to {aspect} here (free), with a blurred copy of itself as a hint; Kie keeps the middle as filmed and paints the new edges.</Hint>
        </div>
      )}
      {runs.map((r) => (
        <RunRow key={r.id} run={r} onRetry={() => void act(async () => localRuns.put(await localApi.retry(r.id)), setError)} onDismiss={() => void act(async () => (await localApi.dismiss(r.id), localRuns.drop(r.id)), setError)} />
      ))}
      <div className="st-rail-foot">
        {(error || (clip && blocker)) && <p className="st-note">{error ?? blocker}</p>}
        <p className="lt-where">
          <Cpu size={12} /> {tool === 'reframe' ? (estimate ? `Runs on Kie · ${estimate.detail}` : 'Runs on Kie — the price shows once the clip’s length is read') : RUNS_ON[tool]}
        </p>
        <div className="st-rail-go">
          <GoButton label={LABEL[tool]} credits={tool === 'reframe' ? estimate?.credits ?? null : null} title={estimate?.detail} disabled={Boolean(blocker)} busy={sending} wide onClick={go} />
        </div>
      </div>
    </aside>
  )

  const feed = (
    <RailCanvas
      surface="video"
      category="video"
      historyFilter={(i: HistoryItem) => i.modelId === LOCAL_MODEL_ID[tool]}
      emptyTitle="Nothing made with this tool yet"
      emptySub="Add a clip on the left. Results land here and in Assets, like everything else in Video."
      explain={EXPLAIN[tool]}
    />
  )

  if (tool === 'removebg' && clip) {
    return (
      <div className="st-split">
        {rail}
        <section className="st-canvas">
          <div className="st-canvas-body lt-canvas">
            <ClickSelect
              clipUrl={clip.url}
              value={sel}
              onChange={setSel}
              aside={
                <div className="lt-preview">
                  <div className="lt-preview-head">
                    <span className="st-field-label">Mask preview</span>
                    <button type="button" className="vw-btn is-sm" disabled={!hasSubject(sel) || preview?.status === 'running' || Boolean(missing)} onClick={previewMask}>
                      {preview?.status === 'running' ? 'Working…' : preview ? 'Preview again' : 'Preview mask'}
                    </button>
                  </div>
                  {preview?.status === 'running' && <RunRow run={preview} onRetry={() => undefined} onDismiss={() => undefined} />}
                  {preview?.status === 'failed' && <p className="st-note">{preview.error}</p>}
                  {preview?.status === 'done' && preview.files?.preview && (
                    <>
                      <video className="lt-video" src={preview.files.preview} controls loop muted playsInline autoPlay />
                      <Hint>
                        The subject is tinted. {typeof preview.coverage === 'number' ? `It fills about ${Math.round(preview.coverage * 100)}% of the frame. ` : ''}Spill or gaps? Add a point there (Shift-click to exclude) and preview again. Happy? Export on the left.
                      </Hint>
                    </>
                  )}
                  {!preview && <Hint>Free, on your PC. Check the whole clip before exporting — the mask follows the subject from frame 0.</Hint>}
                </div>
              }
            />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="st-split">
      {rail}
      {feed}
    </div>
  )
}

const EXPLAIN: Record<LocalEditTool, ReactNode> = {
  depth: <How title="Depth Map" steps={['Add a clip.', 'Pick Turbo (colour) or Gray.', 'Video Depth Anything (Small) works out how far every pixel is, frame by frame, on your graphics card — steady across the clip, not flickering.']} foot="Free: nothing goes to Kie." />,
  removebg: (
    <How
      title="Remove Background"
      steps={['Add a clip.', 'Click on the subject in frame 0 — Shift-click what to leave out, or drag a box.', 'Preview mask: SAM 2.1 follows the subject through the clip and tints it so you can check.', 'Export: a transparent WebM, and a green-screen MP4 if you want one.']}
      foot="Free: it all runs on your PC."
    />
  ),
  fps: <How title="FPS Boost" steps={['Add a clip.', 'Pick 30, 48 or 60 fps.', 'RIFE 4.25 draws the frames in between on your graphics card; the sound stays.']} foot="Free: nothing goes to Kie." />,
  hdr: <How title="SDR to HDR" steps={['Add a clip.', 'ffmpeg expands its range gently and encodes HDR10 (BT.2020, PQ, 10-bit HEVC) with mastering metadata.']} foot="HDR plays properly only on HDR screens. Free." />,
  reframe: (
    <How
      title="Reframe"
      steps={['Add a clip and pick the new ratio.', 'Your PC pads it to that ratio, with a blurred copy behind as a hint.', 'A Kie video-edit model keeps the middle exactly as filmed and paints the new edges.']}
      foot="Kie charges per second of clip: Wan 2.7 16 cr/s at 720p (24 at 1080p), HappyHorse 28 cr/s (48 at 1080p)."
    />
  ),
}

export type { LocalRun }
