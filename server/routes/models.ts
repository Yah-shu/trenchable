import { Hono } from 'hono'
import type { ModelCategory } from '../kie/types.ts'
import { listMergedModels } from '../catalog/models.ts'
import { syncCatalog } from '../catalog/sync.ts'

const VALID_CATEGORIES = new Set<ModelCategory>(['image', 'video', 'audio'])

export const modelsRoutes = new Hono()

modelsRoutes.post('/models/sync', async (c) => {
  try {
    const result = await syncCatalog({ force: true, quiet: true })
    if (result.skipped) {
      return c.json({ data: { synced: false, reason: result.reason } })
    }
    return c.json({
      data: {
        synced: true,
        modelCount: result.catalog?.models.length ?? 0,
        syncedAt: result.catalog?.syncedAt ?? null,
      },
    })
  } catch (err) {
    console.error('[models] manual sync failed', err)
    return c.json(
      { error: err instanceof Error ? err.message : 'Sync failed' },
      500,
    )
  }
})

modelsRoutes.get('/models', async (c) => {
  const merged = await listMergedModels()
  if (!merged) {
    return c.json(
      {
        error:
          'Catalog not found. Wait for startup sync or run npm run sync:models',
      },
      503,
    )
  }

  const categoryRaw = c.req.query('category')
  if (categoryRaw && !VALID_CATEGORIES.has(categoryRaw as ModelCategory)) {
    return c.json({ error: 'category must be image, video or audio' }, 400)
  }
  const category = categoryRaw as ModelCategory | undefined
  const models = category
    ? merged.models.filter((m) => m.category === category)
    : merged.models

  return c.json({
    data: {
      syncedAt: merged.syncedAt,
      source: merged.source,
      models,
    },
  })
})