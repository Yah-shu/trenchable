/** Payload of the agent's `data-media-task` part (mirrors server/agent/mediaTask.ts). */
export interface MediaTaskData {
  taskId: string
  title?: string
  workflowId?: string
  status: 'submitted' | 'succeeded' | 'failed'
  resultUrls?: string[]
  media?: { kind: string; url?: string; localPath?: string }[]
  error?: string
}

export function readMediaTaskData(data: unknown): MediaTaskData | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const value = data as Record<string, unknown>
  if (typeof value.taskId !== 'string') return undefined
  if (value.status !== 'submitted' && value.status !== 'succeeded' && value.status !== 'failed') {
    return undefined
  }
  return value as unknown as MediaTaskData
}