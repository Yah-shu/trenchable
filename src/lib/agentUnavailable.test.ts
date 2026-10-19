import { describe, expect, it } from 'vitest'
import { AGENT_UNAVAILABLE_MESSAGE, formatAgentSendError } from './agentUnavailable.ts'

describe('formatAgentSendError', () => {
  it('keeps an Error message', () => {
    expect(formatAgentSendError(new Error('API キーがありません'))).toBe('API キーがありません')
  })

  it('falls back when the error has no message', () => {
    expect(formatAgentSendError(new Error(''))).toBe(AGENT_UNAVAILABLE_MESSAGE)
    expect(formatAgentSendError('nope')).toBe('nope')
  })

  it('unwraps a JSON error body from the AI SDK transport', () => {
    expect(
      formatAgentSendError(new Error('{"error":"xai の API キーがありません。"}')),
    ).toBe('xai の API キーがありません。')
  })
})
