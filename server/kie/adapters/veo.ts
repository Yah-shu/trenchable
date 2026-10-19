import { assertKieOk, KieApiError, kieFetch } from '../client.ts'
import type { MediaAsset, NormalizedTask, Operation, TaskState } from '../types.ts'
import type { ProviderAdapter } from './types.ts'
import {
  asNumber,
  asRecord,
  asString,
  failOrPartial,
  type KieResponse,
  mediaFromUrls,
  normalizeEpoch,
  parseJson,
  taskIdFrom,
  uniqueUrls,
  unknownOrPartial,
  unwrapKiePayload,
  urlsFrom,
} from './utils.ts'

function veoState(flag: unknown, mediaCount: number): TaskState {
  if (flag === 0 || flag === '0') return 'generating'
  if (flag === 1 || flag === '1') return 'success'
  if (flag === 2 || flag === '2' || flag === 3 || flag === '3') {
    return failOrPartial(mediaCount)
  }
  return unknownOrPartial(mediaCount)
}

export function normalizeVeoTask(
  taskId: string,
  operation: Operation,
  payload: unknown,
): NormalizedTask {
  const { data, response } = unwrapKiePayload(payload)
  const urls = [
    ...urlsFrom(response.resultUrls),
    ...urlsFrom(response.fullResultUrls),
    ...urlsFrom(response.resultUrl),
  ]
  const media: MediaAsset[] = mediaFromUrls([...new Set(urls)], 'video')
  const providerStatus = String(data.successFlag ?? response.successFlag ?? '')
  const state = veoState(data.successFlag ?? response.successFlag, media.length)
  return {
    taskId: asString(data.taskId) ?? taskId,
    provider: 'veo',
    operation,
    state,
    providerStatus,
    media,
    resultUrls: uniqueUrls(media),
    partial: state === 'partial',
    failCode: asString(data.errorCode),
    failMsg: asString(data.error) ?? asString(data.errorMessage),
    createTime: normalizeEpoch(data.createTime),
    updateTime: normalizeEpoch(data.updateTime),
    creditsConsumed: asNumber(data.creditsConsumed),
    rawParam: parseJson(data.paramJson ?? data.param),
    rawResult: payload,
  }
}

function createPath(operation: Operation): string {
  switch (operation) {
    case 'generate': return '/api/v1/veo/generate'
    case 'extend': return '/api/v1/veo/extend'
    case 'upscale-4k': return '/api/v1/veo/get-4k-video'
    case 'upscale-1080p': return '/api/v1/veo/get-1080p-video'
    case 'upload-cover':
    case 'upload-extend':
    case 'replace-section':
    case 'cover-art':
    case 'lyrics':
    case 'aleph':
      throw new KieApiError(`Unsupported Veo operation: ${operation}`, 400)
    default: {
      const exhaustive: never = operation
      throw new KieApiError(`Unsupported Veo operation: ${exhaustive}`, 400)
    }
  }
}

export const veoAdapter: ProviderAdapter = {
  provider: 'veo',
  async create(input) {
    const path = input.operation === 'upscale-1080p'
      ? `${createPath(input.operation)}?${new URLSearchParams({
          taskId: String(input.input.taskId ?? ''),
          index: String(input.input.index ?? 0),
        })}`
      : createPath(input.operation)
    const response = await kieFetch<KieResponse>(path, {
      method: input.operation === 'upscale-1080p' ? 'GET' : 'POST',
      body: input.operation === 'upscale-1080p'
        ? undefined
        : JSON.stringify(input.input),
    })
    assertKieOk(response.code, response.msg, 'Failed to create Veo task')
    const data = asRecord(response.data)
    const taskId = taskIdFrom(data)
    const immediateUrl = asString(data?.resultUrl)
    if (!taskId && immediateUrl) {
      const immediateTaskId = [
        input.operation,
        String(input.input.taskId ?? 'source'),
        String(input.input.index ?? 0),
        Date.now(),
      ].join(':')
      return {
        taskId: immediateTaskId,
        task: normalizeVeoTask(immediateTaskId, input.operation, {
          data: {
            taskId: immediateTaskId,
            successFlag: 1,
            response: { resultUrl: immediateUrl },
            param: input.input,
          },
        }),
      }
    }
    if (!taskId) throw new KieApiError('Veo did not return a taskId or resultUrl', 502)
    return { taskId }
  },
  async getTask(taskId, operation) {
    const response = await kieFetch<KieResponse>(
      `/api/v1/veo/record-info?taskId=${encodeURIComponent(taskId)}`,
    )
    assertKieOk(response.code, response.msg, 'Failed to get Veo task')
    return normalizeVeoTask(taskId, operation, response)
  },
}
