/**
 * Generation Studio library: Elements and Projects.
 *
 * An Element is a named set of reference images (a character, a product, a location, a style) that can be
 * @-mentioned in any job, like the reference app's Elements / Soul ID. A Project is a named group of generations,
 * like a Cinema Studio project.
 *
 * Why an element keeps its own copy of every image: Kie cannot read our disk, and the URLs Kie hands back
 * after an upload expire within days. So the element folder is the source of truth and the board re-uploads
 * an image right before a job uses it (board/studio/library.ts `elementRefs`). Nothing here talks to Kie.
 *
 * Layout under studioDir() (paths.ts):
 *   elements/<id>/element.json        name, kind, description, cover and the image list
 *   elements/<id>/<n>.<png|jpg|webp>  one image; n counts up per element and is never reused, so a URL
 *                                     always means the same bytes (safe to cache, safe to key Kie uploads by)
 *   elements/<id>/<n>-thumb.webp      its thumbnail
 *   projects.json                     every project: title, notes, task ids newest first
 *   uploads/, uploads.json            a copy of every file uploaded through Studio (see "uploads" below)
 *
 * Projects only hold task ids: deleting a project never touches the generations themselves.
 * The root is read on every call (not at import) so tests can point TRENCHABLE_DATA at a temp folder.
 */
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import sharp from 'sharp'
import { readJson, writeJson } from '../lib/json-file.ts'
import { studioDir } from './paths.ts'
import { KieApiError } from '../kie/client.ts'
import { assertSafeHttpsUrl } from '../kie/safe.ts'
import { getMediaRoot } from '../media/archiver.ts'
import { DEFAULT_DEPS, safeGet, UnsafeUrl, type SafeDeps } from '../lib/safe-fetch.ts'

// ---------- types ----------

export const KINDS = ['character', 'product', 'location', 'style', 'other'] as const
export type ElementKind = (typeof KINDS)[number]

export interface ElementImage {
  n: number
  /** File name inside the element folder, e.g. "3.png". */
  file: string
  /** Same-origin path that serves the image. */
  url: string
  /** Same-origin path that serves its thumbnail. */
  thumb: string
  width?: number
  height?: number
}

export interface Element {
  id: string
  name: string
  kind: ElementKind
  description: string
  createdAt: string
  updatedAt: string
  images: ElementImage[]
  /** The `n` of the cover image; 0 when the element has no images. */
  cover: number
}

/** Where an image comes from: an https URL, or a same-origin path such as /media/<taskId>/0.png. */
export interface Source {
  url: string
}

export interface Project {
  id: string
  title: string
  notes: string
  createdAt: string
  updatedAt: string
  /** Generations in this project, newest first. */
  taskIds: string[]
}

/** A refusal with a plain message and the HTTP status the routes answer with. */
export class LibraryError extends Error {
  status: 400 | 404
  constructor(message: string, status: 400 | 404 = 400) {
    super(message)
    this.name = 'LibraryError'
    this.status = status
  }
}

// ---------- limits ----------

/** Kie's models take at most ~9-14 references, so more than this in one element can never all be used. */
export const MAX_IMAGES = 12
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024
export const LIMITS = {
  name: 80,
  description: 2000,
  title: 120,
  notes: 4000,
  elements: 1000,
  projects: 1000,
  taskIdsPerCall: 200,
  taskIdsPerProject: 5000,
} as const

/** Bigger than this (bytes or pixels) and the copy is re-encoded: Kie's reference fields often refuse >10 MB. */
const KEEP_BYTES = 10 * 1024 * 1024
const MAX_SIDE = 4096
const THUMB_SIDE = 512
const READABLE = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'tiff', 'heif'])

const ELEMENT_ID_RE = /^el-[0-9a-f]{12}$/
const PROJECT_ID_RE = /^pr-[0-9a-f]{12}$/
/** Same rule as the media archiver's task ids. */
export const TASK_ID_RE = /^[A-Za-z0-9_-]{1,128}$/
const FILE_RE = /^([1-9]\d{0,5})(-thumb)?\.(png|jpg|webp)$/
const FILES_PATH_RE = /^\/api\/studio\/elements\/([^/]+)\/files\/([^/]+)$/
const API = '/api/studio/elements'

export const isElementId = (id: unknown): id is string => typeof id === 'string' && ELEMENT_ID_RE.test(id)
export const isProjectId = (id: unknown): id is string => typeof id === 'string' && PROJECT_ID_RE.test(id)

// ---------- paths ----------

export const libraryRoot = (): string => studioDir()
const elementsDir = () => join(libraryRoot(), 'elements')
const projectsFile = () => join(libraryRoot(), 'projects.json')

