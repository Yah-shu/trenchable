export type ModelCategory = 'image' | 'video' | 'audio'

export type Provider = 'market' | 'suno' | 'veo' | 'runway'

export type Operation =
  | 'generate'
  | 'extend'
  | 'upload-cover'
  | 'upload-extend'
  | 'replace-section'
  | 'cover-art'
  | 'lyrics'
  | 'upscale-1080p'
  | 'upscale-4k'
  | 'aleph'

export type MediaKind = 'image' | 'video' | 'audio' | 'text'

export type FieldType =
  | 'string'
  | 'textarea'
  | 'number'
  | 'boolean'
  | 'enum'
  | 'reference'
  | 'kling_elements'
  | 'json'

/** How to mention uploaded references inside the prompt */
export type MentionStyle =
  | 'at-image'
  | 'at-video'
  | 'at-audio'
  | 'bracket-image'
  | 'none'

export interface KlingElement {
  name: string
  description: string
  element_input_urls: string[]
  element_input_audio_urls?: string[]
  start_time?: number
  end_time?: number
}

export interface FieldSchema {
  name: string
  type: FieldType
  label: string
  description?: string
  required?: boolean
  default?: unknown
  enum?: string[]
  min?: number
  max?: number
  step?: number
  maxItems?: number
  maxLength?: number
  accept?: string
  maxFileSizeMb?: number
  maxDurationSec?: number
  conflictsWith?: string[]
  /** For reference fields: how to insert into prompt */
  mentionStyle?: MentionStyle
  /**
   * When true, the form stores string[] but the API payload is a single string
   * (first item). Used for OpenAPI string fields like image_url.
   */
  scalar?: boolean
}

export interface ModelDefinition {
  id: string
  model: string
  title: string
  category: ModelCategory
  provider: Provider
  operation?: Operation
  /** User-facing workflow grouping. Models remain a detail, not the entry point. */
  useCase?: string
  tags?: string[]
  docsUrl?: string
  fields: FieldSchema[]
}

export interface Catalog {
  syncedAt: string | null
  source: string
  /** SHA-256 (hex) of docs.kie.ai/llms.txt at last successful sync */
  sourceHash?: string
  models: ModelDefinition[]
}

export type TaskState =
  | 'waiting'
  | 'queuing'
  | 'generating'
  | 'success'
  | 'fail'
  | 'partial'
  | 'expired'
  | 'unknown'

export interface AlignedWord {
  word: string
  startS: number
  endS: number
  success?: boolean
  palign?: number
}

export interface MediaAsset {
  id?: string
  kind: MediaKind
  url?: string
  streamUrl?: string
  previewUrl?: string
  title?: string
  duration?: number
  mimeType?: string
  waveform?: number[]
  alignedWords?: AlignedWord[]
  expiresAt?: number
  providerAssetId?: string
  metadata?: Record<string, unknown>
  /** ローカル保存済みファイルの相対パス (server 基準)。存在すれば期限切れなし */
  localPath?: string
}

export interface NormalizedTask {
  taskId: string
  state: TaskState
  model?: string
  resultUrls: string[]
  provider: Provider
  operation: Operation
  media: MediaAsset[]
  parentTaskId?: string
  providerStatus?: string
  progress?: number
  partial?: boolean
  failMsg?: string
  failCode?: string
  costTime?: number
  createTime?: number
  updateTime?: number
  completeTime?: number
  creditsConsumed?: number
  expiresAt?: number
  rawParam?: unknown
  rawResult?: unknown
}

export interface HistoryItem {
  taskId: string
  model: string
  category: ModelCategory
  state: TaskState
  createdAt: number
  provider?: Provider
  operation?: Operation
  parentTaskId?: string
  media?: MediaAsset[]
  providerStatus?: string
  partial?: boolean
  expiresAt?: number
  rawParam?: unknown
  rawResult?: unknown
  resultUrls?: string[]
  prompt?: string
  creditsConsumed?: number
  failMsg?: string
  /** Catalog model id — used to restore the form (再利用/リトライ) */
  modelId?: string
  /** Full generation input — enables 再利用・リトライ・全文プロンプト表示 */
  input?: Record<string, unknown>
  /** ピン留め: 最大30件。押し出し・「すべて削除」の対象外 */
  pinned?: boolean
}

export type SubmissionQueueState =
  | 'unsent'
  | 'accepted'
  | 'generating'
  | 'cancelled'
  | 'failed'

export interface SubmissionQueueItem {
  id: string
  state: SubmissionQueueState
  provider: Provider
  operation: Operation
  model: string
  retryCount: number
  sendAfter: number
  createdAt: number
}

export interface SavedPersona {
  id: string
  personaId: string
  name: string
  description?: string
  sourceTaskId: string
  sourceAudioId: string
  createdAt: number
}

export interface SavedAudioAsset {
  id: string
  url: string
  name: string
  expiresAt?: number
  createdAt: number
}

export type QuickAction =
  | 'suno-extend'
  | 'suno-replace-section'
  | 'suno-upload-extend'
  | 'runway-aleph'
  | 'runway-extend'
  | 'veo-extend'
  | 'veo-1080p'
  | 'veo-4k'
  | 'lip-sync'
  | 'market-upscale'
  | 'market-edit'
