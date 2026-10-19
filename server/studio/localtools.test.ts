import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { HistoryItem } from '../../src/lib/models/types.ts'
import {
  GpuQueue,
  cleanBox,
  cleanPoints,
  cliArgs,
  greenArgs,
  localProblem,
  padArgs,
  padCanvas,
  parseCliLine,
  reframeInput,
  runCli,
  runFilePath,
  runLocal,
  toolReady,
  type CliName,
  type LocalDeps,
  type LocalRequest,
  type LocalRun,
} from './localtools.ts'

describe('the CLI contract', () => {
  it('reads progress, result and error lines and ignores the rest', () => {
    expect(parseCliLine('PROGRESS 40 depth')).toEqual({ type: 'progress', pct: 40, phase: 'depth' })
    expect(parseCliLine('PROGRESS 140')).toEqual({ type: 'progress', pct: 100, phase: '' })
    expect(parseCliLine('RESULT {"depth": "C:/x/depth.mp4", "frames": 120}')).toEqual({ type: 'result', data: { depth: 'C:/x/depth.mp4', frames: 120 } })
    expect(parseCliLine('ERROR Not enough free memory (2.1 GB)')).toEqual({ type: 'error', message: 'Not enough free memory (2.1 GB)' })
    expect(parseCliLine('RESULT {broken')).toBeNull()
    expect(parseCliLine('xFormers not available')).toBeNull()
  })

  it('builds each tool’s arguments as the contract has them', () => {
    expect(cliArgs.depth('a.mp4', 'D', 'gray')).toEqual(['--in', 'a.mp4', '--out', 'D', '--colormap', 'gray'])
    expect(cliArgs.segment('a.mp4', 'D', [{ x: 0.5, y: 0.4, label: 1, frame: 0 }], [0.1, 0.1, 0.9, 0.9])).toEqual(['--in', 'a.mp4', '--out', 'D', '--points', '[{"x":0.5,"y":0.4,"label":1,"frame":0}]', '--box', '0.1,0.1,0.9,0.9'])
    expect(cliArgs.rife('a.mp4', 'D', 60)).toEqual(['--in', 'a.mp4', '--out', 'D', '--fps', '60'])
    expect(cliArgs.guide('a.mp4', 'D/depth.mp4', 'D/mask.mp4', 'D', true)).toContain('--mesh')
    expect(cliArgs.audio('a.mp4', 'D')).toEqual(['--in', 'a.mp4', '--out', 'D', '--pitch', '3'])
  })

  it('keeps only well-formed clicks and boxes', () => {
    expect(cleanPoints([{ x: 0.5, y: 0.5, label: 1 }, { x: 2, y: 0.5, label: 1 }, { x: 0.1, y: 0.2, label: 0 }, 'x'])).toEqual([
      { x: 0.5, y: 0.5, label: 1, frame: 0 },
      { x: 0.1, y: 0.2, label: 0, frame: 0 },
    ])
    expect(cleanBox([0.8, 0.9, 0.2, 0.1])).toEqual([0.2, 0.1, 0.8, 0.9])
    expect(cleanBox([0.5, 0.5, 0.505, 0.9])).toBeUndefined()
    expect(cleanBox([0, 0, 1])).toBeUndefined()
  })

  it('runs a stub tool through the real spawn path', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'localtools-'))
    const stub = join(dir, 'stub.mjs')
    writeFileSync(stub, "console.log('loading model');console.log('PROGRESS 10 load');console.log('PROGRESS 90 write');console.log('RESULT ' + JSON.stringify({ video: process.argv[3] }))")
    const seen: number[] = []
    const out = await runCli('rife', ['--in', 'clip.mp4'], (p) => seen.push(p), { command: { cmd: process.execPath, pre: [stub], cwd: dir } })
    expect(out).toEqual({ video: 'clip.mp4' })
    expect(seen).toEqual([10, 90])
    const bad = join(dir, 'bad.mjs')
    writeFileSync(bad, "console.log('ERROR Not enough free memory');process.exit(2)")
    await expect(runCli('depth', [], () => undefined, { command: { cmd: process.execPath, pre: [bad], cwd: dir } })).rejects.toThrow('Not enough free memory')
  })
})

