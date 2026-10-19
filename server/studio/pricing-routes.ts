import { Hono } from 'hono'
import { listHistory } from '../db/history.ts'
import { getPriceList, learnedPrices, type LearnedPrice, type PriceList } from './pricing.ts'

/**
 * Credit prices (GET /api/studio/pricing): Kie's price list plus what Kie actually charged for past jobs.
 * Either half can be missing without failing the other — a list with no history still prices a first job,
 * and past charges still price familiar jobs while Kie's list is unreachable (fetchedAt is then null).
 */
export const pricingRoutes = new Hono()

/** History rows read for learned prices; newest first, so this is "the last few thousand jobs". */
const HISTORY_DEPTH = 5000

pricingRoutes.get('/pricing', async (c) => {
  let list: PriceList = { fetchedAt: null, rows: [] }
  let listError: string | null = null
  try {
    list = await getPriceList()
  } catch (e) {
    listError = (e as Error).message
  }
  let learned: LearnedPrice[] = []
  let historyError: string | null = null
  try {
    learned = learnedPrices(listHistory({ limit: HISTORY_DEPTH }))
  } catch (e) {
    historyError = (e as Error).message
  }
  if (listError && historyError) {
    return c.json({ error: `${listError} Past charges could not be read either (${historyError}).` }, 502)
  }
  return c.json({ data: { fetchedAt: list.fetchedAt, rows: list.rows, learned } })
})
