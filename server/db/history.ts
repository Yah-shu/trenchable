import type { HistoryItem, MediaAsset } from '../../src/lib/models/types.ts'
import {
  capItems,
  isTerminalState,
  mergeHistory,
  normalizeHistoryItems,
} from '../../src/lib/history.ts'
import { getDb } from './open.ts'
import { mediaKindFromUrl } from '../../src/lib/media.ts'

type HistoryRow = {
  task_id: string
  model: string
  category: string
  state: string
  created_at: number
  result_urls: string | null
  prompt: string | null
  credits_consumed: number | null
  fail_msg: string | null
  model_id: string | null
  input: string | null
  pinned: number
  provider: string | null
  operation: string | null
  parent_task_id: string | null
  media: string | null
  provider_status: string | null
  partial: number
  expires_at: number | null
  raw_param: string | null
  raw_result: string | null
}

function parseJsonColumn<T>(raw: string | null): T | undefined {
  if (raw == null || raw === '') return undefined
  try {
    return JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function rowToItem(row: HistoryRow): HistoryItem {
  const item: HistoryItem = {
    taskId: row.task_id,
    model: row.model,
    category: row.category as HistoryItem['category'],
    state: row.state as HistoryItem['state'],
    createdAt: row.created_at,
  }
  const resultUrls = parseJsonColumn<string[]>(row.result_urls)
  if (resultUrls?.length) item.resultUrls = resultUrls
  const media = parseJsonColumn<HistoryItem['media']>(row.media)
  if (media?.length) {
    item.media = media
  } else if (resultUrls?.length) {
    item.media = resultUrls.map((url) => ({
      kind: mediaKindFromUrl(url, item.category),
      url,
    }))
  }
  item.provider = (row.provider as HistoryItem['provider']) ?? 'market'
  item.operation = (row.operation as HistoryItem['operation']) ?? 'generate'
  if (row.parent_task_id != null) item.parentTaskId = row.parent_task_id
  if (row.provider_status != null) item.providerStatus = row.provider_status
  if (row.partial === 1) item.partial = true
  if (row.expires_at != null) item.expiresAt = row.expires_at
  const rawParam = parseJsonColumn<unknown>(row.raw_param)
  if (rawParam !== undefined) item.rawParam = rawParam
  const rawResult = parseJsonColumn<unknown>(row.raw_result)
  if (rawResult !== undefined) item.rawResult = rawResult
  if (row.prompt != null) item.prompt = row.prompt
  if (row.credits_consumed != null) item.creditsConsumed = row.credits_consumed
  if (row.fail_msg != null) item.failMsg = row.fail_msg
  if (row.model_id != null) item.modelId = row.model_id
  const input = parseJsonColumn<Record<string, unknown>>(row.input)
  if (input) item.input = input
  if (row.pinned === 1) item.pinned = true
  return item
}

function insertStmt() {
  return getDb().prepare(`
    INSERT INTO history_items (
      task_id, model, category, state, created_at,
      result_urls, prompt, credits_consumed, fail_msg, model_id, input, pinned
      , provider, operation, parent_task_id, media, provider_status, partial,
      expires_at, raw_param, raw_result
    ) VALUES (
      @task_id, @model, @category, @state, @created_at,
      @result_urls, @prompt, @credits_consumed, @fail_msg, @model_id, @input, @pinned
      , @provider, @operation, @parent_task_id, @media, @provider_status, @partial,
      @expires_at, @raw_param, @raw_result
    )
  `)
}

function itemToParams(item: HistoryItem) {
  return {
    task_id: item.taskId,
    model: item.model,
    category: item.category,
    state: item.state,
    created_at: item.createdAt,
    result_urls: item.resultUrls ? JSON.stringify(item.resultUrls) : null,
    prompt: item.prompt ?? null,
    credits_consumed: item.creditsConsumed ?? null,
    fail_msg: item.failMsg ?? null,
    model_id: item.modelId ?? null,
    input: item.input ? JSON.stringify(item.input) : null,
    pinned: item.pinned ? 1 : 0,
    provider: item.provider ?? 'market',
    operation: item.operation ?? 'generate',
    parent_task_id: item.parentTaskId ?? null,
    media: item.media ? JSON.stringify(item.media) : null,
    provider_status: item.providerStatus ?? null,
    partial: item.partial ? 1 : 0,
    expires_at: item.expiresAt ?? null,
    raw_param: item.rawParam === undefined ? null : JSON.stringify(item.rawParam),
    raw_result: item.rawResult === undefined ? null : JSON.stringify(item.rawResult),
  }
}

/** Newest first. limit/offset 未指定時は全件返す（後方互換）。 */
export function listHistory(options?: { limit?: number; offset?: number }): HistoryItem[] {
  const limit = options?.limit
  const offset = options?.offset ?? 0
  if (limit !== undefined) {
    const rows = getDb()
      .prepare(
        `SELECT * FROM history_items
         ORDER BY pinned DESC, created_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(limit, offset) as HistoryRow[]
    return rows.map(rowToItem)
  }
  const rows = getDb()
    .prepare(
      `SELECT * FROM history_items
       ORDER BY pinned DESC, created_at DESC`,
    )
    .all() as HistoryRow[]
  return rows.map(rowToItem)
}

/** Insert or update a single history item (used by agent-initiated generation). */
export function upsertHistoryItem(item: HistoryItem): void {
  getDb()
    .prepare(
      `INSERT INTO history_items (
        task_id, model, category, state, created_at,
        result_urls, prompt, credits_consumed, fail_msg, model_id, input, pinned
        , provider, operation, parent_task_id, media, provider_status, partial,
        expires_at, raw_param, raw_result
      ) VALUES (
        @task_id, @model, @category, @state, @created_at,
        @result_urls, @prompt, @credits_consumed, @fail_msg, @model_id, @input, @pinned
        , @provider, @operation, @parent_task_id, @media, @provider_status, @partial,
        @expires_at, @raw_param, @raw_result
      )
      ON CONFLICT(task_id) DO UPDATE SET
        model = excluded.model,
        category = excluded.category,
        state = excluded.state,
        result_urls = excluded.result_urls,
        prompt = excluded.prompt,
        credits_consumed = excluded.credits_consumed,
        fail_msg = excluded.fail_msg,
        model_id = excluded.model_id,
        input = excluded.input,
        pinned = excluded.pinned,
        provider = excluded.provider,
        operation = excluded.operation,
        parent_task_id = excluded.parent_task_id,
        media = excluded.media,
        provider_status = excluded.provider_status,
        partial = excluded.partial,
        expires_at = excluded.expires_at,
        raw_param = excluded.raw_param,
        raw_result = excluded.raw_result`,
    )
    .run(itemToParams(item))
}

function preserveLocalPaths(item: HistoryItem, existing: HistoryItem | null): HistoryItem {
  if (!existing?.media?.length || !item.media?.length) return item
  const urlMap = new Map<string, string>()
  for (const asset of existing.media) {
    if (asset.localPath) {
      const key = asset.url ?? asset.streamUrl ?? ''
      if (key) urlMap.set(key, asset.localPath)
    }
  }
  if (urlMap.size === 0) return item
  return {
    ...item,
    media: item.media.map((asset) => {
      if (asset.localPath) return asset
      const key = asset.url ?? asset.streamUrl ?? ''
      const stored = key ? urlMap.get(key) : undefined
      return stored ? { ...asset, localPath: stored } : asset
    }),
  }
}

function mergeIncomingHistoryItem(
  incoming: HistoryItem,
  existing: HistoryItem | null,
): HistoryItem {
  const withPaths = preserveLocalPaths(incoming, existing)
  if (!existing) return withPaths
  if (isTerminalState(existing.state) && !isTerminalState(withPaths.state)) {
    return {
      ...existing,
      pinned: withPaths.pinned ?? existing.pinned,
    }
  }
  return {
    ...withPaths,
    createdAt: existing.createdAt,
    pinned: withPaths.pinned ?? existing.pinned,
  }
}

/**
 * Upsert incoming items without deleting rows the client does not know about.
 * Terminal rows are not overwritten by pending states. Returns the full list.
 */
export function upsertHistoryItemsFromUnknown(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) {
    throw new Error('items must be an array')
  }
  const normalized = normalizeHistoryItems(raw, 'local')
  const db = getDb()
  db.transaction(() => {
    for (const item of normalized) {
      const existing = getHistoryItem(item.taskId)
      upsertHistoryItem(mergeIncomingHistoryItem(item, existing))
    }
  })()
  return listHistory()
}

/** Delete one history row. Returns false when the taskId was not stored. */
export function deleteHistoryItem(taskId: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM history_items WHERE task_id = ?')
    .run(taskId)
  return result.changes > 0
}

/** Drop every non-pinned row. Returns the remaining (pinned) list. */
export function clearUnpinnedHistory(): HistoryItem[] {
  getDb().prepare('DELETE FROM history_items WHERE pinned = 0').run()
  return listHistory()
}

/** Read one history item by task id. */
export function getHistoryItem(taskId: string): HistoryItem | null {
  const row = getDb()
    .prepare('SELECT * FROM history_items WHERE task_id = ?')
    .get(taskId) as HistoryRow | undefined
  return row ? rowToItem(row) : null
}
export function historyCount(): number {
  const row = getDb()
    .prepare('SELECT COUNT(*) AS n FROM history_items')
    .get() as { n: number }
  return row.n
}

/** Replace all rows with capped items. Returns the stored list. */
export function replaceAllHistory(items: HistoryItem[]): HistoryItem[] {
  const capped = capItems(
    items.toSorted((a, b) => b.createdAt - a.createdAt),
  )
  const db = getDb()

  // Preserve server-managed localPath values across client full-replace
  const existingRows = db.prepare(
    `SELECT task_id, media FROM history_items WHERE media LIKE '%"localPath"%'`,
  ).all() as { task_id: string; media: string }[]
  const localPathMap = new Map<string, Map<string, string>>()
  for (const row of existingRows) {
    const media = parseJsonColumn<MediaAsset[]>(row.media)
    if (!media) continue
    const urlMap = new Map<string, string>()
    for (const asset of media) {
      if (asset.localPath) {
        const key = asset.url ?? asset.streamUrl ?? ''
        if (key) urlMap.set(key, asset.localPath)
      }
    }
    if (urlMap.size > 0) localPathMap.set(row.task_id, urlMap)
  }

  const preserved = capped.map((item) => {
    const urlMap = localPathMap.get(item.taskId)
    if (!urlMap || !item.media?.length) return item
    const merged = item.media.map((asset) => {
      if (asset.localPath) return asset
      const key = asset.url ?? asset.streamUrl ?? ''
      const existing = key ? urlMap.get(key) : undefined
      return existing ? { ...asset, localPath: existing } : asset
    })
    return { ...item, media: merged }
  })

  const insert = insertStmt()
  const tx = db.transaction((list: HistoryItem[]) => {
    db.prepare('DELETE FROM history_items').run()
    for (const item of list) {
      insert.run(itemToParams(item))
    }
  })
  tx(preserved)
  return listHistory()
}

/**
 * Accept unknown payload (e.g. PUT body), normalize as local studio data,
 * then replace.
 */
export function replaceAllFromUnknown(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) {
    throw new Error('items must be an array')
  }
  const normalized = normalizeHistoryItems(raw, 'local')
  return replaceAllHistory(normalized)
}

/** Import merge: existing taskIds win. Atomic list → merge → replace. */
export function importHistoryItems(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) {
    throw new Error('items must be an array')
  }
  const imported = normalizeHistoryItems(raw, 'import')
  const db = getDb()
  return db.transaction(() => {
    const current = listHistory()
    return replaceAllHistory(mergeHistory(current, imported))
  })()
}

/**
 * One-shot localStorage migration: normalize as local, then merge
 * (or fill empty DB). Existing DB taskIds win.
 * Atomic list → merge → replace so concurrent PUTs cannot be wiped.
 */
export function migrateHistoryItems(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) {
    throw new Error('items must be an array')
  }
  const incoming = normalizeHistoryItems(raw, 'local')
  const db = getDb()
  return db.transaction(() => {
    const current = listHistory()
    if (current.length === 0) {
      return replaceAllHistory(incoming)
    }
    return replaceAllHistory(mergeHistory(current, incoming))
  })()
}

/** Merge localPath values from archived media into the stored media JSON. */
export function updateMediaLocalPaths(taskId: string, media: MediaAsset[]): void {
  const db = getDb()
  const row = db
    .prepare('SELECT media FROM history_items WHERE task_id = ?')
    .get(taskId) as { media: string | null } | null
  if (!row) return

  const existing = parseJsonColumn<MediaAsset[]>(row.media)
  if (!existing?.length) {
    // No existing media column — write the full archived media
    db.prepare('UPDATE history_items SET media = ? WHERE task_id = ?')
      .run(JSON.stringify(media), taskId)
    return
  }

  // Merge: match by URL (not index) to avoid misattribution
  const byUrl = new Map(
    media.filter((m) => m.localPath).map((m) => [m.url ?? m.streamUrl ?? '', m.localPath!]),
  )
  const merged = existing.map((asset) => {
    if (asset.localPath) return asset
    const key = asset.url ?? asset.streamUrl ?? ''
    const lp = key ? byUrl.get(key) : undefined
    return lp ? { ...asset, localPath: lp } : asset
  })

  db.prepare('UPDATE history_items SET media = ? WHERE task_id = ?')
    .run(JSON.stringify(merged), taskId)
}

/** List success/partial items that have media assets still lacking localPath (for backfill). */
const MEDIA_RETENTION_MS = 13 * 24 * 60 * 60 * 1000 // 13 days (margin from kie.ai's 14-day retention)

export function listUnarchivedMedia(limit?: number): { taskId: string; media: MediaAsset[] }[] {
  const cutoff = Date.now() - MEDIA_RETENTION_MS
  const rows = getDb()
    .prepare(
      `SELECT task_id, media FROM history_items
       WHERE state IN ('success', 'partial')
         AND media IS NOT NULL
         AND created_at > ?
       ORDER BY created_at DESC
       ${limit !== undefined ? 'LIMIT ?' : ''}`,
    )
    .all(cutoff, ...(limit !== undefined ? [limit] : [])) as { task_id: string; media: string }[]

  return rows.flatMap((row) => {
    const media = parseJsonColumn<MediaAsset[]>(row.media)
    if (!media?.length) return []
    // Only include items that have at least one downloadable URL without localPath
    const needsArchive = media.some((asset) => (asset.url ?? asset.streamUrl) && !asset.localPath)
    return needsArchive ? [{ taskId: row.task_id, media }] : []
  })
}
