import { Hono } from 'hono'
import { getProviderAdapter } from '../kie/adapters/index.ts'
import type { Operation, Provider } from '../kie/types.ts'
import { archiveTaskMedia } from '../media/archiver.ts'
import { updateMediaLocalPaths } from '../db/history.ts'
import { mirrorTaskIntoHistory } from '../db/recordTask.ts'

export const taskRoutes = new Hono()

taskRoutes.get('/task', async (c) => {
  const taskId = c.req.query('taskId')
  if (!taskId) return c.json({ error: 'taskId is required' }, 400)
  const provider = (c.req.query('provider') ?? 'market') as Provider
  const operation = (c.req.query('operation') ?? 'generate') as Operation
  const task = await getProviderAdapter(provider).getTask(taskId, operation)

  // Auto-archive media to local filesystem (fire-and-forget)
  if (
    (task.state === 'success' || task.state === 'partial') &&
    task.media.some((m) => (m.url ?? m.streamUrl) && !m.localPath)
  ) {
    void archiveTaskMedia(taskId, task.media)
      .then((archived) => updateMediaLocalPaths(taskId, archived))
      .catch((err) => console.error('[media-archive]', taskId, err))
  }

  try {
    mirrorTaskIntoHistory(task)
  } catch (err) {
    console.error('[history] failed to mirror task', taskId, err)
  }

  return c.json({ data: task })
})
