import { describe, expect, it } from 'vitest'
import { parentTaskIdFor } from './taskRelations.ts'

describe('task relationships', () => {
  it('keeps the source task for Aleph Before/After comparison', () => {
    expect(parentTaskIdFor('aleph', {
      _parentTaskId: 'source-runway-task',
      videoUrl: 'https://cdn.example.com/source.mp4',
    })).toBe('source-runway-task')
  })

  it('uses the provider task id for Suno child operations', () => {
    expect(parentTaskIdFor('replace-section', {
      taskId: 'source-suno-task',
      audioId: 'source-audio-id',
    })).toBe('source-suno-task')
  })
})
