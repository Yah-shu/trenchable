import { describe, expect, it } from 'vitest'
import { extractModelSlug, propertyToField } from './from-openapi.ts'

describe('OpenAPI field constraints', () => {
  it('uses explicit prose constraints when the schema omits them', () => {
    const prompt = propertyToField('prompt', {
      type: 'string',
      description: 'Required field. (Max length: 20,000 characters)',
    })
    expect(prompt).toMatchObject({ required: true, maxLength: 20_000 })

    const duration = propertyToField('duration', {
      type: 'number',
      description: 'Video duration in 4-15 seconds.',
    })
    expect(duration).toMatchObject({ min: 4, max: 15 })
  })
})

describe('extractModelSlug', () => {
  const schema = {
    properties: {
      model: {
        description: 'Must be `description/model` for this endpoint',
        enum: ['enum/model'],
        default: 'default/model',
      },
    },
  }

  it('prefers request examples over contradictory schema metadata', () => {
    expect(extractModelSlug(schema, { model: 'example/model' })).toBe(
      'example/model',
    )
  })

  it('falls back through description, enum, and default', () => {
    expect(extractModelSlug(schema)).toBe('description/model')
    expect(
      extractModelSlug({
        properties: {
          model: { enum: ['enum/model'], default: 'default/model' },
        },
      }),
    ).toBe('enum/model')
    expect(
      extractModelSlug({ properties: { model: { default: 'default/model' } } }),
    ).toBe('default/model')
  })

  it('ignores malformed examples', () => {
    expect(extractModelSlug(schema, { model: '' })).toBe('description/model')
    expect(extractModelSlug(schema, ['example/model'])).toBe(
      'description/model',
    )
  })
})
