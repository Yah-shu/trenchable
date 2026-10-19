// Minimal ambient declarations for the Bun runtime primitives used by the
// server and the Electrobun main process. The project develops/builds under
// Bun, but type-checking runs under Node where `bun-types` is not installed,
// so we declare only the surface we actually consume. If `bun-types` is added
// later these can be removed.

declare module 'bun:sqlite' {
  export interface RunResult {
    changes: number
    lastInsertRowid: number | bigint
  }

  export interface Statement {
    run(...params: unknown[]): RunResult
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
    values(...params: unknown[]): unknown[][]
    finalize(): void
  }

  export interface DatabaseOptions {
    strict?: boolean
    readonly?: boolean
    create?: boolean
  }

  export class Database {
    constructor(filename?: string, options?: DatabaseOptions)
    exec(sql: string): void
    prepare(sql: string): Statement
    query(sql: string): Statement
    transaction<Args extends unknown[], R>(
      fn: (...args: Args) => R,
    ): (...args: Args) => R
    run(sql: string, ...params: unknown[]): RunResult
    close(): void
  }
}

declare namespace Bun {
  interface Server {
    readonly port: number
    readonly hostname: string
    readonly url: URL
    stop(closeActiveConnections?: boolean): void
  }

  interface ServeOptions {
    fetch: (request: Request) => Response | Promise<Response>
    port?: number | string
    hostname?: string
  }
}

declare const Bun: {
  serve(options: Bun.ServeOptions): Bun.Server
}
