import type { FieldSchema, ModelDefinition } from './models/types.ts'

const FIELD_LABELS: Record<string, string> = {
  prompt: 'プロンプト',
  negative_prompt: 'ネガティブプロンプト',
  negativeprompt: 'ネガティブプロンプト',
  image_url: '入力画像',
  image_urls: '参照画像',
  input_url: '入力素材',
  input_urls: '参照素材',
  reference_image_url: '参照画像',
  reference_image_urls: '参照画像',
  video_url: '入力動画',
  video_urls: '入力動画',
  audio_url: '入力音声',
  audio_urls: '入力音声',
  aspect_ratio: 'アスペクト比',
  aspectratio: 'アスペクト比',
  resolution: '解像度',
  duration: '長さ',
  duration_seconds: '長さ',
  quality: '品質',
  seed: 'シード',
  steps: 'ステップ数',
  guidance_scale: 'ガイダンス',
}

const CORE_FIELD_NAMES = new Set([
  'prompt',
  'text',
  'custommode',
  'instrumental',
  'aspect_ratio',
  'aspectratio',
  'resolution',
  'duration',
  'duration_seconds',
  'quality',
])

function normalizedName(name: string): string {
  return name.trim().replace(/[-\s]+/g, '_').toLowerCase()
}

function isNsfwChecker(field: FieldSchema): boolean {
  return field.label === 'Nsfw Checker' || normalizedName(field.name) === 'nsfw_checker'
}

export function presentField(field: FieldSchema): FieldSchema {
  if (isNsfwChecker(field)) return field
  const name = normalizedName(field.name)
  if (field.type === 'reference' && (name === 'input_url' || name === 'input_urls')) {
    const accept = field.accept ?? ''
    const label = /audio/i.test(accept)
      ? '入力音声'
      : /video/i.test(accept) && /image/i.test(accept)
        ? '参照素材'
        : /video/i.test(accept)
          ? '入力動画'
          : '参照画像'
    return { ...field, label }
  }
  const label = FIELD_LABELS[name]
  return label ? { ...field, label } : field
}

export function conciseFieldDescription(field: FieldSchema): string | null {
  if (isNsfwChecker(field)) return field.description ?? null
  const name = normalizedName(field.name)
  if (name === 'prompt') return '作りたい内容を具体的に入力します'
  if (name === 'negative_prompt' || name === 'negativeprompt') {
    return '含めたくない要素を入力します'
  }
  return null
}

export function fieldConstraintHint(field: FieldSchema): string | null {
  const parts: string[] = []
  if (typeof field.maxLength === 'number') {
    parts.push(`最大${field.maxLength.toLocaleString('ja-JP')}文字`)
  }
  if (field.type === 'number') {
    if (typeof field.min === 'number' && typeof field.max === 'number') {
      parts.push(`${field.min}〜${field.max}`)
    } else if (typeof field.min === 'number') {
      parts.push(`${field.min}以上`)
    } else if (typeof field.max === 'number') {
      parts.push(`${field.max}以下`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

export function shouldShowTechnicalDescription(field: FieldSchema): boolean {
  if (!field.description || isNsfwChecker(field)) return false
  return field.description !== conciseFieldDescription(field)
}

export function isAdvancedField(field: FieldSchema): boolean {
  if (field.required) return false
  const name = normalizedName(field.name)
  if (CORE_FIELD_NAMES.has(name)) return false
  if (
    field.type === 'reference' ||
    field.type === 'kling_elements' ||
    field.type === 'textarea'
  ) return false
  return true
}

export function modelInputSummary(model: ModelDefinition): string {
  const accepts = model.fields
    .filter((field) => field.type === 'reference')
    .map((field) => field.accept ?? field.name)
    .join(' ')
  const image = /image/i.test(accepts)
  const video = /video/i.test(accepts)
  const audio = /audio/i.test(accepts)
  const media = [image ? '画像' : '', video ? '動画' : '', audio ? '音声' : '']
    .filter(Boolean)
  return media.length > 0 ? `${media.join('・')}入力` : 'テキスト入力'
}
