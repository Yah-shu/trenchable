/**
 * Elements, Projects and Uploads (/api/studio/elements, /projects, /uploads): the HTTP side of ./library.ts.
 *
 * Answers are {data}; errors are {error: "plain words"} with 400/404. Bodies are capped before they are read
 * (JSON 64 KB, image uploads 100 MB in all with 25 MB per image), and every id and file name is checked by
 * the library against a strict pattern, so nothing outside the library folder can be named. Nothing here
 * spends Kie credits: images only reach Kie when a job re-uploads them (board/studio/library.ts).
 */
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serveFile } from '../files.ts'
import {
  LibraryError,
  MAX_IMAGE_BYTES,
  MAX_IMAGES,
  MAX_UPLOAD_BYTES,
  addImageFiles,
  addImageFromUrl,
  addProjectItems,
  createElement,
  createProject,
  deleteElement,
  deleteProject,
  deleteUpload,
  elementFile,
  getElement,
  getProject,
  listElements,
  listProjects,
  listUploads,
  removeImage,
  removeProjectItem,
  saveUpload,
  updateElement,
  updateProject,
  uploadFile,
} from './library.ts'

export const libraryRoutes = new Hono()

const JSON_BYTES = 64 * 1024
const UPLOAD_BYTES = 100 * 1024 * 1024

const message = (e: unknown) => (e instanceof Error ? e.message : String(e))

const limit = (maxSize: number, error: string) => bodyLimit({ maxSize, onError: (c) => c.json({ error }, 400) })
const jsonLimit = limit(JSON_BYTES, 'That request is too large (64 KB max)')
const uploadLimit = limit(UPLOAD_BYTES, 'That upload is too large (100 MB max in one go, 25 MB per image)')

/** Library refusals keep their status; anything else is a 500 with the reason in plain words. */
function fail(c: Context, e: unknown) {
  if (e instanceof LibraryError) return c.json({ error: e.message }, e.status)
  console.error('[studio library]', e)
  return c.json({ error: `Something went wrong: ${message(e)}` }, 500)
}

const guard = (run: (c: Context) => Promise<Response> | Response) => async (c: Context) => {
  try {
    return await run(c)
  } catch (e) {
    return fail(c, e)
  }
}

/** The JSON body, or undefined when there is none or it isn't JSON (the library then says what's missing). */
async function jsonBody(c: Context): Promise<unknown> {
  return c.req.json().catch(() => undefined)
}

const param = (c: Context, name: string) => c.req.param(name) ?? ''

// ---------- elements ----------

libraryRoutes.get(
  '/elements',
  guard((c) => c.json({ data: { items: listElements() } })),
)

libraryRoutes.get(
  '/elements/:id',
  guard((c) => {
    const el = getElement(param(c, 'id'))
    return el ? c.json({ data: el }) : c.json({ error: "That element wasn't found. It may have been deleted." }, 404)
  }),
)

libraryRoutes.post(
  '/elements',
  jsonLimit,
  guard(async (c) => c.json({ data: await createElement(await jsonBody(c)) })),
)

libraryRoutes.patch(
  '/elements/:id',
  jsonLimit,
  guard(async (c) => c.json({ data: await updateElement(param(c, 'id'), await jsonBody(c)) })),
)

libraryRoutes.delete(
  '/elements/:id',
  guard(async (c) => {
    const id = param(c, 'id')
    await deleteElement(id)
    return c.json({ data: { deleted: true, id } })
  }),
)

/** Multipart `file` (one or more images) or JSON { url }. */
libraryRoutes.post(
  '/elements/:id/images',
  uploadLimit,
  guard(async (c) => {
    const id = param(c, 'id')
    const type = c.req.header('content-type') ?? ''
    if (type.includes('application/json')) {
      const body = await jsonBody(c)
      const url = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>).url : undefined
      return c.json({ data: await addImageFromUrl(id, url) })
    }
    if (!type.includes('multipart/form-data')) return c.json({ error: 'Send the image as a file upload, or JSON { url }' }, 400)
    let form: Record<string, string | File | (string | File)[]>
    try {
      form = await c.req.parseBody({ all: true })
    } catch {
      return c.json({ error: 'Send the image as a file upload, or JSON { url }' }, 400)
    }
    const files = ([] as unknown[]).concat(form.file ?? []).filter((f): f is File => f instanceof File && f.size > 0)
    if (!files.length) return c.json({ error: 'Add an image' }, 400)
    if (files.length > MAX_IMAGES) return c.json({ error: `Up to ${MAX_IMAGES} images at a time` }, 400)
    const big = files.find((f) => f.size > MAX_IMAGE_BYTES)
    if (big) return c.json({ error: `"${big.name.slice(0, 80)}" is larger than 25 MB` }, 400)
    const read = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: Buffer.from(await f.arrayBuffer()) })))
    return c.json({ data: await addImageFiles(id, read) })
  }),
)

