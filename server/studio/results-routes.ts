/**
 * Small result actions the shared history routes don't cover.
 *
 * - `POST /favourite { taskId, on }` sets only the favourite (pin) flag. The shared
 *   `PUT /api/history` takes a whole row, so a favourite toggled from a stale copy in the
 *   browser could overwrite media paths or a state the server learned since.
 * - `POST /zip { items: [{ path, name? }] }` streams archived results (`/media/...`, on our
 *   own disk) as one zip. The shared `/api/archive` only fetches remote https URLs.
 */
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { basename, extname, relative, resolve, sep } from 'node:path'
import { PassThrough, Readable } from 'node:stream'
import * as ArchiverPackage from 'archiver'
import type { Archiver } from 'archiver'
import { Hono } from 'hono'
import { getHistoryItem, upsertHistoryItem } from '../db/history.ts'
import { getMediaRoot } from '../media/archiver.ts'
import { sanitizeFileName } from '../kie/safe.ts'

const ZipArchive = (ArchiverPackage as unknown as {
  ZipArchive: new (options: { zlib: { level: number } }) => Archiver
}).ZipArchive

const TASK_ID = /^[A-Za-z0-9_-]{1,128}$/
const MAX_ZIP_ITEMS = 200

export const resultsRoutes = new Hono()

resultsRoutes.post('/favourite', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { taskId?: unknown; on?: unknown } | null
  if (!body || typeof body.taskId !== 'string' || !TASK_ID.test(body.taskId) || typeof body.on !== 'boolean') {
    return c.json({ error: 'Send a taskId and on: true or false.' }, 400)
  }
  const item = getHistoryItem(body.taskId)
  if (!item) return c.json({ error: 'That result is not in history any more.' }, 404)
  upsertHistoryItem({ ...item, pinned: body.on })
  return c.json({ data: { taskId: item.taskId, pinned: body.on } })
})

/**
 * A `/media/...` path as a file inside the media root, or null. Resolved through
 * symlinks so a link inside the folder can't point back out of it.
 */
export function mediaFile(path: string, root = getMediaRoot()): string | null {
  if (typeof path !== 'string' || !path.startsWith('/media/') || path.includes('\0') || path.includes('..')) return null
  const rel = decodeURIComponent(path.slice('/media/'.length))
  if (!rel || rel.includes('..') || /^[a-z]:|^[\\/]/i.test(rel)) return null
  const abs = resolve(root, rel)
  if (!existsSync(abs)) return null
  let real: string
  let realRoot: string
  try {
    real = realpathSync(abs)
    realRoot = realpathSync(root)
  } catch {
    return null
  }
  const inside = relative(realRoot, real)
  if (!inside || inside.startsWith('..') || inside.includes(`..${sep}`) || resolve(realRoot, inside) !== real) return null
  return statSync(real).isFile() ? real : null
}

function uniqueName(raw: string, used: Set<string>): string {
  const parsed = sanitizeFileName(raw, 'media')
  const ext = extname(parsed)
  const stem = ext ? parsed.slice(0, -ext.length) : parsed
  let candidate = parsed
  for (let i = 2; used.has(candidate.toLowerCase()); i++) candidate = `${stem}-${i}${ext}`
  used.add(candidate.toLowerCase())
  return candidate
}

resultsRoutes.post('/zip', async (c) => {
  const body = (await c.req.json().catch(() => null)) as { items?: unknown } | null
  const items = Array.isArray(body?.items) ? (body!.items as { path?: unknown; name?: unknown }[]) : []
  if (!items.length) return c.json({ error: 'Nothing to zip.' }, 400)
  if (items.length > MAX_ZIP_ITEMS) return c.json({ error: `At most ${MAX_ZIP_ITEMS} files per zip.` }, 400)
  const files: { abs: string; name: string }[] = []
  const used = new Set<string>()
  for (const it of items) {
    const abs = typeof it?.path === 'string' ? mediaFile(it.path) : null
    if (!abs) return c.json({ error: 'One of those files is not an archived result.' }, 400)
    const ext = extname(abs)
    const wanted = typeof it.name === 'string' && it.name.trim() ? it.name.trim() : basename(abs)
    files.push({ abs, name: uniqueName(extname(wanted) ? wanted : `${wanted}${ext}`, used) })
  }

  const output = new PassThrough()
  const zip = new ZipArchive({ zlib: { level: 1 } })
  zip.pipe(output)
  for (const f of files) zip.append(createReadStream(f.abs), { name: f.name })
  void zip.finalize().catch((e: unknown) => output.destroy(e as Error))

  const fileName = `trenchable-${new Date().toISOString().slice(0, 10)}.zip`
  return new Response(Readable.toWeb(output) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
})

