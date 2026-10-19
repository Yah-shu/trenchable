import { Hono } from 'hono'
import {
  boostMusicStyle,
  generatePersona,
  getTimestampedLyrics,
} from '../kie/adapters/suno.ts'
import { KieApiError } from '../kie/client.ts'
import { assertPlainObject } from '../kie/safe.ts'
import { listPersonas, removePersona, savePersona } from '../db/personas.ts'

export const sunoRoutes = new Hono()

sunoRoutes.post('/suno/timestamped-lyrics', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new KieApiError('Invalid JSON', 400)
  }
  assertPlainObject(body)
  if (typeof body.taskId !== 'string' || typeof body.audioId !== 'string') {
    throw new KieApiError('taskId and audioId are required', 400)
  }
  const data = await getTimestampedLyrics({
    taskId: body.taskId,
    audioId: body.audioId,
  })
  return c.json({ data })
})

sunoRoutes.post('/suno/style', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new KieApiError('Invalid JSON', 400)
  }
  assertPlainObject(body)
  if (typeof body.style !== 'string' || !body.style.trim()) {
    throw new KieApiError('style is required', 400)
  }
  const result = await boostMusicStyle(body.style)
  return c.json({ data: { result } })
})

sunoRoutes.post('/suno/persona', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new KieApiError('Invalid JSON', 400)
  }
  assertPlainObject(body)
  if (
    typeof body.taskId !== 'string' ||
    typeof body.audioId !== 'string' ||
    typeof body.name !== 'string'
  ) {
    throw new KieApiError('taskId, audioId and name are required', 400)
  }
  const generated = await generatePersona({
    taskId: body.taskId,
    audioId: body.audioId,
    name: body.name,
    description: typeof body.description === 'string' ? body.description : undefined,
  })
  const data = savePersona({
    ...generated,
    sourceTaskId: body.taskId,
    sourceAudioId: body.audioId,
  })
  return c.json({ data })
})

sunoRoutes.get('/personas', (c) => c.json({ data: { items: listPersonas() } }))

sunoRoutes.delete('/personas/:id', (c) => {
  const removed = removePersona(c.req.param('id'))
  return removed ? c.json({ data: { removed: true } }) : c.json({ error: 'Persona not found' }, 404)
})
