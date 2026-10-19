import { getSetting, setSetting, deleteSetting } from '../db/settings.ts'
import { decryptSecret, encryptSecret } from './secretBox.ts'
import { maskApiKey } from './apiKey.ts'
import {
  getBuiltinLlmProvider,
  isBuiltinLlmProvider,
  type BuiltinLlmProvider,
  type CustomLlmEndpoint,
} from '../../src/lib/models/llmProviders.ts'

/** A custom endpoint as persisted — the endpoint definition plus its key. */
export interface StoredCustomLlmEndpoint extends CustomLlmEndpoint {
  apiKey: string
}

export interface DefaultLlmModel {
  provider: string
  model: string
}

/** Preferred model id per provider (builtin id or `custom-<endpointId>`). */
export type PreferredLlmModels = Record<string, string>

const CUSTOM_ENDPOINTS_SETTING = 'LLM_CUSTOM_ENDPOINTS'
const DEFAULT_MODEL_SETTING = 'LLM_DEFAULT_MODEL'
const PREFERRED_MODELS_SETTING = 'LLM_PREFERRED_MODELS'

function keySettingName(provider: BuiltinLlmProvider): string {
  return `LLM_API_KEY_${provider.toUpperCase()}`
}

function normalizeKey(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function readStoredSecret(setting: string): string | null {
  const stored = getSetting(setting)
  if (stored === null) return null
  try {
    return decryptSecret(stored)
  } catch {
    return null
  }
}

/** Resolve an LLM API key. Priority: persisted setting → provider env var. */
export function getLlmApiKey(provider: BuiltinLlmProvider): string | null {
  const stored = normalizeKey(readStoredSecret(keySettingName(provider)))
  if (stored) return stored
  const info = getBuiltinLlmProvider(provider)
  return info ? normalizeKey(process.env[info.envVar]) : null
}

export function setLlmApiKey(provider: BuiltinLlmProvider, key: string): void {
  setSetting(keySettingName(provider), encryptSecret(key))
}

export function deleteLlmApiKey(provider: BuiltinLlmProvider): boolean {
  return deleteSetting(keySettingName(provider))
}

export function hasStoredLlmApiKey(provider: BuiltinLlmProvider): boolean {
  return normalizeKey(readStoredSecret(keySettingName(provider))) !== null
}

export { maskApiKey }

/** Read the encrypted custom endpoint list. Corrupt payloads read as empty. */
export function getCustomLlmEndpoints(): StoredCustomLlmEndpoint[] {
  const raw = readStoredSecret(CUSTOM_ENDPOINTS_SETTING)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry): StoredCustomLlmEndpoint[] => {
      if (!entry || typeof entry !== 'object') return []
      const e = entry as Record<string, unknown>
      if (
        typeof e.id !== 'string' ||
        typeof e.label !== 'string' ||
        (e.kind !== 'openai-compatible' && e.kind !== 'anthropic-compatible') ||
        typeof e.baseUrl !== 'string' ||
        typeof e.apiKey !== 'string' ||
        !Array.isArray(e.models)
      ) {
        return []
      }
      return [
        {
          id: e.id,
          label: e.label,
          kind: e.kind,
          baseUrl: e.baseUrl,
          apiKey: e.apiKey,
          models: e.models.filter((m): m is string => typeof m === 'string'),
        },
      ]
    })
  } catch {
    return []
  }
}

export function setCustomLlmEndpoints(endpoints: StoredCustomLlmEndpoint[]): void {
  setSetting(CUSTOM_ENDPOINTS_SETTING, encryptSecret(JSON.stringify(endpoints)))
}

/** Default model for new agent conversations (plaintext, not a secret). */
export function getDefaultLlmModel(): DefaultLlmModel | null {
  const raw = getSetting(DEFAULT_MODEL_SETTING)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const p = parsed as Record<string, unknown>
    if (typeof p.provider !== 'string' || typeof p.model !== 'string') return null
    if (!p.provider || !p.model) return null
    return { provider: p.provider, model: p.model }
  } catch {
    return null
  }
}

export function setDefaultLlmModel(value: DefaultLlmModel): void {
  setSetting(DEFAULT_MODEL_SETTING, JSON.stringify(value))
}

/** Preferred model per provider for new conversations (plaintext). */
export function getPreferredLlmModels(): PreferredLlmModels {
  const raw = getSetting(PREFERRED_MODELS_SETTING)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: PreferredLlmModels = {}
    for (const [provider, model] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof provider !== 'string' || !provider.trim()) continue
      if (typeof model !== 'string' || !model.trim()) continue
      out[provider.trim()] = model.trim()
    }
    return out
  } catch {
    return {}
  }
}

export function setPreferredLlmModel(provider: string, model: string): PreferredLlmModels {
  const next = { ...getPreferredLlmModels(), [provider.trim()]: model.trim() }
  setSetting(PREFERRED_MODELS_SETTING, JSON.stringify(next))
  return next
}

export function isKnownLlmProvider(id: string): boolean {
  return isBuiltinLlmProvider(id)
}