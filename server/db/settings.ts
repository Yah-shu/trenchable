import { getDb } from './open.ts'

/** Read a single app setting, or `null` when unset. */
export function getSetting(key: string): string | null {
  const row = getDb()
    .prepare('SELECT value FROM app_settings WHERE key = ?')
    .get(key) as { value: string | null } | undefined
  return row?.value ?? null
}

/** Insert or update an app setting. */
export function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (@key, @value, @updated_at)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at`,
    )
    .run({ key, value, updated_at: Date.now() })
}

/** Remove an app setting. Returns true when a row was deleted. */
export function deleteSetting(key: string): boolean {
  return getDb().prepare('DELETE FROM app_settings WHERE key = ?').run(key).changes > 0
}
