import type { FieldSchema, ModelDefinition } from '../kie/types.ts'
import { readCatalog } from './sync.ts'
import { DEDICATED_MODELS } from './dedicated.ts'

function withUseCase(model: ModelDefinition): ModelDefinition {
  if (model.useCase) return model
  const hay = `${model.title} ${model.model}`.toLowerCase()
  if (model.category === 'audio') {
    if (/dialogue|conversation/.test(hay)) return { ...model, useCase: '会話' }
    if (/tts|speech|voice|narrat/.test(hay)) return { ...model, useCase: 'ナレーション' }
    if (/noise|separat|isolation|stem|enhance/.test(hay)) return { ...model, useCase: '音声処理' }
    return { ...model, useCase: '楽曲' }
  }
  if (model.category === 'video') {
    if (/upscale|enhance|4k|1080/.test(hay)) return { ...model, useCase: '高画質化' }
    if (/edit|video-to-video|lip.sync/.test(hay)) return { ...model, useCase: '映像編集' }
    return { ...model, useCase: '映像生成' }
  }
  if (/edit|image-to-image|inpaint|outpaint/.test(hay)) return { ...model, useCase: '画像編集' }
  return { ...model, useCase: '画像生成' }
}

function hydrateDedicatedModel(
  dedicated: ModelDefinition,
  catalogModels: ModelDefinition[],
): ModelDefinition {
  if (dedicated.provider !== 'market') return dedicated
  const catalogModel = catalogModels.find(
    (candidate) => candidate.provider === 'market' && candidate.model === dedicated.model,
  )
  if (!catalogModel) return dedicated

  const fields = catalogModel.fields.map((field): FieldSchema => {
    if (dedicated.id === 'market/elevenlabs-tts' && field.name === 'text') {
      return {
        ...field,
        label: '原稿',
        description: '空行で最大5000文字ずつのセグメントに分けます',
        maxLength: 20_000,
      }
    }
    if (dedicated.id === 'market/elevenlabs-dialogue' && field.name === 'stability') {
      return { ...field, min: 0, max: 1, step: 0.5, default: 0.5 }
    }
    if (dedicated.id === 'market/volcengine-lip-sync' && field.name === 'video_url') {
      return { ...field, accept: 'video/*', maxItems: 1, scalar: true }
    }
    if (dedicated.id === 'market/volcengine-lip-sync' && field.name === 'audio_url') {
      return { ...field, accept: 'audio/*', maxItems: 1, scalar: true }
    }
    return field
  })

  return {
    ...catalogModel,
    id: dedicated.id,
    title: dedicated.title,
    operation: dedicated.operation,
    useCase: dedicated.useCase,
    tags: dedicated.tags,
    docsUrl: dedicated.docsUrl ?? catalogModel.docsUrl,
    fields,
  }
}

export interface MergedModelsResult {
  syncedAt: string | null
  source: string
  models: ModelDefinition[]
}

/** Dedicated workflows merged over the synced docs catalog (deduped, useCase-filled). */
export async function listMergedModels(): Promise<MergedModelsResult | null> {
  const catalog = await readCatalog()
  if (!catalog) return null
  const dedicatedModels = DEDICATED_MODELS.map((model) =>
    hydrateDedicatedModel(model, catalog.models),
  )
  const models = [...dedicatedModels, ...catalog.models]
    .filter(
      (model, index, items) =>
        items.findIndex(
          (item) => item.provider === model.provider && item.model === model.model,
        ) === index,
    )
    .map(withUseCase)
  return { syncedAt: catalog.syncedAt, source: catalog.source, models }
}