describe('requests', () => {
  const clip = 'https://tempfile.redpandaai.co/x/clip.mp4'
  it('says what is missing in plain words', () => {
    expect(localProblem({ tool: 'depth' })).toBe('Add your clip first.')
    expect(localProblem({ tool: 'depth', clipUrl: '/media/../etc' })).toBe('That clip path is not allowed.')
    expect(localProblem({ tool: 'fps', clipUrl: clip, fps: 24 })).toBe('Pick 30, 48 or 60 fps.')
    expect(localProblem({ tool: 'removebg', clipUrl: clip, points: [{ x: 0.5, y: 0.5, label: 0 }] })).toMatch(/Click on the subject/)
    expect(localProblem({ tool: 'removebg', clipUrl: clip, box: [0.1, 0.1, 0.5, 0.5] })).toBeNull()
    expect(localProblem({ tool: 'reframe', clipUrl: clip, aspect: '4:5' })).toMatch(/no 4:5 frame/)
    expect(localProblem({ tool: 'reframe', clipUrl: clip, aspect: '4:5', model: 'happyhorse/video-edit' })).toBeNull()
    expect(localProblem({ tool: 'depth', clipUrl: '/media/local-abc/0.mp4' })).toBeNull()
  })

  it('reads doctor’s answer per tool', () => {
    expect(toolReady({ installed: false, reason: 'Not installed.', tools: {}, checkedAt: 0 }, 'depth')).toBe('Not installed.')
    expect(toolReady({ installed: true, tools: { depth: 'ok', rife: 'error weights missing' }, checkedAt: 0 }, 'rife')).toBe('rife: error weights missing')
    expect(toolReady({ installed: true, tools: { depth: 'ok' }, checkedAt: 0 }, 'frame')).toBeNull()
  })
})

describe('Reframe', () => {
  it('pads to the smallest frame of the new ratio that holds the whole clip', () => {
    // 16:9 → 9:16: the width stays, the height grows.
    expect(padCanvas(1280, 720, '9:16')).toEqual({ W: 720, H: 1280, x: 0, y: 438, w: 720, h: 406 })
    // 9:16 → 16:9 at full size would be 3413 wide; capped at 1280 on the long side.
    const c = padCanvas(1080, 1920, '16:9')
    expect(c.W).toBe(1280)
    expect(c.H).toBe(720)
    expect(c.w % 2 + c.h % 2 + c.x % 2 + c.y % 2).toBe(0)
    expect(c.x + c.w).toBeLessThanOrEqual(c.W)
    // Already the ratio: no padding.
    expect(padCanvas(1080, 1080, '1:1')).toEqual({ W: 1080, H: 1080, x: 0, y: 0, w: 1080, h: 1080 })
  })

  it('blurs a zoomed copy behind the clip and keeps the sound', () => {
    const args = padArgs('in.mp4', 'out.mp4', padCanvas(1280, 720, '1:1'))
    const graph = args[args.indexOf('-filter_complex') + 1]!
    expect(graph).toMatch(/boxblur/)
    expect(graph).toMatch(/overlay=\d+:\d+/)
    expect(args).toContain('0:a:0?')
  })

  it('sends Wan its ratio and keeps the clip’s audio; HappyHorse follows the padded frame', () => {
    expect(reframeInput('wan/2-7-videoedit', 'https://u/p.mp4', '9:16')).toMatchObject({ video_url: 'https://u/p.mp4', aspect_ratio: '9:16', resolution: '720p', audio_setting: 'origin' })
    const hh = reframeInput('happyhorse/video-edit', 'https://u/p.mp4', '4:5', '1080p')
    expect(hh).not.toHaveProperty('aspect_ratio')
    expect(hh).toMatchObject({ resolution: '1080p', audio_setting: 'origin' })
  })

  it('green screen decodes the alpha with libvpx-vp9', () => {
    const args = greenArgs('subject.webm', 'source.mp4', 'green.mp4')
    expect(args.slice(args.indexOf('-c:v'), args.indexOf('-c:v') + 4)).toEqual(['-c:v', 'libvpx-vp9', '-i', 'subject.webm'])
  })
})

describe('the GPU queue', () => {
  it('runs one job at a time and says how many are ahead', async () => {
    const q = new GpuQueue()
    const order: string[] = []
    const waits: number[] = []
    let release!: () => void
    const first = q.run(() => new Promise<void>((ok) => (release = () => (order.push('a'), ok()))))
    const second = q.run(async () => void order.push('b'), (n) => waits.push(n))
    const third = q.run(async () => {
      throw new Error('boom')
    })
    const fourth = q.run(async () => void order.push('d'), (n) => waits.push(n))
    expect(q.pending).toBe(4)
    await new Promise((r) => setTimeout(r, 5))
    expect(order).toEqual([])
    release()
    await first
    await second
    await expect(third).rejects.toThrow('boom')
    await fourth
    expect(order).toEqual(['a', 'b', 'd'])
    expect(waits).toEqual([1, 3])
    await new Promise((r) => setTimeout(r, 0))
    expect(q.pending).toBe(0)
  })
})

