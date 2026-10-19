import { assertKieOk, KieApiError, kieFetch } from './client.ts'
import { assertSafeHttpsUrl } from './safe.ts'

interface CreditResponse {
  code: number
  msg: string
  data: number
}

interface DownloadUrlResponse {
  code: number
  msg: string
  data: string
}

export async function getCredits(): Promise<number> {
  const res = await kieFetch<CreditResponse>('/api/v1/chat/credit')
  assertKieOk(res.code, res.msg, 'Failed to get credits')
  return res.data
}

export async function getDownloadUrl(url: string): Promise<string> {
  assertSafeHttpsUrl(url, 'url')
  const res = await kieFetch<DownloadUrlResponse>('/api/v1/common/download-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
  assertKieOk(res.code, res.msg, 'Failed to get download URL')
  if (!res.data) {
    throw new KieApiError('Failed to get download URL', 502)
  }
  return res.data
}
