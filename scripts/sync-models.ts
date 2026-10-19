/**
 * CLI: npm run sync:models
 *
 * --force       skip freshness, llms.txt hash, and 70% shrink protection
 * --ignore-age  skip the 12h freshness window only (CI / release)
 */
import { parseSyncCliArgs, syncCatalog } from '../server/catalog/sync.ts'

const { force, maxAgeMs } = parseSyncCliArgs(process.argv.slice(2))

syncCatalog({ force, maxAgeMs, quiet: false })
  .then((result) => {
    if (result.skipped) {
      console.log(`Skipped: ${result.reason}`)
      if (!force) console.log('Use --force to sync anyway.')
      return
    }
    console.log('Done.')
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
