/**
 * Edit Video's local tools (localtools.ts) and GenShitSu's Guided swap (guided.ts), under /api/studio:
 *
 *   GET    /local/doctor              are the tools installed? (doctor.py, cached 10 min; ?fresh=1 asks again)
 *   POST   /local/frame   { clipUrl } frame 0 as a PNG URL + size + length, for clicking on the subject
 *   POST   /local         { tool, clipUrl, colormap?, fps?, points?, box?, green?, maskRun?, aspect?, model?, resolution?, name? } → the run
 *   GET    /local                     running runs and recent ones, newest first (the Edit Video rail polls this)
 *   GET    /local/:id                 one run
 *   POST   /local/:id/retry           run it again (a Reframe already on Kie is collected, not paid twice)
 *   DELETE /local/:id                 dismiss
 *   GET    /local/file/:id/:name      a run's file (mask preview, guide, frame 0), with Range for the players
 *
 *   POST   /guided        { clipUrl, images, points, box?, faceOutline, prompt?, name? } → the run; Prepare starts
 *   GET    /guided  ·  GET /guided/:id
 *   POST   /guided/:id/prepare  { points?, box?, faceOutline? }   prepare again (clears the approval)
 *   POST   /guided/:id/approve  { fingerprint }                   bind the approval to the files you saw
 *   POST   /guided/:id/draft    { prompt?, images? }              Seedance 2.5 draft, 480p (spends credits)
 *   POST   /guided/:id/hd                                         finish the draft at 1080p (spends credits)
 *   POST   /guided/:id/retry  ·  DELETE /guided/:id
 *
 * A finished run's result is an ordinary history row, so /api/history carries it from there.
 */
import { Hono } from 'hono'
import { readFileSync, statSync } from 'node:fs'
import { approveGuided, dismissGuided, getGuided, guidedProblem, listGuided, reprepare, requestOf as guidedRequestOf, retryGuided, startDraft, startGuided, startHd, type GuidedRequest } from './guided.ts'
import {
  ASPECTS,
  cleanBox,
  cleanPoints,
  dismissLocalRun,
  doctor,
  frameOf,
  getLocalRun,
  listLocalRuns,
  localProblem,
  retryLocalRun,
  runFilePath,
  startLocalRun,
  toolReady,
  type LocalRequest,
} from './localtools.ts'

export const localToolRoutes = new Hono()

/** Only what the pipeline reads, so an odd body can't carry anything else into the run file. */
function localRequestOf(body: Record<string, unknown>): Partial<LocalRequest> {
  const str = (k: string) => (typeof body[k] === 'string' && body[k] ? (body[k] as string) : undefined)
  return {
    tool: str('tool') as LocalRequest['tool'],
    clipUrl: str('clipUrl')?.trim(),
    name: str('name')?.slice(0, 120),
    colormap: str('colormap') as LocalRequest['colormap'],
    fps: typeof body.fps === 'number' ? body.fps : Number(body.fps) || undefined,
    points: cleanPoints(body.points),
    box: cleanBox(body.box),
    green: body.green === true,
    maskRun: str('maskRun'),
    aspect: ASPECTS.includes(body.aspect as never) ? (body.aspect as LocalRequest['aspect']) : undefined,
    model: str('model') as LocalRequest['model'],
    resolution: body.resolution === '1080p' ? '1080p' : '720p',
  }
}

/** The CLI each tool needs, by doctor's names. */
const NEEDS: Record<LocalRequest['tool'], string[]> = { depth: ['depth'], removebg: ['segment'], mask: ['segment'], fps: ['rife'], hdr: ['hdr'], reframe: [] }

localToolRoutes.get('/local/doctor', async (c) => c.json({ data: await doctor(c.req.query('fresh') === '1') }))

localToolRoutes.post('/local/frame', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const clipUrl = typeof body.clipUrl === 'string' ? body.clipUrl.trim() : ''
  const problem = localProblem({ tool: 'hdr', clipUrl })
  if (problem) return c.json({ error: problem }, 400)
  const doc = await doctor()
  const missing = toolReady(doc, 'frame')
  if (missing) return c.json({ error: missing }, 503)
  try {
    return c.json({ data: await frameOf(clipUrl) })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 500)
  }
})

localToolRoutes.post('/local', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const request = localRequestOf(body)
  const problem = localProblem(request)
  if (problem) return c.json({ error: problem }, 400)
  if (NEEDS[request.tool!].length) {
    const doc = await doctor()
    for (const t of NEEDS[request.tool!]) {
      const missing = toolReady(doc, t)
      if (missing) return c.json({ error: missing }, 503)
    }
  }
  return c.json({ data: startLocalRun(request as LocalRequest) })
})

localToolRoutes.get('/local', (c) => c.json({ data: { runs: listLocalRuns() } }))

