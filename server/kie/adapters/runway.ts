import { assertKieOk, KieApiError, kieFetch } from '../client.ts'
import type { MediaAsset, NormalizedTask, Operation, TaskState } from '../types.ts'
import type { ProviderAdapter } from './types.ts'
import {
  asNumber,
  asRecord,
  asString,
  failOrPartial,
  type KieResponse,
  normalizeEpoch,
  parseJson,
  taskIdFrom,
  uniqueUrls,
  unknownOrPartial,
  unwrapKiePayload,
} from './utils.ts'

function runwayState(value: unknown, mediaCount: number, expired: boolean): TaskState {
  if (expired) return 'expired'
  switch (value) {
    case 'wait': return 'waiting'
    case 'queueing': return 'queuing'
    case 'generating': return 'generating'
    case 'success': return 'success'
    case 'fail': return failOrPartial(mediaCount)
    case 0:
    case '0': return 'generating'
    case 1:
    case '1': return 'success'
    case 2:
    case '2': return failOrPartial(mediaCount)
    default: return unknownOrPartial(mediaCount)
  }
}

export function normalizeRunwayTask(
  taskId: string,
  operation: Operation,
  payload: unknown,
): NormalizedTask {
  const { data, response } = unwrapKiePayload(payload)
  const videoInfo = asRecord(data.videoInfo) ?? asRecord(response.videoInfo)
  const videoUrl = asString(response.resultVideoUrl)
    ?? asString(videoInfo?.videoUrl)
    ?? asString(data.videoUrl)
  const imageUrl = asString(response.resultImageUrl)
    ?? asString(videoInfo?.imageUrl)
  const media: MediaAsset[] = []
  if (videoUrl) media.push({
    kind: 'video',
    url: videoUrl,
    previewUrl: imageUrl,
    providerAssetId: asString(videoInfo?.videoId),
  })
  const expired = data.expireFlag === 1 || data.expireFlag === true
  const status = data.state ?? data.successFlag ?? response.state ?? response.successFlag
  const state = runwayState(status, media.length, expired)
  return {
    taskId: asString(data.taskId) ?? asString(videoInfo?.taskId) ?? taskId,
    provider: 'runway',
    operation,
    state,
    providerStatus: status === undefined ? undefined : String(status),
    parentTaskId: asString(data.parentTaskId),
    media,
    resultUrls: uniqueUrls(media),
    partial: state === 'partial',
    failCode: asString(data.failCode) ?? asString(data.errorCode),
    failMsg: asString(data.failMsg) ?? asString(data.error),
    createTime: normalizeEpoch(data.createTime),
    updateTime: normalizeEpoch(data.updateTime),
    completeTime: normalizeEpoch(data.completeTime),
    creditsConsumed: asNumber(data.creditsConsumed),
    rawParam: parseJson(data.paramJson ?? data.param),
    rawResult: payload,
  }
}

function createPath(operation: Operation): string {
  switch (operation) {
    case 'generate': return '/api/v1/runway/generate'
    case 'extend': return '/api/v1/runway/extend'
    case 'aleph': return '/api/v1/aleph/generate'
    case 'upload-cover':
    case 'upload-extend':
    case 'replace-section':
    case 'cover-art':
    case 'lyrics':
    case 'upscale-1080p':
    case 'upscale-4k':
      throw new KieApiError(`Unsupported Runway operation: ${operation}`, 400)
    default: {
      const exhaustive: never = operation
      throw new KieApiError(`Unsupported Runway operation: ${exhaustive}`, 400)
    }
  }
}

export const runwayAdapter: ProviderAdapter = {
  provider: 'runway',
  async create(input) {
    const response = await kieFetch<KieResponse>(createPath(input.operation), {
      method: 'POST',
      body: JSON.stringify(input.input),
    })
    assertKieOk(response.code, response.msg, 'Failed to create Runway task')
    const data = asRecord(response.data)
    const taskId = taskIdFrom(data)
    if (!taskId) throw new KieApiError('Runway did not return a taskId', 502)
    return { taskId }
  },
  async getTask(taskId, operation) {
    const path = operation === 'aleph'
      ? `/api/v1/aleph/record-info?taskId=${encodeURIComponent(taskId)}`
      : `/api/v1/runway/record-detail?taskId=${encodeURIComponent(taskId)}`
    const response = await kieFetch<KieResponse>(path)
    assertKieOk(response.code, response.msg, 'Failed to get Runway task')
    return normalizeRunwayTask(taskId, operation, response)
  },
}
