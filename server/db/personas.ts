import { randomUUID } from 'node:crypto'
import type { SavedPersona } from '../../src/lib/models/types.ts'
import { getDb } from './open.ts'

type PersonaRow = {
  id: string
  persona_id: string
  name: string
  description: string | null
  source_task_id: string
  source_audio_id: string
  created_at: number
}

function rowToPersona(row: PersonaRow): SavedPersona {
  return {
    id: row.id,
    personaId: row.persona_id,
    name: row.name,
    description: row.description ?? undefined,
    sourceTaskId: row.source_task_id,
    sourceAudioId: row.source_audio_id,
    createdAt: row.created_at,
  }
}

export function listPersonas(): SavedPersona[] {
  return (getDb().prepare(
    'SELECT * FROM saved_personas ORDER BY created_at DESC',
  ).all() as PersonaRow[]).map(rowToPersona)
}

export function savePersona(input: Omit<SavedPersona, 'id' | 'createdAt'>): SavedPersona {
  const persona: SavedPersona = {
    ...input,
    id: randomUUID(),
    createdAt: Date.now(),
  }
  getDb().prepare(`
    INSERT INTO saved_personas (
      id, persona_id, name, description, source_task_id, source_audio_id, created_at
    ) VALUES (
      @id, @personaId, @name, @description, @sourceTaskId, @sourceAudioId, @createdAt
    )
  `).run({ ...persona, description: persona.description ?? null })
  return persona
}

export function removePersona(id: string): boolean {
  return getDb().prepare('DELETE FROM saved_personas WHERE id = ?').run(id).changes > 0
}
