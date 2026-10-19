import type { MediaAsset, MediaKind, TaskState } from '../types.ts'

/** kie.ai API の共通レスポンス封筒 */
export type KieResponse = { code?: number; msg?: string; data?: unknown }

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

export function urlsFrom(value: unknown): string[] {
  if (typeof value === 'string') return value ? [value] : []
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

export function mediaFromUrls(urls: string[], kind: MediaKind): MediaAsset[] {
  return urls.map((url) => ({ kind, url }))
}

export function uniqueUrls(media: MediaAsset[]): string[] {
  return [...new Set(media.flatMap((asset) => {
    const value = asset.url ?? asset.streamUrl
    return value ? [value] : []
  }))]
}

export function normalizeEpoch(value: unknown): number | undefined {
  const number = asNumber(value)
  if (number === undefined) return undefined
  return number < 1e12 ? number * 1000 : number
}

/**
 * kie.ai のタスク詳細ペイロードを展開する。
 * `{ data: { response: ... } }` 入れ子・フラットのどちらの形でも
 * data / response を取り出せる（suno / veo / runway 共通）。
 */
export function unwrapKiePayload(payload: unknown): {
  data: Record<string, unknown>
  response: Record<string, unknown>
} {
  const envelope = asRecord(payload) ?? {}
  const data = asRecord(envelope.data) ?? envelope
  const response = asRecord(data.response) ?? data
  return { data, response }
}

/** 失敗ステータス時の共通判定: メディアが一部あれば partial、なければ fail */
export function failOrPartial(mediaCount: number): TaskState {
  return mediaCount > 0 ? 'partial' : 'fail'
}

/** 不明ステータス時の共通判定: メディアが一部あれば partial、なければ unknown */
export function unknownOrPartial(mediaCount: number): TaskState {
  return mediaCount > 0 ? 'partial' : 'unknown'
}

/** create 応答から taskId（`taskId` または `id`）を取り出す */
export function taskIdFrom(
  data: Record<string, unknown> | undefined,
): string | undefined {
  return asString(data?.taskId) ?? asString(data?.id)
}
