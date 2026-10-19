import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '../../src/lib/models/types.ts'
import { GpuQueue, type CliName } from './localtools.ts'
import {
  approve,
  draftInput,
  draftProblem,
  fingerprintDir,
  fingerprintFiles,
  fingerprintOf,
  guidedProblem,
  guidedPrompt,
  hdInput,
  makeDraft,
  makeHd,
  prepare,
  requestOf,
  restoreArgs,
  type GuidedDeps,
  type GuidedRun,
} from './guided.ts'

describe('the prompt and the Kie inputs', () => {
  it('says what the guide is, who goes in, and what must disappear', () => {
    const p = guidedPrompt({ pictures: 2, faceOutline: true, extra: 'She wears a red coat.' })
    expect(p).toMatch(/^Replace the depth-coloured figure in @video1 with the person from @image1; keep the motion, camera, framing and background/)
    expect(p).toMatch(/face-mesh lines/)
    expect(p).toMatch(/pitched up three semitones/)
    expect(p).toMatch(/@image2 is another view/)
    expect(p.endsWith('She wears a red coat.')).toBe(true)
    const plain = guidedPrompt({ pictures: 1, faceOutline: false })
    expect(plain).not.toMatch(/mesh/)
    expect(plain).not.toMatch(/@image2/)
  })

  it('drafts in Seedance’s own 480p draft mode with the guide as the reference video', () => {
    expect(draftInput('https://kie/guide.mp4', ['https://kie/a.png'], 'P')).toEqual({
      prompt: 'P',
      reference_video_urls: ['https://kie/guide.mp4'],
      reference_image_urls: ['https://kie/a.png'],
      resolution: '480p',
      draft: true,
      duration: -1, // Kie: must be -1 with a reference video (follows the guide's length)
      aspect_ratio: 'adaptive',
    })
    expect(draftInput('https://g', [], 'P')).not.toHaveProperty('reference_image_urls')
    expect(hdInput('kie-draft-1')).toEqual({ draft_task_id: 'kie-draft-1', resolution: '1080p' })
  })

  it('puts the original soundtrack back, or none for a silent clip', () => {
    expect(restoreArgs('r.mp4', 's.mp4', 'o.mp4', true)).toEqual(expect.arrayContaining(['-map', '0:v:0', '1:a:0', '-c:v', 'copy']))
    expect(restoreArgs('r.mp4', 's.mp4', 'o.mp4', false)).toContain('-an')
  })

  it('checks the request', () => {
    expect(guidedProblem({ clipUrl: 'https://x/c.mp4', points: [], images: [] })).toMatch(/Click on the person/)
    expect(guidedProblem({ clipUrl: 'https://x/c.mp4', points: [{ x: 0.5, y: 0.5, label: 1 }], images: ['blob:x'] })).toMatch(/not uploaded/)
    expect(guidedProblem(requestOf({ clipUrl: 'https://x/c.mp4', points: [{ x: 0.5, y: 0.5, label: 1 }], images: ['https://k/a.png'] }))).toBeNull()
    expect(requestOf({}).faceOutline).toBe(true)
  })
})

describe('the fingerprint', () => {
  it('changes when any file or name changes', () => {
    const a = fingerprintOf([{ name: 'guide.mp4', bytes: Buffer.from('1') }])
    expect(fingerprintOf([{ name: 'guide.mp4', bytes: Buffer.from('1') }])).toBe(a)
    expect(fingerprintOf([{ name: 'guide.mp4', bytes: Buffer.from('2') }])).not.toBe(a)
    expect(fingerprintOf([{ name: 'mask.mp4', bytes: Buffer.from('1') }])).not.toBe(a)
  })

  it('covers the landmarks only with Face outline on', async () => {
    expect(fingerprintFiles(false)).not.toContain('face-landmarks.json')
    const dir = mkdtempSync(join(tmpdir(), 'guided-fp-'))
    for (const f of fingerprintFiles(true)) writeFileSync(join(dir, f), f)
    const on = await fingerprintDir(dir, true)
    const off = await fingerprintDir(dir, false)
    expect(on).not.toBe(off)
    writeFileSync(join(dir, 'guide.mp4'), 'changed')
    expect(await fingerprintDir(dir, true)).not.toBe(on)
  })
})

