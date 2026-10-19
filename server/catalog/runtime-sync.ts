import { syncCatalog } from './sync.ts'

/** How often a packaged desktop process re-checks docs.kie.ai while running. */
export const DESKTOP_CATALOG_REFRESH_MS = 6 * 60 * 60 * 1000

export type CatalogRuntimeKind = 'dev' | 'desktop'

export function runtimeCatalogSyncOptions(kind: CatalogRuntimeKind): {
  force: boolean
  maxAgeMs?: number
} {
  const force = process.env.SYNC_MODELS_FORCE === '1'
  return {
    force,
    maxAgeMs: force || kind === 'desktop' ? 0 : undefined,
  }
}

function logResult(
  label: string,
  result: { skipped: boolean; reason?: string; catalog?: { models: unknown[] } },
): void {
  if (result.skipped) {
    console.log(`[catalog] ${label}: ${result.reason}`)
    return
  }
  console.log(
    `[catalog] ${label} done (${result.catalog?.models.length ?? 0} models)`,
  )
}

/**
 * Non-blocking catalog refresh. Dev keeps the 12h freshness window so watch
 * restarts stay cheap. Packaged desktop always checks llms.txt (same as CI
 * `--ignore-age`) and repeats on an interval so installed builds pick up new
 * Market models without waiting for an app update.
 */
export function startRuntimeCatalogSync(kind: CatalogRuntimeKind): void {
  if (process.env.SYNC_MODELS_ON_START === '0') {
    console.log('[catalog] startup sync disabled (SYNC_MODELS_ON_START=0)')
    return
  }

  const run = (label: string) => {
    const options = runtimeCatalogSyncOptions(kind)
    void syncCatalog({ ...options, quiet: false })
      .then((result) => logResult(label, result))
      .catch((err) => {
        console.warn(`[catalog] ${label} failed (using existing catalog):`, err)
      })
  }

  run('startup')
  if (kind !== 'desktop') return

  const timer = setInterval(() => run('interval'), DESKTOP_CATALOG_REFRESH_MS)
  timer.unref?.()
}
