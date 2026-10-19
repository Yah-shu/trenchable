import { createWriteStream, existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'
import type { MediaAsset } from '../../src/lib/models/types.ts'
import { getDownloadUrl } from '../kie/common.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))

const SAFE_TASK_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Media root lives alongside the SQLite DB:
 * - dev: <repo>/data/media/
 * - desktop: <userData>/media/ (STUDIO_DB_PATH points to <userData>/studio.db)
 */
export function getMediaRoot(): string {
  const dbPath = process.env.STUDIO_DB_PATH ?? resolve(__dirname, '../../data/studio.db')
  return join(dirname(dbPath), 'media')
}

/** Resolve a relative localPath (e.g. "media/{taskId}/0.mp4") to an absolute path. */
export function resolveMediaPath(localPath: string): string {
  return join(getMediaRoot(), '..', localPath)
}

function extensionFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname
    const ext = extname(pathname)
    // Limit to reasonable media extensions
    if (/^\.[a-z0-9]{2,5}$/i.test(ext)) return ext.toLowerCase()
  } catch { /* ignore */ }
  return ''
}

const MIME_EXT_MAP: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const KIND_DEFAULT_EXT: Record<string, string> = {
  video: '.mp4',
  audio: '.mp3',
  image: '.png',
}

function extensionForAsset(asset: MediaAsset, url: string): string {
  const fromUrl = extensionFromUrl(url)
  if (fromUrl) return fromUrl
  if (asset.mimeType && MIME_EXT_MAP[asset.mimeType]) return MIME_EXT_MAP[asset.mimeType]
  return KIND_DEFAULT_EXT[asset.kind] ?? ''
}

// In-flight deduplication: prevents concurrent archives for the same taskId
const inflight = new Map<string, Promise<MediaAsset[]>>()

/**
 * Download media assets for a completed task to local filesystem.
 * Returns the media array with `localPath` populated for successfully downloaded assets.
 * Failed downloads retain the original remote URL without localPath.
 * Deduplicates concurrent calls for the same taskId.
 */
export function archiveTaskMedia(
  taskId: string,
  media: MediaAsset[],
): Promise<MediaAsset[]> {
  if (!SAFE_TASK_ID.test(taskId)) {
    console.warn('[media-archive] unsafe taskId, skipped', taskId)
    return Promise.resolve(media)
  }
  const existing = inflight.get(taskId)
  if (existing) return existing
  const run = doArchive(taskId, media).finally(() => inflight.delete(taskId))
  inflight.set(taskId, run)
  return run
}

async function doArchive(taskId: string, media: MediaAsset[]): Promise<MediaAsset[]> {
  const mediaRoot = getMediaRoot()
  const taskDir = join(mediaRoot, taskId)

  const results: MediaAsset[] = []

  for (const [index, asset] of media.entries()) {
    // Already archived and file exists — skip
    if (asset.localPath) {
      const absPath = resolveMediaPath(asset.localPath)
      if (existsSync(absPath)) {
        results.push(asset)
        continue
      }
    }

    const sourceUrl = asset.url ?? asset.streamUrl
    if (!sourceUrl) {
      results.push(asset)
      continue
    }

    try {
      const temporaryUrl = await getDownloadUrl(sourceUrl)
      const response = await fetch(temporaryUrl)
      if (!response.ok || !response.body) {
        throw new Error(`download failed (${response.status})`)
      }

      const ext = extensionForAsset(asset, sourceUrl)
      const fileName = `${index}${ext}`
      const relativePath = `media/${taskId}/${fileName}`

      mkdirSync(taskDir, { recursive: true })
      // Atomic write: stream to .part file then rename
      const tmpPath = join(taskDir, `${fileName}.part`)
      await pipeline(response.body, createWriteStream(tmpPath))
      renameSync(tmpPath, join(taskDir, fileName))

      results.push({ ...asset, localPath: relativePath })
    } catch (error) {
      console.error(
        '[media-archive] failed to download asset',
        { taskId, index, url: sourceUrl, error: error instanceof Error ? error.message : error },
      )
      results.push(asset)
    }
  }

  return results
}
