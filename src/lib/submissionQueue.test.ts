import { afterEach, describe, expect, it, vi } from 'vitest'
import { classifyApiError, SubmissionQueue } from './submissionQueue.ts'

afterEach(() => vi.useRealTimers())

describe('SubmissionQueue', () => {
  it('does not send more than 20 jobs in a rolling 10 second window', async () => {
    vi.useFakeTimers()
    const queue = new SubmissionQueue(20, 10_000, 0)
    let calls = 0
    const promises = Array.from({ length: 21 }, () => queue.enqueue({
      provider: 'market',
      operation: 'generate',
      model: 'fixture',
      run: async () => ++calls,
    }))
    await vi.advanceTimersByTimeAsync(1)
    expect(calls).toBe(20)
    await vi.advanceTimersByTimeAsync(10_020)
    expect(calls).toBe(21)
    await Promise.all(promises)
  })

  it('cancels only unsent jobs', async () => {
    vi.useFakeTimers()
    const queue = new SubmissionQueue()
    const promise = queue.enqueue({
      provider: 'suno',
      operation: 'generate',
      model: 'suno',
      run: async () => 'accepted',
    })
    expect(queue.cancelUnsent()).toBe(1)
    await expect(promise).rejects.toThrow('キャンセル')
  })

  it('classifies rate, purchase, input and refunded errors', () => {
    expect(classifyApiError({ status: 429 })).toBe('retry')
    expect(classifyApiError({ status: 402 })).toBe('purchase')
    expect(classifyApiError({ code: 413 })).toBe('fix-input')
    expect(classifyApiError({ code: 531 })).toBe('refunded')
  })

  it('classifies insufficient credits messages as purchase', () => {
    expect(classifyApiError(new Error('Insufficient credits'))).toBe('purchase')
    expect(classifyApiError(new Error('not enough balance to run'))).toBe('purchase')
    expect(classifyApiError(new Error('クレジットが不足しています'))).toBe('purchase')
    expect(classifyApiError(new Error('残高不足のため credit を追加してください'))).toBe('purchase')
    expect(classifyApiError(new Error('some other failure'))).toBe('failed')
  })
})
