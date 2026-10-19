/**
 * Genjutsu → Guided swap: replace the person in a clip with your character, steered by a guide video
 * instead of raw footage. A port of github.com/sirioberati/Genjustsu-Open-Source-Workflow (MIT, © Sirio
 * Berati) — its "What happens" steps, on this PC's tools and Kie's Seedance 2.5:
 *
 *   Prepare (free, local, one GPU job at a time — localtools.ts `gpu`):
 *     clip ─audio.py --pitch 3→ original.wav + pitched.wav (the voice +3 semitones, same length)
 *          ─depth.py→ coloured depth ─segment.py (your clicks on frame 0)→ mask
 *          ─facemesh.py (Face outline on)→ landmarks ─guide.py [--mesh]→ guide.mp4: the depth-coloured subject
 *           over the ORIGINAL background, the face mesh on top
 *          ─ffmpeg→ seedance-input.mp4: the guide with the pitched voice inside (no separate audio track to Kie)
 *     → the guide and the mask preview side by side, and a fingerprint of every file that will be used.
 *   Review: you press Approve guide. The approval is bound to that fingerprint (the repo's mask_review.py):
 *     any re-prepare, or any file changing on disk, clears it, and Make draft re-checks it from disk.
 *   Make draft (Kie): upload seedance-input.mp4 → bytedance/seedance-2-5 with it as the reference video,
 *     your pictures as @image1…, `draft: true` (480p, Seedance's own draft mode) → download, drop its sound,
 *     put the clip's ORIGINAL soundtrack back → history row `guided-<id>-draft` (model studio/guided-swap).
 *   Make HD (Kie): bytedance/seedance-2-5-draft with the draft's task id at 1080p — the same take, finished
 *     (the repo's "complete the accepted draft at 1080p"; Kie keeps a draft 7 days) → soundtrack restored again
 *     → `guided-<id>-hd`.
 *
 * A run lives in <studioDir>/guided/<id>/ (paths.ts; run.json + every file), polled by Genjutsu's rail. A Kie task id
 * is saved the moment the job is created, so Retry after a restart collects that job instead of paying again.
 * The prompt, the Kie inputs and the fingerprint are pure and tested in guided.test.ts.
 */
import { createHash } from 'node:crypto'
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { HistoryItem } from '../../src/lib/models/types.ts'
import { studioDir } from './paths.ts'
import {
  cliArgs,
  cleanBox,
  cleanPoints,
  fileUrlOf,
  gpu as sharedGpu,
  newId,
  realLocalDeps,
  resultFile,
  type Box,
  type CliName,
  type GpuQueue,
  type LocalDeps,
  type Point,
  type Probe,
} from './localtools.ts'

export const guidedRoot = () => join(studioDir(), 'guided')

export const GUIDED_MODEL_ID = 'studio/guided-swap'
export const SEEDANCE = 'bytedance/seedance-2-5'
export const SEEDANCE_FINISH = 'bytedance/seedance-2-5-draft'
/** Seedance 2.5 reads up to 30 reference pictures. */
export const MAX_PICTURES = 30
/** The clip lengths a guided swap takes (Seedance renders 4–30 s; past 15 s the guide drifts). */
export const MIN_SECONDS = 4
export const MAX_SECONDS = 15
export const PITCH = 3

/* ---------- the request ---------- */

export interface GuidedRequest {
  clipUrl: string
  name?: string
  /** Character pictures, already on Kie (uploadMedia): @image1, @image2… in this order. */
  images: string[]
  points: Point[]
  box?: Box
  /** Draw the face mesh into the guide (expression and lip motion). On by default. */
  faceOutline: boolean
  /** What you add to the instruction. */
  prompt?: string
}

