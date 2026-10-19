import { getDb } from './open.ts'

/** Agent chat conversation metadata. Message bodies live in `messages_json`. */
export interface AgentConversation {
  id: string
  title: string
  provider: string
  model: string
  createdAt: number
  updatedAt: number
}

type Row = {
  id: string
  title: string
  provider: string
  model: string
  created_at: number
  updated_at: number
}

function rowToConversation(row: Row): AgentConversation {
  return {
    id: row.id,
    title: row.title,
    provider: row.provider,
    model: row.model,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function listAgentConversations(): AgentConversation[] {
  const rows = getDb()
    .prepare('SELECT * FROM agent_conversations ORDER BY updated_at DESC')
    .all() as Row[]
  return rows.map(rowToConversation)
}

export function getAgentConversation(id: string): AgentConversation | null {
  const row = getDb()
    .prepare('SELECT * FROM agent_conversations WHERE id = ?')
    .get(id) as Row | undefined
  return row ? rowToConversation(row) : null
}

export function upsertAgentConversation(
  input: { id: string; title: string; provider: string; model: string },
): AgentConversation {
  const now = Date.now()
  getDb()
    .prepare(
      `INSERT INTO agent_conversations (id, title, provider, model, created_at, updated_at)
       VALUES (@id, @title, @provider, @model, @created_at, @updated_at)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         provider = excluded.provider,
         model = excluded.model,
         updated_at = excluded.updated_at`,
    )
    .run({
      id: input.id,
      title: input.title,
      provider: input.provider,
      model: input.model,
      created_at: now,
      updated_at: now,
    })
  return getAgentConversation(input.id)!
}

/** Bump updated_at (and optionally the title) after activity. */
export function touchAgentConversation(id: string, title?: string): void {
  const now = Date.now()
  if (title !== undefined) {
    getDb()
      .prepare('UPDATE agent_conversations SET updated_at = ?, title = ? WHERE id = ?')
      .run(now, title, id)
    return
  }
  getDb()
    .prepare('UPDATE agent_conversations SET updated_at = ? WHERE id = ?')
    .run(now, id)
}

export function deleteAgentConversation(id: string): boolean {
  return (
    getDb().prepare('DELETE FROM agent_conversations WHERE id = ?').run(id).changes > 0
  )
}

export function getAgentMessages(id: string): unknown[] {
  const row = getDb()
    .prepare('SELECT messages_json FROM agent_conversations WHERE id = ?')
    .get(id) as { messages_json: string | null } | undefined
  if (!row?.messages_json) return []
  try {
    const parsed: unknown = JSON.parse(row.messages_json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveAgentMessages(id: string, messages: unknown[]): void {
  getDb()
    .prepare(
      'UPDATE agent_conversations SET messages_json = ?, updated_at = ? WHERE id = ?',
    )
    .run(JSON.stringify(messages), Date.now(), id)
}