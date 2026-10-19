import { exec } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { Hono } from 'hono'
import { deleteSetting } from '../db/settings.ts'
import {
  KIE_API_KEY_SETTING,
  getStoredApiKey,
  hasStoredApiKeyInStore,
  hasUsableApiKey,
  maskApiKey,
  setStoredApiKey,
} from '../settings/apiKey.ts'
import { getMediaRoot } from '../media/archiver.ts'
import { getDb } from '../db/open.ts'
import { z } from 'zod'
import { validateJson } from './validation.ts'

export const settingsRoutes = new Hono()

// Ensure DB is open when routes load
getDb()

const PLACEHOLDER = 'your_api_key_here'

const apiKeySchema = z.object({
  apiKey: z
    .string({ error: 'apiKey is required' })
    .trim()
    .min(1, 'apiKey is required')
    .refine((v) => v !== PLACEHOLDER, 'apiKey is required'),
})

settingsRoutes.get('/settings', (c) => {
  const key = getStoredApiKey()
  return c.json({
    data: {
      hasApiKey: hasUsableApiKey(),
      apiKeyMasked: key ? maskApiKey(key) : null,
      // Whether the effective key comes from the persisted store (vs env only).
      apiKeyFromStore: hasStoredApiKeyInStore(),
    },
  })
})

settingsRoutes.put('/settings/api-key', validateJson(apiKeySchema), (c) => {
  const { apiKey } = c.req.valid('json')
  setStoredApiKey(apiKey)
  return c.json({
    data: { hasApiKey: true, apiKeyMasked: maskApiKey(apiKey) },
  })
})

settingsRoutes.delete('/settings/api-key', (c) => {
  deleteSetting(KIE_API_KEY_SETTING)
  return c.json({ data: { hasApiKey: hasUsableApiKey() } })
})

/** ローカルメディアフォルダを OS のファイルマネージャで開く */
settingsRoutes.post('/settings/open-media-folder', (c) => {
  const mediaRoot = getMediaRoot()
  mkdirSync(mediaRoot, { recursive: true })

  const cmd =
    process.platform === 'win32'
      ? `explorer.exe "${mediaRoot}"`
      : process.platform === 'darwin'
        ? `open "${mediaRoot}"`
        : `xdg-open "${mediaRoot}"`

  exec(cmd, (err) => {
    if (err) console.warn('[settings] failed to open media folder:', err.message)
  })

  return c.json({ data: { path: mediaRoot } })
})
