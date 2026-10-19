import { createTask, getTaskDetail } from '../market.ts'
import type { ProviderAdapter } from './types.ts'

export const marketAdapter: ProviderAdapter = {
  provider: 'market',
  async create(input) {
    const taskId = await createTask({
      model: input.model,
      input: input.input,
      callBackUrl: input.callBackUrl,
    })
    return { taskId }
  },
  getTask(taskId) {
    return getTaskDetail(taskId)
  },
}
