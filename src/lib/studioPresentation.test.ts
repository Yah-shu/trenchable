import { describe, expect, it } from 'vitest'
import type { FieldSchema, ModelDefinition } from './models/types.ts'
import {
  fieldConstraintHint,
  isAdvancedField,
  modelInputSummary,
  presentField,
} from './studioPresentation.ts'

describe('studio presentation', () => {
  it('localizes common fields without changing Nsfw Checker', () => {
    expect(presentField({ name: 'prompt', type: 'textarea', label: 'Prompt' }).label)
      .toBe('プロンプト')

    const nsfw: FieldSchema = {
      name: 'nsfw_checker',
      type: 'boolean',
      label: 'Nsfw Checker',
      description: 'Provider description stays as-is.',
    }
    expect(presentField(nsfw)).toEqual(nsfw)
  })

  it('keeps core fields visible and moves optional tuning fields to details', () => {
    expect(isAdvancedField({ name: 'prompt', type: 'textarea', label: 'Prompt' })).toBe(false)
    expect(isAdvancedField({ name: 'resolution', type: 'enum', label: 'Resolution' })).toBe(false)
    expect(isAdvancedField({ name: 'seed', type: 'number', label: 'Seed' })).toBe(true)
    expect(isAdvancedField({ name: 'steps', type: 'number', label: 'Steps', required: true })).toBe(false)
  })

  it('builds compact constraint and model input summaries', () => {
    expect(fieldConstraintHint({
      name: 'prompt',
      type: 'textarea',
      label: 'Prompt',
      maxLength: 5000,
    })).toBe('最大5,000文字')

    const model: ModelDefinition = {
      id: 'example',
      model: 'example',
      title: 'Example',
      category: 'video',
      provider: 'market',
      fields: [{
        name: 'input_urls',
        type: 'reference',
        label: 'Input Urls',
        accept: 'image/*,video/*',
      }],
    }
    expect(modelInputSummary(model)).toBe('画像・動画入力')
  })
})