libraryRoutes.delete(
  '/elements/:id/images/:n',
  guard(async (c) => {
    const n = param(c, 'n')
    if (!/^[1-9]\d{0,5}$/.test(n)) return c.json({ error: "That image isn't in this element" }, 404)
    return c.json({ data: await removeImage(param(c, 'id'), Number(n)) })
  }),
)

/** An element's image or its thumbnail (`<n>-thumb.webp`). `n` is never reused, so the answer never changes. */
libraryRoutes.get(
  '/elements/:id/files/:name',
  guard((c) => {
    const found = elementFile(param(c, 'id'), param(c, 'name'))
    if (!found) return c.json({ error: 'File not found' }, 404)
    const res = serveFile(found.path, found.type, c.req.header('range'))
    res.headers.set('Cache-Control', 'private, max-age=31536000, immutable')
    return res
  }),
)

// ---------- projects ----------

const NO_PROJECT = "That project wasn't found. It may have been deleted."

libraryRoutes.get(
  '/projects',
  guard((c) => c.json({ data: { items: listProjects() } })),
)

libraryRoutes.get(
  '/projects/:id',
  guard((c) => {
    const p = getProject(param(c, 'id'))
    return p ? c.json({ data: p }) : c.json({ error: NO_PROJECT }, 404)
  }),
)

libraryRoutes.post(
  '/projects',
  jsonLimit,
  guard(async (c) => c.json({ data: await createProject((await jsonBody(c)) ?? {}) })),
)

libraryRoutes.patch(
  '/projects/:id',
  jsonLimit,
  guard(async (c) => c.json({ data: await updateProject(param(c, 'id'), await jsonBody(c)) })),
)

libraryRoutes.delete(
  '/projects/:id',
  guard(async (c) => {
    const id = param(c, 'id')
    await deleteProject(id)
    return c.json({ data: { deleted: true, id } })
  }),
)

libraryRoutes.post(
  '/projects/:id/items',
  jsonLimit,
  guard(async (c) => c.json({ data: await addProjectItems(param(c, 'id'), await jsonBody(c)) })),
)

libraryRoutes.delete(
  '/projects/:id/items/:taskId',
  guard(async (c) => c.json({ data: await removeProjectItem(param(c, 'id'), param(c, 'taskId')) })),
)

// ---------- uploads (the media picker's Uploads tab) ----------

/** ?offset=&limit=&kind=image|video|audio → { items, total }, newest first. */
libraryRoutes.get(
  '/uploads',
  guard((c) =>
    c.json({
      data: listUploads({ offset: Number(c.req.query('offset') ?? 0), limit: Number(c.req.query('limit') ?? 60), kind: c.req.query('kind') ?? undefined }),
    }),
  ),
)

/** Multipart: `file` (one), plus `hostedUrl` / `expiresAt` when the board already put it on Kie. */
libraryRoutes.post(
  '/uploads',
  uploadLimit,
  guard(async (c) => {
    if (!(c.req.header('content-type') ?? '').includes('multipart/form-data')) return c.json({ error: 'Send the file as a file upload' }, 400)
    let form: Record<string, string | File | (string | File)[]>
    try {
      form = await c.req.parseBody({ all: true })
    } catch {
      return c.json({ error: 'Send the file as a file upload' }, 400)
    }
    const files = ([] as unknown[]).concat(form.file ?? []).filter((f): f is File => f instanceof File && f.size > 0)
    if (files.length !== 1) return c.json({ error: 'Send one file at a time' }, 400)
    const f = files[0] as File
    if (f.size > MAX_UPLOAD_BYTES) return c.json({ error: `"${f.name.slice(0, 80)}" is larger than 100 MB` }, 400)
    const one = (v: unknown) => (typeof v === 'string' ? v : undefined)
    const saved = await saveUpload({ name: f.name, type: f.type, bytes: Buffer.from(await f.arrayBuffer()) }, { url: one(form.hostedUrl), expiresAt: one(form.expiresAt) })
    return c.json({ data: saved })
  }),
)

libraryRoutes.delete(
  '/uploads/:id',
  guard(async (c) => {
    const id = param(c, 'id')
    await deleteUpload(id)
    return c.json({ data: { deleted: true, id } })
  }),
)

/** An upload's file or its thumbnail. Ids are never reused, so the answer never changes. */
libraryRoutes.get(
  '/uploads/files/:name',
  guard((c) => {
    const found = uploadFile(param(c, 'name'))
    if (!found) return c.json({ error: 'File not found' }, 404)
    const res = serveFile(found.path, found.type, c.req.header('range'))
    res.headers.set('Cache-Control', 'private, max-age=31536000, immutable')
    return res
  }),
)
