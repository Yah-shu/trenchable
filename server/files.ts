/** Serving local media files to the board: whole, or in short byte ranges for video players. */
import { closeSync, createReadStream, openSync, readSync, statSync } from 'node:fs'

function streamOf(path: string, start?: number, end?: number): ReadableStream<Uint8Array> {
  const stream = createReadStream(path, start === undefined ? undefined : { start, end })
  return new ReadableStream({
    start(controller) {
      stream.on('data', (chunk) => controller.enqueue(new Uint8Array(chunk as Buffer)))
      stream.on('end', () => controller.close())
      stream.on('error', (err) => controller.error(err))
    },
    cancel() {
      stream.destroy()
    },
  })
}

/**
 * Most bytes sent for one range request. Players ask for "bytes=N-" (the rest of
 * the file); answering that with one long stream breaks on longer ads: once the
 * player has buffered enough it stops reading, the connection sits idle, and the
 * server's 10 s idle timeout cuts it mid-video. Short pieces finish at once and
 * the player simply asks for the next one.
 */
const MAX_RANGE = 1024 * 1024

function readRange(path: string, start: number, end: number): Uint8Array {
  const buf = Buffer.alloc(end - start + 1)
  const fd = openSync(path, 'r')
  try {
    let off = 0
    while (off < buf.length) {
      const n = readSync(fd, buf, off, buf.length - off, start + off)
      if (n <= 0) break
      off += n
    }
    return off === buf.length ? buf : buf.subarray(0, off)
  } finally {
    closeSync(fd)
  }
}

export function serveFile(path: string, type: string, range: string | undefined): Response {
  const size = statSync(path).size
  const m = range ? /^bytes=(\d*)-(\d*)$/.exec(range) : null
  if (m) {
    const start = m[1] ? Number(m[1]) : 0
    const end = Math.min(m[2] ? Number(m[2]) : size - 1, size - 1, start + MAX_RANGE - 1)
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    return new Response(readRange(path, start, end), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': String(end - start + 1),
        'Accept-Ranges': 'bytes',
      },
    })
  }
  return new Response(streamOf(path), { headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' } })
}