function elementDir(id: string): string {
  if (!isElementId(id)) throw new LibraryError("That element wasn't found", 404)
  return join(elementsDir(), id)
}

/** `parts` joined under `root`, or null when the result would leave it. */
function inside(root: string, parts: string[]): string | null {
  const base = resolve(root)
  const abs = resolve(base, ...parts)
  return abs.startsWith(base + sep) ? abs : null
}

const thumbName = (n: number) => `${n}-thumb.webp`

// ---------- queued writes ----------

const locks = new Map<string, Promise<unknown>>()

/** Runs `job` after every earlier job on the same key, so two requests never lose each other's change. */
function queued<T>(key: string, job: () => Promise<T> | T): Promise<T> {
  const next = (locks.get(key) ?? Promise.resolve()).then(job)
  const tail = next.catch(() => undefined)
  locks.set(key, tail)
  void tail.then(() => {
    if (locks.get(key) === tail) locks.delete(key)
  })
  return next
}

function writeBytes(path: string, bytes: Buffer): void {
  const tmp = `${path}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`
  writeFileSync(tmp, bytes)
  renameSync(tmp, path)
}

const now = () => new Date().toISOString()

// ---------- elements: records ----------

interface StoredImage {
  n: number
  file: string
  width?: number
  height?: number
}

/** element.json: the public Element minus the URLs (worked out on read), plus the counter for `n`. */
interface ElementRecord extends Omit<Element, 'images'> {
  images: StoredImage[]
  seq: number
}

function readRecord(id: string): ElementRecord | null {
  if (!isElementId(id)) return null
  const rec = readJson<ElementRecord | null>(join(elementsDir(), id, 'element.json'), null)
  return rec && rec.id === id && Array.isArray(rec.images) ? rec : null
}

function writeRecord(rec: ElementRecord): void {
  writeJson(join(elementDir(rec.id), 'element.json'), rec)
}

function toElement(rec: ElementRecord): Element {
  const base = `${API}/${rec.id}/files`
  return {
    id: rec.id,
    name: rec.name,
    kind: rec.kind,
    description: rec.description,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    images: rec.images.map((img) => ({
      n: img.n,
      file: img.file,
      url: `${base}/${img.file}`,
      thumb: `${base}/${thumbName(img.n)}`,
      ...(img.width ? { width: img.width } : {}),
      ...(img.height ? { height: img.height } : {}),
    })),
    cover: rec.cover,
  }
}

const NO_ELEMENT = "That element wasn't found. It may have been deleted."

function mustRecord(id: string): ElementRecord {
  const rec = readRecord(id)
  if (!rec) throw new LibraryError(NO_ELEMENT, 404)
  return rec
}

function elementIds(): string[] {
  const dir = elementsDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && isElementId(d.name))
    .map((d) => d.name)
}

