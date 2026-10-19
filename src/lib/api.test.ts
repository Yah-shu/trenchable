import { describe, expect, it, vi } from 'vitest'
import {
  ApiClientError,
  compareSemver,
  fetchCredits,
  fetchHistory,
  generateTask,
  resetApiBaseForTests,
  resolveApiBase,
  saveApiKey,
} from './api.ts'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function stubFetch(response: Response) {
  const mock = vi.fn(async () => response)
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('parseJson via API functions', () => {
  it('returns parsed data on success', async () => {
    stubFetch(jsonResponse({ data: { credits: 42 } }))
    await expect(fetchCredits()).resolves.toEqual({ data: { credits: 42 } })
  })

  it('throws ApiClientError with server message, status and code', async () => {
    stubFetch(jsonResponse({ error: 'insufficient credits', code: 402 }, 402))
    const promise = fetchCredits()
    await expect(promise).rejects.toBeInstanceOf(ApiClientError)
    await expect(promise).rejects.toMatchObject({
      message: 'insufficient credits',
      status: 402,
      code: 402,
    })
  })

  it('falls back to a generic message for non-JSON error bodies', async () => {
    stubFetch(new Response('<html>gateway error</html>', { status: 502 }))
    await expect(fetchCredits()).rejects.toMatchObject({
      message: 'Request failed (502)',
      status: 502,
    })
  })

  it('falls back to the HTTP status when the error body lacks a message', async () => {
    stubFetch(jsonResponse({}, 500))
    await expect(fetchHistory()).rejects.toMatchObject({
      message: 'Request failed (500)',
      status: 500,
    })
  })
})

describe('compareSemver', () => {
  it('orders dotted versions and ignores pre-release suffixes', () => {
    expect(compareSemver('1.0.9', '1.0.8')).toBeGreaterThan(0)
    expect(compareSemver('1.0.8', '1.0.9')).toBeLessThan(0)
    expect(compareSemver('1.0.9-canary', '1.0.9')).toBe(0)
    expect(compareSemver('1.0.10', '1.0.9')).toBeGreaterThan(0)
  })
})

describe('resolveApiBase', () => {
  it('prefers the newest healthy version then the lowest port', async () => {
    resetApiBaseForTests('http://127.0.0.1:8787')
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes(':8787/')) {
        return jsonResponse({ ok: true, version: '1.0.8' })
      }
      if (url.includes(':8788/')) {
        return jsonResponse({ ok: true, version: '1.0.9' })
      }
      return new Response('nope', { status: 404 })
    })
    vi.stubGlobal('fetch', mock)
    await expect(resolveApiBase()).resolves.toBe('http://127.0.0.1:8788')
    // Restore relative base used by Vite/dev request-shape tests.
    resetApiBaseForTests('')
  })
})

describe('request shape', () => {
  it('POSTs generate params as JSON', async () => {
    resetApiBaseForTests('')
    const mock = stubFetch(jsonResponse({ data: { taskId: 't-1' } }))
    await generateTask({ model: 'test/model', input: { prompt: 'hi' } })
    expect(mock).toHaveBeenCalledTimes(1)
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/generate')
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      model: 'test/model',
      input: { prompt: 'hi' },
    })
  })

  it('PUTs the API key to the settings endpoint', async () => {
    resetApiBaseForTests('')
    const mock = stubFetch(
      jsonResponse({ data: { hasApiKey: true, apiKeyMasked: 'sk-***' } }),
    )
    await expect(saveApiKey('sk-test')).resolves.toEqual({
      data: { hasApiKey: true, apiKeyMasked: 'sk-***' },
    })
    const [url, init] = mock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/settings/api-key')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ apiKey: 'sk-test' })
  })
})
