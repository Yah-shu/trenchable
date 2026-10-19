/** One trimmed reference clip, as Kie's `video_list` items expect. */
export interface VideoClip {
  url: string
  start: number
  ends: number
}

/** Kie limits: 1 clip, ≤100MB, ≤30s source, trim window ≤10s. */
export const VIDEO_CLIP_LIMITS = { maxFileSizeMb: 100, maxDurationSec: 30, maxTrimSec: 10 }

export function readVideoClip(value: unknown): VideoClip | null {
  const first = Array.isArray(value) ? value[0] : null
  if (!first || typeof first !== 'object') return null
  const clip = first as Partial<VideoClip>
  if (typeof clip.url !== 'string' || !clip.url) return null
  return { url: clip.url, start: Number(clip.start) || 0, ends: Number(clip.ends) || 0 }
}

export function videoClipError(value: unknown): string | null {
  const clip = readVideoClip(value)
  if (!clip) return null
  if (clip.start < 0) return 'Start must be 0 or later'
  if (clip.ends <= clip.start) return 'End must be after start'
  if (clip.ends - clip.start > VIDEO_CLIP_LIMITS.maxTrimSec) {
    return `The trimmed clip can be at most ${VIDEO_CLIP_LIMITS.maxTrimSec} seconds`
  }
  if (clip.ends > VIDEO_CLIP_LIMITS.maxDurationSec) {
    return `End can be at most ${VIDEO_CLIP_LIMITS.maxDurationSec} seconds`
  }
  return null
}
