import { ApiClientError, apiUrl } from './api.ts'

export interface AgentConversation {
  id: string
  title: string
  provider: string
  model: string
  createdAt: number
  updatedAt: number
}

export interface LlmProviderSettings {
  id: string
  label: string
  suggestedModels: string[]
  hasKey: boolean
  apiKeyMasked: string | null
  apiKeyFromStore: boolean
}

export interface CustomEndpointSettings {
  id: string
  label: string
  kind: 'openai-compatible' | 'anthropic-compatible'
  baseUrl: string
  models: string[]
  hasKey: boolean
  apiKeyMasked: string | null
}

export interface LlmSettings {
  providers: LlmProviderSettings[]
  customEndpoints: CustomEndpointSettings[]
  defaultModel: { provider: string; model: string } | null
  /** Preferred model id keyed by provider id (builtin or `custom-<id>`). */
  preferredModels: Record<string, string>
}

async function parse<T>(res: Response): Promise<T> {
  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiClientError(`Request failed (${res.status})`, res.status)
  }
  if (!res.ok) {
    const err = body as { error?: string; code?: number }
    throw new ApiClientError(
      typeof err.error === 'string' && err.error.trim()
        ? err.error
        : `Request failed (${res.status})`,
      res.status,
      typeof err.code === 'number' ? err.code : undefined,
    )
  }
  const wrapped = body as { data?: T }
  return (wrapped.data ?? body) as T
}

/** Conversation messages on the studio API (same origin / desktop loopback). */
export const agentChatUrl = (): string => apiUrl('/api/agent/chat')

/** Agent runtime liveness. Same Hono process as /api — 502 means the API is down. */
export async function fetchAgentHealth(): Promise<{ ok: boolean }> {
  const res = await fetch(apiUrl('/api/agent/health'))
  if (!res.ok) {
    throw new ApiClientError(`Request failed (${res.status})`, res.status)
  }
  const body = (await res.json().catch(() => null)) as { ok?: boolean } | null
  if (!body?.ok) throw new ApiClientError('Agent health check failed', res.status)
  return { ok: true }
}

export async function fetchAgentMessages(id: string): Promise<unknown[]> {
  const res = await fetch(
    apiUrl(`/api/agent-conversations/${encodeURIComponent(id)}/messages`),
  )
  const data = await parse<{ messages: unknown[] }>(res)
  return Array.isArray(data.messages) ? data.messages : []
}

export async function fetchAgentConversations(): Promise<AgentConversation[]> {
  const res = await fetch(apiUrl('/api/agent-conversations'))
  const data = await parse<{ items: AgentConversation[] }>(res)
  return data.items
}

export async function createAgentConversation(input: {
  id: string
  title: string
  provider: string
  model: string
}): Promise<AgentConversation> {
  const res = await fetch(apiUrl('/api/agent-conversations'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
  return parse<AgentConversation>(res)
}

export async function renameAgentConversation(
  id: string,
  title: string,
): Promise<AgentConversation> {
  const res = await fetch(apiUrl(`/api/agent-conversations/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  return parse<AgentConversation>(res)
}

export async function deleteAgentConversation(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/agent-conversations/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  })
  await parse<{ removed: boolean }>(res)
}

export async function fetchLlmSettings(): Promise<LlmSettings> {
  const res = await fetch(apiUrl('/api/settings/llm'))
  const data = await parse<LlmSettings>(res)
  return {
    ...data,
    preferredModels: data.preferredModels ?? {},
  }
}

export async function saveLlmApiKey(provider: string, apiKey: string): Promise<void> {
  const res = await fetch(apiUrl('/api/settings/llm/key'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, apiKey }),
  })
  await parse(res)
}

export async function deleteLlmApiKey(provider: string): Promise<void> {
  const res = await fetch(
    apiUrl(`/api/settings/llm/key/${encodeURIComponent(provider)}`),
    { method: 'DELETE' },
  )
  await parse(res)
}

export type CustomEndpointInput = Omit<CustomEndpointSettings, 'hasKey' | 'apiKeyMasked'> & {
  apiKey?: string
}

export async function saveLlmCustomEndpoints(
  endpoints: CustomEndpointInput[],
): Promise<void> {
  const res = await fetch(apiUrl('/api/settings/llm/endpoints'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoints }),
  })
  await parse(res)
}

export async function saveDefaultLlmModel(value: {
  provider: string
  model: string
}): Promise<void> {
  const res = await fetch(apiUrl('/api/settings/llm/default-model'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
  await parse(res)
}

export async function savePreferredLlmModel(value: {
  provider: string
  model: string
}): Promise<void> {
  const res = await fetch(apiUrl('/api/settings/llm/preferred-model'), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(value),
  })
  await parse(res)
}

/** Random id for a new conversation (path-safe). */
export function newConversationId(): string {
  if (crypto.randomUUID) return crypto.randomUUID().replaceAll('-', '').slice(0, 24)
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}