localToolRoutes.get('/local/file/:id/:name', (c) => {
  const path = runFilePath(c.req.param('id'), c.req.param('name'))
  if (!path) return c.json({ error: 'No such file.' }, 404)
  const name = c.req.param('name')
  const type = /\.mp4$/i.test(name) ? 'video/mp4' : /\.webm$/i.test(name) ? 'video/webm' : /\.png$/i.test(name) ? 'image/png' : /\.jpe?g$/i.test(name) ? 'image/jpeg' : /\.json$/i.test(name) ? 'application/json' : /\.wav$/i.test(name) ? 'audio/wav' : 'application/octet-stream'
  const size = statSync(path).size
  const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header('range') ?? '')
  const all = readFileSync(path)
  const head = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' }
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]))
    const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    return new Response(all.subarray(start, end + 1), { status: 206, headers: { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) } })
  }
  return new Response(all, { headers: { ...head, 'Content-Length': String(size) } })
})

localToolRoutes.get('/local/:id', (c) => {
  const run = getLocalRun(c.req.param('id'))
  return run ? c.json({ data: run }) : c.json({ error: 'No such run.' }, 404)
})

localToolRoutes.post('/local/:id/retry', (c) => {
  const run = getLocalRun(c.req.param('id'))
  if (!run) return c.json({ error: 'No such run.' }, 404)
  if (run.status === 'running') return c.json({ error: 'It is still running.' }, 409)
  return c.json({ data: retryLocalRun(run.id) })
})

localToolRoutes.delete('/local/:id', (c) => (dismissLocalRun(c.req.param('id')) ? c.json({ data: { ok: true } }) : c.json({ error: 'Nothing to dismiss.' }, 404)))

/* ---------- Guided swap ---------- */

const GUIDED_TOOLS = ['audio', 'depth', 'segment', 'facemesh', 'guide']

localToolRoutes.post('/guided', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const request = guidedRequestOf(body)
  const problem = guidedProblem(request)
  if (problem) return c.json({ error: problem }, 400)
  const doc = await doctor()
  for (const t of GUIDED_TOOLS) {
    if (t === 'facemesh' && !request.faceOutline) continue
    const missing = toolReady(doc, t)
    if (missing) return c.json({ error: missing }, 503)
  }
  return c.json({ data: startGuided(request as GuidedRequest) })
})

localToolRoutes.get('/guided', (c) => c.json({ data: { runs: listGuided() } }))

const withRun = (id: string) => getGuided(id)

localToolRoutes.get('/guided/:id', (c) => {
  const run = withRun(c.req.param('id'))
  return run ? c.json({ data: run }) : c.json({ error: 'No such guided swap.' }, 404)
})

localToolRoutes.post('/guided/:id/prepare', async (c) => {
  const run = withRun(c.req.param('id'))
  if (!run) return c.json({ error: 'No such guided swap.' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const patch: Partial<GuidedRequest> = {
    ...(Array.isArray(body.points) ? { points: cleanPoints(body.points) } : {}),
    ...('box' in body ? { box: cleanBox(body.box) } : {}),
    ...(typeof body.faceOutline === 'boolean' ? { faceOutline: body.faceOutline } : {}),
  }
  const problem = guidedProblem({ ...run.request, ...patch }) ?? reprepare(run, patch)
  return problem ? c.json({ error: problem }, 409) : c.json({ data: run })
})

localToolRoutes.post('/guided/:id/approve', async (c) => {
  const run = withRun(c.req.param('id'))
  if (!run) return c.json({ error: 'No such guided swap.' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const problem = await approveGuided(run, typeof body.fingerprint === 'string' ? body.fingerprint : '')
  return problem ? c.json({ error: problem }, 409) : c.json({ data: run })
})

localToolRoutes.post('/guided/:id/draft', async (c) => {
  const run = withRun(c.req.param('id'))
  if (!run) return c.json({ error: 'No such guided swap.' }, 404)
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const patch = guidedRequestOf({ ...run.request, ...body })
  const problem = await startDraft(run, { prompt: patch.prompt, images: Array.isArray(body.images) ? patch.images : undefined })
  return problem ? c.json({ error: problem }, 409) : c.json({ data: run })
})

localToolRoutes.post('/guided/:id/hd', (c) => {
  const run = withRun(c.req.param('id'))
  if (!run) return c.json({ error: 'No such guided swap.' }, 404)
  const problem = startHd(run)
  return problem ? c.json({ error: problem }, 409) : c.json({ data: run })
})

localToolRoutes.post('/guided/:id/retry', (c) => {
  const run = withRun(c.req.param('id'))
  if (!run) return c.json({ error: 'No such guided swap.' }, 404)
  const problem = retryGuided(run)
  return problem ? c.json({ error: problem }, 409) : c.json({ data: run })
})

localToolRoutes.delete('/guided/:id', (c) => (dismissGuided(c.req.param('id')) ? c.json({ data: { ok: true } }) : c.json({ error: 'Nothing to dismiss.' }, 404)))
