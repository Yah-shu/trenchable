/**
 * Edit Video's local tools — Depth Map, Remove Background, FPS Boost, SDR → HDR — and Reframe, which pads
 * the clip here and has Kie fill the new edges. Kie has no depth, matting, interpolation or HDR model, so
 * the first four run on this PC's graphics card through the CLIs in extras/local-tools (one Python script per
 * tool, see extras/local-tools/README.md for the contract):
 *
 *   python -I extras/local-tools/tools/<tool>.py --in clip.mp4 --out DIR ...
 *     stdout: `PROGRESS <0-100> <phase>` lines, then `RESULT <json>`; on failure `ERROR <plain words>`, exit ≠ 0
 *
 *   clip ─(download, or copy an archived result)→ local/clips/<hash>/source.<ext>   (shared by every run on it)
 *        ─one GPU job at a time (`gpu`), the rest "Waiting for the graphics card"→ the tool's CLI → files in the run's folder
 *        ─(Remove Background) ffmpeg: the cut-out over green, for a green-screen MP4 beside the transparent WebM
 *        ─(Reframe) ffmpeg pads the clip to the new ratio over a blurred copy of itself → a Kie video-edit model
 *         fills the blurred bands and keeps the middle →
 *   one history row (`local-<id>`, model `studio/<tool>`), like any other job's, so it shows in Video and Assets.
 *
 * A run is a JSON file in its folder (<studioDir>/local/<id>/run.json, paths.ts) and an entry in `runs`, polled by
 * the Edit Video rail (GET /api/studio/local), the same shape as dub.ts: restart = failed + Retry, Dismiss.
 * A `mask` run is Remove Background's "Preview mask": the tool's files only, no history row; Export reuses them.
 *
 * Kept like dub.ts: the CLI line parser, the argument builders, the pad maths and the Kie inputs are pure and
 * tested in localtools.test.ts; `runLocal` takes every outside effect as a dependency (`LocalDeps`).
 */
import { createHash } from 'node:crypto'
import { execFile, spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { HistoryItem, MediaAsset } from '../../src/lib/models/types.ts'
import { studioDir, toolsDir, venvPython } from './paths.ts'

/* ---------- where things are ---------- */

export const toolsRoot = () => toolsDir()
export const localRoot = () => join(studioDir(), 'local')
const pythonOf = (root: string) => venvPython(join(root, 'venv'))
const scriptOf = (root: string, tool: string) => join(root, 'tools', `${tool}.py`)

/* ---------- the CLI contract ---------- */

export type CliName = 'depth' | 'segment' | 'frame' | 'rife' | 'facemesh' | 'guide' | 'hdr' | 'audio' | 'doctor'

export type CliEvent = { type: 'progress'; pct: number; phase: string } | { type: 'result'; data: Record<string, unknown> } | { type: 'error'; message: string }

/** One stdout line of a tool → what it says, or null for anything else (library chatter). */
export function parseCliLine(raw: string): CliEvent | null {
  const line = raw.trim()
  let m = /^PROGRESS\s+(-?\d+(?:\.\d+)?)\s*(.*)$/.exec(line)
  if (m) return { type: 'progress', pct: Math.max(0, Math.min(100, Math.round(Number(m[1])))), phase: m[2]!.trim() }
  m = /^RESULT\s+(\{.*\})$/.exec(line)
  if (m) {
    try {
      const data = JSON.parse(m[1]!) as unknown
      if (data && typeof data === 'object' && !Array.isArray(data)) return { type: 'result', data: data as Record<string, unknown> }
    } catch {
      return { type: 'error', message: 'The tool answered in a shape that could not be read.' }
    }
  }
  m = /^ERROR\s+(.+)$/.exec(line)
  if (m) return { type: 'error', message: m[1]!.trim() }
  return null
}

/** A point on frame 0, normalised 0–1; label 1 = the subject, 0 = leave this out. */
export interface Point {
  x: number
  y: number
  label: 0 | 1
  frame?: number
}
/** A box around the subject, normalised 0–1: x0, y0, x1, y1. */
export type Box = [number, number, number, number]

const unit = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1

/** Points from a request, kept only when they are well formed; at most 24. */
export function cleanPoints(raw: unknown): Point[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((p): p is Point => Boolean(p) && typeof p === 'object' && unit((p as Point).x) && unit((p as Point).y))
    .slice(0, 24)
    .map((p) => ({ x: round4(p.x), y: round4(p.y), label: p.label === 0 ? 0 : 1, frame: 0 }))
}

export function cleanBox(raw: unknown): Box | undefined {
  if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(unit)) return undefined
  const [a, b, c, d] = raw as number[]
  const box: Box = [round4(Math.min(a!, c!)), round4(Math.min(b!, d!)), round4(Math.max(a!, c!)), round4(Math.max(b!, d!))]
  return box[2] - box[0] > 0.01 && box[3] - box[1] > 0.01 ? box : undefined
}

const round4 = (n: number) => Math.round(n * 10000) / 10000
const round3 = (n: number) => Math.round(n * 1000) / 1000

