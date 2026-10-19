import { zValidator } from '@hono/zod-validator'
import type { ZodType } from 'zod'

/** zod / zod core 両方のエラーを受けられる最小限の構造型 */
interface IssueHolder {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>
}

/**
 * zod の検証エラーを既存 API と同じ `{ error: string }` 形式に変換するための
 * メッセージ整形。先頭の issue のみ返す（既存の早期 return 挙動に合わせる）。
 */
export function firstIssueMessage(error: IssueHolder): string {
  const issue = error.issues[0]
  if (!issue) return 'Invalid request'
  const path = issue.path.map((p) => String(p)).join('.')
  // カスタムメッセージが既にフィールド名を含む場合は重複させない
  if (!path || issue.message.startsWith(path)) return issue.message
  return `${path}: ${issue.message}`
}

/** JSON ボディ検証。失敗時は `{ error: string }` の 400 を返す */
export function validateJson<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: firstIssueMessage(result.error) }, 400)
    }
  })
}

/** クエリパラメータ検証。失敗時は `{ error: string }` の 400 を返す */
export function validateQuery<T extends ZodType>(schema: T) {
  return zValidator('query', schema, (result, c) => {
    if (!result.success) {
      return c.json({ error: firstIssueMessage(result.error) }, 400)
    }
  })
}
