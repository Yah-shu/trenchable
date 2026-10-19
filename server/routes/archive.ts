import { Readable, PassThrough } from 'node:stream'
import { extname } from 'node:path'
import * as ArchiverPackage from 'archiver'
import type { Archiver } from 'archiver'
import { Hono } from 'hono'
import { getDownloadUrl } from '../kie/common.ts'
import { KieApiError } from '../kie/client.ts'
import { assertPlainObject, assertSafeHttpsUrl, sanitizeFileName } from '../kie/safe.ts'

const ZipArchive = (ArchiverPackage as unknown as {
  ZipArchive: new (options: { zlib: { level: number } }) => Archiver
}).ZipArchive

type ArchiveEntry = {
  url?: string
  name?: string
  lyrics?: string
}

function uniqueName(raw: string, used: Set<string>): string {
  const parsed = sanitizeFileName(raw, 'media')
  const extension = extname(parsed)
  const stem = extension ? parsed.slice(0, -extension.length) : parsed
  let candidate = parsed
  let index = 2
  while (used.has(candidate.toLowerCase())) {
    candidate = `${stem}-${index}${extension}`
    index += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}

export const archiveRoutes = new Hono()

archiveRoutes.post('/archive', async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    throw new KieApiError('Invalid JSON', 400)
  }
  assertPlainObject(body)
  if (!Array.isArray(body.items) || body.items.length === 0) {
    throw new KieApiError('items is required', 400)
  }
  if (body.items.length > 50) {
    throw new KieApiError('A maximum of 50 media items can be archived', 400)
  }
  const items = body.items as ArchiveEntry[]
  for (const entry of items) {
    if (!entry || typeof entry !== 'object' || typeof entry.url !== 'string') {
      throw new KieApiError('Every archive item requires a URL', 400)
    }
    assertSafeHttpsUrl(entry.url, 'media URL')
  }

  const output = new PassThrough()
  const zip = new ZipArchive({ zlib: { level: 6 } })
  zip.pipe(output)

  void (async () => {
    const used = new Set<string>()
    for (const [index, entry] of items.entries()) {
      const sourceUrl = entry.url as string
      const sourcePath = new URL(sourceUrl).pathname
      const fallback = `media-${index + 1}${extname(sourcePath) || ''}`
      const requested = entry.name
        ? `${entry.name}${extname(entry.name) ? '' : extname(sourcePath)}`
        : fallback
      const name = uniqueName(requested, used)
      if (entry.lyrics) {
        zip.append(entry.lyrics, {
          name: uniqueName(`${name.replace(/\.[^.]+$/, '')}-lyrics.txt`, used),
        })
      }
      try {
        const temporaryUrl = await getDownloadUrl(sourceUrl)
        assertSafeHttpsUrl(temporaryUrl, 'download URL')
        const response = await fetch(temporaryUrl)
        if (!response.ok || !response.body) {
          throw new Error(`download failed (${response.status})`)
        }
        zip.append(Readable.fromWeb(response.body as never), { name })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown error'
        zip.append(`Could not save ${sourceUrl}\n${message}\n`, {
          name: uniqueName(`${name}.error.txt`, used),
        })
      }
    }
    await zip.finalize()
  })().catch((error) => output.destroy(error as Error))

  const fileName = `kie-studio-${new Date().toISOString().slice(0, 10)}.zip`
  return new Response(Readable.toWeb(output) as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  })
})
