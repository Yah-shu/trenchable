import type { ModelDefinition } from './models/types.ts'

export function validateWorkflowInput(
  model: ModelDefinition,
  values: Record<string, unknown>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (
    model.provider === 'suno' &&
    (model.id === 'suno/music' || model.operation === 'upload-cover')
  ) {
    const customMode = values.customMode !== false
    const instrumental = values.instrumental === true
    const prompt = typeof values.prompt === 'string' ? values.prompt.trim() : ''
    const style = typeof values.style === 'string' ? values.style.trim() : ''
    const title = typeof values.title === 'string' ? values.title.trim() : ''
    const modelName = typeof values.model === 'string' ? values.model : 'V5'
    if (!prompt && (!customMode || !instrumental)) {
      errors.prompt = customMode
        ? '歌詞ありの曲では歌詞または作曲指示を入力してください'
        : '作りたい曲を500文字以内で入力してください'
    }
    if (customMode && !style) errors.style = 'Custom modeではスタイルが必須です'
    if (customMode && !title) errors.title = 'Custom modeではタイトルが必須です'

    const promptLimit = customMode ? (modelName === 'V4' ? 3000 : 5000) : 500
    const styleLimit = modelName === 'V4' ? 200 : 1000
    if (prompt.length > promptLimit) {
      errors.prompt = `このモードの指示は${promptLimit}文字以内にしてください`
    }
    if (customMode && style.length > styleLimit) {
      errors.style = `${modelName}のスタイルは${styleLimit}文字以内にしてください`
    }
  }
  if (model.provider === 'suno' && model.operation === 'replace-section') {
    const start = Number(values.infillStartS)
    const end = Number(values.infillEndS)
    const duration = Number(values._duration)
    const length = end - start
    if (!Number.isFinite(start) || !Number.isFinite(end) || length < 6 || length > 60) {
      errors.infillEndS = '作り直す区間は6〜60秒にしてください'
    } else if (Number.isFinite(duration) && duration > 0 && length > duration / 2) {
      errors.infillEndS = '作り直す区間は曲全体の50%以下にしてください'
    }
  }
  if (
    model.provider === 'runway' &&
    model.operation === 'generate' &&
    String(values.duration) === '10' &&
    values.quality === '1080p'
  ) {
    errors.quality = 'Runwayの10秒生成では1080pを選べません'
  }
  if (model.id === 'market/elevenlabs-tts' && typeof values.text === 'string') {
    const segments = values.text.split(/\n\s*\n/g).filter((text) => text.trim())
    if (segments.some((text) => text.length > 5000)) {
      errors.text = '各ナレーションセグメントは5000文字以内にしてください'
    }
  }
  if (model.id === 'market/volcengine-lip-sync') {
    const videos = Array.isArray(values.video_url) ? values.video_url : []
    const audio = Array.isArray(values.audio_url) ? values.audio_url : []
    if (videos.length !== 1) errors.video_url = '動画を1件選択してください'
    if (audio.length !== 1) errors.audio_url = '音声を1件選択してください'
  }
  return errors
}

export function sanitizeWorkflowInput(
  model: ModelDefinition,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const sanitized = { ...input }
  if (
    model.provider === 'suno' &&
    (model.id === 'suno/music' || model.operation === 'upload-cover') &&
    sanitized.customMode === false
  ) {
    delete sanitized.style
    delete sanitized.title
    delete sanitized.negativeTags
    delete sanitized.personaId
  }
  return sanitized
}
