import { getStoredApiKey } from '../settings/apiKey.ts'

const API_BASE = 'https://api.kie.ai'
const UPLOAD_BASE = 'https://kieai.redpandaai.co'

export class KieApiError extends Error {
  status: number
  code?: number
  body?: unknown

  constructor(message: string, status: number, code?: number, body?: unknown) {
    super(message)
    this.name = 'KieApiError'
    this.status = status
    this.code = code
    this.body = body
  }
}

export function getApiKey(): string {
  const key = getStoredApiKey()
  if (!key) {
    throw new KieApiError(
      'KIE_API_KEY is not set. Open Settings in the app to save your key.',
      503,
    )
  }
  return key
}

/** Throw when upstream business code is not success. */
export function assertKieOk(
  code: number | undefined,
  msg: string | undefined,
  fallback: string,
): void {
  if (code !== 200) {
    const status = code && code >= 400 && code < 600 ? code : 502
    throw new KieApiError(msg || fallback, status, code)
  }
}

export async function kieFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  base: 'api' | 'upload' = 'api',
): Promise<T> {
  const apiKey = getApiKey()
  const baseUrl = base === 'upload' ? UPLOAD_BASE : API_BASE
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${apiKey}`)
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  })

  const text = await res.text()
  let json: unknown = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }

  if (!res.ok) {
    const msg =
      typeof json === 'object' &&
      json &&
      'msg' in json &&
      typeof (json as { msg: unknown }).msg === 'string'
        ? (json as { msg: string }).msg
        : `Kie API error (${res.status})`
    throw new KieApiError(msg, res.status, undefined, json)
  }

  return json as T
}

export { API_BASE, UPLOAD_BASE }
