/**
 * LLM provider catalog for the studio agent mode.
 * Shared by the server settings helpers and the frontend model picker.
 * No secrets live here — keys are stored encrypted in SQLite (server) and
 * never reach the frontend.
 */

export type BuiltinLlmProvider = 'google' | 'xai' | 'openai' | 'anthropic' | 'alibaba'

export type CustomLlmEndpointKind = 'openai-compatible' | 'anthropic-compatible'

/** A user-configured OpenAI-/Anthropic-compatible endpoint (GUI 設定). */
export interface CustomLlmEndpoint {
  id: string
  label: string
  kind: CustomLlmEndpointKind
  baseUrl: string
  models: string[]
}

export interface BuiltinLlmProviderInfo {
  id: BuiltinLlmProvider
  label: string
  /** Env var consulted when no key is stored (server-side fallback). */
  envVar: string
  /** Curated model ids for the picker. Free-form input is allowed too. */
  suggestedModels: string[]
}

export const BUILTIN_LLM_PROVIDERS: readonly BuiltinLlmProviderInfo[] = [
  {
    id: 'google',
    label: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
    suggestedModels: [
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.1-pro-preview',
      'gemini-3-pro-preview',
      'gemini-2.5-pro',
    ],
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    envVar: 'XAI_API_KEY',
    suggestedModels: ['grok-4.5', 'grok-4.3'],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    suggestedModels: ['gpt-5.5', 'gpt-5.4', 'gpt-5.3', 'gpt-5.2', 'gpt-5-mini'],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    envVar: 'ANTHROPIC_API_KEY',
    suggestedModels: [
      'claude-sonnet-4-6',
      'claude-opus-4-8',
      'claude-haiku-4-5',
      'claude-sonnet-5',
      'claude-opus-5',
    ],
  },
  {
    id: 'alibaba',
    label: 'Alibaba (DashScope)',
    envVar: 'DASHSCOPE_API_KEY',
    suggestedModels: ['qwen3-max', 'qwen-plus', 'qwen-flash'],
  },
] as const

const BUILTIN_IDS = new Set<string>(BUILTIN_LLM_PROVIDERS.map((p) => p.id))

export function isBuiltinLlmProvider(id: string): id is BuiltinLlmProvider {
  return BUILTIN_IDS.has(id)
}

export function getBuiltinLlmProvider(id: string): BuiltinLlmProviderInfo | undefined {
  return BUILTIN_LLM_PROVIDERS.find((p) => p.id === id)
}

/** Provider id used for custom endpoints in model specifiers: `custom-<endpointId>`. */
export function customEndpointProviderId(endpointId: string): string {
  return `custom-${endpointId}`
}

/** Fallback model for new agent conversations when no default is configured. */
export const FALLBACK_AGENT_MODEL = {
  provider: 'google' as BuiltinLlmProvider,
  model: 'gemini-3.6-flash',
}