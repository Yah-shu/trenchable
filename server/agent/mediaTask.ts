export type MediaTaskStatus = 'submitted' | 'succeeded' | 'failed'

export interface MediaTaskData {
  taskId: string
  title?: string
  workflowId?: string
  status: MediaTaskStatus
  resultUrls?: string[]
  media?: { kind: string; url?: string; localPath?: string }[]
  error?: string
}