/** The arguments each CLI takes (L-localtools.md), input and output folder first. */
export const cliArgs = {
  frame: (input: string, out: string, t = 0) => ['--in', input, '--out', out, '--t', String(t)],
  depth: (input: string, out: string, colormap: Colormap = 'turbo') => ['--in', input, '--out', out, '--colormap', colormap],
  segment: (input: string, out: string, points: Point[], box?: Box) => ['--in', input, '--out', out, '--points', JSON.stringify(points), ...(box ? ['--box', box.join(',')] : [])],
  rife: (input: string, out: string, fps: number) => ['--in', input, '--out', out, '--fps', String(fps)],
  hdr: (input: string, out: string) => ['--in', input, '--out', out],
  audio: (input: string, out: string, pitch = 3) => ['--in', input, '--out', out, '--pitch', String(pitch)],
  facemesh: (input: string, out: string, over?: string) => ['--in', input, '--out', out, ...(over ? ['--over', over] : [])],
  guide: (input: string, depth: string, mask: string, out: string, mesh: boolean) => ['--in', input, '--depth', depth, '--mask', mask, '--out', out, ...(mesh ? ['--mesh'] : [])],
}

/** A file path a tool's RESULT names, checked to be a string. */
export function resultFile(data: Record<string, unknown>, key: string): string {
  const v = data[key]
  if (typeof v !== 'string' || !v) throw new Error(`The tool finished without its ${key} file.`)
  return v
}

/* ---------- one graphics card, one job ---------- */

/**
 * One graphics card runs one model at a time (two would run each other out of VRAM), so every GPU tool waits
 * its turn here. `ahead` is how many are in front, for "Waiting for the graphics card (1 ahead)".
 */
export class GpuQueue {
  private tail: Promise<unknown> = Promise.resolve()
  private count = 0

  get pending() {
    return this.count
  }

  run<T>(job: () => Promise<T>, onWait?: (ahead: number) => void): Promise<T> {
    const ahead = this.count
    this.count++
    if (ahead > 0) onWait?.(ahead)
    const next = this.tail.then(job, job)
    this.tail = next.catch(() => undefined).finally(() => this.count--)
    return next
  }
}

export const gpu = new GpuQueue()

/* ---------- the request and the run ---------- */

export type LocalTool = 'depth' | 'removebg' | 'fps' | 'hdr' | 'reframe' | 'mask'
export type Colormap = 'turbo' | 'gray'
export type Aspect = '9:16' | '1:1' | '16:9' | '4:5'
export const ASPECTS: Aspect[] = ['9:16', '1:1', '16:9', '4:5']
export const FPS_TARGETS = [30, 48, 60] as const

export interface LocalRequest {
  tool: LocalTool
  /** The clip: an https URL (a Kie upload) or a `/media/...` path of an archived result. */
  clipUrl: string
  name?: string
  colormap?: Colormap
  fps?: number
  points?: Point[]
  box?: Box
  /** Remove Background: a green-screen MP4 as well as the transparent WebM. */
  green?: boolean
  /** Remove Background: the Preview mask run whose files Export reuses. */
  maskRun?: string
  aspect?: Aspect
  /** Reframe: the Kie model that fills the new edges. */
  model?: ReframeModel
  resolution?: '720p' | '1080p'
}

export type LocalPhase = 'queued' | 'waiting' | 'preparing' | 'running' | 'padding' | 'uploading' | 'kie' | 'finishing' | 'saving' | 'done' | 'failed'

export interface LocalRun {
  id: string
  request: LocalRequest
  status: 'running' | 'done' | 'failed'
  phase: LocalPhase
  /** As the rail says it: "Depth 40%", "Waiting for the graphics card". */
  step: string
  progress?: number
  createdAt: number
  updatedAt: number
  error?: string
  /** The history row it became (not for a mask preview). */
  taskId?: string
  /** Credits Kie reported (Reframe only; the rest are free). */
  credits: number
  /** Files to look at while reviewing (a mask preview): name → URL under /api/studio/local/file. */
  files?: Record<string, string>
  /** Per-frame subject coverage from the mask, averaged. */
  coverage?: number
  kieTaskId?: string
  dismissed?: boolean
}

export const LOCAL_MODEL_ID: Record<Exclude<LocalTool, 'mask'>, string> = {
  depth: 'studio/depth-map',
  removebg: 'studio/remove-background',
  fps: 'studio/fps-boost',
  hdr: 'studio/sdr-to-hdr',
  reframe: 'studio/reframe',
}
export const LOCAL_TITLE: Record<LocalTool, string> = { depth: 'Depth Map', removebg: 'Remove Background', fps: 'FPS Boost', hdr: 'SDR → HDR', reframe: 'Reframe', mask: 'Mask preview' }