/* ---------- the pipeline, with fakes ---------- */

function fakes(root: string, over: Partial<LocalDeps> = {}) {
  const calls: { cli: { name: CliName; args: string[] }[]; ffmpeg: string[][]; kie: { model: string; input: Record<string, unknown> }[]; rows: HistoryItem[]; waited: string[] } = { cli: [], ffmpeg: [], kie: [], rows: [], waited: [] }
  const touch = (p: string) => (writeFileSync(p, 'x'), p)
  const deps: LocalDeps = {
    workDir: (id) => {
      const d = join(root, id)
      mkdirSync(d, { recursive: true })
      return d
    },
    clip: async () => touch(join(root, 'source.mp4')),
    cli: async (name, args, onProgress) => {
      calls.cli.push({ name, args })
      onProgress(50, 'half')
      const out = args[args.indexOf('--out') + 1]!
      if (name === 'depth') return { depth: touch(join(out, 'depth.mp4')), frames: 120 }
      if (name === 'rife') return { video: touch(join(out, 'interp.mp4')) }
      if (name === 'hdr') return { video: touch(join(out, 'hdr.mp4')) }
      if (name === 'segment') return { masks: touch(join(out, 'mask.mp4')), alpha: touch(join(out, 'subject.webm')), preview: touch(join(out, 'preview.mp4')), coverage: [0.2, 0.3] }
      throw new Error(`unexpected ${name}`)
    },
    ffmpeg: async (args) => {
      calls.ffmpeg.push(args)
      touch(args[args.length - 1]!)
    },
    probe: async () => ({ duration: 5, width: 1280, height: 720, hasAudio: true }),
    upload: async () => 'https://kie/padded.mp4',
    kieCreate: async (model, input) => {
      calls.kie.push({ model, input })
      return 'kie-1'
    },
    kieWait: async (id) => {
      calls.waited.push(id)
      return { urls: ['https://kie/out.mp4'], credits: 80 }
    },
    fetchTo: async (_url, path) => void touch(path),
    mediaDir: async (taskId) => ({ abs: join(root, 'media', taskId), rel: `media/${taskId}` }),
    publish: async (row) => void calls.rows.push(row),
    save: () => undefined,
    fileUrl: (id, name) => `/f/${id}/${name}`,
    gpu: new GpuQueue(),
    now: () => 1000,
    ...over,
  }
  return { deps, calls }
}

const run = (request: LocalRequest, id = 'r1'): LocalRun => ({ id, request, status: 'running', phase: 'queued', step: 'Queued', createdAt: 1000, updatedAt: 1000, credits: 0 })

