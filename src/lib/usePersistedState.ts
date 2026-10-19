import { useEffect, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

/**
 * localStorage への統一アクセス層。
 * - SSR / storage 無効環境では安全にフォールバック
 * - JSON の parse 失敗・容量超過は握りつぶしてフォールバック値を返す
 * - 既存キー名はそのまま使う（データ互換維持）
 */

function storageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && 'localStorage' in window
  } catch {
    return false
  }
}

/** 生文字列の読み出し（存在しない・アクセス不可なら null）。 */
export function readPersistedRaw(key: string): string | null {
  if (!storageAvailable()) return null
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/** 生文字列の保存。容量超過などの失敗は無視する。 */
export function writePersistedRaw(key: string, value: string): void {
  if (!storageAvailable()) return
  try {
    localStorage.setItem(key, value)
  } catch {
    // 保存できない場合は諦める（メモリ上の state は維持される）
  }
}

/** キーの削除。 */
export function removePersisted(key: string): void {
  if (!storageAvailable()) return
  try {
    localStorage.removeItem(key)
  } catch {
    // 削除失敗は無視
  }
}

/**
 * JSON 値の読み出し。parse 失敗・型不一致（validate が undefined を返す）は
 * fallback を返す。
 */
export function readPersistedJson<T>(
  key: string,
  fallback: T,
  validate?: (parsed: unknown) => T | undefined,
): T {
  const raw = readPersistedRaw(key)
  if (raw === null) return fallback
  try {
    const parsed = JSON.parse(raw) as unknown
    if (validate) return validate(parsed) ?? fallback
    return parsed as T
  } catch {
    return fallback
  }
}

/** JSON 値の保存。失敗は無視する。 */
export function writePersistedJson(key: string, value: unknown): void {
  try {
    writePersistedRaw(key, JSON.stringify(value))
  } catch {
    // 循環参照など serialize 失敗は無視
  }
}

/**
 * localStorage に JSON で永続化される useState。
 * 初期値は storage から読み出し（legacyKey があれば旧キーもフォールバック参照）、
 * 以後 state の変更ごとに書き戻す。
 */
export function usePersistedState<T>(
  key: string,
  initialValue: T,
  options?: {
    legacyKey?: string
    validate?: (parsed: unknown) => T | undefined
  },
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    const raw = readPersistedRaw(key) ??
      (options?.legacyKey ? readPersistedRaw(options.legacyKey) : null)
    if (raw === null) return initialValue
    try {
      const parsed = JSON.parse(raw) as unknown
      if (options?.validate) return options.validate(parsed) ?? initialValue
      return parsed as T
    } catch {
      return initialValue
    }
  })

  useEffect(() => {
    writePersistedJson(key, value)
  }, [key, value])

  return [value, setValue]
}