/* ---------- the pipeline, with fakes ---------- */

function fakes(root: string, over: Partial<GuidedDeps> = {}) {
  const calls = { cli: [] as { name: CliName; args: string[] }[], ffmpeg: [] as string[][], kie: [] as { model: string; input: Record<string, unknown> }[], rows: [] as HistoryItem[], uploads: [] as string[] }
  const touch = (p: string, body = 'x') => (writeFileSync(p, body), p)
  let n = 0
  const deps: GuidedDeps = {
    workDir: (id) => {
      const d = join(root, id)
      mkdirSync(d, { recursive: true })
      return d
    },
    clip: async () => touch(join(root, 'clip.mp4'), 'clip'),
    cli: async (name, args) => {
      calls.cli.push({ name, args })
      const out = args[args.indexOf('--out') + 1]!
      if (name === 'audio') return { original: touch(join(out, 'original.wav')), pitched: touch(join(out, 'pitched.wav')) }
      if (name === 'depth') return { depth: touch(join(out, 'depth.mp4')) }
      if (name === 'segment') return { masks: touch(join(out, 'mask.mp4')), alpha: touch(join(out, 'subject.webm')), preview: touch(join(out, 'preview.mp4')), coverage: [0.3] }
      if (name === 'facemesh') return { landmarks: touch(join(out, 'face-landmarks.json')), overlay: touch(join(out, 'mesh.mp4')) }
      if (name === 'guide') return { guide: touch(join(out, 'guide.mp4'), `guide-${++n}`), preview: touch(join(out, 'guide_preview.mp4')) }
      throw new Error(`unexpected ${name}`)
    },
    ffmpeg: async (args) => {
      calls.ffmpeg.push(args)
      touch(args[args.length - 1]!)
    },
    probe: async () => ({ duration: 5.2, width: 720, height: 1280, hasAudio: true }),
    upload: async (p) => (calls.uploads.push(p), 'https://kie/seedance-input.mp4'),
    kieCreate: async (model, input) => (calls.kie.push({ model, input }), `kie-${calls.kie.length}`),
    kieWait: async () => ({ urls: ['https://kie/out.mp4'], credits: 85 }),
    fetchTo: async (_u, p) => void touch(p),
    mediaDir: async (taskId) => ({ abs: join(root, 'media', taskId), rel: `media/${taskId}` }),
    publish: async (row) => void calls.rows.push(row),
    save: () => undefined,
    fingerprint: fingerprintDir,
    fileUrl: (id, name) => `/f/${id}/${name}`,
    gpu: new GpuQueue(),
    now: () => 5000,
    ...over,
  }
  return { deps, calls }
}

const newRun = (): GuidedRun => ({
  id: 'g1',
  request: { clipUrl: 'https://x/c.mp4', images: ['https://kie/a.png'], points: [{ x: 0.5, y: 0.4, label: 1, frame: 0 }], faceOutline: true },
  status: 'running',
  action: 'prepare',
  step: 'Queued',
  createdAt: 5000,
  updatedAt: 5000,
  credits: 0,
})

