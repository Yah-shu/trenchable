import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../db/open.ts'
import {
  deleteAgentConversation,
  getAgentConversation,
  listAgentConversations,
  touchAgentConversation,
  upsertAgentConversation,
} from '../db/agentConversations.ts'
import { validateJson } from './validation.ts'

export const agentConversationsRoutes = new Hono()

// Ensure DB is open when routes load
getDb()

const createBodySchema = z.object({
  id: z
    .string({ error: 'id is required' })
    .trim()
    .min(1, 'id is required')
    .max(120)
    .regex(/^[a-zA-Z0-9_-]+$/, 'id must be alphanumeric, hyphen or underscore'),
  title: z.string({ error: 'title is required' }).trim().min(1, 'title is required').max(200),
  provider: z.string({ error: 'provider is required' }).trim().min(1, 'provider is required'),
  model: z.string({ error: 'model is required' }).trim().min(1, 'model is required'),
})

const patchBodySchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200).optional(),
})

agentConversationsRoutes.get('/agent-conversations', (c) =>
  c.json({ data: { items: listAgentConversations() } }),
)

agentConversationsRoutes.post('/agent-conversations', validateJson(createBodySchema), (c) =>
  c.json({ data: upsertAgentConversation(c.req.valid('json')) }),
)

agentConversationsRoutes.patch(
  '/agent-conversations/:id',
  validateJson(patchBodySchema),
  (c) => {
    const id = c.req.param('id')
    if (!getAgentConversation(id)) {
      return c.json({ error: 'Conversation not found' }, 404)
    }
    const { title } = c.req.valid('json')
    touchAgentConversation(id, title)
    return c.json({ data: getAgentConversation(id) })
  },
)

agentConversationsRoutes.delete('/agent-conversations/:id', (c) => {
  const removed = deleteAgentConversation(c.req.param('id'))
  return removed
    ? c.json({ data: { removed: true } })
    : c.json({ error: 'Conversation not found' }, 404)
})