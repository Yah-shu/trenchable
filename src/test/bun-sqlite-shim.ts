import { createRequire } from 'node:module'
import type BetterSqlite3 from 'better-sqlite3'

/**
 * Test-only shim that emulates the subset of the `bun:sqlite` API used by the
 * server (`server/db/*`) on top of `better-sqlite3`, so Vitest can run under
 * Node where `bun:sqlite` is unavailable. Wired via the `bun:sqlite` alias in
 * `vitest.config.ts`.
 *
 * Both drivers accept bare-key named parameters (`@name` in SQL bound with
 * `{ name }`), positional `?` params, `.exec()`, `.prepare().run/get/all`, and
 * `.transaction()`, so the wrapped database is behaviourally equivalent for our
 * usage. The `strict` option is accepted (and ignored) for parity with
 * `bun:sqlite`.
 *
 * better-sqlite3 builds native code and is an optional dependency, so it is
 * loaded only when a test really opens a database: tests that merely import a
 * module using the DB still run on a computer without C++ build tools.
 */
const require = createRequire(import.meta.url)

function driver(): typeof BetterSqlite3 {
  try {
    return require('better-sqlite3') as typeof BetterSqlite3
  } catch {
    throw new Error('This test opens a database, which needs better-sqlite3. It builds native code: install your platform’s C++ build tools, then run npm install again.')
  }
}

type Db = BetterSqlite3.Database & { query: (sql: string) => BetterSqlite3.Statement }

export class Database {
  constructor(filename: string, _options?: { strict?: boolean }) {
    const Driver = driver()
    const db = new Driver(filename) as Db
    /** `bun:sqlite` exposes `query()` as a cached `prepare()`. */
    db.query = (sql: string) => db.prepare(sql)
    return db as unknown as Database
  }
}
