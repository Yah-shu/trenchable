import { ArrowDown, ArrowUp, Plus, Play, Trash2 } from 'lucide-react'
import { Pressable } from '../motion/Pressable.tsx'

type DialogueLine = { text: string; voice: string }

function parseDialogue(value: unknown): DialogueLine[] {
  if (!Array.isArray(value)) return [{ text: '', voice: '' }, { text: '', voice: '' }]
  const rows = value.flatMap((entry): DialogueLine[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
    const row = entry as Record<string, unknown>
    return [{
      text: typeof row.text === 'string' ? row.text : '',
      voice: typeof row.voice === 'string'
        ? row.voice
        : typeof row.voice_id === 'string'
          ? row.voice_id
          : '',
    }]
  })
  return rows.length ? rows : [{ text: '', voice: '' }]
}

export function DialogueEditor({
  value,
  disabled,
  onChange,
}: {
  value: unknown
  disabled?: boolean
  onChange: (value: DialogueLine[]) => void
}) {
  const rows = parseDialogue(value)
  function update(index: number, patch: Partial<DialogueLine>) {
    onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row))
  }
  function move(index: number, direction: -1 | 1) {
    const next = [...rows]
    const target = index + direction
    if (target < 0 || target >= next.length) return
    const [row] = next.splice(index, 1)
    if (row) next.splice(target, 0, row)
    onChange(next)
  }
  function preview(text: string) {
    if (!('speechSynthesis' in window) || !text.trim()) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="studio-label">話者 {index + 1}</span>
            <div className="flex gap-1">
              <Pressable className="studio-btn grid size-7 place-items-center p-0" onClick={() => move(index, -1)} disabled={disabled || index === 0} aria-label="上へ"><ArrowUp size={12} /></Pressable>
              <Pressable className="studio-btn grid size-7 place-items-center p-0" onClick={() => move(index, 1)} disabled={disabled || index === rows.length - 1} aria-label="下へ"><ArrowDown size={12} /></Pressable>
              <Pressable className="studio-btn grid size-7 place-items-center p-0" onClick={() => preview(row.text)} disabled={disabled || !row.text.trim()} aria-label="ブラウザ音声で試聴"><Play size={12} /></Pressable>
              <Pressable className="studio-btn grid size-7 place-items-center p-0 text-[var(--danger)]" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} disabled={disabled || rows.length === 1} aria-label="削除"><Trash2 size={12} /></Pressable>
            </div>
          </div>
          <input className="studio-input mb-2 w-full" value={row.voice} onChange={(event) => update(index, { voice: event.target.value })} placeholder="Voice ID" disabled={disabled} />
          <textarea className="studio-input min-h-20 w-full resize-y" value={row.text} onChange={(event) => update(index, { text: event.target.value })} placeholder="この話者のセリフ" disabled={disabled} />
        </div>
      ))}
      <Pressable className="studio-btn inline-flex w-full items-center justify-center gap-1" onClick={() => onChange([...rows, { text: '', voice: '' }])} disabled={disabled}>
        <Plus size={13} /> 話者行を追加
      </Pressable>
      <p className="text-[10px] text-[var(--text-muted)]">試聴はVoice IDとは別のブラウザ音声です。最終音声は生成後に確認できます。</p>
    </div>
  )
}

function splitNarration(value: string): string[] {
  const segments = value.split(/\n\s*\n/g)
  return segments.length ? segments : ['']
}

export function NarrationEditor({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const segments = splitNarration(value)
  const update = (index: number, text: string) => {
    onChange(segments.map((segment, segmentIndex) => segmentIndex === index ? text : segment).join('\n\n'))
  }
  return (
    <div className="space-y-2">
      {segments.map((segment, index) => {
        const previous = segments[index - 1]?.slice(-120)
        const next = segments[index + 1]?.slice(0, 120)
        return (
          <div key={index} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 flex items-center justify-between"><span className="studio-label">セグメント {index + 1}</span><span className="text-[10px] text-[var(--text-muted)]">{segment.length}文字</span></div>
            <textarea className="studio-input min-h-24 w-full resize-y" value={segment} onChange={(event) => update(index, event.target.value)} disabled={disabled} />
            {(previous || next) && (
              <div className="mt-2 grid gap-1 text-[10px] text-[var(--text-muted)]">
                {previous && <p><span className="font-semibold">前文:</span> …{previous}</p>}
                {next && <p><span className="font-semibold">次文:</span> {next}…</p>}
              </div>
            )}
          </div>
        )
      })}
      <Pressable className="studio-btn inline-flex w-full items-center justify-center gap-1" onClick={() => onChange(`${value}${value ? '\n\n' : ''}`)} disabled={disabled}><Plus size={13} /> セグメントを追加</Pressable>
      <p className="text-[10px] text-[var(--text-muted)]">空行で分割します。送信時は前後の文脈を連続した原稿として保持するため、声の流れが切れにくくなります。</p>
    </div>
  )
}
