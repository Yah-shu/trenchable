import { Hono } from 'hono'
import { z } from 'zod'
import {
  clearUnpinnedHistory,
  deleteHistoryItem,
  historyCount,
  importHistoryItems,
  listHistory,
  migrateHistoryItems,
  upsertHistoryItemsFromUnknown,
} from '../db/history.ts'
import { getDb } from '../db/open.ts'
import { validateJson, validateQuery } from './validation.ts'

export const historyRoutes = new Hono()

// Ensure DB is open when routes load
getDb()

const listQuerySchema = z.object({
  limit: z.coerce
    .number({ error: 'limit must be a non-negative integer' })
    .int('limit must be a non-negative integer')
    .nonnegative('limit must be a non-negative integer')
    .optional(),
  offset: z.coerce
    .number({ error: 'offset must be a non-negative integer' })
    .int('offset must be a non-negative integer')
    .nonnegative('offset must be a non-negative integer')
    .optional(),
})

// items の要素単位の検証は db 層（replaceAllFromUnknown など）が担う
const itemsBodySchema = z.object({ items: z.unknown() })

historyRoutes.get('/history', validateQuery(listQuerySchema), (c) => {
  const { limit, offset } = c.req.valid('query')
  return c.json({
    data: { items: listHistory({ limit, offset }), count: historyCount() },
  })
})

historyRoutes.put('/history', validateJson(itemsBodySchema), (c) => {
  const { items } = c.req.valid('json')
  try {
    const stored = upsertHistoryItemsFromUnknown(items)
    return c.json({ data: { items: stored, count: historyCount() } })
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'Failed to save history' },
      400,
    )
  }
})

historyRoutes.delete('/history/:taskId', (c) => {
  const taskId = c.req.param('taskId')
  if (!deleteHistoryItem(taskId)) {
    return c.json({ error: 'Task not found' }, 404)
  }
  return c.json({ data: { items: listHistory(), count: historyCount() } })
})

historyRoutes.post('/history/clear-unpinned', (c) => {
  const items = clearUnpinnedHistory()
  return c.json({ data: { items, count: historyCount() } })
})

historyRoutes.post('/history/import', validateJson(itemsBodySchema), (c) => {
  const { items } = c.req.valid('json')
  try {
    const stored = importHistoryItems(items)
    return c.json({ data: { items: stored } })
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'Failed to import history' },
      400,
    )
  }
})

historyRoutes.post('/history/migrate', validateJson(itemsBodySchema), (c) => {
  const { items } = c.req.valid('json')
  try {
    const stored = migrateHistoryItems(items)
    return c.json({ data: { items: stored } })
  } catch (e) {
    return c.json(
      { error: e instanceof Error ? e.message : 'Failed to migrate history' },
      400,
    )
  }
})
