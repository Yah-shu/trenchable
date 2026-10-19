import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { Hono } from 'hono'
import { getMediaRoot } from '../media/archiver.ts'

const MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
}

export const mediaRoutes = new Hono()

mediaRoutes.get('/media/*', (c) => {
  const rawPath = c.req.path.replace(/^\/media\//, '')

  // Path traversal protection
  if (rawPath.includes('..') || rawPath.includes('\0')) {
    return c.json({ error: 'Invalid path' }, 400)
  }

  const safePath = normalize(rawPath)
  if (safePath.startsWith('..') || safePath.startsWith('/')) {
    return c.json({ error: 'Invalid path' }, 400)
  }

  const filePath = join(getMediaRoot(), safePath)

  // Ensure resolved path is still within media root
  const mediaRoot = getMediaRoot()
  if (!filePath.startsWith(mediaRoot)) {
    return c.json({ error: 'Invalid path' }, 400)
  }

  if (!existsSync(filePath)) {
    return c.json({ error: 'Not found' }, 404)
  }

  const stat = statSync(filePath)
  if (!stat.isFile()) {
    return c.json({ error: 'Not found' }, 404)
  }

  // Symlink protection: ensure the real path is still within media root
  const realPath = realpathSync(filePath)
  if (!realPath.startsWith(realpathSync(mediaRoot))) {
    return c.json({ error: 'Invalid path' }, 400)
  }

  const ext = extname(filePath).toLowerCase()
  const contentType = MIME_TYPES[ext] ?? 'application/octet-stream'

  // HTTP Range support (required for video/audio seeking in WKWebView/WebKitGTK)
  const rangeHeader = c.req.header('range')
  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader)
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0
      const end = match[2] ? parseInt(match[2], 10) : stat.size - 1
      if (start >= stat.size || end >= stat.size || start > end) {
        return new Response(null, {
          status: 416,
          headers: { 'Content-Range': `bytes */${stat.size}` },
        })
      }
      const rangeStream = createReadStream(filePath, { start, end })
      return new Response(
        new ReadableStream({
          start(controller) {
            rangeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
            rangeStream.on('end', () => controller.close())
            rangeStream.on('error', (err) => controller.error(err))
          },
          cancel() {
            rangeStream.destroy()
          },
        }),
        {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Content-Length': String(end - start + 1),
            'Accept-Ranges': 'bytes',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        },
      )
    }
  }

  const stream = createReadStream(filePath)

  return new Response(
    new ReadableStream({
      start(controller) {
        stream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        stream.on('end', () => controller.close())
        stream.on('error', (err) => controller.error(err))
      },
      cancel() {
        stream.destroy()
      },
    }),
    {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    },
  )
})
