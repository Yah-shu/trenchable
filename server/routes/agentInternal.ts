import { randomUUID } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { assertPlainObject } from '../kie/safe.ts'
import { KieApiError } from '../kie/client.ts'
import { getProviderAdapter } from '../kie/adapters/index.ts'
import { getCredits } from '../kie/common.ts'
import type { ModelDefinition, Operation, Provider } from '../kie/types.ts'
import { archiveTaskMedia } from '../media/archiver.ts'
import { listMergedModels } from '../catalog/models.ts'
import { getDb } from '../db/open.ts'
import {
  getHistoryItem,
  listHistory,
  updateMediaLocalPaths,
} from '../db/history.ts'
import { mirrorTaskIntoHistory, recordCreatedTask } from '../db/recordTask.ts'
import {
  getCustomLlmEndpoints,
  getDefaultLlmModel,
  getLlmApiKey,
} from '../settings/llmKeys.ts'
import { BUILTIN_LLM_PROVIDERS } from '../../src/lib/models/llmProviders.ts'
import { validateJson } from './validation.ts'

/**
 * Internal API consumed by in-process tools historically over loopback.
 * Kept for debugging / future external agents. The custom token header
 * forces a CORS preflight, so arbitrary web pages cannot read this API
 * cross-origin. The token is STUDIO_AGENT_TOKEN; the packaged desktop
 * generates one per boot.
 */
export const INTERNAL_TOKEN_ENV = 'STUDIO_AGENT_TOKEN'
export const INTERNAL_TOKEN_DEFAULT = 'kie-studio-agent-dev'
// Never fall back to the well-known default: it would be guessable by any
// page that can reach the loopback API. Random per process instead.
const FALLBACK_TOKEN = randomUUID()

export const agentInternalRoutes = new Hono()

// Ensure DB is open when routes load
getDb()

agentInternalRoutes.use('/internal/*', async (c, next) => {
  const expected = process.env[INTERNAL_TOKEN_ENV] ?? FALLBACK_TOKEN
  if (c.req.header('x-studio-agent-token') !== expected) {
    return c.json({ error: 'forbidden' }, 403)
  }
  return next()
})

/** Decrypted LLM credentials for provider registration in the agent server. */
agentInternalRoutes.get('/internal/agent/credentials', (c) => {
  const providers = BUILTIN_LLM_PROVIDERS.flatMap((info) => {
    const apiKey = getLlmApiKey(info.id)
    return apiKey ? [{ id: info.id, apiKey }] : []
  })
  return c.json({
    data: {
      providers,
      customEndpoints: getCustomLlmEndpoints(),
      defaultModel: getDefaultLlmModel(),
    },
  })
})

function workflowSummary(model: ModelDefinition) {
  return {
    id: model.id,
    model: model.model,
    title: model.title,
    category: model.category,
    provider: model.provider,
    operation: model.operation,
    useCase: model.useCase ?? null,
    tags: model.tags ?? [],
    requiredFields: model.fields.filter((f) => f.required).map((f) => f.name),
    optionalFields: model.fields.filter((f) => !f.required).map((f) => f.name),
    docsUrl: model.docsUrl ?? null,
  }
}

agentInternalRoutes.get('/internal/agent/workflows', async (c) => {
  const merged = await listMergedModels()
  if (!merged) {
    return c.json(
      { error: 'Catalog not found. Wait for startup sync or run npm run sync:models' },
      503,
    )
  }
  const category = c.req.query('category')
  const capability = c.req.query('capability')?.toLowerCase()
  const q = c.req.query('q')?.toLowerCase()
  let models = merged.models
  if (category === 'image' || category === 'video' || category === 'audio') {
    models = models.filter((m) => m.category === category)
  }
  if (capability) {
    models = models.filter((m) =>
      `${m.title} ${m.useCase ?? ''} ${(m.tags ?? []).join(' ')} ${m.model}`
        .toLowerCase()
        .includes(capability),
    )
  }
  if (q) {
    models = models.filter((m) =>
      `${m.id} ${m.title} ${m.model} ${(m.tags ?? []).join(' ')}`
        .toLowerCase()
        .includes(q),
    )
  }
  return c.json({ data: { items: models.map(workflowSummary) } })
})