/** Every element, newest first. */
export function listElements(): Element[] {
  return elementIds()
    .map(readRecord)
    .filter((r): r is ElementRecord => r !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(toElement)
}

export function getElement(id: string): Element | null {
  const rec = readRecord(id)
  return rec ? toElement(rec) : null
}

// ---------- validation ----------

type Body = Record<string, unknown>

function asBody(v: unknown, what: string): Body {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new LibraryError(`Send the ${what} as JSON`)
  return v as Body
}

function onlyKeys(body: Body, allowed: string[], what: string): void {
  const extra = Object.keys(body).filter((k) => !allowed.includes(k))
  if (extra.length) throw new LibraryError(`${what} can't include ${extra.join(', ')}`)
}

function text(v: unknown, label: string, max: number, required: boolean): string {
  if (v === undefined || v === null) {
    if (required) throw new LibraryError(`${label} can't be empty`)
    return ''
  }
  if (typeof v !== 'string') throw new LibraryError(`${label} must be text`)
  const s = v.trim()
  if (required && !s) throw new LibraryError(`${label} can't be empty`)
  if (s.length > max) throw new LibraryError(`${label} is too long (${max} characters max)`)
  return s
}

function kindOf(v: unknown): ElementKind {
  if (typeof v === 'string' && (KINDS as readonly string[]).includes(v)) return v as ElementKind
  throw new LibraryError(`Pick a kind: ${KINDS.join(', ')}`)
}

// ---------- images ----------

/** An image ready to save: the bytes to keep (as given when possible), its thumbnail and its size. */
export interface PreparedImage {
  bytes: Buffer
  ext: 'png' | 'jpg' | 'webp'
  thumb: Buffer
  width: number
  height: number
}

const unreadable = (label: string) => new LibraryError(`${label} isn't an image Trenchable can read (use PNG, JPG or WebP)`)

/**
 * Check that the bytes are a real image and get them ready to keep. PNG/JPG/WebP under 10 MB and 4096 px are
 * kept byte for byte (no quality lost on a face or a label); anything else is converted, and shrunk to fit
 * 4096 px, so whatever is stored can go straight to Kie. SVG is refused (it is a document, not a picture).
 */
export async function prepareImage(bytes: Buffer, label = 'The image'): Promise<PreparedImage> {
  if (!bytes.length) throw new LibraryError(`${label} is empty`)
  if (bytes.length > MAX_IMAGE_BYTES) throw new LibraryError(`${label} is larger than 25 MB`)
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>
  try {
    meta = await sharp(bytes).metadata()
  } catch {
    throw unreadable(label)
  }
  if (!meta.format || !READABLE.has(meta.format) || !meta.width || !meta.height) throw unreadable(label)
  try {
    const turned = (meta.orientation ?? 1) >= 5
    let width = turned ? meta.height : meta.width
    let height = turned ? meta.width : meta.height
    const plain = meta.format === 'jpeg' || meta.format === 'png' || meta.format === 'webp'
    let out = bytes
    let ext: PreparedImage['ext'] = meta.format === 'jpeg' ? 'jpg' : meta.format === 'png' ? 'png' : 'webp'
    if (!plain || bytes.length > KEEP_BYTES || Math.max(width, height) > MAX_SIDE) {
      const img = () => sharp(bytes, { animated: false }).rotate().resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      let r = meta.hasAlpha ? await img().png().toBuffer({ resolveWithObject: true }) : await img().jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true })
      ext = meta.hasAlpha ? 'png' : 'jpg'
      if (r.data.length > KEEP_BYTES) {
        r = await img().webp({ quality: 88 }).toBuffer({ resolveWithObject: true })
        ext = 'webp'
      }
      out = r.data
      width = r.info.width
      height = r.info.height
    }
    const thumb = await sharp(out).rotate().resize({ width: THUMB_SIDE, height: THUMB_SIDE, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer()
    return { bytes: out, ext, thumb, width, height }
  } catch {
    throw unreadable(label)
  }
}

/** Fetches go out over https only, on every redirect hop too (safeGet checks each hop's address). */
export const HTTPS_ONLY: SafeDeps = {
  resolve: DEFAULT_DEPS.resolve,
  fetch: (url, init) => (url.startsWith('https://') ? DEFAULT_DEPS.fetch(url, init) : Promise.reject(new Error('not https'))),
}

const SOURCE_HELP = 'Use an https link or a file from your generations (like /media/<task>/0.png)'

/** A local file that must stay under `root`, symlinks included. */
function readInside(root: string, parts: string[], label: string): Buffer {
  const abs = inside(root, parts)
  if (!abs || !existsSync(abs)) throw new LibraryError(`${label} wasn't found on disk`, 404)
  const st = statSync(abs)
  if (!st.isFile()) throw new LibraryError(`${label} wasn't found on disk`, 404)
  if (!realpathSync(abs).startsWith(realpathSync(resolve(root)) + sep)) throw new LibraryError(`${label} isn't a file Trenchable can use. ${SOURCE_HELP}`)
  if (st.size > MAX_IMAGE_BYTES) throw new LibraryError(`${label} is larger than 25 MB`)
  return readFileSync(abs)
}

/**
 * The bytes behind one source. A same-origin path may only name a generation in the media archive
 * (/media/...) or another element's image; anything else on disk is out of reach. An https link goes through
 * the SSRF guard (https only, no private or local hosts, every redirect checked) with a 25 MB cap.
 */
export async function loadSource(raw: unknown, label = 'The image', deps: SafeDeps = HTTPS_ONLY): Promise<Buffer> {
  const value = typeof raw === 'string' ? raw : raw && typeof raw === 'object' ? (raw as Body).url : undefined
  if (typeof value !== 'string' || !value.trim()) throw new LibraryError(`${label} has no link. ${SOURCE_HELP}`)
  const url = value.trim()
  if (url.length > 4096) throw new LibraryError(`${label} link is too long`)

  if (url.startsWith('/') && !url.startsWith('//')) {
    let path: string
    try {
      path = decodeURIComponent(url.split(/[?#]/)[0] ?? '')
    } catch {
      throw new LibraryError(`${label} link isn't valid. ${SOURCE_HELP}`)
    }
    const parts = path.split('/').filter(Boolean)
    if (path.includes('\0') || path.includes('\\') || parts.some((p) => p === '.' || p === '..' || p.includes(':'))) {
      throw new LibraryError(`${label} isn't a file Trenchable can use. ${SOURCE_HELP}`)
    }
    if (parts[0] === 'media' && parts.length > 1) return readInside(getMediaRoot(), parts.slice(1), label)
    const own = FILES_PATH_RE.exec(path)
    if (own) {
      const found = elementFile(own[1] ?? '', own[2] ?? '')
      if (!found) throw new LibraryError(`${label} wasn't found`, 404)
      return readInside(elementsDir(), [own[1] ?? '', own[2] ?? ''], label)
    }
    throw new LibraryError(`${label} isn't a file Trenchable can use. ${SOURCE_HELP}`)
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new LibraryError(`${label} link isn't valid. ${SOURCE_HELP}`)
  }
  if (parsed.protocol !== 'https:') throw new LibraryError(`${label} link must start with https://. ${SOURCE_HELP}`)
  try {
    assertSafeHttpsUrl(url, `${label} link`)
  } catch (e) {
    if (e instanceof KieApiError) throw new LibraryError(`${label} link must point at a public website`)
    throw e
  }
  let got: Awaited<ReturnType<typeof safeGet>>
  try {
    got = await safeGet(url, MAX_IMAGE_BYTES, deps)
  } catch (e) {
    if (e instanceof UnsafeUrl) throw new LibraryError(`${label} link must point at a public website`)
    throw e
  }
  if (!got) throw new LibraryError(`${label} couldn't be downloaded (the site refused it, it's over 25 MB, or it timed out)`)
  return got.bytes
}

/** Source -> bytes -> checked image, for several sources at once; any failure fails them all. */
async function prepareSources(sources: unknown[], deps: SafeDeps): Promise<PreparedImage[]> {
  const many = sources.length > 1
  return Promise.all(
    sources.map(async (s, i) => {
      const label = many ? `Image ${i + 1}` : 'The image'
      return prepareImage(await loadSource(s, label, deps), label)
    }),
  )
}

/** Writes the image files and returns their entries; `rec.seq` moves on so `n` is never reused. */
function saveFiles(rec: ElementRecord, images: PreparedImage[]): StoredImage[] {
  const dir = elementDir(rec.id)
  mkdirSync(dir, { recursive: true })
  return images.map((img) => {
    const n = ++rec.seq
    const file = `${n}.${img.ext}`
    writeBytes(join(dir, file), img.bytes)
    writeBytes(join(dir, thumbName(n)), img.thumb)
    return { n, file, width: img.width, height: img.height }
  })
}

function roomFor(rec: ElementRecord, adding: number): void {
  if (rec.images.length + adding > MAX_IMAGES) {
    const left = MAX_IMAGES - rec.images.length
    throw new LibraryError(
      left > 0
        ? `An element holds up to ${MAX_IMAGES} images; this one has room for ${left} more`
        : `An element holds up to ${MAX_IMAGES} images; this one is full. Remove one first`,
    )
  }
}

// ---------- elements: changes ----------

/** POST /elements: { name, kind, description?, sources? }. Every source is copied in, or nothing is created. */
export async function createElement(input: unknown, deps: SafeDeps = HTTPS_ONLY): Promise<Element> {
  const body = asBody(input, 'element')
  onlyKeys(body, ['name', 'kind', 'description', 'sources'], 'A new element')
  const name = text(body.name, 'Name', LIMITS.name, true).replace(/\s+/g, ' ')
  const kind = body.kind === undefined || body.kind === null || body.kind === '' ? 'other' : kindOf(body.kind)
  const description = text(body.description, 'Description', LIMITS.description, false)
  const sources = body.sources ?? []
  if (!Array.isArray(sources)) throw new LibraryError('Sources must be a list of images')
  if (sources.length > MAX_IMAGES) throw new LibraryError(`An element holds up to ${MAX_IMAGES} images`)
  if (elementIds().length >= LIMITS.elements) throw new LibraryError(`The library is full (${LIMITS.elements} elements). Delete some first`)

  const images = await prepareSources(sources, deps)
  let id = ''
  do id = `el-${randomBytes(6).toString('hex')}`
  while (existsSync(join(elementsDir(), id)))
  const at = now()
  const rec: ElementRecord = { id, name, kind, description, createdAt: at, updatedAt: at, images: [], cover: 0, seq: 0 }
  return queued(`el:${id}`, () => {
    rec.images = saveFiles(rec, images)
    rec.cover = rec.images[0]?.n ?? 0
    writeRecord(rec)
    return toElement(rec)
  })
}

/** Adds checked images to an element (the first image of an empty element becomes its cover). */
async function addPrepared(id: string, images: PreparedImage[]): Promise<Element> {
  return queued(`el:${id}`, () => {
    const rec = mustRecord(id)
    roomFor(rec, images.length)
    rec.images.push(...saveFiles(rec, images))
    if (!rec.images.some((i) => i.n === rec.cover)) rec.cover = rec.images[0]?.n ?? 0
    rec.updatedAt = now()
    writeRecord(rec)
    return toElement(rec)
  })
}

/** Uploaded files (multipart). Checked before anything is saved, so one bad file saves none. */
export async function addImageFiles(id: string, files: { name: string; bytes: Buffer }[]): Promise<Element> {
  const rec = mustRecord(id)
  if (!files.length) throw new LibraryError('Add an image')
  roomFor(rec, files.length)
  const label = (f: { name: string }, i: number) => (f.name ? `"${f.name.slice(0, 80)}"` : files.length > 1 ? `Image ${i + 1}` : 'The image')
  const images = await Promise.all(files.map((f, i) => prepareImage(f.bytes, label(f, i))))
  return addPrepared(id, images)
}

/** One image from a link or a same-origin path (see loadSource). */
export async function addImageFromUrl(id: string, url: unknown, deps: SafeDeps = HTTPS_ONLY): Promise<Element> {
  roomFor(mustRecord(id), 1)
  return addPrepared(id, await prepareSources([url], deps))
}

export function removeImage(id: string, n: number): Promise<Element> {
  return queued(`el:${id}`, () => {
    const rec = mustRecord(id)
    const img = rec.images.find((i) => i.n === n)
    if (!img) throw new LibraryError("That image isn't in this element", 404)
    rec.images = rec.images.filter((i) => i.n !== n)
    if (rec.cover === n) rec.cover = rec.images[0]?.n ?? 0
    rec.updatedAt = now()
    writeRecord(rec)
    const dir = elementDir(id)
    for (const f of [img.file, thumbName(n)]) {
      try {
        unlinkSync(join(dir, f))
      } catch {
        // already gone; the record no longer lists it either way
      }
    }
    return toElement(rec)
  })
}

/** PATCH /elements/:id: { name?, kind?, description?, cover? } where cover is an image's `n`. */
export function updateElement(id: string, input: unknown): Promise<Element> {
  const body = asBody(input, 'changes')
  onlyKeys(body, ['name', 'kind', 'description', 'cover'], 'The change')
  const name = body.name === undefined ? undefined : text(body.name, 'Name', LIMITS.name, true).replace(/\s+/g, ' ')
  const kind = body.kind === undefined ? undefined : kindOf(body.kind)
  const description = body.description === undefined ? undefined : text(body.description, 'Description', LIMITS.description, false)
  const cover = body.cover
  if (cover !== undefined && (typeof cover !== 'number' || !Number.isInteger(cover))) throw new LibraryError('Pick the cover image by its number')
  return queued(`el:${id}`, () => {
    const rec = mustRecord(id)
    if (cover !== undefined && !rec.images.some((i) => i.n === cover)) throw new LibraryError("That cover image isn't in this element")
    if (name !== undefined) rec.name = name
    if (kind !== undefined) rec.kind = kind
    if (description !== undefined) rec.description = description
    if (cover !== undefined) rec.cover = cover as number
    rec.updatedAt = now()
    writeRecord(rec)
    return toElement(rec)
  })
}

/** Deletes the element and its images. Past generations that used it keep their own copies. */
export function deleteElement(id: string): Promise<void> {
  return queued(`el:${id}`, () => {
    mustRecord(id)
    rmSync(elementDir(id), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  })
}

const TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }

/**
 * The file behind GET /elements/:id/files/:name, or null. Only names the element's record lists are served
 * (an image or its thumbnail), so nothing else in the folder, or outside it, can be reached.
 */
export function elementFile(id: string, name: string): { path: string; type: string } | null {
  const m = FILE_RE.exec(name)
  if (!m || !isElementId(id)) return null
  const rec = readRecord(id)
  const n = Number(m[1])
  const img = rec?.images.find((i) => i.n === n)
  if (!img) return null
  const wanted = m[2] ? thumbName(n) : img.file
  if (name !== wanted) return null
  const path = inside(elementsDir(), [id, wanted])
  if (!path || !existsSync(path)) return null
  return { path, type: TYPES[m[3] ?? ''] ?? 'application/octet-stream' }
}

// ---------- projects ----------

const NO_PROJECT = "That project wasn't found. It may have been deleted."

/** projects.json. A damaged file stops changes instead of being overwritten with an empty list. */
function readProjects(): Project[] {
  const path = projectsFile()
  if (!existsSync(path)) return []
  let list: unknown
  try {
    list = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`${path} is damaged and can't be read. Fix or move it, then try again.`)
  }
  if (!Array.isArray(list)) throw new Error(`${path} is damaged and can't be read. Fix or move it, then try again.`)
  return list as Project[]
}

function changeProjects<T>(change: (list: Project[]) => T): Promise<T> {
  return queued('projects', () => {
    const list = readProjects()
    const out = change(list)
    writeJson(projectsFile(), list)
    return out
  })
}

function mustProject(list: Project[], id: string): Project {
  const p = isProjectId(id) ? list.find((x) => x.id === id) : undefined
  if (!p) throw new LibraryError(NO_PROJECT, 404)
  return p
}

/** Every project, most recently changed first. */
export function listProjects(): Project[] {
  return readProjects().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getProject(id: string): Project | null {
  return isProjectId(id) ? (readProjects().find((p) => p.id === id) ?? null) : null
}

/** POST /projects: { title?, notes? }; an empty title becomes "Untitled project". */
export function createProject(input: unknown): Promise<Project> {
  const body = asBody(input ?? {}, 'project')
  onlyKeys(body, ['title', 'notes'], 'A new project')
  const title = text(body.title, 'Title', LIMITS.title, false).replace(/\s+/g, ' ') || 'Untitled project'
  const notes = text(body.notes, 'Notes', LIMITS.notes, false)
  return changeProjects((list) => {
    if (list.length >= LIMITS.projects) throw new LibraryError(`There are already ${LIMITS.projects} projects. Delete some first`)
    let id = ''
    do id = `pr-${randomBytes(6).toString('hex')}`
    while (list.some((p) => p.id === id))
    const at = now()
    const project: Project = { id, title, notes, createdAt: at, updatedAt: at, taskIds: [] }
    list.push(project)
    return project
  })
}

/** PATCH /projects/:id: { title?, notes? }. */
export function updateProject(id: string, input: unknown): Promise<Project> {
  const body = asBody(input, 'changes')
  onlyKeys(body, ['title', 'notes'], 'The change')
  const title = body.title === undefined ? undefined : text(body.title, 'Title', LIMITS.title, true).replace(/\s+/g, ' ')
  const notes = body.notes === undefined ? undefined : text(body.notes, 'Notes', LIMITS.notes, false)
  return changeProjects((list) => {
    const p = mustProject(list, id)
    if (title !== undefined) p.title = title
    if (notes !== undefined) p.notes = notes
    p.updatedAt = now()
    return p
  })
}

/** Removes the project only; the generations it listed stay in history. */
export function deleteProject(id: string): Promise<void> {
  return changeProjects((list) => {
    const p = mustProject(list, id)
    list.splice(list.indexOf(p), 1)
  })
}

/**
 * POST /projects/:id/items: { taskIds }. They go on top in the order given (pass newest first); one already
 * in the project moves up instead of appearing twice. Ids are checked for shape only, so a job can be filed
 * the moment it is submitted, before history has it.
 */
export function addProjectItems(id: string, input: unknown): Promise<Project> {
  const raw = asBody(input, 'generations').taskIds
  if (!Array.isArray(raw) || !raw.length) throw new LibraryError('Pick at least one generation to add')
  if (raw.length > LIMITS.taskIdsPerCall) throw new LibraryError(`Add up to ${LIMITS.taskIdsPerCall} generations at a time`)
  if (raw.some((t) => typeof t !== 'string' || !TASK_ID_RE.test(t))) throw new LibraryError("Some of those generations aren't valid")
  const adding = [...new Set(raw as string[])]
  return changeProjects((list) => {
    const p = mustProject(list, id)
    const next = [...adding, ...p.taskIds.filter((t) => !adding.includes(t))]
    if (next.length > LIMITS.taskIdsPerProject) throw new LibraryError(`A project holds up to ${LIMITS.taskIdsPerProject} generations`)
    p.taskIds = next
    p.updatedAt = now()
    return p
  })
}

export function removeProjectItem(id: string, taskId: string): Promise<Project> {
  return changeProjects((list) => {
    const p = mustProject(list, id)
    if (!TASK_ID_RE.test(taskId) || !p.taskIds.includes(taskId)) throw new LibraryError("That generation isn't in this project", 404)
    p.taskIds = p.taskIds.filter((t) => t !== taskId)
    p.updatedAt = now()
    return p
  })
}

// ---------- uploads ----------
//
// the reference app's media picker opens on "Uploads": every file you ever gave it, ready to attach again.
// Kie's upload links expire within days, so each upload Studio makes is also kept here, on disk, next to
// the elements: the board re-hosts the local copy for Kie when the link it got at upload time is stale
// (board/studio/library.ts `uploadHosted`). The same bytes uploaded twice are one entry, moved to the top.
//
//   uploads/<id>.<ext>          the file (an image is kept as given when it can be, like an element image)
//   uploads/<id>-thumb.webp     an image's thumbnail
//   uploads.json                every upload, newest first

export type UploadKind = 'image' | 'video' | 'audio'

export interface Upload {
  id: string
  /** The file's name on the computer it came from. */
  name: string
  kind: UploadKind
  mime: string
  /** File name inside the uploads folder. */
  file: string
  /** Same-origin path that serves the file. */
  url: string
  /** Same-origin path of an image's thumbnail. */
  thumb?: string
  size: number
  width?: number
  height?: number
  /** When it was last uploaded (a repeat upload moves it to the top). */
  createdAt: string
  /** The Kie link it got at upload time, and when Kie throws it away. */
  hostedUrl?: string
  hostedUntil?: string
}

interface UploadRecord extends Omit<Upload, 'url' | 'thumb'> {
  hash: string
  hasThumb: boolean
}

/** Videos and sounds are kept as sent, so they get the whole 100 MB the route allows. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024
/** Past this many, the oldest uploads (and their files) go. */
export const MAX_UPLOADS = 2000
const UPLOAD_ID_RE = /^up-[0-9a-f]{12}$/
const UPLOAD_FILE_RE = /^(up-[0-9a-f]{12})(-thumb)?\.(png|jpg|webp|mp4|webm|mov|mp3|wav|m4a|ogg|flac|aac)$/
const UPLOADS_API = '/api/studio/uploads'
const uploadsDir = () => join(libraryRoot(), 'uploads')
const uploadsFile = () => join(libraryRoot(), 'uploads.json')

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
}

/**
 * What a video or sound file really is, from its first bytes (never from the name or the type the
 * browser claims). Null for anything else; images are checked by `prepareImage`.
 */
export function sniffMedia(bytes: Buffer, claimed = ''): { kind: 'video' | 'audio'; ext: string } | null {
  const at = (i: number, s: string) => bytes.subarray(i, i + s.length).toString('latin1') === s
  if (bytes.length < 12) return null
  if (at(4, 'ftyp')) {
    const brand = bytes.subarray(8, 12).toString('latin1')
    if (/^M4A|^M4B/.test(brand) || (claimed.startsWith('audio/') && !/^qt/.test(brand))) return { kind: 'audio', ext: 'm4a' }
    return { kind: 'video', ext: brand.startsWith('qt') ? 'mov' : 'mp4' }
  }
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return { kind: 'video', ext: 'webm' }
  if (at(0, 'RIFF') && at(8, 'WAVE')) return { kind: 'audio', ext: 'wav' }
  if (at(0, 'OggS')) return { kind: 'audio', ext: 'ogg' }
  if (at(0, 'fLaC')) return { kind: 'audio', ext: 'flac' }
  if (at(0, 'ID3')) return { kind: 'audio', ext: 'mp3' }
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf6) === 0xf0) return { kind: 'audio', ext: 'aac' }
  if (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0) return { kind: 'audio', ext: 'mp3' }
  return null
}

function readUploads(): UploadRecord[] {
  const path = uploadsFile()
  if (!existsSync(path)) return []
  let list: unknown
  try {
    list = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new Error(`${path} is damaged and can't be read. Fix or move it, then try again.`)
  }
  if (!Array.isArray(list)) throw new Error(`${path} is damaged and can't be read. Fix or move it, then try again.`)
  return list as UploadRecord[]
}

function toUpload(rec: UploadRecord): Upload {
  const { hash: _hash, hasThumb, ...rest } = rec
  return {
    ...rest,
    url: `${UPLOADS_API}/files/${rec.file}`,
    ...(hasThumb ? { thumb: `${UPLOADS_API}/files/${rec.id}-thumb.webp` } : {}),
  }
}

function dropUploadFiles(rec: UploadRecord): void {
  for (const f of [rec.file, `${rec.id}-thumb.webp`]) {
    try {
      unlinkSync(join(uploadsDir(), f))
    } catch {
      // never written, or already gone
    }
  }
}

/** The Kie link handed over with an upload: https only, with a date it expires. */
function hostedOf(url: unknown, until: unknown): { hostedUrl: string; hostedUntil?: string } | null {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url) || url.length > 2048) return null
  const at = typeof until === 'string' || typeof until === 'number' ? Date.parse(String(until)) : Number.NaN
  return Number.isFinite(at) ? { hostedUrl: url, hostedUntil: new Date(at).toISOString() } : { hostedUrl: url }
}

