/**
 * Extra pictures for Edit: "put this product in her hand", "dress him in this jacket".
 * The editors take a list of pictures; the first is the one being edited, these follow
 * it, and the prompt can refer to them as the second picture, the third…
 */
import { useRef, useState } from 'react'
import { AtSign, Loader2, Plus, X } from 'lucide-react'
import { mediaUrl } from '../../api.ts'
import { uploadMedia } from '../../library.ts'
import { MentionPicker } from '../../Mentions.tsx'
import { hostForKie } from '../../mentions.ts'
import type { SourceImage } from './pixels.ts'

export function RefStrip({ value, onChange, max = 4, onError, disabled }: { value: SourceImage[]; onChange: (v: SourceImage[]) => void; max?: number; onError?: (m: string) => void; disabled?: string | null }) {
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const add = (img: SourceImage) => onChange([...value, img].slice(0, max))

  const upload = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      const { fileUrl } = await uploadMedia(f)
      add({ url: fileUrl, local: URL.createObjectURL(f) })
    } catch (e) {
      onError?.((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ed-control">
      <span className="ed-control-label">More pictures (optional)</span>
      {disabled ? (
        <p className="ed-hint">{disabled}</p>
      ) : (
        <div className="ed-refs">
          {value.map((r, i) => (
            <span key={`${r.url}-${i}`} className="ed-ref">
              <img src={r.local ?? r.url} alt="" />
              <span className="ed-ref-n">{i + 2}</span>
              <button type="button" className="ed-ref-x" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}>
                <X size={11} />
              </button>
            </span>
          ))}
          {value.length < max && (
            <span className="ed-ref-add">
              <button type="button" className="pl-iconbtn ed-iconbtn" title="Upload a picture" aria-label="Upload a picture" onClick={() => file.current?.click()}>
                {busy ? <Loader2 size={14} className="st-spin" /> : <Plus size={14} />}
              </button>
              <button type="button" className="pl-iconbtn ed-iconbtn" title="Pick from your work" aria-label="Pick from your work" onClick={() => setPicking((v) => !v)}>
                <AtSign size={14} />
              </button>
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
                    void hostForKie(media)
                      .then((url) => add({ url, local: mediaUrl(media) }))
                      .catch((e: unknown) => onError?.((e as Error).message))
                      .finally(() => setBusy(false))
                  }}
                />
              )}
            </span>
          )}
        </div>
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
