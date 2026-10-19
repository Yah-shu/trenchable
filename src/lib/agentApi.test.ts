import { describe, expect, it, vi } from 'vitest'
import { ApiClientError } from './api.ts'
import { fetchAgentHealth, fetchLlmSettings } from './agentApi.ts'

function stubFetch(response: Response) {
  const mock = vi.fn(async () => response)
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('agentApi.parse via LLM settings', () => {
  it('throws ApiClientError for plain-text 404 bodies (not JSON parse noise)', async () => {
    stubFetch(new Response('404 Not Found', { status: 404 }))
    const promise = fetchLlmSettings()
    await expect(promise).rejects.toBeInstanceOf(ApiClientError)
    await expect(promise).rejects.toMatchObject({
      message: 'Request failed (404)',
      status: 404,
    })
  })

  it('returns data on success', async () => {
    stubFetch(
      new Response(
        JSON.stringify({
          data: {
            providers: [],
            customEndpoints: [],
            defaultModel: null,
            preferredModels: {},
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    await expect(fetchLlmSettings()).resolves.toEqual({
      providers: [],
      customEndpoints: [],
      defaultModel: null,
      preferredModels: {},
    })
  })
})

describe('fetchAgentHealth', () => {
  it('succeeds on { ok: true }', async () => {
    stubFetch(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    await expect(fetchAgentHealth()).resolves.toEqual({ ok: true })
  })

  it('throws on 502 so the agent view can warn before send', async () => {
    stubFetch(new Response('bad gateway', { status: 502 }))
    await expect(fetchAgentHealth()).rejects.toMatchObject({ status: 502 })
  })
})