/**
 * Keep a copy of one file uploaded through Studio. Images go through the same checks as an element image
 * (re-encoded only when too big or not PNG/JPG/WebP); videos and sounds are kept byte for byte once their
 * first bytes say what they are. `hosted` is the Kie link the board already got for it, if any.
 */
export async function saveUpload(file: { name: string; type?: string; bytes: Buffer }, hosted?: { url?: unknown; expiresAt?: unknown }): Promise<Upload> {
  const label = file.name ? `"${file.name.slice(0, 80)}"` : 'The file'
  if (!file.bytes.length) throw new LibraryError(`${label} is empty`)
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new LibraryError(`${label} is larger than 100 MB`)
  const media = sniffMedia(file.bytes, file.type ?? '')
  let prepared: { bytes: Buffer; ext: string; kind: UploadKind; thumb?: Buffer; width?: number; height?: number }
  if (media) prepared = { bytes: file.bytes, ext: media.ext, kind: media.kind }
  else {
    let img: PreparedImage
    try {
      img = await prepareImage(file.bytes, label)
    } catch {
      throw new LibraryError(`${label} isn't a picture, video or sound Trenchable can keep (PNG, JPG, WebP, MP4, MOV, WebM, MP3, WAV, M4A…)`)
    }
    prepared = { bytes: img.bytes, ext: img.ext, kind: 'image', thumb: img.thumb, width: img.width, height: img.height }
  }
  const hash = createHash('sha256').update(file.bytes).digest('hex')
  const link = hostedOf(hosted?.url, hosted?.expiresAt)
  const name = (file.name || 'upload').replace(/[\r\n\t]/g, ' ').trim().slice(0, 120) || 'upload'
  return queued('uploads', () => {
    const list = readUploads()
    const same = list.find((r) => r.hash === hash)
    if (same) {
      // One entry per file: a repeat upload moves it up and carries the newer Kie link.
      same.createdAt = now()
      same.name = name
      if (link) {
        same.hostedUrl = link.hostedUrl
        if (link.hostedUntil) same.hostedUntil = link.hostedUntil
        else delete same.hostedUntil
      }
      const rest = list.filter((r) => r !== same)
      writeJson(uploadsFile(), [same, ...rest])
      return toUpload(same)
    }
    let id = ''
    do id = `up-${randomBytes(6).toString('hex')}`
    while (list.some((r) => r.id === id))
    mkdirSync(uploadsDir(), { recursive: true })
    const fileName = `${id}.${prepared.ext}`
    writeBytes(join(uploadsDir(), fileName), prepared.bytes)
    if (prepared.thumb) writeBytes(join(uploadsDir(), `${id}-thumb.webp`), prepared.thumb)
    const rec: UploadRecord = {
      id,
      name,
      kind: prepared.kind,
      mime: MEDIA_TYPES[prepared.ext] ?? 'application/octet-stream',
      file: fileName,
      size: prepared.bytes.length,
      ...(prepared.width ? { width: prepared.width, height: prepared.height } : {}),
      createdAt: now(),
      ...(link ?? {}),
      hash,
      hasThumb: Boolean(prepared.thumb),
    }
    const next = [rec, ...list]
    for (const old of next.splice(MAX_UPLOADS)) dropUploadFiles(old)
    writeJson(uploadsFile(), next)
    return toUpload(rec)
  })
}

