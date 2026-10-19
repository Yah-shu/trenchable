/**
 * Sync Market IMAGE/VIDEO/AUDIO models from docs.kie.ai into src/data/catalog.json
 */
import { createHash } from 'node:crypto'
import { writeFile, mkdir, readFile, stat } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import {
  detectCategory,
  extractInputSchema,
  extractModelSlug,
  extractOpenApiFromMarkdown,
  inputSchemaToFields,
} from '../../src/lib/models/from-openapi.ts'
import type { Catalog, ModelDefinition } from '../../src/lib/models/types.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DEFAULT_CATALOG_PATH = resolve(__dirname, '../../src/data/catalog.json')

/**
 * Resolve the catalog file location.
 *
 * Desktop builds set STUDIO_CATALOG_PATH to a writable userData path because the
 * bundled source path is read-only (and catalog.json is not shipped inside the
 * app bundle). Dev/CLI leave it unset and fall back to the repo source file.
 */
export function getCatalogPath(): string {
  const override = process.env.STUDIO_CATALOG_PATH
  return override && override.length > 0 ? resolve(override) : DEFAULT_CATALOG_PATH
}
const LLMS_TXT = 'https://docs.kie.ai/llms.txt'
const FETCH_TIMEOUT_MS = 15_000
const DEFAULT_CONCURRENCY = 12
const FETCH_ATTEMPTS = 3
const FETCH_RETRY_DELAY_MS = 500
const MIN_CATALOG_RETENTION_RATIO = 0.7

const EXCLUDE_RE =
  /(suno|chat|claude|common-api|file-upload|webhook|quickstart|callback|cn\/|gpt-codex|\/gemini\/|\/grok\/grok-4|get-task-detail)/i

const VIDEO_HINT_RE =
  /(video|kling|seedance|hailuo|sora|wan\/|infinitalk|omnihuman|happyhorse|gemini-omni-flash|grok-imagine\/.*video)/i

const AUDIO_HINT_RE =
  /(audio|speech|voice|dialogue|tts|elevenlabs|music|sound|vocal|noise|stem)/i

function parseLlmsLinks(text: string): { title: string; url: string }[] {
  const links: { title: string; url: string }[] = []
  const re = /\[([^\]]+)\]\((https:\/\/docs\.kie\.ai\/[^)]+)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    links.push({ title: m[1]!, url: m[2]!.replace(/\.md$/, '') })
  }
  return links
}

function isMarketModelPage(url: string, title: string): boolean {
  if (!url.includes('/market/')) return false
  if (EXCLUDE_RE.test(url) || EXCLUDE_RE.test(title)) return false
  if (url.includes('/cn/')) return false
  return true
}

