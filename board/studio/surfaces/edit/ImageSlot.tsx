/**
 * The one-picture input every Edit tool and Layers starts from: upload, drop, or pick
 * something you already made.
 *
 * Unlike a rail slot it keeps two addresses for the picture — the Kie-hosted one that
 * goes into the job, and a copy this page can read pixels from (the file you dropped,
 * or our archive of a past result) — because the mask painter, Reframe's padding and the
 * Layers composite all need to draw it, and Kie's upload host doesn't allow that.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AtSign, ImagePlus, Loader2, X, type LucideIcon } from 'lucide-react'
import { mediaUrl } from '../../api.ts'
import { uploadMedia } from '../../library.ts'
import { MentionPicker } from '../../Mentions.tsx'
import { hostForKie } from '../../mentions.ts'
import { SlotTile } from '../../parts.tsx'
import { naturalSize, type SourceImage } from './pixels.ts'

export function ImageSlot({
  title = 'Image',
  sub = 'Drop a PNG or JPG, or pick one you made',
  icon = ImagePlus,
  value,
  onChange,
  onError,
  extra,
}: {
  title?: string
  sub?: string
  icon?: LucideIcon
  value: SourceImage | null
  onChange: (img: SourceImage | null) => void
  onError?: (message: string) => void
  extra?: ReactNode
}) {
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const file = useRef<HTMLInputElement>(null)

  const fail = (e: unknown) => onError?.((e as Error).message)

  const upload = async (f: File | undefined) => {
    if (!f || !f.type.startsWith('image')) return
    setBusy(true)
    const local = URL.createObjectURL(f)
    try {
      const [{ fileUrl }, size] = await Promise.all([uploadMedia(f), naturalSize({ url: local, local })])
      onChange({ url: fileUrl, local, width: size.width, height: size.height })
    } catch (e) {
      URL.revokeObjectURL(local)
      fail(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="st-slot-wrap is-wide ed-slot"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        const f = e.dataTransfer.files?.[0]
        if (!f) return
        e.preventDefault()
        void upload(f)
      }}
    >
      <SlotTile icon={icon} title={title} sub={sub} wide thumb={value ? (value.local ?? value.url) : null} onPick={() => file.current?.click()} />
      {busy && <Loader2 size={14} className="st-spin st-slot-busy" />}
      <span className="st-slot-tools">
        <button type="button" className="st-slot-tool" title="Pick from your work" onClick={() => setPicking((v) => !v)}>
          <AtSign size={12} />
        </button>
        {value && (
          <button type="button" className="st-slot-tool" title="Remove" onClick={() => onChange(null)}>
            <X size={12} />
          </button>
        )}
      </span>
      {value?.width && value.height ? (
        <span className="ed-slot-size">
          {value.width}×{value.height}
        </span>
      ) : null}
      {extra}
      {picking && (
        <MentionPicker
          model={null}
          kind="image"
          placement="down"
          refs={[]}
          onClose={() => setPicking(false)}
          onPick={({ media }) => {
            setPicking(false)
            setBusy(true)
            const local = mediaUrl(media)
            void Promise.all([hostForKie(media), local ? naturalSize({ url: local, local }).catch(() => null) : Promise.resolve(null)])
              .then(([url, size]) => onChange({ url, local, ...(size ?? {}) }))
              .catch(fail)
              .finally(() => setBusy(false))
          }}
        />
      )}
      <input
        ref={file}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          void upload(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

/** Fill in a picture's size when it arrived without one (a handoff carries only a URL). */
export function useNaturalSize(value: SourceImage | null, onChange: (img: SourceImage) => void) {
  const latest = useRef(onChange)
  latest.current = onChange
  useEffect(() => {
    if (!value || (value.width && value.height)) return
    let live = true
    void naturalSize(value)
      .then((s) => live && latest.current({ ...value, width: s.width, height: s.height }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [value])
}