export function guidedProblem(r: Partial<GuidedRequest>): string | null {
  if (r.clipUrl?.includes('..') || r.clipUrl?.includes('\0')) return 'That clip path is not allowed.'
  if (!r.clipUrl || !(/^https:\/\//.test(r.clipUrl) || /^\/?media\/[^/]+\/[^/]+$/.test(r.clipUrl))) return 'Add your clip first.'
  if (!r.points?.some((p) => p.label === 1) && !r.box) return 'Click on the person to replace first (frame 0, on the right).'
  if ((r.images ?? []).some((u) => !/^https:\/\//.test(u))) return 'A character picture is not uploaded yet.'
  if ((r.images?.length ?? 0) > MAX_PICTURES) return `Seedance takes up to ${MAX_PICTURES} pictures.`
  return null
}

export function requestOf(body: Record<string, unknown>): Partial<GuidedRequest> {
  return {
    clipUrl: typeof body.clipUrl === 'string' ? body.clipUrl.trim() : undefined,
    name: typeof body.name === 'string' ? body.name.slice(0, 120) : undefined,
    images: Array.isArray(body.images) ? body.images.filter((u): u is string => typeof u === 'string').slice(0, MAX_PICTURES) : [],
    points: cleanPoints(body.points),
    box: cleanBox(body.box),
    faceOutline: body.faceOutline !== false,
    prompt: typeof body.prompt === 'string' ? body.prompt.slice(0, 4000) : undefined,
  }
}

/* ---------- the prompt and the Kie inputs ---------- */

/**
 * The instruction Seedance gets, after the repo's seedance_bridge.py: what @video1 is (a guide, not footage),
 * who goes in, what must disappear, and that the embedded voice is timing only. Then what you typed.
 */
export function guidedPrompt(o: { pictures: number; faceOutline: boolean; extra?: string }): string {
  const who = o.pictures > 0 ? 'the person from @image1' : 'a new person'
  const parts = [
    `Replace the depth-coloured figure in @video1 with ${who}; keep the motion, camera, framing and background exactly as in @video1.`,
    `@video1 is a guide, not footage: the person to replace is drawn as a coloured depth map${o.faceOutline ? ' with face-mesh lines on the face' : ''} over the original background. ` +
      'Its embedded voice is the original speech pitched up three semitones; use it only for performance and lip timing.',
    `Remove every depth colour${o.faceOutline ? ' and every face-mesh line' : ''} from the result: render a real, photographic person with natural skin, hair and clothes. Replace the entire original identity, including hair. Preserve the exact dialogue timing.`,
  ]
  if (o.pictures > 1) parts.push(`@image1 is the main character reference; ${o.pictures === 2 ? '@image2 is another view' : `@image2 to @image${o.pictures} are more views`} of the same person.`)
  const extra = o.extra?.trim()
  if (extra) parts.push(extra)
  return parts.join('\n')
}

/**
 * The draft job: the guide as the reference video, the pictures as references, Seedance's 480p draft mode.
 * `duration: -1` = as long as the guide: Kie refuses any other value here (live run 2026-10-17: "the 'duration'
 * parameter must be -1, and the input video duration must be between 4 and 30 seconds").
 */
export function draftInput(guideUrl: string, images: string[], prompt: string): Record<string, unknown> {
  return {
    prompt,
    reference_video_urls: [guideUrl],
    ...(images.length ? { reference_image_urls: images.slice(0, MAX_PICTURES) } : {}),
    resolution: '480p',
    draft: true,
    duration: -1,
    aspect_ratio: 'adaptive',
  }
}

/** The HD job: the accepted draft, finished at 1080p by Seedance (same take, same parameters). */
export const hdInput = (draftTaskId: string): Record<string, unknown> => ({ draft_task_id: draftTaskId, resolution: '1080p' })

/* ---------- the fingerprint the approval is bound to ---------- */

/** Every file Make draft will use; the face landmarks only with Face outline on. */
export const fingerprintFiles = (faceOutline: boolean) => ['source.mp4', 'original.wav', 'pitched.wav', 'depth.mp4', 'mask.mp4', ...(faceOutline ? ['face-landmarks.json'] : []), 'guide.mp4', 'seedance-input.mp4']

/** sha256 over each name and its bytes, in order (mask_review.py's `fingerprint`). */
export function fingerprintOf(parts: { name: string; bytes: Uint8Array }[]): string {
  const h = createHash('sha256')
  for (const p of parts) {
    h.update(p.name)
    h.update(p.bytes)
  }
  return h.digest('hex')
}

/** The same over the files on disk, streamed; throws if one is missing (prepare first). */
export async function fingerprintDir(dir: string, faceOutline: boolean): Promise<string> {
  const h = createHash('sha256')
  for (const name of fingerprintFiles(faceOutline)) {
    const path = join(dir, name)
    if (!existsSync(path)) throw new Error('Prepare the guide first.')
    h.update(name)
    await new Promise<void>((ok, fail) => {
      createReadStream(path)
        .on('data', (b) => h.update(b))
        .on('end', () => ok())
        .on('error', fail)
    })
  }
  return h.digest('hex')
}

/* ---------- ffmpeg ---------- */

/** The guide with the pitched voice inside: what Kie gets as @video1. */
export const embedArgs = (guide: string, pitched: string, out: string): string[] => ['-y', '-v', 'error', '-i', guide, '-i', pitched, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]

/** Seedance's picture with the clip's original soundtrack (its own sound dropped); silent if the clip was. */
export const restoreArgs = (result: string, source: string, out: string, hasAudio: boolean): string[] =>
  hasAudio
    ? ['-y', '-v', 'error', '-i', result, '-i', source, '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]
    : ['-y', '-v', 'error', '-i', result, '-map', '0:v:0', '-c:v', 'copy', '-an', '-movflags', '+faststart', out]

/* ---------- the run ---------- */

export type GuidedAction = 'prepare' | 'draft' | 'hd'

export interface GuidedRun {
  id: string
  request: GuidedRequest
  /** running: a step is going · review: prepared, waiting for Approve · ready: approved or a result is in · failed */
  status: 'running' | 'review' | 'ready' | 'failed'
  /** The step running, or the last one that ran. */
  action: GuidedAction
  step: string
  progress?: number
  createdAt: number
  updatedAt: number
  error?: string
  seconds?: number
  prepared?: { fingerprint: string; guide: string; mask: string; faceOutline: boolean; coverage?: number; at: number }
  approved?: { fingerprint: string; at: number }
  draft?: { kieTaskId?: string; taskId?: string; credits?: number; at?: number; prompt?: string }
  hd?: { kieTaskId?: string; taskId?: string; credits?: number; at?: number }
  credits: number
  dismissed?: boolean
}

export interface GuidedDeps extends Pick<LocalDeps, 'clip' | 'cli' | 'ffmpeg' | 'probe' | 'upload' | 'kieCreate' | 'kieWait' | 'fetchTo' | 'mediaDir' | 'publish' | 'now'> {
  workDir: (id: string) => string
  save: (run: GuidedRun) => void
  fingerprint: (dir: string, faceOutline: boolean) => Promise<string>
  fileUrl: (id: string, name: string) => string
  gpu: GpuQueue
}

export const KIE_TIMEOUT = 30 * 60_000

function set(run: GuidedRun, deps: GuidedDeps, step: string, progress?: number) {
  run.step = step
  run.progress = progress
  run.updatedAt = deps.now()
  deps.save(run)
}

function fail(run: GuidedRun, deps: GuidedDeps, e: unknown) {
  run.status = 'failed'
  run.error = (e as Error).message || 'It stopped with no reason given.'
  set(run, deps, 'Failed')
}

const mean = (xs: unknown) => (Array.isArray(xs) && xs.length ? Math.round((xs.reduce((a: number, b) => a + (Number(b) || 0), 0) / xs.length) * 1000) / 1000 : undefined)

/** One GPU tool in turn, its progress on the run. */
async function tool(run: GuidedRun, deps: GuidedDeps, label: string, name: CliName, args: string[], onGpu = true) {
  const go = () => {
    set(run, deps, label, 0)
    return deps.cli(name, args, (pct, phase) => set(run, deps, `${label}${phase ? ` · ${phase}` : ''} ${pct}%`, pct))
  }
  return onGpu ? deps.gpu.run(go, (ahead) => set(run, deps, `Waiting for the graphics card (${ahead} ahead)`)) : go()
}

/** Prepare: every local step, then the fingerprint; the approval is cleared first. */
export async function prepare(run: GuidedRun, deps: GuidedDeps): Promise<GuidedRun> {
  const r = run.request
  const dir = deps.workDir(run.id)
  run.status = 'running'
  run.action = 'prepare'
  run.error = undefined
  run.approved = undefined
  run.prepared = undefined
  try {
    set(run, deps, 'Getting the clip')
    const clip = await deps.clip(r.clipUrl)
    const source = join(dir, 'source.mp4')
    copyFileSync(clip, source)
    const probe = await deps.probe(source)
    run.seconds = Math.round(probe.duration * 100) / 100
    if (probe.duration < MIN_SECONDS - 0.1 || probe.duration > MAX_SECONDS + 0.25) throw new Error(`A guided swap takes clips of ${MIN_SECONDS}–${MAX_SECONDS} s; this one is ${probe.duration.toFixed(1)} s. Trim it first.`)
    if (!probe.hasAudio) throw new Error('This clip has no sound; the guide carries the voice for lip timing. Use a clip with its sound.')

    const audio = await tool(run, deps, 'Pitching the voice', 'audio', cliArgs.audio(source, dir, PITCH), false)
    copyIfElsewhere(resultFile(audio, 'original'), join(dir, 'original.wav'))
    copyIfElsewhere(resultFile(audio, 'pitched'), join(dir, 'pitched.wav'))

    const depth = await tool(run, deps, 'Depth', 'depth', cliArgs.depth(source, dir, 'turbo'))
    const depthFile = resultFile(depth, 'depth')
    const seg = await tool(run, deps, 'Finding the person', 'segment', cliArgs.segment(source, dir, r.points, r.box))
    const maskFile = resultFile(seg, 'masks')
    const coverage = mean(seg.coverage)
    if (coverage !== undefined && coverage < 0.005) throw new Error('The mask came back almost empty. Click on the person itself and prepare again.')
    copyIfElsewhere(depthFile, join(dir, 'depth.mp4'))
    copyIfElsewhere(maskFile, join(dir, 'mask.mp4'))
    if (r.faceOutline) {
      const mesh = await tool(run, deps, 'Face outline', 'facemesh', cliArgs.facemesh(source, dir))
      copyIfElsewhere(resultFile(mesh, 'landmarks'), join(dir, 'face-landmarks.json'))
    }
    const guide = await tool(run, deps, 'Building the guide', 'guide', cliArgs.guide(source, join(dir, 'depth.mp4'), join(dir, 'mask.mp4'), dir, r.faceOutline))
    copyIfElsewhere(resultFile(guide, 'guide'), join(dir, 'guide.mp4'))
    const maskPreview = typeof seg.preview === 'string' ? seg.preview : maskFile

    set(run, deps, 'Putting the voice in the guide')
    await deps.ffmpeg(embedArgs(join(dir, 'guide.mp4'), join(dir, 'pitched.wav'), join(dir, 'seedance-input.mp4')))

    set(run, deps, 'Fingerprinting')
    const fingerprint = await deps.fingerprint(dir, r.faceOutline)
    run.prepared = { fingerprint, guide: deps.fileUrl(run.id, 'seedance-input.mp4'), mask: deps.fileUrl(run.id, baseName(maskPreview)), faceOutline: r.faceOutline, coverage, at: deps.now() }
    run.status = 'review'
    set(run, deps, 'Review the guide, then Approve')
  } catch (e) {
    fail(run, deps, e)
  }
  return run
}

const baseName = (p: string) => p.split(/[\\/]/).pop()!
const copyIfElsewhere = (from: string, to: string) => {
  if (resolve(from).toLowerCase() !== resolve(to).toLowerCase()) copyFileSync(from, to)
}

/** Approve: only the guide you saw — the fingerprint you were shown must still be the files on disk. */
export async function approve(run: GuidedRun, fingerprint: string, deps: GuidedDeps): Promise<string | null> {
  if (run.status === 'running') return 'It is still working.'
  if (!run.prepared) return 'Prepare the guide first.'
  if (fingerprint !== run.prepared.fingerprint) return 'The guide changed since you looked. Look at the new one, then approve.'
  const now = await deps.fingerprint(deps.workDir(run.id), run.prepared.faceOutline).catch(() => null)
  if (now !== run.prepared.fingerprint) return 'The guide’s files changed on disk. Prepare it again.'
  run.approved = { fingerprint, at: deps.now() }
  run.status = 'ready'
  set(run, deps, 'Approved — ready for a draft')
  return null
}

/** Why Make draft can't go yet, or null. Checked against the files on disk, not just the run. */
export async function draftProblem(run: GuidedRun, deps: GuidedDeps): Promise<string | null> {
  if (run.status === 'running') return 'It is still working.'
  if (!run.prepared) return 'Prepare the guide first.'
  if (!run.approved || run.approved.fingerprint !== run.prepared.fingerprint) return 'Approve the guide first.'
  const now = await deps.fingerprint(deps.workDir(run.id), run.prepared.faceOutline).catch(() => null)
  if (now !== run.approved.fingerprint) return 'The guide’s files changed since you approved them. Prepare and approve again.'
  return null
}

/** One Kie job collected: created now, or (Retry) the one already created. Its file, restored, saved. */
async function kieStep(run: GuidedRun, deps: GuidedDeps, which: 'draft' | 'hd', model: string, input: () => Promise<Record<string, unknown>>) {
  const dir = deps.workDir(run.id)
  const slot = (run[which] ??= {})
  if (!slot.kieTaskId) {
    const body = await input()
    set(run, deps, which === 'draft' ? 'Sending the draft to Seedance 2.5' : 'Finishing the draft at 1080p')
    slot.kieTaskId = await deps.kieCreate(model, body)
    deps.save(run)
  }
  set(run, deps, which === 'draft' ? 'Seedance is making the draft (480p)' : 'Seedance is finishing it at 1080p')
  const res = await deps.kieWait(slot.kieTaskId, KIE_TIMEOUT)
  slot.credits = res.credits
  run.credits = Math.round((run.credits + res.credits) * 100) / 100
  if (!res.urls[0]) throw new Error('Seedance returned no video.')
  set(run, deps, 'Putting the original sound back')
  const raw = join(dir, `${which}-seedance.mp4`)
  await deps.fetchTo(res.urls[0], raw)
  const source = join(dir, 'source.mp4')
  const probe = await deps.probe(source)
  const out = join(dir, `${which}.mp4`)
  await deps.ffmpeg(restoreArgs(raw, source, out, probe.hasAudio))

  set(run, deps, 'Saving')
  const taskId = `guided-${run.id}-${which}`
  const media = await deps.mediaDir(taskId)
  mkdirSync(media.abs, { recursive: true })
  copyFileSync(out, join(media.abs, '0.mp4'))
  const title = which === 'draft' ? 'Guided swap · draft 480p' : 'Guided swap · HD 1080p'
  await deps.publish(historyRow(run, which, taskId, [{ kind: 'video', mimeType: 'video/mp4', localPath: `${media.rel}/0.mp4`, duration: run.seconds, title }]))
  slot.taskId = taskId
  slot.at = deps.now()
}

export async function makeDraft(run: GuidedRun, deps: GuidedDeps): Promise<GuidedRun> {
  run.status = 'running'
  run.action = 'draft'
  run.error = undefined
  try {
    const dir = deps.workDir(run.id)
    await kieStep(run, deps, 'draft', SEEDANCE, async () => {
      set(run, deps, 'Uploading the guide')
      const url = await deps.upload(join(dir, 'seedance-input.mp4'))
      const prompt = guidedPrompt({ pictures: run.request.images.length, faceOutline: run.request.faceOutline, extra: run.request.prompt })
      // The same object kieStep holds: it writes the task id onto it next.
      run.draft!.prompt = prompt
      return draftInput(url, run.request.images, prompt)
    })
    run.status = 'ready'
    set(run, deps, 'Draft ready — Make HD when you like it')
  } catch (e) {
    fail(run, deps, e)
  }
  return run
}

export async function makeHd(run: GuidedRun, deps: GuidedDeps): Promise<GuidedRun> {
  run.status = 'running'
  run.action = 'hd'
  run.error = undefined
  try {
    const draftId = run.draft?.kieTaskId
    if (!draftId || !run.draft?.taskId) throw new Error('Make a draft first.')
    await kieStep(run, deps, 'hd', SEEDANCE_FINISH, async () => hdInput(draftId))
    run.status = 'ready'
    set(run, deps, 'HD ready')
  } catch (e) {
    const msg = (e as Error).message ?? ''
    // Kie keeps a draft 7 days; past that the finish job is refused.
    if (/expire|not found|invalid draft|7 days/i.test(msg)) (e as Error).message = `Seedance no longer has this draft (it keeps them 7 days): ${msg}. Make a new draft.`
    fail(run, deps, e)
  }
  return run
}

export function historyRow(run: GuidedRun, which: 'draft' | 'hd', taskId: string, media: HistoryItem['media']): HistoryItem {
  const r = run.request
  const slot = run[which] ?? {}
  return {
    taskId,
    model: 'Guided swap',
    modelId: GUIDED_MODEL_ID,
    category: 'video',
    state: 'success',
    createdAt: run.createdAt + (which === 'hd' ? 1 : 0),
    operation: 'generate',
    prompt: run.draft?.prompt ?? '',
    media,
    resultUrls: [],
    creditsConsumed: slot.credits || undefined,
    input: {
      guided_run: run.id,
      stage: which,
      draft: which === 'draft',
      resolution: which === 'draft' ? '480p' : '1080p',
      kie_model: which === 'draft' ? SEEDANCE : SEEDANCE_FINISH,
      kie_task_id: slot.kieTaskId,
      clip_url: r.clipUrl,
      images: r.images,
      face_outline: r.faceOutline,
      fingerprint: run.approved?.fingerprint,
      ...(r.prompt ? { extra_prompt: r.prompt } : {}),
    },
  }
}

/* ---------- the runs this server knows ---------- */

const runs = new Map<string, GuidedRun>()
let deps: GuidedDeps | null = null
let loaded = false

function load() {
  if (loaded) return
  loaded = true
  const root = guidedRoot()
  if (!existsSync(root)) return
  for (const id of readdirSync(root)) {
    const file = join(root, id, 'run.json')
    if (!existsSync(file)) continue
    try {
      const run = JSON.parse(readFileSync(file, 'utf8')) as GuidedRun
      if (run.status === 'running') {
        run.status = 'failed'
        run.step = 'Failed'
        run.error = 'Trenchable restarted while this was running. Press Retry to carry on.'
        writeFileSync(file, JSON.stringify(run, null, 1))
      }
      runs.set(run.id, run)
    } catch {
      // A half-written file from a crash: skip it.
    }
  }
}

export function setGuidedDeps(d: GuidedDeps | null) {
  deps = d
  runs.clear()
  loaded = d !== null
}

const RECENT_MS = 7 * 24 * 60 * 60 * 1000

export function listGuided(now = Date.now()): GuidedRun[] {
  load()
  return [...runs.values()].filter((r) => !r.dismissed && (r.status === 'running' || now - r.updatedAt < RECENT_MS)).sort((a, b) => b.createdAt - a.createdAt)
}

export const getGuided = (id: string) => (load(), runs.get(id))

const D = () => deps ?? realGuidedDeps()

export function startGuided(request: GuidedRequest, d: GuidedDeps = D()): GuidedRun {
  load()
  const now = d.now()
  const run: GuidedRun = { id: newId(now), request, status: 'running', action: 'prepare', step: 'Queued', createdAt: now, updatedAt: now, credits: 0 }
  runs.set(run.id, run)
  d.save(run)
  void prepare(run, d)
  return run
}

/** Prepare again with new clicks or Face outline: the approval goes, a finished draft stays in history. */
export function reprepare(run: GuidedRun, patch: Partial<GuidedRequest>, d: GuidedDeps = D()): string | null {
  if (run.status === 'running') return 'It is still working.'
  run.request = { ...run.request, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
  run.draft = undefined
  run.hd = undefined
  void prepare(run, d)
  return null
}

export const approveGuided = (run: GuidedRun, fingerprint: string, d: GuidedDeps = D()) => approve(run, fingerprint, d)

export async function startDraft(run: GuidedRun, patch: Pick<Partial<GuidedRequest>, 'prompt' | 'images'>, d: GuidedDeps = D()): Promise<string | null> {
  const problem = await draftProblem(run, d)
  if (problem) return problem
  if (run.draft?.taskId) return 'This guide already has a draft. Prepare again for another, or Make HD.'
  if (patch.prompt !== undefined) run.request.prompt = patch.prompt
  if (patch.images) run.request.images = patch.images
  run.draft = undefined
  void makeDraft(run, d)
  return null
}

export function startHd(run: GuidedRun, d: GuidedDeps = D()): string | null {
  if (run.status === 'running') return 'It is still working.'
  if (!run.draft?.taskId) return 'Make a draft first.'
  if (run.hd?.taskId) return 'This draft is already in HD.'
  void makeHd(run, d)
  return null
}

/** Retry the step that failed; a Kie job already created is collected, not sent again. */
export function retryGuided(run: GuidedRun, d: GuidedDeps = D()): string | null {
  if (run.status !== 'failed') return 'Nothing failed.'
  if (run.action === 'prepare') void prepare(run, d)
  else if (run.action === 'draft') {
    // A job Kie refused is gone: send a fresh one. One cut off by a restart or a timeout is collected.
    if (run.draft?.kieTaskId && !/restarted|stopped answering|too long/i.test(run.error ?? '')) run.draft = undefined
    void makeDraft(run, d)
  } else {
    if (run.hd?.kieTaskId && !/restarted|stopped answering|too long/i.test(run.error ?? '')) run.hd = undefined
    void makeHd(run, d)
  }
  return null
}

export function dismissGuided(id: string, d: GuidedDeps = D()): boolean {
  const run = getGuided(id)
  if (!run || run.status === 'running') return false
  run.dismissed = true
  d.save(run)
  return true
}

/* ---------- the real world ---------- */

export function realGuidedDeps(): GuidedDeps {
  const local = realLocalDeps()
  return {
    clip: local.clip,
    cli: local.cli,
    ffmpeg: local.ffmpeg,
    probe: local.probe as (p: string) => Promise<Probe>,
    upload: local.upload,
    kieCreate: local.kieCreate,
    kieWait: local.kieWait,
    fetchTo: local.fetchTo,
    mediaDir: local.mediaDir,
    publish: local.publish,
    now: local.now,
    workDir: (id) => {
      const dir = join(guidedRoot(), id)
      mkdirSync(dir, { recursive: true })
      return dir
    },
    save: (run) => {
      const dir = join(guidedRoot(), run.id)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'run.json'), JSON.stringify(run, null, 1))
    },
    fingerprint: fingerprintDir,
    fileUrl: fileUrlOf,
    gpu: sharedGpu,
  }
}