function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function resolveConcurrency(): number {
  const raw = process.env.SYNC_CONCURRENCY
  if (!raw) return DEFAULT_CONCURRENCY
  const n = Number.parseInt(raw, 10)
  if (!Number.isFinite(n) || n < 1) return DEFAULT_CONCURRENCY
  return Math.min(n, 32)
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: 'text/plain, text/markdown, */*' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`)
  return res.text()
}

export async function fetchTextWithRetry(
  url: string,
  attempts = FETCH_ATTEMPTS,
  delayMs = FETCH_RETRY_DELAY_MS,
): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await fetchText(url)
    } catch (error) {
      lastError = error
      if (attempt < attempts - 1) {
        await new Promise((resolvePromise) =>
          setTimeout(resolvePromise, delayMs),
        )
      }
    }
  }
  throw lastError
}

function pickBodySchema(
  doc: Record<string, unknown>,
): { schema: Record<string, unknown>; example?: unknown } | null {
  const paths = doc.paths as Record<string, Record<string, unknown>> | undefined
  if (!paths) return null
  for (const pathItem of Object.values(paths)) {
    const post = pathItem.post as Record<string, unknown> | undefined
    if (!post) continue
    const body = post.requestBody as Record<string, unknown> | undefined
    const content = body?.content as
      | Record<string, Record<string, unknown>>
      | undefined
    const json = content?.['application/json']
    const schema = json?.schema as Record<string, unknown> | undefined
    if (schema) return { schema, example: json?.example }
  }
  return null
}

async function parseModelPage(
  title: string,
  url: string,
  quiet: boolean,
): Promise<ModelDefinition | null> {
  const mdUrl = url.endsWith('.md') ? url : `${url}.md`
  let markdown: string
  try {
    markdown = await fetchTextWithRetry(mdUrl)
  } catch {
    try {
      markdown = await fetchText(url)
    } catch {
      if (!quiet) console.warn(`  skip (fetch): ${url}`)
      return null
    }
  }

  const yamlText = extractOpenApiFromMarkdown(markdown)
  if (!yamlText) {
    if (!quiet) console.warn(`  skip (no openapi): ${url}`)
    return null
  }

  let doc: Record<string, unknown>
  try {
    doc = parseYaml(yamlText) as Record<string, unknown>
  } catch {
    if (!quiet) console.warn(`  skip (yaml): ${url}`)
    return null
  }

  const body = pickBodySchema(doc)
  if (!body) {
    if (!quiet) console.warn(`  skip (no body): ${url}`)
    return null
  }

  const model = extractModelSlug(body.schema, body.example)
  if (!model) {
    if (!quiet) console.warn(`  skip (no model slug): ${url}`)
    return null
  }

  const input = extractInputSchema(body.schema)
  const fields = inputSchemaToFields(input)
  const hints = `${url} ${title} ${model}`
  const category = VIDEO_HINT_RE.test(hints)
    ? 'video'
    : AUDIO_HINT_RE.test(hints)
      ? 'audio'
      : detectCategory(`${url} ${title}`, model)

  return {
    id: model,
    model,
    title: title.replace(/\s+/g, ' ').trim(),
    category,
    provider: 'market',
    docsUrl: url,
    fields,
  }
}

/** Run async work over items with a fixed concurrency pool. */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  async function worker() {
    while (true) {
      const index = next++
      if (index >= items.length) return
      results[index] = await fn(items[index]!, index)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return results
}

/** In-memory catalog cache — avoids readFile+JSON.parse on every /api/models. */
let cachedCatalog: Catalog | null | undefined
let cachedCatalogMtimeMs: number | undefined

function setCachedCatalog(catalog: Catalog | null): void {
  cachedCatalog = catalog
}

export async function readCatalog(): Promise<Catalog | null> {
  const path = getCatalogPath()
  try {
    const info = await stat(path)
    if (
      cachedCatalog !== undefined &&
      cachedCatalogMtimeMs === info.mtimeMs
    ) return cachedCatalog
    const raw = await readFile(path, 'utf8')
    const catalog = JSON.parse(raw) as Catalog
    setCachedCatalog(catalog)
    cachedCatalogMtimeMs = info.mtimeMs
    return catalog
  } catch {
    setCachedCatalog(null)
    cachedCatalogMtimeMs = undefined
    return null
  }
}

export function catalogAgeMs(catalog: Catalog | null): number | null {
  if (!catalog?.syncedAt) return null
  const t = Date.parse(catalog.syncedAt)
  if (Number.isNaN(t)) return null
  return Date.now() - t
}

export interface SyncOptions {
  /** Skip network sync if catalog is fresher than this (ms). Default: 12h */
  maxAgeMs?: number
  /** Force sync even if fresh */
  force?: boolean
  /** Less console noise */
  quiet?: boolean
}

/** CLI flags for `npm run sync:models`. */
export function parseSyncCliArgs(argv: string[]): Pick<SyncOptions, 'force' | 'maxAgeMs'> {
  const force = argv.includes('--force')
  const ignoreAge = argv.includes('--ignore-age')
  return {
    force,
    maxAgeMs: force || ignoreAge ? 0 : undefined,
  }
}

export interface SyncResult {
  skipped: boolean
  reason?: string
  catalog?: Catalog
}

export async function syncCatalog(
  options: SyncOptions = {},
): Promise<SyncResult> {
  const maxAgeMs = options.maxAgeMs ?? 12 * 60 * 60 * 1000
  const quiet = options.quiet ?? false
  const existing = await readCatalog()

  if (!options.force) {
    const age = catalogAgeMs(existing)
    if (age !== null && age < maxAgeMs) {
      const hours = (age / 3_600_000).toFixed(1)
      return {
        skipped: true,
        reason: `catalog is fresh (${hours}h old)`,
        catalog: existing ?? undefined,
      }
    }
  }

  if (!quiet) console.log('[catalog] Fetching llms.txt...')
  const llmsStarted = Date.now()
  const llms = await fetchText(LLMS_TXT)
  const sourceHash = hashText(llms)
  if (!quiet) {
    console.log(
      `[catalog] llms.txt fetched in ${((Date.now() - llmsStarted) / 1000).toFixed(1)}s`,
    )
  }

  if (
    !options.force &&
    existing?.sourceHash &&
    existing.sourceHash === sourceHash
  ) {
    return {
      skipped: true,
      reason: 'llms.txt unchanged',
      catalog: existing,
    }
  }

  const links = parseLlmsLinks(llms).filter((l) =>
    isMarketModelPage(l.url, l.title),
  )

  const seen = new Set<string>()
  const unique = links.filter((l) => {
    if (seen.has(l.url)) return false
    seen.add(l.url)
    return true
  })

  const concurrency = resolveConcurrency()
  if (!quiet) {
    console.log(
      `[catalog] Found ${unique.length} candidate pages (concurrency=${concurrency})`,
    )
  }

  const pagesStarted = Date.now()
  let completed = 0
  const results = await mapPool(unique, concurrency, async (l) => {
    const model = await parseModelPage(l.title, l.url, quiet)
    completed++
    if (!quiet) {
      process.stdout.write(
        `  [${completed}/${unique.length}] ${l.title}\n`,
      )
    }
    return model
  })

  const models = results.filter((r): r is ModelDefinition => r !== null)
  const pagesElapsed = ((Date.now() - pagesStarted) / 1000).toFixed(1)
  if (!quiet) {
    console.log(
      `[catalog] Fetched ${unique.length} pages in ${pagesElapsed}s (${models.length} parsed)`,
    )
  }

  const byId = new Map<string, ModelDefinition>()
  for (const m of models) {
    const prev = byId.get(m.id)
    if (!prev) {
      byId.set(m.id, m)
      continue
    }
    const keep = m.fields.length > prev.fields.length ? m : prev
    const discard = keep === m ? prev : m
    if (!quiet) {
      console.warn(
        `[catalog] duplicate model id: ${m.id} (${discard.docsUrl} vs ${keep.docsUrl})`,
      )
    }
    byId.set(m.id, keep)
  }

  const sorted = [...byId.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category)
    return a.title.localeCompare(b.title)
  })

  const existingCount = existing?.models.length ?? 0
  if (
    shouldKeepExistingCatalog(
      existingCount,
      sorted.length,
      options.force ?? false,
    )
  ) {
    const reason = `parsed ${sorted.length} models but existing has ${existingCount}; kept existing catalog`
    if (!quiet) {
      console.warn(`[catalog] ${reason}`)
    }
    return {
      skipped: true,
      reason,
      catalog: existing!,
    }
  }

  const catalog: Catalog = {
    syncedAt: new Date().toISOString(),
    source: 'docs.kie.ai/llms.txt',
    sourceHash,
    models: sorted,
  }

  const catalogPath = getCatalogPath()
  await mkdir(dirname(catalogPath), { recursive: true })
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  setCachedCatalog(catalog)

  if (!quiet) {
    console.log(
      `[catalog] Wrote ${sorted.length} models (${sorted.filter((m) => m.category === 'image').length} image, ${sorted.filter((m) => m.category === 'video').length} video, ${sorted.filter((m) => m.category === 'audio').length} audio)`,
    )
  }

  return { skipped: false, catalog }
}

export function shouldKeepExistingCatalog(
  existingCount: number,
  nextCount: number,
  force: boolean,
): boolean {
  if (force || existingCount === 0) return false
  return nextCount < existingCount * MIN_CATALOG_RETENTION_RATIO
}

/**
 * Desktop userData catalog is seeded from the bundled snapshot. Reseed when
 * missing/unreadable, or when the bundle's syncedAt is strictly newer than
 * the file on disk (so app updates pick up new models). A userData catalog
 * that was network-synced later is left alone.
 */
export function shouldReseedCatalog(
  bundled: { syncedAt?: string | null },
  existing: { syncedAt?: string | null } | null,
): boolean {
  if (!existing) return true
  const bundledTime = bundled.syncedAt ? Date.parse(bundled.syncedAt) : Number.NaN
  const existingTime = existing.syncedAt ? Date.parse(existing.syncedAt) : Number.NaN
  if (Number.isNaN(bundledTime)) return false
  if (Number.isNaN(existingTime)) return true
  return bundledTime > existingTime
}