describe('runLocal', () => {
  it('Depth Map → one history row, studio/depth-map, free', async () => {
    const root = mkdtempSync(join(tmpdir(), 'local-'))
    const { deps, calls } = fakes(root)
    const done = await runLocal(run({ tool: 'depth', clipUrl: 'https://x/c.mp4', colormap: 'gray', name: 'c.mp4' }), deps)
    expect(done.status).toBe('done')
    expect(calls.cli[0]!.args).toContain('gray')
    expect(calls.rows[0]).toMatchObject({ taskId: 'local-r1', modelId: 'studio/depth-map', category: 'video', prompt: 'Depth Map · c.mp4', input: { colormap: 'gray', runs_on: 'local' } })
    expect(calls.rows[0]!.media?.[0]).toMatchObject({ localPath: 'media/local-r1/0.mp4', mimeType: 'video/mp4' })
    expect(existsSync(join(root, 'media', 'local-r1', '0.mp4'))).toBe(true)
    expect(calls.kie).toEqual([])
  })

  it('Remove Background: Export reuses the preview’s mask and adds the green screen', async () => {
    const root = mkdtempSync(join(tmpdir(), 'local-'))
    const { deps, calls } = fakes(root)
    const runs = new Map<string, LocalRun>()
    const points = [{ x: 0.5, y: 0.4, label: 1 as const, frame: 0 }]
    const preview = await runLocal(run({ tool: 'mask', clipUrl: 'https://x/c.mp4', points }, 'm1'), deps, runs)
    runs.set('m1', preview)
    expect(preview.status).toBe('done')
    expect(preview.files?.preview).toBe('/f/m1/preview.mp4')
    expect(preview.coverage).toBe(0.25)
    expect(calls.rows).toEqual([])
    const out = await runLocal(run({ tool: 'removebg', clipUrl: 'https://x/c.mp4', points, green: true, maskRun: 'm1' }, 'e1'), deps, runs)
    expect(out.status).toBe('done')
    expect(calls.cli.filter((c) => c.name === 'segment')).toHaveLength(1)
    expect(calls.rows[0]!.media?.map((m) => m.mimeType)).toEqual(['video/webm', 'video/mp4'])
    // Different clicks: the mask is made again.
    await runLocal(run({ tool: 'removebg', clipUrl: 'https://x/c.mp4', points: [{ x: 0.2, y: 0.4, label: 1, frame: 0 }], maskRun: 'm1' }, 'e2'), deps, runs)
    expect(calls.cli.filter((c) => c.name === 'segment')).toHaveLength(2)
  })

  it('an empty mask fails the preview in plain words', async () => {
    const root = mkdtempSync(join(tmpdir(), 'local-'))
    const { deps } = fakes(root, {
      cli: async (_n, args) => {
        const out = args[args.indexOf('--out') + 1]!
        for (const f of ['mask.mp4', 'subject.webm', 'preview.mp4']) writeFileSync(join(out, f), 'x')
        return { masks: join(out, 'mask.mp4'), alpha: join(out, 'subject.webm'), preview: join(out, 'preview.mp4'), coverage: [0, 0.001] }
      },
    })
    const done = await runLocal(run({ tool: 'mask', clipUrl: 'https://x/c.mp4', points: [{ x: 0.5, y: 0.5, label: 1 }] }), deps)
    expect(done.status).toBe('failed')
    expect(done.error).toMatch(/almost empty/)
  })

  it('Reframe pads, sends the padded clip to Kie, and a retry collects instead of paying twice', async () => {
    const root = mkdtempSync(join(tmpdir(), 'local-'))
    const { deps, calls } = fakes(root)
    const done = await runLocal(run({ tool: 'reframe', clipUrl: 'https://x/c.mp4', aspect: '9:16' }), deps)
    expect(done.status).toBe('done')
    expect(calls.ffmpeg[0]!.join(' ')).toMatch(/boxblur/)
    expect(calls.kie).toEqual([{ model: 'wan/2-7-videoedit', input: expect.objectContaining({ video_url: 'https://kie/padded.mp4', aspect_ratio: '9:16' }) }])
    expect(done.credits).toBe(80)
    expect(calls.rows[0]).toMatchObject({ modelId: 'studio/reframe', creditsConsumed: 80, input: { kie_task_id: 'kie-1', aspect_ratio: '9:16' } })

    const again = { ...run({ tool: 'reframe', clipUrl: 'https://x/c.mp4', aspect: '9:16' }, 'r2'), kieTaskId: 'kie-old' }
    await runLocal(again, deps)
    expect(calls.kie).toHaveLength(1)
    expect(calls.waited).toEqual(['kie-1', 'kie-old'])
  })

  it('Reframe refuses a clip longer than the model takes, before any upload', async () => {
    const root = mkdtempSync(join(tmpdir(), 'local-'))
    const { deps, calls } = fakes(root, { probe: async () => ({ duration: 14, width: 1280, height: 720, hasAudio: true }) })
    const done = await runLocal(run({ tool: 'reframe', clipUrl: 'https://x/c.mp4', aspect: '1:1' }), deps)
    expect(done.error).toMatch(/up to 10 s/)
    expect(calls.kie).toEqual([])
  })

  it('a tool error fails the run with its own words', async () => {
    const root = mkdtempSync(join(tmpdir(), 'local-'))
    const { deps } = fakes(root, {
      cli: async () => {
        throw new Error('Not enough free memory (2.1 GB free, 3 GB needed).')
      },
    })
    const done = await runLocal(run({ tool: 'fps', clipUrl: 'https://x/c.mp4', fps: 60 }), deps)
    expect(done).toMatchObject({ status: 'failed', error: 'Not enough free memory (2.1 GB free, 3 GB needed).' })
  })
})

describe('run files', () => {
  it('serves only plain names inside a known folder', () => {
    expect(runFilePath('abc', '../run.json')).toBeNull()
    expect(runFilePath('..', 'x.mp4')).toBeNull()
    expect(runFilePath('abc', '.hidden')).toBeNull()
    expect(runFilePath('a/b', 'x.mp4')).toBeNull()
  })
})
