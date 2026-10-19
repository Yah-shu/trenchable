import { createApp } from './app.ts'
import { startRuntimeCatalogSync } from './catalog/runtime-sync.ts'
import { getDb, getDbPath } from './db/open.ts'
import { startBackfill } from './media/backfill.ts'

// Bun auto-loads `.env` from the project root, so no explicit dotenv step is
// needed here. This entry is intentionally thin: it starts the shared Hono app
// (see `server/app.ts`) via `Bun.serve` for local development. The packaged
// desktop build boots the same app from `src/bun/index.ts`.

const app = createApp()
const port = Number(process.env.PORT || 8787)

const server = Bun.serve({
  fetch: (req) => app.fetch(req),
  port,
  hostname: '127.0.0.1',
})

process.env.STUDIO_API_BASE = `http://127.0.0.1:${server.port}`

console.log(`KIE STUDIO API listening on http://127.0.0.1:${server.port}`)

try {
  getDb()
  console.log(`[history] SQLite ready at ${getDbPath()}`)
} catch (err) {
  console.error('[history] failed to open SQLite', err)
}

startRuntimeCatalogSync('dev')

// Backfill: download media for existing history items that lack localPath.
startBackfill()