/** GET /uploads: a page of uploads, newest first, optionally only one kind. */
export function listUploads(opts: { offset?: number; limit?: number; kind?: string } = {}): { items: Upload[]; total: number } {
  const kind = opts.kind === 'image' || opts.kind === 'video' || opts.kind === 'audio' ? opts.kind : null
  const all = readUploads().filter((r) => !kind || r.kind === kind)
  const offset = Math.max(0, Math.floor(opts.offset ?? 0) || 0)
  const limit = Math.min(200, Math.max(1, Math.floor(opts.limit ?? 60) || 60))
  return { items: all.slice(offset, offset + limit).map(toUpload), total: all.length }
}

/** Forgets an upload and deletes its copy. Jobs that already used it keep their own Kie link. */
export function deleteUpload(id: string): Promise<void> {
  return queued('uploads', () => {
    if (!UPLOAD_ID_RE.test(id)) throw new LibraryError("That upload wasn't found", 404)
    const list = readUploads()
    const rec = list.find((r) => r.id === id)
    if (!rec) throw new LibraryError("That upload wasn't found", 404)
    writeJson(uploadsFile(), list.filter((r) => r !== rec))
    dropUploadFiles(rec)
  })
}

/** The file behind GET /uploads/files/:name, or null: only a listed upload's file or its thumbnail. */
export function uploadFile(name: string): { path: string; type: string } | null {
  const m = UPLOAD_FILE_RE.exec(name)
  if (!m) return null
  const rec = readUploads().find((r) => r.id === m[1])
  if (!rec) return null
  const wanted = m[2] ? (rec.hasThumb ? `${rec.id}-thumb.webp` : null) : rec.file
  if (!wanted || name !== wanted) return null
  const path = inside(uploadsDir(), [wanted])
  if (!path || !existsSync(path)) return null
  return { path, type: m[2] ? 'image/webp' : (MEDIA_TYPES[m[3] ?? ''] ?? rec.mime) }
}
