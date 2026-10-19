/**
 * Cinema's pickers, as the reference app lays them out: a Camera modal (Setup wheels and a
 * Movement library of named moves you put on the shot in order), a Film setup modal
 * (Genre / Era / Tempo), and preset modals for colour palette and lighting. Each has
 * Reset all. They only edit the look (camera.ts); the words reach the prompt through
 * the composer's `dress`.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, ArrowRight, Check, Plus, Search, X } from 'lucide-react'
import { TabBar } from '../../parts.tsx'
import { QuietBtn } from '../pageParts.tsx'
import { addMove, AUTO, FILM_TABS, LIGHTS, MOVES, PALETTES, removeMove, shiftMove, WHEELS, type CinemaLook, type LookOption, type Mode } from './camera.ts'
import '../studio-pages.css'

/* ---------- the modal shell ---------- */

export function Modal({ title, onClose, onReset, children, wide }: { title: string; onClose: () => void; onReset?: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="sp-modal-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sp-modal pl-panel ${wide ? 'is-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sp-modal-head">
          <p className="sp-panel-title">{title}</p>
          <span className="sp-head-actions">
            {onReset && <QuietBtn onClick={onReset}>Reset all</QuietBtn>}
            <button type="button" className="pl-iconbtn is-quiet" aria-label="Close" onClick={onClose}>
              <X size={16} />
            </button>
          </span>
        </div>
        <div className="sp-modal-body">{children}</div>
      </div>
    </div>
  )
}

/* ---------- camera ---------- */

