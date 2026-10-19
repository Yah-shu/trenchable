import type { CreatedProviderTask } from '../kie/adapters/types.ts'
import { listMergedModels } from '../catalog/models.ts'
import type {
  HistoryItem,
  NormalizedTask,
  Operation,
  Provider,
} from '../kie/types.ts'
import { getHistoryItem, upsertHistoryItem } from './history.ts'

function isMirrorableState(
  state: NormalizedTask['state'],
): state is 'success' | 'partial' | 'fail' {
  switch (state) {
    case 'success':
    case 'partial':
    case 'fail':
      return true
    case 'waiting':
    case 'queuing':
    case 'generating':
    case 'expired':
    case 'unknown':
      return false
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

/** Record a newly created generation task in SQLite history (Gallery source of truth). */
export async function recordCreatedTask(params: {
  provider: Provider
  operation: Operation
  model: string
  input: Record<string, unknown>
  created: CreatedProviderTask
  workflowId?: string
  title?: string
}): Promise<void> {
  const merged = await listMergedModels()
  const definition =
    (params.workflowId
      ? merged?.models.find((item) => item.id === params.workflowId)
      : undefined) ??
    merged?.models.find((item) => item.id === params.model) ??
    merged?.models.find(
      (item) => item.provider === params.provider && item.model === params.model,
    )
  const prompt =
    typeof params.input.prompt === 'string' ? params.input.prompt : undefined
  const item: HistoryItem = {
    taskId: params.created.taskId,
    model: params.title ?? definition?.title ?? params.model,
    category: definition?.category ?? 'image',
    state: params.created.task?.state ?? 'waiting',
    createdAt: params.created.task?.createTime ?? Date.now(),
    provider: params.provider,
    operation: params.operation,
    modelId: definition?.id ?? params.workflowId ?? params.model,
    input: params.input,
  }
  if (prompt !== undefined) item.prompt = prompt
  if (params.created.task?.resultUrls?.length) {
    item.resultUrls = params.created.task.resultUrls
  }
  if (params.created.task?.media?.length) {
    item.media = params.created.task.media
  }
  upsertHistoryItem(item)
}

/** Mirror a terminal provider task into an existing history row. */
export function mirrorTaskIntoHistory(task: NormalizedTask): void {
  if (!isMirrorableState(task.state)) return
  const existing = getHistoryItem(task.taskId)
  if (!existing || existing.state === task.state) return
  upsertHistoryItem({
    ...existing,
    state: task.state,
    resultUrls: task.resultUrls.length ? task.resultUrls : existing.resultUrls,
    media: task.media.length ? task.media : existing.media,
    failMsg: task.failMsg ?? existing.failMsg,
    creditsConsumed: task.creditsConsumed ?? existing.creditsConsumed,
    expiresAt: task.expiresAt ?? existing.expiresAt,
    partial: task.partial ?? existing.partial,
  })
}
