/**
 * Pick pictures from your own past results to turn into element pictures.
 *
 * Multi-select, newest first, with a prompt search — the same idea as the `@` list,
 * but it hands back library sources (an archived /media path or the provider link)
 * because the library copies the file in rather than mentioning it.
 */
import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { useHistory } from '../api.ts'
import { pastImages } from './model.ts'
import { Btn } from '../surfaces/pageParts.tsx'
import '../surfaces/studio-pages.css'

export function PastPicker({ max, onAdd, onCancel, busy }: { max: number; onAdd: (sources: string[]) => void; onCancel: () => void; busy?: boolean }) {
  const { items } = useHistory()
  const all = useMemo(() => pastImages(items), [items])
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const needle = q.trim().toLowerCase()
  const shown = needle ? all.filter((p) => p.prompt.toLowerCase().includes(needle)) : all

  const toggle = (source: string) =>
    setPicked((now) => (now.includes(source) ? now.filter((s) => s !== source) : now.length >= max ? now : [...now, source]))

  return (
    <div className="sp-past pl-panel">
      <div className="sp-past-head">
        <label className="st-mention-search sp-past-search">
          <Search size={13} />
          <input placeholder="Search your images by prompt…" value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
        <span className="sp-hint">
          {picked.length}/{max} picked
        </span>
      </div>
      {!items ? (
        <p className="sp-hint">Loading your work…</p>
      ) : !shown.length ? (
        <p className="sp-hint">{all.length ? 'Nothing matches.' : 'No finished images yet. Make some first, then come back.'}</p>
      ) : (
        <div className="sp-past-grid">
          {shown.slice(0, 120).map((p) => {
            const on = picked.includes(p.source)
            return (
              <button key={p.key} type="button" className={`sp-past-item ${on ? 'is-on' : ''}`} title={p.prompt} onClick={() => toggle(p.source)} disabled={!on && picked.length >= max}>
                <img src={p.source} alt="" loading="lazy" />
                {on && (
                  <span className="sp-choice-tick">
                    <Check size={11} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
      <div className="sp-row-end">
        <Btn ghost onClick={onCancel}>
          Cancel
        </Btn>
        <Btn onClick={() => onAdd(picked)} disabled={!picked.length || busy}>
          {busy ? 'Adding…' : `Add ${picked.length || ''} ${picked.length === 1 ? 'picture' : 'pictures'}`.replace('  ', ' ')}
        </Btn>
      </div>
    </div>
  )
}