function Wheel({ label, options, value, onPick }: { label: string; options: LookOption[]; value: string | undefined; onPick: (id: string) => void }) {
  const list = useRef<HTMLDivElement>(null)
  const current = value ?? AUTO
  // Centre the chosen value, like a wheel at rest.
  useEffect(() => {
    const on = list.current?.querySelector<HTMLElement>('.is-on')
    on?.scrollIntoView?.({ block: 'center' })
  }, [current])
  return (
    <div className="sp-wheel">
      <span className="sp-wheel-label">{label}</span>
      <div ref={list} className="sp-wheel-list" role="listbox" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} type="button" role="option" aria-selected={o.id === current} className={`sp-wheel-item ${o.id === current ? 'is-on' : ''}`} onClick={() => onPick(o.id)} title={o.note}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function CameraModal({ look, mode, onChange, onClose }: { look: CinemaLook; mode: Mode; onChange: (next: CinemaLook) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'setup' | 'movement'>('setup')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<'theirs' | 'az'>('theirs')
  const moves = look.moves ?? []
  const needle = q.trim().toLowerCase()
  const found = MOVES.filter((m) => !needle || `${m.label} ${m.words}`.toLowerCase().includes(needle))
  const shown = sort === 'az' ? [...found].sort((a, b) => a.label.localeCompare(b.label)) : found

  return (
    <Modal title="Camera" wide onClose={onClose} onReset={() => onChange({ ...look, camera: AUTO, lens: AUTO, aperture: AUTO, moves: [] })}>
      <TabBar
        tabs={[
          { id: 'setup' as const, label: 'Setup' },
          { id: 'movement' as const, label: `Movement${moves.length ? ` (${moves.length})` : ''}` },
        ]}
        value={tab}
        onPick={setTab}
      />
      {tab === 'setup' ? (
        <div className="sp-wheels">
          {WHEELS.map((w) => (
            <Wheel key={w.key} label={w.label} options={w.options} value={look[w.key]} onPick={(id) => onChange({ ...look, [w.key]: id })} />
          ))}
        </div>
      ) : (
        <div className="sp-moves">
          <p className="sp-hint">
            Direct a camera move. Put several on one shot — they happen in the order listed here.
            {mode === 'image' ? ' Moves only apply in Video mode; they are kept for when you switch.' : ''}
          </p>
          <div className="sp-move-shot">
            <span className="sp-label-inline">On this shot</span>
            {moves.length ? (
              moves.map((id, i) => {
                const m = MOVES.find((x) => x.id === id)
                if (!m) return null
                return (
                  <span key={id} className="sp-move-chip">
                    <span className="sp-move-n">{i + 1}</span>
                    {m.label}
                    <button type="button" aria-label={`Earlier: ${m.label}`} disabled={i === 0} onClick={() => onChange({ ...look, moves: shiftMove(moves, id, -1) })}>
                      <ArrowLeft size={11} />
                    </button>
                    <button type="button" aria-label={`Later: ${m.label}`} disabled={i === moves.length - 1} onClick={() => onChange({ ...look, moves: shiftMove(moves, id, 1) })}>
                      <ArrowRight size={11} />
                    </button>
                    <button type="button" aria-label={`Take off: ${m.label}`} onClick={() => onChange({ ...look, moves: removeMove(moves, id) })}>
                      <X size={11} />
                    </button>
                  </span>
                )
              })
            ) : (
              <span className="sp-hint">Nothing yet — the model picks the camera work.</span>
            )}
          </div>
          <div className="sp-move-tools">
            <label className="st-mention-search sp-search">
              <Search size={13} />
              <input placeholder="Search moves…" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select className="sp-input sp-move-sort" value={sort} onChange={(e) => setSort(e.target.value as 'theirs' | 'az')} aria-label="Sort by">
              <option value="theirs">Sort: popular</option>
              <option value="az">Sort: A–Z</option>
            </select>
          </div>
          <div className="sp-move-grid">
            {shown.map((m) => {
              const at = moves.indexOf(m.id)
              return (
                <div key={m.id} className={`sp-move ${at >= 0 ? 'is-on' : ''}`}>
                  <span className="sp-move-title">{m.label}</span>
                  <span className="sp-move-note">{m.note}</span>
                  {at >= 0 ? (
                    <QuietBtn icon={Check} onClick={() => onChange({ ...look, moves: removeMove(moves, m.id) })} title="Take it off the shot">
                      On the shot · {at + 1}
                    </QuietBtn>
                  ) : (
                    <QuietBtn icon={Plus} onClick={() => onChange({ ...look, moves: addMove(moves, m.id) })} title="Add it to the end of the shot">
                      Put on prompt
                    </QuietBtn>
                  )}
                </div>
              )
            })}
            {!shown.length && <p className="sp-hint">No move matches.</p>}
          </div>
        </div>
      )}
    </Modal>
  )
}

/* ---------- film look ---------- */

export function FilmLookModal({ look, mode, onChange, onClose }: { look: CinemaLook; mode: Mode; onChange: (next: CinemaLook) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'genre' | 'era' | 'tempo'>('genre')
  const current = FILM_TABS.find((t) => t.key === tab)!
  const value = look[tab] ?? (tab === 'genre' ? 'general' : AUTO)
  return (
    <Modal title="Film setup" onClose={onClose} onReset={() => onChange({ ...look, genre: 'general', era: AUTO, tempo: AUTO })}>
      <TabBar tabs={FILM_TABS.map((t) => ({ id: t.key, label: t.label }))} value={tab} onPick={setTab} />
      <p className="sp-hint">
        {current.note}
        {current.videoOnly && mode === 'image' ? ' Tempo only applies in Video mode.' : ''}
      </p>
      <OptionGrid options={current.options} value={value} onPick={(id) => onChange({ ...look, [tab]: id })} />
    </Modal>
  )
}

/* ---------- palette and lighting ---------- */

export function PresetModal({ kind, look, onChange, onClose }: { kind: 'palette' | 'lighting'; look: CinemaLook; onChange: (next: CinemaLook) => void; onClose: () => void }) {
  const options = kind === 'palette' ? PALETTES : LIGHTS
  return (
    <Modal title={kind === 'palette' ? 'Color palette' : 'Lighting'} onClose={onClose} onReset={() => onChange({ ...look, [kind]: AUTO })}>
      <OptionGrid
        options={options}
        value={look[kind] ?? AUTO}
        onPick={(id) => {
          onChange({ ...look, [kind]: id })
          onClose()
        }}
      />
    </Modal>
  )
}

function OptionGrid({ options, value, onPick }: { options: LookOption[]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="sp-look-grid">
      {options.map((o) => (
        <button key={o.id} type="button" className={`sp-look ${o.id === value ? 'is-on' : ''}`} aria-pressed={o.id === value} onClick={() => onPick(o.id)} title={o.words || 'Let the model decide'}>
          {o.swatch && (
            <span className="sp-swatch">
              {o.swatch.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </span>
          )}
          <span className="sp-look-title">{o.label}</span>
          {(o.note || o.words) && <span className="sp-look-note">{o.note ?? o.words}</span>}
        </button>
      ))}
    </div>
  )
}
