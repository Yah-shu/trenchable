import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Packaged builds inject STUDIO_DB_PATH (userData dir) so the DB lives in a
// writable location; dev falls back to the repo-local data/studio.db.
const DB_PATH = process.env.STUDIO_DB_PATH ?? resolve(__dirname, '../../data/studio.db')

let db: Database | null = null

function migrate(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS history_items (
      task_id TEXT PRIMARY KEY NOT NULL,
      model TEXT NOT NULL,
      category TEXT NOT NULL,
      state TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      result_urls TEXT,
      prompt TEXT,
      credits_consumed REAL,
      fail_msg TEXT,
      model_id TEXT,
      input TEXT,
      pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_history_created
      ON history_items(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_history_pinned
      ON history_items(pinned);
    CREATE TABLE IF NOT EXISTS saved_personas (
      id TEXT PRIMARY KEY NOT NULL,
      persona_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      source_task_id TEXT NOT NULL,
      source_audio_id TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_personas_created
      ON saved_personas(created_at DESC);
    CREATE TABLE IF NOT EXISTS saved_audio_assets (
      id TEXT PRIMARY KEY NOT NULL,
      url TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      expires_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audio_assets_created
      ON saved_audio_assets(created_at DESC);
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS agent_conversations (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_conversations_updated
      ON agent_conversations(updated_at DESC);
  `)

  const columns = new Set(
    (
      database.prepare('PRAGMA table_info(history_items)').all() as {
        name: string
      }[]
    ).map((column) => column.name),
  )
  const additiveColumns: Record<string, string> = {
    provider: "TEXT NOT NULL DEFAULT 'market'",
    operation: "TEXT NOT NULL DEFAULT 'generate'",
    parent_task_id: 'TEXT',
    media: 'TEXT',
    provider_status: 'TEXT',
    partial: 'INTEGER NOT NULL DEFAULT 0',
    expires_at: 'INTEGER',
    raw_param: 'TEXT',
    raw_result: 'TEXT',
  }
  for (const [name, definition] of Object.entries(additiveColumns)) {
    if (!columns.has(name)) {
      database.exec(`ALTER TABLE history_items ADD COLUMN ${name} ${definition}`)
    }
  }

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_history_parent_task
      ON history_items(parent_task_id);
  `)

  const agentColumns = new Set(
    (
      database.prepare('PRAGMA table_info(agent_conversations)').all() as {
        name: string
      }[]
    ).map((column) => column.name),
  )
  if (!agentColumns.has('messages_json')) {
    database.exec('ALTER TABLE agent_conversations ADD COLUMN messages_json TEXT')
  }
}

/** Open (or reuse) the studio SQLite database under data/studio.db. */
export function getDb(): Database {
  if (db) return db
  mkdirSync(dirname(DB_PATH), { recursive: true })
  db = new Database(DB_PATH, { strict: true })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

export function getDbPath(): string {
  return DB_PATH
}