/** Full input schema of one workflow — call before generating. */
agentInternalRoutes.get('/internal/agent/workflow-schema', async (c) => {
  const id = c.req.query('id')
  if (!id) return c.json({ error: 'id is required' }, 400)
  const merged = await listMergedModels()
  if (!merged) {
    return c.json(
      { error: 'Catalog not found. Wait for startup sync or run npm run sync:models' },
      503,
    )
  }
  const model =
    merged.models.find((m) => m.id === id) ??
    merged.models.find((m) => m.model === id)
  if (!model) return c.json({ error: `workflow not found: ${id}` }, 404)
  return c.json({ data: model })
})

const generateBodySchema = z.object({
  provider: z.enum(['market', 'suno', 'veo', 'runway']).default('market'),
  operation: z
    .enum([
      'generate',
      'extend',
      'upload-cover',
      'upload-extend',
      'replace-section',
      'cover-art',
      'lyrics',
      'upscale-1080p',
      'upscale-4k',
      'aleph',
    ])
    .default('generate'),
  model: z.string({ error: 'model is required' }).min(1, 'model is required'),
  input: z.unknown(),
  workflowId: z.string().optional(),
  title: z.string().optional(),
})

/** Create a generation task AND record it in history (server-side). */
agentInternalRoutes.post('/internal/agent/generate', validateJson(generateBodySchema), async (c) => {
  const body = c.req.valid('json')
  try {
    assertPlainObject(body.input, 'input')
  } catch (e) {
    if (e instanceof KieApiError) return c.json({ error: e.message }, 400)
    throw e
  }

  const adapter = getProviderAdapter(body.provider)
  const created = await adapter.create({
    provider: body.provider,
    operation: body.operation,
    model: body.model,
    input: body.input as Record<string, unknown>,
  })

  await recordCreatedTask({
    provider: body.provider,
    operation: body.operation,
    model: body.model,
    input: body.input as Record<string, unknown>,
    created,
    workflowId: body.workflowId,
    title: body.title,
  })

  return c.json({ data: { taskId: created.taskId } })
})

/** Normalized task status; archives media and mirrors results into history. */
agentInternalRoutes.get('/internal/agent/task', async (c) => {
  const taskId = c.req.query('taskId')
  if (!taskId) return c.json({ error: 'taskId is required' }, 400)
  const provider = (c.req.query('provider') ?? 'market') as Provider
  const operation = (c.req.query('operation') ?? 'generate') as Operation
  const task = await getProviderAdapter(provider).getTask(taskId, operation)

  if (
    (task.state === 'success' || task.state === 'partial') &&
    task.media.some((m) => (m.url ?? m.streamUrl) && !m.localPath)
  ) {
    void archiveTaskMedia(taskId, task.media)
      .then((archived) => updateMediaLocalPaths(taskId, archived))
      .catch((err) => console.error('[media-archive]', taskId, err))
  }

  mirrorTaskIntoHistory(task)

  return c.json({ data: task })
})

agentInternalRoutes.get('/internal/agent/history', (c) => {
  const q = c.req.query('q')?.toLowerCase()
  const category = c.req.query('category')
  const limitRaw = Number.parseInt(c.req.query('limit') ?? '10', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 10
  let items = listHistory()
  if (category === 'image' || category === 'video' || category === 'audio') {
    items = items.filter((item) => item.category === category)
  }
  if (q) {
    items = items.filter((item) =>
      `${item.taskId} ${item.model} ${item.prompt ?? ''}`.toLowerCase().includes(q),
    )
  }
  return c.json({
    data: {
      items: items.slice(0, limit).map((item) => ({
        taskId: item.taskId,
        model: item.model,
        category: item.category,
        state: item.state,
        createdAt: item.createdAt,
        resultUrls: item.resultUrls ?? [],
        prompt: item.prompt?.slice(0, 200) ?? null,
        provider: item.provider ?? 'market',
        operation: item.operation ?? 'generate',
      })),
    },
  })
})

/** Stored input of one task — the base for extend / regenerate requests. */
agentInternalRoutes.get('/internal/agent/history/:taskId/input', (c) => {
  const item = getHistoryItem(c.req.param('taskId'))
  if (!item) return c.json({ error: 'Task not found' }, 404)
  return c.json({
    data: {
      taskId: item.taskId,
      model: item.model,
      modelId: item.modelId ?? null,
      provider: item.provider ?? 'market',
      operation: item.operation ?? 'generate',
      input: item.input ?? null,
      prompt: item.prompt ?? null,
      state: item.state,
    },
  })
})

agentInternalRoutes.get('/internal/agent/credits', async (c) => {
  const credits = await getCredits()
  return c.json({ data: { credits } })
})