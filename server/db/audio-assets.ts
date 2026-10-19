import { randomUUID } from 'node:crypto'
import type { SavedAudioAsset } from '../../src/lib/models/types.ts'
import { getDb } from './open.ts'

type AudioAssetRow = {
  id: string
  url: string
  name: string
  expires_at: number | null
  created_at: number
}

function rowToAsset(row: AudioAssetRow): SavedAudioAsset {
  return {
    id: row.id,
    url: row.url,
    name: row.name,
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
  }
}

export function listAudioAssets(): SavedAudioAsset[] {
  return (getDb().prepare(
    'SELECT * FROM saved_audio_assets ORDER BY created_at DESC',
  ).all() as AudioAssetRow[]).map(rowToAsset)
}

export function saveAudioAsset(input: {
  url: string
  name: string
  expiresAt?: number
}): SavedAudioAsset {
  const asset: SavedAudioAsset = {
    ...input,
    id: randomUUID(),
    createdAt: Date.now(),
  }
  getDb().prepare(`
    INSERT INTO saved_audio_assets (id, url, name, expires_at, created_at)
    VALUES (@id, @url, @name, @expiresAt, @createdAt)
    ON CONFLICT(url) DO UPDATE SET
      name = excluded.name,
      expires_at = excluded.expires_at,
      created_at = excluded.created_at
  `).run({ ...asset, expiresAt: asset.expiresAt ?? null })
  const row = getDb().prepare(
    'SELECT * FROM saved_audio_assets WHERE url = ?',
  ).get(input.url) as AudioAssetRow
  return rowToAsset(row)
}

export function removeAudioAsset(id: string): boolean {
  return getDb().prepare('DELETE FROM saved_audio_assets WHERE id = ?').run(id).changes > 0
}
