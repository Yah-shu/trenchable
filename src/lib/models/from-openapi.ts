import type { FieldSchema, FieldType, ModelCategory } from './types.ts'

const REFERENCE_NAME_RE =
  /(image_?urls?|image_?input|audio_?urls?|audio_?input|input_?urls?|reference_?urls?|reference_?mask|mask_?urls?|video_?urls?|end_?image|start_?image|first_?frame|last_?frame|^image$|^mask$|^video$|^audio$)/i

const TEXTAREA_NAME_RE = /(prompt|negative|description|caption|text)/i

function humanize(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function isUriArray(prop: Record<string, unknown>): boolean {
  if (prop.type !== 'array') return false
  const items = prop.items as Record<string, unknown> | undefined
  if (!items) return false
  if (items.format === 'uri') return true
  if (items.type === 'string' && typeof items.examples === 'object') return true
  return items.type === 'string'
}

function detectMentionStyle(
  name: string,
  description?: string,
): FieldSchema['mentionStyle'] {
  const hay = `${name} ${description ?? ''}`.toLowerCase()
  if (/audio/i.test(name)) return 'at-audio'
  if (/video/i.test(name)) return 'at-video'
  if (hay.includes('[image')) return 'bracket-image'
  if (hay.includes('@image') || REFERENCE_NAME_RE.test(name)) return 'at-image'
  return 'none'
}

function detectFieldType(
  name: string,
  prop: Record<string, unknown>,
): FieldType {
  if (name === 'kling_elements') return 'kling_elements'
  if (Array.isArray(prop.enum) && prop.enum.every((v) => typeof v === 'string')) {
    return 'enum'
  }
  if (prop.type === 'boolean') return 'boolean'
  if (prop.type === 'integer' || prop.type === 'number') return 'number'
  if (prop.type === 'array' && (REFERENCE_NAME_RE.test(name) || isUriArray(prop))) {
    return 'reference'
  }
  if (prop.type === 'string') {
    if (REFERENCE_NAME_RE.test(name)) {
      return 'reference'
    }
    return TEXTAREA_NAME_RE.test(name) ? 'textarea' : 'string'
  }
  if (prop.type === 'array' || prop.type === 'object') return 'json'
  return 'json'
}

function acceptForField(name: string): string {
  if (/video/i.test(name)) return 'video/*,image/*'
  if (/audio/i.test(name)) return 'audio/*'
  return 'image/jpeg,image/png,image/webp,image/*'
}

export function propertyToField(
  name: string,
  prop: Record<string, unknown>,
  required: string[] = [],
): FieldSchema {
  const type = detectFieldType(name, prop)
  const description =
    typeof prop.description === 'string'
      ? prop.description.split('\n')[0]?.trim()
      : undefined

  const field: FieldSchema = {
    name,
    type,
    label: humanize(name),
    description,
    required: required.includes(name) || /\bRequired field\b/i.test(description ?? ''),
  }

  if (prop.default !== undefined) field.default = prop.default
  if (Array.isArray(prop.enum)) {
    field.enum = prop.enum.filter((v): v is string => typeof v === 'string')
  }
  if (typeof prop.minimum === 'number') field.min = prop.minimum
  if (typeof prop.maximum === 'number') field.max = prop.maximum
  if (typeof prop.maxLength === 'number') field.maxLength = prop.maxLength
  if (field.maxLength === undefined) {
    const maxLength = description?.match(/Max(?:imum)?\s+length:\s*([\d,]+)\s*characters?/i)
    if (maxLength?.[1]) field.maxLength = Number(maxLength[1].replace(/,/g, ''))
  }
  if (typeof prop.maxItems === 'number') field.maxItems = prop.maxItems
  if (type === 'number') {
    field.step = prop.type === 'integer' ? 1 : 0.1
    const durationRange = description?.match(/([\d.]+)\s*[-–]\s*([\d.]+)\s*seconds?/i)
    if (durationRange?.[1] && durationRange[2]) {
      field.min ??= Number(durationRange[1])
      field.max ??= Number(durationRange[2])
    }
  }
  if (type === 'reference') {
    field.accept = acceptForField(name)
    field.mentionStyle = detectMentionStyle(name, description)
    const maxSize = description?.match(/Max(?:imum)?\s+size:\s*([\d.]+)\s*MB/i)
    if (maxSize?.[1]) field.maxFileSizeMb = Number(maxSize[1])
    const maxDuration = description?.match(/(?:Max(?:imum)?\s+duration|up to)[:\s]+([\d.]+)\s*(?:seconds?|s\b|minutes?|mins?)/i)
    if (maxDuration?.[1]) {
      const amount = Number(maxDuration[1])
      field.maxDurationSec = /minutes?|mins?/i.test(maxDuration[0]) ? amount * 60 : amount
    }
    if (prop.type === 'string') {
      field.maxItems = 1
      field.scalar = true
    } else if (typeof prop.maxItems === 'number') {
      field.maxItems = prop.maxItems
    } else {
      field.maxItems = 8
    }
  }
  if (type === 'kling_elements') {
    field.maxItems = typeof prop.maxItems === 'number' ? prop.maxItems : 3
  }

  return field
}

export function inputSchemaToFields(
  input: Record<string, unknown> | undefined,
): FieldSchema[] {
  if (!input || typeof input !== 'object') return []
  const properties = (input.properties ?? {}) as Record<
    string,
    Record<string, unknown>
  >
  const required = Array.isArray(input.required)
    ? (input.required as string[]).map((n) => n.trim())
    : []

  const order = Array.isArray((input as { 'x-apidog-orders'?: string[] })[
    'x-apidog-orders'
  ])
    ? ((input as { 'x-apidog-orders': string[] })['x-apidog-orders'] ?? [])
    : Object.keys(properties)
  const orderedNames = new Set(order)

  const names = [
    ...order.filter((n) => n in properties),
    ...Object.keys(properties).filter((n) => !orderedNames.has(n)),
  ]

  // OpenAPI keys sometimes include trailing spaces (e.g. Seedance docs).
  return names.map((name) =>
    propertyToField(name.trim(), properties[name]!, required),
  )
}

export function detectCategory(
  pathOrTitle: string,
  modelSlug: string,
): ModelCategory {
  const hay = `${pathOrTitle} ${modelSlug}`.toLowerCase()
  if (
    !hay.includes('video') &&
    !hay.includes('infinitalk') &&
    !hay.includes('omnihuman') &&
    (hay.includes('audio') ||
      hay.includes('speech') ||
      hay.includes('voice') ||
      hay.includes('dialogue') ||
      hay.includes('tts') ||
      hay.includes('elevenlabs') ||
      hay.includes('music') ||
      hay.includes('sound'))
  ) {
    return 'audio'
  }
  if (
    hay.includes('video') ||
    hay.includes('kling') ||
    hay.includes('seedance') ||
    hay.includes('hailuo') ||
    hay.includes('sora') ||
    hay.includes('wan/') ||
    /\/wan\b/.test(hay)
  ) {
    return 'video'
  }
  return 'image'
}

export function extractOpenApiFromMarkdown(markdown: string): string | null {
  const fence = markdown.match(/```ya?ml\s*\n([\s\S]*?)```/i)
  return fence?.[1]?.trim() ?? null
}

export function extractModelSlug(
  schema: Record<string, unknown>,
  example?: unknown,
): string | null {
  if (example && typeof example === 'object' && !Array.isArray(example)) {
    const model = (example as Record<string, unknown>).model
    if (typeof model === 'string' && model.length > 0) return model
  }
  const props = schema.properties as
    | Record<string, Record<string, unknown>>
    | undefined
  const modelProp = props?.model
  if (!modelProp) return null
  if (typeof modelProp.description === 'string') {
    const match = modelProp.description.match(/Must be `([^`]+)`/)
    if (match?.[1]) return match[1]
  }
  if (Array.isArray(modelProp.enum) && typeof modelProp.enum[0] === 'string') {
    return modelProp.enum[0]
  }
  if (typeof modelProp.default === 'string') return modelProp.default
  return null
}

export function extractInputSchema(
  bodySchema: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const props = bodySchema.properties as
    | Record<string, Record<string, unknown>>
    | undefined
  return props?.input as Record<string, unknown> | undefined
}
