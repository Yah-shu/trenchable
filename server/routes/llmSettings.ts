import { Hono } from 'hono'
import { z } from 'zod'
import { getDb } from '../db/open.ts'
import { validateJson } from './validation.ts'
import {
  deleteLlmApiKey,
  getCustomLlmEndpoints,
  getDefaultLlmModel,
  getLlmApiKey,
  getPreferredLlmModels,
  hasStoredLlmApiKey,
  maskApiKey,
  setCustomLlmEndpoints,
  setDefaultLlmModel,
  setLlmApiKey,
  setPreferredLlmModel,
} from '../settings/llmKeys.ts'
import {
  BUILTIN_LLM_PROVIDERS,
  isBuiltinLlmProvider,
} from '../../src/lib/models/llmProviders.ts'
import type { StoredCustomLlmEndpoint } from '../settings/llmKeys.ts'

export const llmSettingsRoutes = new Hono()

// Ensure DB is open when routes load
getDb()

const keyBodySchema = z.object({
  provider: z
    .string({ error: 'provider is required' })
    .min(1, 'provider is required')
    .refine(isBuiltinLlmProvider, 'unknown provider'),
  apiKey: z
    .string({ error: 'apiKey is required' })
    .trim()
    .min(1, 'apiKey is required'),
})

const endpointSchema = z.object({
  id: z
    .string({ error: 'id is required' })
    .trim()
    .min(1, 'id is required')
    .regex(/^[a-z0-9-]+$/, 'id must be lowercase letters, numbers and hyphens'),
  label: z.string({ error: 'label is required' }).trim().min(1, 'label is required'),
  kind: z.enum(['openai-compatible', 'anthropic-compatible']),
  baseUrl: z.url('baseUrl must be a valid URL'),
  models: z.array(z.string().trim().min(1)).min(1, 'models is required'),
  // Omitted (or empty) keeps the previously stored key for that endpoint id.
  apiKey: z.string().trim().optional(),
})

const endpointsBodySchema = z.object({
  endpoints: z.array(endpointSchema).max(20),
})

const defaultModelBodySchema = z.object({
  provider: z.string({ error: 'provider is required' }).trim().min(1, 'provider is required'),
  model: z.string({ error: 'model is required' }).trim().min(1, 'model is required'),
})

const preferredModelBodySchema = z.object({
  provider: z.string({ error: 'provider is required' }).trim().min(1, 'provider is required'),
  model: z.string({ error: 'model is required' }).trim().min(1, 'model is required'),
})

function maskedStored(endpoint: StoredCustomLlmEndpoint) {
  const { apiKey, ...rest } = endpoint
  return {
    ...rest,
    hasKey: apiKey.trim().length > 0,
    apiKeyMasked: apiKey.trim() ? maskApiKey(apiKey) : null,
  }
}

llmSettingsRoutes.get('/settings/llm', (c) => {
  const providers = BUILTIN_LLM_PROVIDERS.map((info) => {
    const key = getLlmApiKey(info.id)
    return {
      id: info.id,
      label: info.label,
      suggestedModels: info.suggestedModels,
      hasKey: key !== null,
      apiKeyMasked: key ? maskApiKey(key) : null,
      apiKeyFromStore: hasStoredLlmApiKey(info.id),
    }
  })
  const customEndpoints = getCustomLlmEndpoints().map(maskedStored)
  return c.json({
    data: {
      providers,
      customEndpoints,
      defaultModel: getDefaultLlmModel(),
      preferredModels: getPreferredLlmModels(),
    },
  })
})

llmSettingsRoutes.put('/settings/llm/key', validateJson(keyBodySchema), (c) => {
  const { provider, apiKey } = c.req.valid('json')
  setLlmApiKey(provider, apiKey)
  return c.json({ data: { hasKey: true, apiKeyMasked: maskApiKey(apiKey) } })
})

llmSettingsRoutes.delete('/settings/llm/key/:provider', (c) => {
  const provider = c.req.param('provider')
  if (!isBuiltinLlmProvider(provider)) {
    return c.json({ error: 'unknown provider' }, 400)
  }
  deleteLlmApiKey(provider)
  return c.json({ data: { hasKey: getLlmApiKey(provider) !== null } })
})

llmSettingsRoutes.put('/settings/llm/endpoints', validateJson(endpointsBodySchema), (c) => {
  const { endpoints } = c.req.valid('json')
  const existing = new Map(getCustomLlmEndpoints().map((e) => [e.id, e]))
  const seen = new Set<string>()
  const stored: StoredCustomLlmEndpoint[] = []
  for (const endpoint of endpoints) {
    if (seen.has(endpoint.id)) {
      return c.json({ error: `duplicate endpoint id: ${endpoint.id}` }, 400)
    }
    seen.add(endpoint.id)
    const apiKey = endpoint.apiKey?.trim() || existing.get(endpoint.id)?.apiKey || ''
    stored.push({ ...endpoint, apiKey })
  }
  setCustomLlmEndpoints(stored)
  return c.json({
    data: {
      customEndpoints: stored.map(maskedStored),
    },
  })
})

llmSettingsRoutes.put('/settings/llm/default-model', validateJson(defaultModelBodySchema), (c) => {
  setDefaultLlmModel(c.req.valid('json'))
  return c.json({ data: { defaultModel: c.req.valid('json') } })
})

llmSettingsRoutes.put(
  '/settings/llm/preferred-model',
  validateJson(preferredModelBodySchema),
  (c) => {
    const { provider, model } = c.req.valid('json')
    const preferredModels = setPreferredLlmModel(provider, model)
    return c.json({ data: { preferredModels } })
  },
)