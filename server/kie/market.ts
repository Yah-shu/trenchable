import { assertKieOk, KieApiError, kieFetch } from './client.ts'
import type { NormalizedTask, TaskState } from './types.ts'
import { mediaKindFromUrl } from '../../src/lib/media.ts'

interface CreateTaskResponse {
  code: number
  msg: string
  data?: { taskId: string }
}

export interface RecordInfoResponse {
  code: number
  msg: string
  data?: {
    taskId?: string
    model?: string
    state?: string
    progress?: number
    param?: string
    resultJson?: string
    failCode?: string | null
    failMsg?: string | null
    costTime?: number
    completeTime?: number
    createTime?: number
    updateTime?: number
    expireTime?: number
    creditsConsumed?: number
    consumeCredits?: number
    credit?: number
  }
}

export async function createTask(params: {
  model: string
  input: Record<string, unknown>
  callBackUrl?: string
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: params.model,
    input: params.input,
  }
  if (params.callBackUrl) body.callBackUrl = params.callBackUrl

  const res = await kieFetch<CreateTaskResponse>('/api/v1/jobs/createTask', {
    method: 'POST',
    body: JSON.stringify(body),
  })

  assertKieOk(res.code, res.msg, 'Failed to create task')
  if (!res.data?.taskId) {
    throw new KieApiError('Failed to create task', 502, res.code)
  }
  return res.data.taskId
}

function normalizeState(state?: string): TaskState {
  switch (state) {
    case 'waiting':
    case 'queuing':
    case 'generating':
    case 'success':
    case 'fail':
      return state
    default:
      return 'unknown'
  }
}

function parseResult(resultJson?: string): { raw?: unknown; urls: string[] } {
  if (!resultJson) return { urls: [] }
  try {
    const parsed: unknown = JSON.parse(resultJson)
    const urls = new Set<string>()
    function visit(value: unknown, key = ''): void {
      if (typeof value === 'string') {
        if (/url/i.test(key) && /^https:\/\//i.test(value)) urls.add(value)
        return
      }
      if (Array.isArray(value)) {
        for (const entry of value) visit(entry, key)
        return
      }
      if (!value || typeof value !== 'object') return
      for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
        visit(child, childKey)
      }
    }
    visit(parsed)
    return { raw: parsed, urls: [...urls] }
  } catch {
    return { raw: resultJson, urls: [] }
  }
}

export async function getTaskDetail(taskId: string): Promise<NormalizedTask> {
  const res = await kieFetch<RecordInfoResponse>(
    `/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
  )

  assertKieOk(res.code, res.msg, 'Failed to get task detail')
  if (!res.data) {
    throw new KieApiError('Failed to get task detail', 502, res.code)
  }

  return normalizeMarketTask(taskId, res.data)
}

export function normalizeMarketTask(
  taskId: string,
  data: NonNullable<RecordInfoResponse['data']>,
): NormalizedTask {
  const result = parseResult(data.resultJson)
  const creditsConsumed =
    typeof data.creditsConsumed === 'number'
      ? data.creditsConsumed
      : typeof data.consumeCredits === 'number'
        ? data.consumeCredits
        : typeof data.credit === 'number'
          ? data.credit
          : undefined

  const normalizedState = normalizeState(data.state)
  const state = normalizedState === 'fail' && result.urls.length > 0
    ? 'partial'
    : normalizedState
  const fallbackKind = /audio|speech|voice|tts|music|sound/i.test(data.model ?? '')
    ? 'audio'
    : /video|kling|veo|runway|seedance|wan/i.test(data.model ?? '')
      ? 'video'
      : 'image'

  return {
    taskId: data.taskId ?? taskId,
    state,
    provider: 'market',
    operation: 'generate',
    model: data.model,
    resultUrls: result.urls,
    media: result.urls.map((url) => ({
      kind: mediaKindFromUrl(url, fallbackKind),
      url,
    })),
    providerStatus: data.state,
    progress: data.progress,
    partial: state === 'partial',
    failMsg: data.failMsg ?? undefined,
    failCode: data.failCode ?? undefined,
    costTime: data.costTime,
    createTime: data.createTime,
    updateTime: data.updateTime,
    completeTime: data.completeTime,
    creditsConsumed,
    expiresAt: data.expireTime,
    rawParam: data.param,
    rawResult: result.raw,
  }
}
