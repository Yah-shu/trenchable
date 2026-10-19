import { Hono } from 'hono'
import { getDownloadUrl } from '../kie/common.ts'
import { assertSafeHttpsUrl } from '../kie/safe.ts'
import { KieApiError } from '../kie/client.ts'

export const downloadUrlRoutes = new Hono()

downloadUrlRoutes.post('/download-url', async (c) => {
  let body: { url?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  if (!body.url || typeof body.url !== 'string') {
    return c.json({ error: 'url is required' }, 400)
  }
  try {
    assertSafeHttpsUrl(body.url, 'url')
  } catch (e) {
    if (e instanceof KieApiError) {
      return c.json({ error: e.message }, 400)
    }
    throw e
  }
  const downloadUrl = await getDownloadUrl(body.url)
  return c.json({ data: { downloadUrl } })
})