/** Plain-words problems with a request, before anything runs. */
export function localProblem(r: Partial<LocalRequest>): string | null {
  if (!r.tool || !(r.tool in LOCAL_TITLE)) return 'Pick a tool.'
  if (r.clipUrl?.includes('..') || r.clipUrl?.includes('\0')) return 'That clip path is not allowed.'
  if (!r.clipUrl || !(/^https:\/\//.test(r.clipUrl) || /^\/?media\/[^/]+\/[^/]+$/.test(r.clipUrl))) return 'Add your clip first.'
  if (r.tool === 'depth' && r.colormap && r.colormap !== 'turbo' && r.colormap !== 'gray') return 'Pick Turbo or Gray.'
  if (r.tool === 'fps' && !FPS_TARGETS.includes(r.fps as 30)) return 'Pick 30, 48 or 60 fps.'
  if ((r.tool === 'mask' || r.tool === 'removebg') && !r.points?.some((p) => p.label === 1) && !r.box) return 'Click on the subject first (or drag a box around it).'
  if (r.tool === 'reframe') {
    if (!ASPECTS.includes(r.aspect as Aspect)) return 'Pick the new ratio.'
    const model = REFRAME_MODELS[r.model ?? DEFAULT_REFRAME]
    if (!model) return 'That model cannot reframe.'
    if (!model.aspects.includes(r.aspect as Aspect)) return `${model.title} has no ${r.aspect} frame; pick ${REFRAME_MODELS['happyhorse/video-edit'].title}.`
  }
  return null
}

/* ---------- Reframe: pad, then Kie fills ---------- */

/**
 * The Kie video-edit models that can fill a padded frame, read off the live catalogue (2026-10-17):
 *   Wan 2.7 Video Edit — video_url + prompt, an `aspect_ratio` field of its own (16:9 9:16 1:1 4:3 3:4),
 *     `audio_setting: origin` keeps the clip's sound, up to 10 s; 16 cr/s at 720p, 24 at 1080p. The default:
 *     cheapest, and it is told the frame rather than guessing it from the padded clip.
 *   HappyHorse Video Edit — video_url + prompt ("local replacement"), no ratio field (it keeps the padded
 *     clip's frame, so it does 4:5), `audio_setting: origin`; 28 cr/s at 720p, 48 at 1080p.
 * Runway Aleph takes only a video and a prompt, has no audio setting and no listed price, so it is left out.
 */
export const REFRAME_MODELS = {
  'wan/2-7-videoedit': { title: 'Wan 2.7 Video Edit', aspects: ['9:16', '1:1', '16:9'] as Aspect[], maxSeconds: 10 },
  'happyhorse/video-edit': { title: 'HappyHorse Video Edit', aspects: ['9:16', '1:1', '16:9', '4:5'] as Aspect[], maxSeconds: 15 },
} as const
export type ReframeModel = keyof typeof REFRAME_MODELS
export const DEFAULT_REFRAME: ReframeModel = 'wan/2-7-videoedit'

const ratioOf = (a: Aspect) => {
  const [w, h] = a.split(':').map(Number)
  return w! / h!
}
const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)
const evenOffset = (n: number) => Math.max(0, Math.round(n / 2) * 2)

/**
 * The new frame: the smallest canvas of the target ratio that holds the whole clip (so nothing is cropped),
 * scaled so its long side is at most `maxSide`; and where the clip sits in it (centred). All even, for x264.
 */
export function padCanvas(w: number, h: number, aspect: Aspect, maxSide = 1280): { W: number; H: number; x: number; y: number; w: number; h: number } {
  const r = ratioOf(aspect)
  let W = w
  let H = h
  if (w / h > r) H = w / r
  else W = h * r
  const k = Math.min(1, maxSide / Math.max(W, H))
  const cw = even(w * k)
  const ch = even(h * k)
  const CW = Math.max(cw, even(W * k))
  const CH = Math.max(ch, even(H * k))
  return { W: CW, H: CH, x: evenOffset((CW - cw) / 2), y: evenOffset((CH - ch) / 2), w: cw, h: ch }
}

/** ffmpeg: the clip, whole, centred on a blurred, zoomed copy of itself at the new ratio; sound kept. */
export function padArgs(input: string, out: string, c: ReturnType<typeof padCanvas>): string[] {
  const graph = [
    `[0:v]scale=${c.W}:${c.H}:force_original_aspect_ratio=increase,crop=${c.W}:${c.H},boxblur=24:2,eq=brightness=-0.04[bg]`,
    `[0:v]scale=${c.w}:${c.h}[fg]`,
    `[bg][fg]overlay=${c.x}:${c.y},format=yuv420p[v]`,
  ].join(';')
  return ['-y', '-v', 'error', '-i', input, '-filter_complex', graph, '-map', '[v]', '-map', '0:a:0?', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]
}

export const REFRAME_PROMPT =
  'This video was padded to a new frame: the sharp middle is the original footage, the blurred bands around it are only placeholders. ' +
  'Keep the middle exactly as filmed — the same people, motion, timing, camera and colours. Replace the blurred bands with a natural continuation of the scene, ' +
  'matching its perspective, lighting and movement, so the whole frame reads as one continuous shot. No borders, no blur, no text.'

/** The Kie job that fills a padded clip, in the fields that model reads. */
export function reframeInput(model: ReframeModel, videoUrl: string, aspect: Aspect, resolution: '720p' | '1080p' = '720p'): Record<string, unknown> {
  if (model === 'wan/2-7-videoedit') return { video_url: videoUrl, prompt: REFRAME_PROMPT, aspect_ratio: aspect, resolution, audio_setting: 'origin', prompt_extend: false }
  return { video_url: videoUrl, prompt: REFRAME_PROMPT, resolution, audio_setting: 'origin' }
}

/* ---------- Remove Background: the green screen ---------- */

/** The broadcast green a keyer expects. */
export const GREEN = '0x00b140'

/** ffmpeg: the transparent cut-out over solid green, with the clip's sound if it had any. */
export const greenArgs = (alphaWebm: string, source: string, out: string): string[] => [
  '-y', '-v', 'error',
  // libvpx-vp9 as the decoder, or ffmpeg's own drops the alpha plane.
  '-c:v', 'libvpx-vp9', '-i', alphaWebm,
  '-i', source,
  '-filter_complex', `color=c=${GREEN}:s=16x16[c];[c][0:v]scale2ref[bg][fg];[bg][fg]overlay=shortest=1:format=auto,format=yuv420p[v]`,
  '-map', '[v]', '-map', '1:a:0?', '-c:v', 'libx264', '-crf', '18', '-preset', 'veryfast', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
]

/* ---------- the pipeline ---------- */

export interface Probe {
  duration: number
  width: number
  height: number
  hasAudio: boolean
}

export interface LocalDeps {
  /** A fresh folder for this run's files. */
  workDir: (id: string) => string
  /** The clip on disk (downloaded once per URL and shared). */
  clip: (url: string) => Promise<string>
  /** One CLI, waited for; progress lines as they come. */
  cli: (name: CliName, args: string[], onProgress: (pct: number, phase: string) => void) => Promise<Record<string, unknown>>
  ffmpeg: (args: string[]) => Promise<void>
  probe: (path: string) => Promise<Probe>
  upload: (path: string) => Promise<string>
  /** Create a Kie job and return its id (stored at once, so a retry collects instead of paying twice). */
  kieCreate: (model: string, input: Record<string, unknown>) => Promise<string>
  /** Wait for a Kie job: its file URLs and what Kie charged. */
  kieWait: (taskId: string, timeoutMs: number) => Promise<{ urls: string[]; credits: number }>
  fetchTo: (url: string, path: string) => Promise<void>
  mediaDir: (taskId: string) => Promise<{ abs: string; rel: string }>
  publish: (item: HistoryItem) => Promise<void>
  save: (run: LocalRun) => void
  /** URL the browser can load a run file from. */
  fileUrl: (id: string, name: string) => string
  gpu: GpuQueue
  now: () => number
}

export const KIE_EDIT_TIMEOUT = 25 * 60_000

function set(run: LocalRun, deps: LocalDeps, phase: LocalPhase, step: string, progress?: number) {
  run.phase = phase
  run.step = step
  run.progress = progress
  run.updatedAt = deps.now()
  deps.save(run)
}

/** A GPU tool, in turn, with its progress on the run ("Depth 40%"). */
export async function onGpu(run: LocalRun, deps: LocalDeps, label: string, name: CliName, args: string[]): Promise<Record<string, unknown>> {
  return deps.gpu.run(
    () => {
      set(run, deps, 'running', label, 0)
      return deps.cli(name, args, (pct, phase) => set(run, deps, 'running', `${label}${phase ? ` · ${phase}` : ''} ${pct}%`, pct))
    },
    (ahead) => set(run, deps, 'waiting', `Waiting for the graphics card (${ahead} ahead)`),
  )
}

const mean = (xs: unknown) => (Array.isArray(xs) && xs.length ? round3(xs.reduce((a: number, b) => a + (Number(b) || 0), 0) / xs.length) : undefined)

/** Run one tool; it ends `done` (a history row, or a mask preview's files) or `failed` (with a reason). */
export async function runLocal(run: LocalRun, deps: LocalDeps, runs?: Map<string, LocalRun>): Promise<LocalRun> {
  const r = run.request
  const dir = deps.workDir(run.id)
  try {
    set(run, deps, 'preparing', 'Getting the clip')
    const source = await deps.clip(r.clipUrl)
    const files: { path: string; mime: string; name: string }[] = []

    if (r.tool === 'depth') {
      const out = await onGpu(run, deps, 'Depth', 'depth', cliArgs.depth(source, dir, r.colormap ?? 'turbo'))
      files.push({ path: resultFile(out, 'depth'), mime: 'video/mp4', name: '0.mp4' })
    } else if (r.tool === 'fps') {
      const out = await onGpu(run, deps, `Interpolating to ${r.fps} fps`, 'rife', cliArgs.rife(source, dir, r.fps ?? 60))
      files.push({ path: resultFile(out, 'video'), mime: 'video/mp4', name: '0.mp4' })
    } else if (r.tool === 'hdr') {
      // ffmpeg on the processor, not the card: no need to wait for the GPU.
      set(run, deps, 'running', 'Converting to HDR10', 0)
      const out = await deps.cli('hdr', cliArgs.hdr(source, dir), (pct, phase) => set(run, deps, 'running', `HDR${phase ? ` · ${phase}` : ''} ${pct}%`, pct))
      files.push({ path: resultFile(out, 'video'), mime: 'video/mp4', name: '0.mp4' })
    } else if (r.tool === 'mask' || r.tool === 'removebg') {
      // Export reuses the preview's files when they are for the same clip and the same clicks.
      const prior = r.tool === 'removebg' && r.maskRun ? runs?.get(r.maskRun) : undefined
      const same = prior?.status === 'done' && prior.request.clipUrl === r.clipUrl && JSON.stringify(prior.request.points ?? []) === JSON.stringify(r.points ?? []) && JSON.stringify(prior.request.box ?? null) === JSON.stringify(r.box ?? null)
      const priorDir = same ? deps.workDir(prior!.id) : null
      let alpha = priorDir ? join(priorDir, 'subject.webm') : ''
      if (!priorDir || !existsSync(alpha)) {
        const out = await onGpu(run, deps, 'Finding the subject', 'segment', cliArgs.segment(source, dir, r.points ?? [], r.box))
        alpha = resultFile(out, 'alpha')
        run.coverage = mean(out.coverage)
        if (r.tool === 'mask') {
          run.files = { preview: deps.fileUrl(run.id, baseName(resultFile(out, 'preview'))), mask: deps.fileUrl(run.id, baseName(resultFile(out, 'masks'))), alpha: deps.fileUrl(run.id, baseName(alpha)) }
          if (run.coverage !== undefined && run.coverage < 0.005) throw new Error('The mask came back almost empty. Click on the subject itself, or drag a box around it, and preview again.')
        }
      }
      if (r.tool === 'removebg') {
        files.push({ path: alpha, mime: 'video/webm', name: '0.webm' })
        if (r.green) {
          set(run, deps, 'finishing', 'Green screen')
          const green = join(dir, 'green.mp4')
          await deps.ffmpeg(greenArgs(alpha, source, green))
          files.push({ path: green, mime: 'video/mp4', name: '1.mp4' })
        }
      }
    } else if (r.tool === 'reframe') {
      const model = r.model ?? DEFAULT_REFRAME
      const probe = await deps.probe(source)
      if (!(probe.width > 0 && probe.height > 0)) throw new Error('Could not read the clip’s size.')
      const limit = REFRAME_MODELS[model].maxSeconds
      if (probe.duration > limit + 0.25) throw new Error(`${REFRAME_MODELS[model].title} takes clips up to ${limit} s; this one is ${Math.round(probe.duration)} s. Trim it first.`)
      set(run, deps, 'padding', `Padding to ${r.aspect}`)
      const padded = join(dir, 'padded.mp4')
      await deps.ffmpeg(padArgs(source, padded, padCanvas(probe.width, probe.height, r.aspect!)))
      run.files = { padded: deps.fileUrl(run.id, 'padded.mp4') }
      if (!run.kieTaskId) {
        set(run, deps, 'uploading', 'Uploading the padded clip')
        const url = await deps.upload(padded)
        set(run, deps, 'kie', `Filling the edges on ${REFRAME_MODELS[model].title}`)
        run.kieTaskId = await deps.kieCreate(model, reframeInput(model, url, r.aspect!, r.resolution))
        deps.save(run)
      } else {
        set(run, deps, 'kie', `Filling the edges on ${REFRAME_MODELS[model].title}`)
      }
      const res = await deps.kieWait(run.kieTaskId, KIE_EDIT_TIMEOUT)
      run.credits = round3(run.credits + res.credits)
      if (!res.urls[0]) throw new Error('Kie returned no video.')
      const out = join(dir, 'reframed.mp4')
      await deps.fetchTo(res.urls[0], out)
      files.push({ path: out, mime: 'video/mp4', name: '0.mp4' })
    }

    if (r.tool === 'mask') {
      run.status = 'done'
      set(run, deps, 'done', 'Mask ready — check it, then Export')
      return run
    }

    set(run, deps, 'saving', 'Saving')
    const taskId = `local-${run.id}`
    const media = await deps.mediaDir(taskId)
    mkdirSync(media.abs, { recursive: true })
    const title = rowTitle(r)
    const assets: MediaAsset[] = files.map((f) => {
      copyFileSync(f.path, join(media.abs, f.name))
      return { kind: 'video', mimeType: f.mime, localPath: `${media.rel}/${f.name}`, title }
    })
    await deps.publish(historyRow(run, taskId, assets))
    run.taskId = taskId
    run.status = 'done'
    set(run, deps, 'done', 'Done')
  } catch (e) {
    run.status = 'failed'
    run.error = (e as Error).message || 'The tool stopped with no reason given.'
    set(run, deps, 'failed', 'Failed')
  }
  return run
}

const baseName = (p: string) => p.split(/[\\/]/).pop()!

/** "Depth Map · clip.mp4", "FPS Boost 60 fps", "Reframe 9:16". */
export function rowTitle(r: LocalRequest): string {
  const what = r.tool === 'fps' ? `FPS Boost ${r.fps} fps` : r.tool === 'reframe' ? `Reframe ${r.aspect}` : LOCAL_TITLE[r.tool]
  return r.name ? `${what} · ${r.name}` : what
}

export function historyRow(run: LocalRun, taskId: string, media: MediaAsset[]): HistoryItem {
  const r = run.request
  const tool = r.tool as Exclude<LocalTool, 'mask'>
  return {
    taskId,
    model: LOCAL_TITLE[tool],
    modelId: LOCAL_MODEL_ID[tool],
    category: 'video',
    state: 'success',
    createdAt: run.createdAt,
    operation: 'generate',
    prompt: rowTitle(r),
    media,
    resultUrls: [],
    creditsConsumed: run.credits || undefined,
    input: {
      clip_url: r.clipUrl,
      tool,
      ...(r.colormap ? { colormap: r.colormap } : {}),
      ...(r.fps ? { fps: r.fps } : {}),
      ...(r.points?.length ? { points: r.points } : {}),
      ...(r.box ? { box: r.box } : {}),
      ...(r.tool === 'removebg' ? { green_screen: Boolean(r.green) } : {}),
      ...(r.aspect ? { aspect_ratio: r.aspect } : {}),
      ...(r.tool === 'reframe' ? { kie_model: r.model ?? DEFAULT_REFRAME, kie_task_id: run.kieTaskId, resolution: r.resolution ?? '720p' } : { runs_on: 'local' }),
    },
  }
}

/* ---------- the runs this server knows ---------- */

const runs = new Map<string, LocalRun>()
let deps: LocalDeps | null = null
let loaded = false

/** Runs on disk from before this process: one still marked running was cut off by a restart. */
function load() {
  if (loaded) return
  loaded = true
  const root = localRoot()
  if (!existsSync(root)) return
  for (const id of readdirSync(root)) {
    const file = join(root, id, 'run.json')
    if (!existsSync(file)) continue
    try {
      const run = JSON.parse(readFileSync(file, 'utf8')) as LocalRun
      if (run.status === 'running') {
        run.status = 'failed'
        run.phase = 'failed'
        run.step = 'Failed'
        run.error = 'Trenchable restarted while this was running. Press Retry to run it again.'
        writeFileSync(file, JSON.stringify(run, null, 1))
      }
      runs.set(run.id, run)
    } catch {
      // A half-written file from a crash: skip it.
    }
  }
}

/** Swap in fakes (tests). */
export function setLocalDeps(d: LocalDeps | null) {
  deps = d
  runs.clear()
  loaded = d !== null
}

const RECENT_MS = 3 * 24 * 60 * 60 * 1000

export function listLocalRuns(now = Date.now()): LocalRun[] {
  load()
  return [...runs.values()].filter((r) => !r.dismissed && (r.status === 'running' || now - r.createdAt < RECENT_MS)).sort((a, b) => b.createdAt - a.createdAt)
}

export const getLocalRun = (id: string) => (load(), runs.get(id))

export const newId = (now: number) => `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`

export function startLocalRun(request: LocalRequest, d: LocalDeps = deps ?? realLocalDeps()): LocalRun {
  load()
  const now = d.now()
  const run: LocalRun = { id: newId(now), request, status: 'running', phase: 'queued', step: 'Queued', createdAt: now, updatedAt: now, credits: 0 }
  runs.set(run.id, run)
  d.save(run)
  void runLocal(run, d, runs)
  return run
}

/** Retry: a Reframe whose Kie job was already sent collects that job instead of sending (and paying) again. */
export function retryLocalRun(id: string, d: LocalDeps = deps ?? realLocalDeps()): LocalRun | null {
  const old = getLocalRun(id)
  if (!old || old.status === 'running') return null
  old.dismissed = true
  d.save(old)
  const run = startLocalRunWith(old.request, d, old.request.tool === 'reframe' && old.kieTaskId && /restarted|stopped answering|too long/i.test(old.error ?? '') ? old.kieTaskId : undefined)
  return run
}

function startLocalRunWith(request: LocalRequest, d: LocalDeps, kieTaskId?: string): LocalRun {
  const now = d.now()
  const run: LocalRun = { id: newId(now), request, status: 'running', phase: 'queued', step: 'Queued', createdAt: now, updatedAt: now, credits: 0, ...(kieTaskId ? { kieTaskId } : {}) }
  runs.set(run.id, run)
  d.save(run)
  void runLocal(run, d, runs)
  return run
}

export function dismissLocalRun(id: string, d: LocalDeps = deps ?? realLocalDeps()): boolean {
  const run = getLocalRun(id)
  if (!run || run.status === 'running') return false
  run.dismissed = true
  d.save(run)
  return true
}

/* ---------- frame 0, for clicking on the subject ---------- */

export interface FrameInfo {
  image: string
  size: [number, number]
  duration: number
  fps: number
}

const clipKey = (url: string) => createHash('sha1').update(url).digest('hex').slice(0, 16)
const framesCache = new Map<string, FrameInfo>()

/** Frame 0 of a clip as a PNG URL, with its size and length (cached per clip). */
export async function frameOf(url: string, d: LocalDeps = deps ?? realLocalDeps()): Promise<FrameInfo> {
  const key = clipKey(url)
  const hit = framesCache.get(key)
  if (hit) return hit
  const source = await d.clip(url)
  const dir = join(localRoot(), 'clips', key)
  mkdirSync(dir, { recursive: true })
  const out = await d.cli('frame', cliArgs.frame(source, dir, 0), () => undefined)
  const size = Array.isArray(out.size) ? (out.size as number[]) : [0, 0]
  const info: FrameInfo = { image: d.fileUrl(`clips~${key}`, baseName(resultFile(out, 'image'))), size: [Number(size[0]) || 0, Number(size[1]) || 0], duration: Number(out.duration) || 0, fps: Number(out.fps) || 0 }
  framesCache.set(key, info)
  return info
}

/* ---------- doctor: are the tools installed? ---------- */

export interface Doctor {
  installed: boolean
  /** Why not, in plain words. */
  reason?: string
  gpu?: string
  tools: Record<string, string>
  checkedAt: number
}

let doctorCache: { at: number; value: Doctor } | null = null
const DOCTOR_TTL = 10 * 60_000

/** The tools' own check (doctor.py), cached ten minutes; a missing install says so without running anything. */
export async function doctor(fresh = false, d: LocalDeps = deps ?? realLocalDeps()): Promise<Doctor> {
  const now = Date.now()
  // A missing install is asked again after 30 s, so the tools show up soon after they are installed.
  if (!fresh && doctorCache && now - doctorCache.at < (doctorCache.value.installed ? DOCTOR_TTL : 30_000)) return doctorCache.value
  const root = toolsRoot()
  let value: Doctor
  if (!existsSync(pythonOf(root))) value = { installed: false, reason: `Local tools are not installed (no ${root}\\venv yet).`, tools: {}, checkedAt: now }
  else if (!existsSync(scriptOf(root, 'doctor'))) value = { installed: false, reason: `Local tools are still being set up (${root}\\tools has no doctor.py yet).`, tools: {}, checkedAt: now }
  else {
    try {
      const out = await d.cli('doctor', [], () => undefined)
      const tools = (out.tools && typeof out.tools === 'object' ? out.tools : {}) as Record<string, string>
      value = { installed: true, gpu: typeof out.gpu === 'string' ? out.gpu : undefined, tools, checkedAt: now }
    } catch (e) {
      value = { installed: false, reason: `The local tools did not start: ${(e as Error).message}`, tools: {}, checkedAt: now }
    }
  }
  doctorCache = { at: now, value }
  return value
}

/** Whether one tool is ready, by doctor's answer: "ok", or the reason it is not. */
export function toolReady(doc: Doctor, tool: string): string | null {
  if (!doc.installed) return doc.reason ?? 'Local tools are not installed.'
  const v = doc.tools[tool]
  if (v === undefined || v === 'ok') return null
  return `${tool}: ${v}`
}

/* ---------- serving run files ---------- */

/** A run file's path on disk, or null if the name is anything but a plain file in a known folder. */
export function runFilePath(id: string, name: string): string | null {
  if (!/^[a-z0-9]+(?:~[a-z0-9]+)?$/i.test(id) || !/^[\w.-]+$/.test(name) || name.startsWith('.')) return null
  const dir = id.startsWith('clips~') ? join(localRoot(), 'clips', id.slice(6)) : join(localRoot(), id)
  const guided = join(localRoot(), '..', 'guided', id)
  for (const base of [dir, guided]) {
    const p = join(base, name)
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

export const fileUrlOf = (id: string, name: string) => `/api/studio/local/file/${id}/${name}`

/* ---------- the real world ---------- */

/** How one CLI is started: the tools' venv Python, isolated (-I), on its script. */
export function cliCommand(name: CliName, root = toolsRoot()): { cmd: string; pre: string[]; cwd: string } {
  return { cmd: pythonOf(root), pre: ['-I', scriptOf(root, name)], cwd: root }
}

/**
 * Spawn one CLI and parse its output line by line: low priority and the RAM check are the tool's own
 * business. `command` swaps the interpreter (tests run a stub script that prints the same lines).
 */
export function runCli(
  name: CliName,
  args: string[],
  onProgress: (pct: number, phase: string) => void,
  opts: { timeoutMs?: number; command?: { cmd: string; pre: string[]; cwd: string } } = {},
): Promise<Record<string, unknown>> {
  const command = opts.command ?? cliCommand(name)
  const timeoutMs = opts.timeoutMs ?? 60 * 60_000
  if (!existsSync(command.cmd)) return Promise.reject(new Error('Local tools are not installed on this PC yet.'))
  return new Promise((ok, fail) => {
    const child = spawn(command.cmd, [...command.pre, ...args], {
      shell: false,
      windowsHide: true,
      cwd: command.cwd,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8', MIOPEN_GEMM_ENFORCE_BACKEND: '1', TORCH_BLAS_PREFER_HIPBLASLT: '0' },
    })
    let result: Record<string, unknown> | null = null
    let error: string | null = null
    let buf = ''
    let err = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    const take = (line: string) => {
      const ev = parseCliLine(line)
      if (!ev) return
      if (ev.type === 'progress') onProgress(ev.pct, ev.phase)
      else if (ev.type === 'result') result = ev.data
      else error = ev.message
    }
    child.stdout.on('data', (b) => {
      buf += String(b)
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() ?? ''
      lines.forEach(take)
    })
    child.stderr.on('data', (b) => (err = (err + String(b)).slice(-4000)))
    child.on('error', (e) => (clearTimeout(timer), fail(e)))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (buf) take(buf)
      if (code === 0 && result) ok(result)
      else fail(new Error(error ?? (code === 0 ? `${name} finished without a result.` : `${name} stopped: ${err.trim().split('\n').slice(-2).join(' ').slice(0, 300) || `exit ${code}`}`)))
    })
  })
}

function exec(cmd: string, args: string[], timeoutMs = 20 * 60_000): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { shell: false, windowsHide: true })
    let err = ''
    const timer = setTimeout(() => child.kill(), timeoutMs)
    child.stderr.on('data', (b) => (err = (err + String(b)).slice(-2000)))
    child.on('error', (e) => (clearTimeout(timer), fail(e)))
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) ok()
      else fail(new Error(`${cmd} failed: ${err.trim().split('\n').slice(-3).join(' ').slice(0, 400)}`))
    })
  })
}

