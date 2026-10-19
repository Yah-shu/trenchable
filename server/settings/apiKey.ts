import { getSetting, setSetting } from '../db/settings.ts'
import { decryptSecret, encryptSecret } from './secretBox.ts'

/** Settings key under which the KIE API key is persisted. */
export const KIE_API_KEY_SETTING = 'KIE_API_KEY'

const PLACEHOLDER = 'your_api_key_here'

function normalize(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed || trimmed === PLACEHOLDER) return null
  return trimmed
}

/** Decrypt the persisted API key, tolerating legacy plaintext and corruption. */
function readStoredSetting(): string | null {
  const stored = getSetting(KIE_API_KEY_SETTING)
  if (stored === null) return null
  try {
    return decryptSecret(stored)
  } catch {
    // Wrong key or tampered payload: treat as no usable stored key.
    return null
  }
}

/**
 * Resolve the effective KIE API key.
 * Priority: persisted setting (app_settings) → KIE_API_KEY env var.
 */
export function getStoredApiKey(): string | null {
  return normalize(readStoredSetting()) ?? normalize(process.env.KIE_API_KEY)
}

/** Persist the API key, encrypted at rest. */
export function setStoredApiKey(key: string): void {
  setSetting(KIE_API_KEY_SETTING, encryptSecret(key))
}

/** Whether a key is persisted in the store (independent of the env fallback). */
export function hasStoredApiKeyInStore(): boolean {
  return normalize(readStoredSetting()) !== null
}

/** Whether a usable key exists from either the store or the environment. */
export function hasUsableApiKey(): boolean {
  return getStoredApiKey() !== null
}

/** Mask a key for display, e.g. `••••1234`. */
export function maskApiKey(key: string): string {
  const tail = key.slice(-4)
  return `${'\u2022'.repeat(4)}${tail}`
}
