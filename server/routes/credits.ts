import { Hono } from 'hono'
import { getCredits } from '../kie/common.ts'

export const creditsRoutes = new Hono()

creditsRoutes.get('/credits', async (c) => {
  const credits = await getCredits()
  return c.json({ data: { credits } })
})