export function probeFile(path: string): Promise<Probe> {
  return new Promise((ok, fail) => {
    execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,width,height', '-of', 'json', path], { windowsHide: true }, (e, stdout) => {
      if (e) return fail(new Error(`ffprobe could not read the clip: ${e.message.slice(0, 200)}`))
      try {
        const j = JSON.parse(stdout) as { format?: { duration?: string }; streams?: { codec_type?: string; width?: number; height?: number }[] }
        const v = (j.streams ?? []).find((s) => s.codec_type === 'video')
        ok({ duration: Number(j.format?.duration) || 0, width: v?.width ?? 0, height: v?.height ?? 0, hasAudio: (j.streams ?? []).some((s) => s.codec_type === 'audio') })
      } catch (err) {
        fail(err as Error)
      }
    })
  })
}

export async function download(url: string, path: string) {
  if (/^\/?media\//.test(url)) {
    // An archived result: only a real file inside the media root (results-routes' own check).
    const { mediaFile } = await import('./results-routes.ts')
    const abs = mediaFile(`/${url.replace(/^\//, '')}`)
    if (!abs) throw new Error('That clip is no longer on disk.')
    copyFileSync(abs, path)
    return
  }
  let res = await fetch(url)
  if (!res.ok) {
    // Kie's own file links sometimes need its download-url step first.
    const { getDownloadUrl } = await import('../kie/common.ts')
    res = await fetch(await getDownloadUrl(url))
  }
  if (!res.ok) throw new Error(`Could not download ${new URL(url).hostname} (${res.status}).`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
}

/** The clip once per URL, under local/clips/<hash>/ (frame 0 and every run on it share it). */
export async function cachedClip(url: string): Promise<string> {
  const dir = join(localRoot(), 'clips', clipKey(url))
  mkdirSync(dir, { recursive: true })
  const ext = /\.(mp4|mov|webm|mkv|m4v)(?:$|\?)/i.exec(url)?.[1]?.toLowerCase() ?? 'mp4'
  const path = join(dir, `source.${ext}`)
  if (!existsSync(path) || statSync(path).size === 0) await download(url, path)
  return path
}

export async function kieCreate(model: string, input: Record<string, unknown>): Promise<string> {
  const { createTask } = await import('../kie/market.ts')
  for (let attempt = 0; ; attempt++) {
    try {
      return await createTask({ model, input })
    } catch (e) {
      if (attempt < 4 && /429|rate limit|too many/i.test((e as Error).message)) {
        await new Promise((r) => setTimeout(r, 2_000 * (attempt + 1)))
        continue
      }
      throw e
    }
  }
}

export async function kieWait(taskId: string, timeoutMs: number): Promise<{ urls: string[]; credits: number }> {
  const { getTaskDetail } = await import('../kie/market.ts')
  const started = Date.now()
  for (;;) {
    await new Promise((r) => setTimeout(r, Date.now() - started > 60_000 ? 6_000 : 3_000))
    let task
    try {
      task = await getTaskDetail(taskId)
    } catch {
      if (Date.now() - started > timeoutMs) throw new Error('Kie stopped answering about this job.')
      continue
    }
    if (task.state === 'success' || task.state === 'partial') return { urls: task.resultUrls, credits: task.creditsConsumed ?? 0 }
    if (task.state === 'fail' || task.state === 'expired') throw new Error(task.failMsg || `Kie reported the job ${task.state}.`)
    if (Date.now() - started > timeoutMs) throw new Error('It took too long on Kie’s side and was stopped.')
  }
}

export async function uploadFile(path: string): Promise<string> {
  const { uploadFileStream } = await import('../kie/upload.ts')
  const name = path.split(/[\\/]/).pop()!
  const blob = new Blob([readFileSync(path)], { type: name.endsWith('.webm') ? 'video/webm' : 'video/mp4' })
  return (await uploadFileStream(blob, { fileName: name, uploadPath: 'studio-local' })).fileUrl
}

export async function mediaDirOf(taskId: string) {
  // Same place archived results live, so /media/<taskId>/... serves them.
  const { getMediaRoot } = await import('../media/archiver.ts')
  return { abs: join(getMediaRoot(), taskId), rel: `media/${taskId}` }
}

export async function publishRow(item: HistoryItem) {
  const { upsertHistoryItem } = await import('../db/history.ts')
  upsertHistoryItem(item)
}

export function realLocalDeps(): LocalDeps {
  return {
    workDir: (id) => {
      const dir = join(localRoot(), id)
      mkdirSync(dir, { recursive: true })
      return dir
    },
    clip: cachedClip,
    cli: (name, args, onProgress) => runCli(name, args, onProgress),
    ffmpeg: (args) => exec('ffmpeg', args),
    probe: probeFile,
    upload: uploadFile,
    kieCreate,
    kieWait,
    fetchTo: download,
    mediaDir: mediaDirOf,
    publish: publishRow,
    save: (run) => {
      const dir = join(localRoot(), run.id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 1))
    },
    fileUrl: fileUrlOf,
    gpu,
    now: () => Date.now(),
  }
}