describe('guided swap', () => {
  it('prepares every local step, then waits for review — no Kie call', async () => {
    const root = mkdtempSync(join(tmpdir(), 'guided-'))
    const { deps, calls } = fakes(root)
    const run = await prepare(newRun(), deps)
    expect(run.status).toBe('review')
    expect(calls.cli.map((c) => c.name)).toEqual(['audio', 'depth', 'segment', 'facemesh', 'guide'])
    expect(calls.cli.find((c) => c.name === 'guide')!.args).toContain('--mesh')
    expect(calls.cli.find((c) => c.name === 'audio')!.args).toEqual(expect.arrayContaining(['--pitch', '3']))
    // The pitched voice goes inside the guide, not as its own track.
    expect(calls.ffmpeg[0]!.slice(-1)[0]).toMatch(/seedance-input\.mp4$/)
    expect(run.prepared).toMatchObject({ guide: '/f/g1/seedance-input.mp4', mask: '/f/g1/preview.mp4', coverage: 0.3 })
    expect(calls.kie).toEqual([])
    expect(await draftProblem(run, deps)).toBe('Approve the guide first.')
  })

  it('binds approval to the files seen: a stale fingerprint or a changed file is refused', async () => {
    const root = mkdtempSync(join(tmpdir(), 'guided-'))
    const { deps } = fakes(root)
    const run = await prepare(newRun(), deps)
    expect(await approve(run, 'not-it', deps)).toMatch(/changed since you looked/)
    expect(await approve(run, run.prepared!.fingerprint, deps)).toBeNull()
    expect(run.status).toBe('ready')
    expect(await draftProblem(run, deps)).toBeNull()
    writeFileSync(join(root, 'g1', 'mask.mp4'), 'edited')
    expect(await draftProblem(run, deps)).toMatch(/changed since you approved/)
  })

  it('re-preparing clears the approval', async () => {
    const root = mkdtempSync(join(tmpdir(), 'guided-'))
    const { deps } = fakes(root)
    const run = await prepare(newRun(), deps)
    await approve(run, run.prepared!.fingerprint, deps)
    await prepare(run, deps)
    expect(run.approved).toBeUndefined()
    expect(run.status).toBe('review')
  })

  it('a clip outside 4–15 s or without sound stops before the GPU', async () => {
    const root = mkdtempSync(join(tmpdir(), 'guided-'))
    const { deps, calls } = fakes(root, { probe: async () => ({ duration: 22, width: 720, height: 1280, hasAudio: true }) })
    const run = await prepare(newRun(), deps)
    expect(run.error).toMatch(/4–15 s/)
    expect(calls.cli).toEqual([])
  })

  it('draft: Seedance 2.5 at 480p with the approved guide, original sound back, one history row', async () => {
    const root = mkdtempSync(join(tmpdir(), 'guided-'))
    const { deps, calls } = fakes(root)
    const run = await prepare(newRun(), deps)
    await approve(run, run.prepared!.fingerprint, deps)
    await makeDraft(run, deps)
    expect(run.status).toBe('ready')
    expect(calls.uploads[0]).toMatch(/seedance-input\.mp4$/)
    expect(calls.kie[0]).toMatchObject({ model: 'bytedance/seedance-2-5', input: { reference_video_urls: ['https://kie/seedance-input.mp4'], reference_image_urls: ['https://kie/a.png'], resolution: '480p', draft: true, duration: -1 } })
    const restore = calls.ffmpeg[calls.ffmpeg.length - 1]!
    expect(restore).toEqual(expect.arrayContaining(['1:a:0']))
    expect(calls.rows[0]).toMatchObject({ taskId: 'guided-g1-draft', modelId: 'studio/guided-swap', creditsConsumed: 85, input: { draft: true, resolution: '480p', kie_task_id: 'kie-1', guided_run: 'g1' } })

    await makeHd(run, deps)
    expect(calls.kie[1]).toEqual({ model: 'bytedance/seedance-2-5-draft', input: { draft_task_id: 'kie-1', resolution: '1080p' } })
    expect(calls.rows[1]).toMatchObject({ taskId: 'guided-g1-hd', input: { stage: 'hd', resolution: '1080p' } })
    expect(run.credits).toBe(170)
  })

  it('a draft whose Kie job was already created is collected, not sent again', async () => {
    const root = mkdtempSync(join(tmpdir(), 'guided-'))
    const { deps, calls } = fakes(root)
    const run = await prepare(newRun(), deps)
    await approve(run, run.prepared!.fingerprint, deps)
    run.draft = { kieTaskId: 'kie-existing' }
    await makeDraft(run, deps)
    expect(calls.kie).toEqual([])
    expect(calls.rows[0]!.input).toMatchObject({ kie_task_id: 'kie-existing' })
  })
})
