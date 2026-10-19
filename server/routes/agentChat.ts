import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../db/open.ts'
import { getAgentMessages } from '../db/agentConversations.ts'
import { streamStudioChat, type StudioUIMessage } from '../agent/chat.ts'
import { AgentModelError } from '../agent/errors.ts'
import { validateJson } from './validation.ts'

export const agentChatRoutes = new Hono()

getDb()

const chatBodySchema = z.object({
  conversationId: z.string().trim().min(1, 'conversationId is required').max(120),
  provider: z.string().trim().min(1, 'provider is required'),
  model: z.string().trim().min(1, 'model is required'),
  messages: z.array(z.unknown()).min(1, 'messages is required'),
})

agentChatRoutes.get('/agent/health', (c) => c.json({ ok: true }))

agentChatRoutes.get('/agent-conversations/:id/messages', (c) => {
  const id = c.req.param('id')
  return c.json({ data: { messages: getAgentMessages(id) } })
})

agentChatRoutes.post('/agent/chat', validateJson(chatBodySchema), async (c) => {
  const body = c.req.valid('json')
  try {
    return await streamStudioChat({
      conversationId: body.conversationId,
      provider: body.provider,
      model: body.model,
      messages: body.messages as StudioUIMessage[],
      abortSignal: c.req.raw.signal,
    })
  } catch (error) {
    if (error instanceof AgentModelError) {
      return c.json({ error: error.message }, 400)
    }
    throw error
  }
})
