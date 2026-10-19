import { ReferenceUpload } from './ReferenceUpload.tsx'
import {
  VIDEO_CLIP_LIMITS,
  readVideoClip,
  videoClipError,
  type VideoClip,
} from '../lib/videoClip.ts'

/**
 * Upload + trim editor for a reference video (`video_list`). Replaces the raw
 * JSON textarea; an empty selection yields '' so the field is omitted.
 */
export function VideoClipEditor({
  value,
  onChange,
  disabled,
  inputId,
}: {
  value: unknown
  onChange: (next: VideoClip[] | '') => void
  disabled?: boolean
  inputId?: string
}) {
  const clip = readVideoClip(value)
  const error = videoClipError(value)

  function setUrl(urls: string[]) {
    const url = urls[0]
    if (!url) {
      onChange('')
      return
    }
    onChange([{ url, start: clip?.start ?? 0, ends: clip?.ends || VIDEO_CLIP_LIMITS.maxTrimSec }])
  }

  function setTime(key: 'start' | 'ends', raw: string) {
    if (!clip) return
    const n = Number(raw)
    onChange([{ ...clip, [key]: Number.isFinite(n) ? n : 0 }])
  }

  return (
    <div className="space-y-2">
      <ReferenceUpload
        inputId={inputId}
        value={clip ? [clip.url] : []}
        onChange={setUrl}
        maxItems={1}
        accept="video/mp4,video/quicktime,video/webm,video/*"
        maxFileSizeMb={VIDEO_CLIP_LIMITS.maxFileSizeMb}
        maxDurationSec={VIDEO_CLIP_LIMITS.maxDurationSec}
        disabled={disabled}
        mentionStyle="none"
      />
      {clip && (
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs">
            <span className="studio-label">Use from (sec)</span>
            <input
              type="number"
              className="studio-input"
              min={0}
              max={VIDEO_CLIP_LIMITS.maxDurationSec}
              step={0.1}
              value={clip.start}
              disabled={disabled}
              onChange={(e) => setTime('start', e.target.value)}
            />
          </label>
          <label className="text-xs">
            <span className="studio-label">Until (sec)</span>
            <input
              type="number"
              className="studio-input"
              min={0}
              max={VIDEO_CLIP_LIMITS.maxDurationSec}
              step={0.1}
              value={clip.ends}
              disabled={disabled}
              onChange={(e) => setTime('ends', e.target.value)}
            />
          </label>
        </div>
      )}
      <p className="text-[11px] opacity-70">
        1 video, up to 100MB and 30s long. Pick a window of up to 10s to use as the
        reference. Can’t be combined with a first-frame image.
      </p>
      {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
    </div>
  )
}
