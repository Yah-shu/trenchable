import { Hono } from 'hono'
import {
  getGrokStatus,
  GrokCliError,
  optimizePromptWithGrok,
  type PromptAssistMode,
} from '../grok/cli.ts'
import { getOptimizeProfile } from '../grok/optimize-profiles.ts'

export const optimizePromptRoutes = new Hono()

optimizePromptRoutes.get('/grok/status', async (c) => {
  const status = await getGrokStatus()
  return c.json({
    data: {
      available: status.available,
      version: status.version,
    },
  })
})

optimizePromptRoutes.get('/optimize-profile', (c) => {
  const modelId = c.req.query('modelId') || undefined
  const profile = getOptimizeProfile(modelId)
  return c.json({
    data: {
      family: profile.family,
      label: profile.label,
      modality: profile.modality,
      formula: profile.formula,
      mention: profile.mention,
      hasGuide: Boolean(profile.guide),
    },
  })
})

function resolveMode(
  mode: unknown,
  prompt: string,
): PromptAssistMode | null {
  if (mode === 'generate' || mode === 'optimize') return mode
  if (mode === undefined || mode === null || mode === '') {
    return prompt ? 'optimize' : 'generate'
  }
  return null
}

optimizePromptRoutes.post('/optimize-prompt', async (c) => {
  let body: {
    prompt?: unknown
    customInstructions?: unknown
    modelId?: unknown
    mode?: unknown
  }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }

  const prompt =
    typeof body.prompt === 'string' ? body.prompt.trim() : ''
  const customInstructions =
    typeof body.customInstructions === 'string'
      ? body.customInstructions.trim()
      : ''
  const modelId =
    typeof body.modelId === 'string' ? body.modelId : undefined

  const mode = resolveMode(body.mode, prompt)
  if (!mode) {
    return c.json({ error: 'mode must be generate or optimize' }, 400)
  }

  if (mode === 'optimize' && !prompt) {
    return c.json({ error: 'prompt is required for optimize' }, 400)
  }
  if (mode === 'generate' && !customInstructions) {
    return c.json(
      { error: 'customInstructions is required for generate' },
      400,
    )
  }

  try {
    const result = await optimizePromptWithGrok({
      prompt,
      customInstructions: customInstructions || undefined,
      modelId,
      mode,
    })
    return c.json({
      data: {
        optimizedPrompt: result.optimizedPrompt,
        mode: result.mode,
        profile: {
          family: result.profile.family,
          label: result.profile.label,
        },
      },
    })
  } catch (e) {
    if (e instanceof GrokCliError) {
      if (e.code === 'unavailable') {
        return c.json({ error: e.message }, 503)
      }
      if (e.code === 'timeout') {
        return c.json({ error: e.message }, 504)
      }
      if (e.code === 'empty') {
        return c.json({ error: e.message }, 400)
      }
      return c.json({ error: e.message }, 500)
    }
    throw e
  }
})
