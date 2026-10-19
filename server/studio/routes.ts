/**
 * Generation Studio's own API, mounted under /api/studio.
 *
 * Studio runs jobs through the shared Kie routes (/api/generate, /api/task, /api/history,
 * /api/upload); what lives here is only what those cannot hold: the credit price list
 * the library of reusable Elements and Projects, and the result actions (favourite one
 * row, zip archived files) the shared history routes don't do.
 */
import { Hono } from 'hono'
import { pricingRoutes } from './pricing-routes.ts'
import { libraryRoutes } from './library-routes.ts'
import { resultsRoutes } from './results-routes.ts'

export const studioRoutes = new Hono()

studioRoutes.route('/studio', pricingRoutes)
studioRoutes.route('/studio', libraryRoutes)
studioRoutes.route('/studio', resultsRoutes)
studioRoutes.route('/studio', (await import('./dub-routes.ts')).dubRoutes)
studioRoutes.route('/studio', (await import('./localtools-routes.ts')).localToolRoutes)
