import { Hono } from 'hono'
import { z } from 'zod'
import { assertPlainObject, assertSafeHttpsUrl } from '../kie/safe.ts'
import { KieApiError } from '../kie/client.ts'
import { getProviderAdapter } from '../kie/adapters/index.ts'
import { recordCreatedTask } from '../db/recordTask.ts'
import { validateJson } from './validation.ts'

export const generateRoutes = new Hono()

const generateSchema = z.object({
  model: z.string({ error: 'model is required' }).min(1, 'model is required'),
  input: z.unknown(),
  callBackUrl: z.string().optional(),
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
  workflowId: z.string().optional(),
})

generateRoutes.post('/generate', validateJson(generateSchema), async (c) => {
  const body = c.req.valid('json')

  // プレーンオブジェクト判定と SSRF 対策は専用メッセージを持つ既存ヘルパーを維持
  try {
    assertPlainObject(body.input, 'input')
  } catch (e) {
    if (e instanceof KieApiError) {
      return c.json({ error: e.message }, 400)
    }
    throw e
  }

  let callBackUrl: string | undefined
  if (body.callBackUrl) {
    try {
      assertSafeHttpsUrl(body.callBackUrl, 'callBackUrl')
      callBackUrl = body.callBackUrl
    } catch (e) {
      if (e instanceof KieApiError) {
        return c.json({ error: e.message }, 400)
      }
      throw e
    }
  }

  const provider = body.provider
  const operation = body.operation
  const adapter = getProviderAdapter(provider)
  const created = await adapter.create({
    provider,
    operation,
    model: body.model,
    input: body.input,
    callBackUrl,
  })

  try {
    await recordCreatedTask({
      provider,
      operation,
      model: body.model,
      input: body.input as Record<string, unknown>,
      created,
      workflowId: body.workflowId,
    })
  } catch (err) {
    console.error('[history] failed to record created task', created.taskId, err)
  }

  return c.json({ data: created })
})
