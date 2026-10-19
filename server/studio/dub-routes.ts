/**
 * The dub pipeline's routes (dub.ts), under /api/studio:
 *
 *   POST   /dub             { mode, clipUrl, voice, fallbackVoice?, language?, keepBackground, lipSync, model?, name? } → the new run
 *                            (model: an ElevenLabs id or google/gemini-3-1-flash-tts; voice: an ElevenLabs id or a Gemini name)
 *   GET    /dub             running runs and recent failures, newest first (the Audio feed polls this)
 *   GET    /dub/:id         one run
 *   POST   /dub/:id/retry   the same request again, as a new run
 *   DELETE /dub/:id         dismiss a finished or failed run from the feed
 *
 * A finished run's result is an ordinary history row (`dub-<id>`), so /api/history carries it from there.
 */
import { Hono } from 'hono'
import { dismissRun, getRun, listRuns, requestProblem, startRun, type DubRequest } from './dub.ts'

export const dubRoutes = new Hono()

/** Only what the pipeline reads, so an old or odd body can't carry anything else into the run file. */
function requestOf(body: Record<string, unknown>): Partial<DubRequest> {
  return {
    mode: body.mode as DubRequest['mode'],
    clipUrl: typeof body.clipUrl === 'string' ? body.clipUrl.trim() : undefined,
    voice: typeof body.voice === 'string' ? body.voice : undefined,
    fallbackVoice: typeof body.fallbackVoice === 'string' && body.fallbackVoice ? body.fallbackVoice : undefined,
    language: typeof body.language === 'string' && body.language ? body.language : undefined,
    keepBackground: body.keepBackground !== false,
    lipSync: body.lipSync === true,
    model: typeof body.model === 'string' ? (body.model as DubRequest['model']) : undefined,
    name: typeof body.name === 'string' ? body.name.slice(0, 120) : undefined,
  }
}

dubRoutes.post('/dub', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>
  const request = requestOf(body)
  const problem = requestProblem(request)
  if (problem) return c.json({ error: problem }, 400)
  return c.json({ data: startRun(request as DubRequest) })
})

dubRoutes.get('/dub', (c) => c.json({ data: { runs: listRuns() } }))

dubRoutes.get('/dub/:id', (c) => {
  const run = getRun(c.req.param('id'))
  return run ? c.json({ data: run }) : c.json({ error: 'No such dub run.' }, 404)
})

dubRoutes.post('/dub/:id/retry', (c) => {
  const run = getRun(c.req.param('id'))
  if (!run) return c.json({ error: 'No such dub run.' }, 404)
  if (run.status === 'running') return c.json({ error: 'It is still running.' }, 409)
  dismissRun(run.id)
  return c.json({ data: startRun(run.request) })
})

dubRoutes.delete('/dub/:id', (c) => (dismissRun(c.req.param('id')) ? c.json({ data: { ok: true } }) : c.json({ error: 'Nothing to dismiss.' }, 404)))
