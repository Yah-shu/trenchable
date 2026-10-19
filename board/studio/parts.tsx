/**
 * The pieces every Studio surface is built from. One component per thing the UI
 * repeats. Skinned with Plinth
 * (theme/plinth.css): badges, tabs, the press on cards and the Generate button are the
 * shared classes; the rest is studio.css at the compact scale.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Minus, Plus, Sparkles, type LucideIcon } from 'lucide-react'
import { ModelMenu, useChoiceFamilies } from './ModelMenu.tsx'

/* ---------- small bits ---------- */

export function Badge({ children, quiet }: { children: ReactNode; quiet?: boolean }) {
  return <span className={`pl-badge ${quiet ? 'pl-badge--quiet' : 'pl-badge--coral'}`}>{children}</span>
}

/** Credit cost, always tabular so the number doesn't jiggle while you change options. */
export function CostTag({ credits }: { credits: number | null }) {
  if (credits == null) return null
  return (
    <span className="st-cost">
      <Sparkles size={11} />
      {/* 10, 57.4, 8.25 — never "10.00". */}
      {String(Number(credits.toFixed(2)))}
    </span>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="st-note">{children}</p>
}

/* ---------- popover ---------- */

/**
 * A menu anchored to the element it sits in. Closes on an outside click or Escape.
 *
 * It renders into <body> at a fixed position worked out from its anchor, because the
 * rail and the Advanced panel both scroll — an absolutely placed menu inside them gets
 * clipped at their edge. It opens upwards by default (most pickers live in a composer
 * pinned to the bottom of the screen), `down` for rails, and either way flips to
 * whichever side has room.
 */
export function Popover({
  onClose,
  children,
  down,
  wide,
  tall,
  className = '',
}: {
  onClose: () => void
  children: ReactNode
  down?: boolean
  wide?: boolean
  /** Let it grow to 520px instead of 340px (the model picker). */
  tall?: boolean
  className?: string
}) {
  const marker = useRef<HTMLSpanElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<CSSProperties | null>(null)

  useLayoutEffect(() => {
    const anchor = marker.current?.parentElement
    if (!anchor) return
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const below = window.innerHeight - r.bottom
      const above = r.top
      const openDown = down ? below >= 220 || below >= above : above < 220 && below > above
      const width = box.current?.offsetWidth ?? 240
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
      const cap = tall ? 520 : 340
      setPos(openDown ? { top: r.bottom + 6, left, maxHeight: Math.min(cap, below - 14) } : { bottom: window.innerHeight - r.top + 6, left, maxHeight: Math.min(cap, above - 14) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [down, tall])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!marker.current?.parentElement?.contains(t) && !box.current?.contains(t)) onClose()
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <>
      <span ref={marker} hidden />
      {createPortal(
        <div ref={box} className={`st-pop is-floating ${wide ? 'is-wide' : ''} ${className}`} style={{ position: 'fixed', ...pos, visibility: pos ? 'visible' : 'hidden' }}>
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}

export interface Choice {
  value: string
  label: string
  sub?: string
}

/**
 * The control pill their composer repeats: a label, the current value, a chevron, and a
 * list to pick from. With `search`, the list filters as you type (used for models).
 */
export function ControlPill({
  label,
  value,
  choices,
  onPick,
  icon: Icon,
  wide,
  search,
  disabled,
}: {
  label?: string
  value: string
  choices: Choice[]
  onPick: (value: string) => void
  icon?: LucideIcon
  wide?: boolean
  search?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const current = choices.find((c) => c.value === value)
  const shown = q.trim() ? choices.filter((c) => c.label.toLowerCase().includes(q.trim().toLowerCase())) : choices
  // A list of model families gets the reference app's model picker instead of the plain menu.
  const families = useChoiceFamilies(choices, Boolean(search))
  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        className={`st-pill ${wide ? 'is-model' : ''}`}
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        title={label}
      >
        {Icon && <Icon size={14} />}
        {label && wide && <span className="st-pill-label">{label}</span>}
        <span>{current?.label ?? value}</span>
        <ChevronDown size={13} className="st-pill-chev" />
      </button>
      {open && families && (
        <Popover onClose={() => setOpen(false)} tall className="is-models">
          <ModelMenu
            choices={choices}
            families={families}
            value={value}
            onPick={(v) => {
              onPick(v)
              setOpen(false)
            }}
          />
        </Popover>
      )}
      {open && !families && (
        <Popover onClose={() => setOpen(false)}>
          {search && (
            <input
              className="st-pop-search"
              placeholder="Search…"
              value={q}
              autoFocus
              onChange={(e) => setQ(e.target.value)}
            />
          )}
          {shown.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`st-pop-item ${c.value === value ? 'is-on' : ''}`}
              onClick={() => {
                onPick(c.value)
                setOpen(false)
                setQ('')
              }}
            >
              {c.value === value ? <Check size={13} /> : <span style={{ width: 13 }} />}
              <span>{c.label}</span>
              {c.sub && <span className="st-pop-sub">{c.sub}</span>}
            </button>
          ))}
          {!shown.length && <p className="st-pop-item">Nothing matches.</p>}
        </Popover>
      )}
    </div>
  )
}

/** An icon-only pill, for the composer's + and @ buttons. */
export function IconPill({
  icon: Icon,
  title,
  on,
  disabled,
  onClick,
}: {
  icon: LucideIcon
  title: string
  on?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button type="button" className={`st-pill is-icon ${on ? 'is-on' : ''}`} title={title} aria-label={title} disabled={disabled} onClick={onClick}>
      <Icon size={16} />
    </button>
  )
}

export function Stepper({ value, min = 1, max = 4, onChange }: { value: number; min?: number; max?: number; onChange: (n: number) => void }) {
  return (
    <div className="st-stepper">
      <button type="button" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="Fewer">
        <Minus size={14} />
      </button>
      <span className="st-stepper-value">
        {value}/{max}
      </span>
      <button type="button" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="More">
        <Plus size={14} />
      </button>
    </div>
  )
}

export function GoButton({
  label = 'Generate',
  credits,
  busy,
  disabled,
  wide,
  title,
  onClick,
}: {
  label?: string
  credits?: number | null
  busy?: boolean
  disabled?: boolean
  wide?: boolean
  /** How the cost was worked out, on hover. */
  title?: string
  onClick: () => void
}) {
  return (
    <button type="button" className={`plinth-btn plinth-btn--sm st-go ${wide ? 'plinth-btn--block is-wide' : ''}`} disabled={disabled || busy} onClick={onClick} title={title}>
      <span className="plinth-btn__face">
        <span className="plinth-btn__label">{busy ? 'Working…' : label}</span>
        <CostTag credits={credits ?? null} />
      </span>
    </button>
  )
}

/* ---------- tabs and chips ---------- */

/** One tab. `badge` is a small pill after the label — the reference app's "Styles · New". */
export interface TabDef<T extends string = string> {
  id: T
  label: string
  badge?: string
}

export function TabBar<T extends string>({ tabs, value, onPick }: { tabs: TabDef<T>[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="pl-tabs st-tabs" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === value}
          className={`pl-tab ${t.id === value ? 'is-active' : ''}`}
          onClick={() => onPick(t.id)}
        >
          {t.label}
          {t.badge && <span className="st-tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({
  options,
  value,
  onPick,
}: {
  options: { id: T; label: string; icon?: LucideIcon }[]
  value: T
  onPick: (id: T) => void
}) {
  return (
    <div className="st-chips">
      {options.map((o) => {
        const Icon = o.icon
        return (
          <button key={o.id} type="button" className={`st-chip ${o.id === value ? 'is-active' : ''}`} onClick={() => onPick(o.id)}>
            {Icon && <Icon size={12} />}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

/* ---------- rail form pieces ---------- */

export function SlotTile({
  icon: Icon,
  title,
  sub = 'Select a PNG or JPG from your device',
  optional,
  wide,
  thumb,
  onPick,
}: {
  icon: LucideIcon
  title: string
  sub?: string
  optional?: boolean
  wide?: boolean
  thumb?: string | null
  onPick: () => void
}) {
  return (
    <button type="button" className={`st-slot ${wide ? 'is-wide' : ''}`} onClick={onPick}>
      {optional && <span className="st-slot-opt">Optional</span>}
      {thumb ? (
        <img src={thumb} alt="" style={{ width: '100%', borderRadius: 8 }} />
      ) : (
        <span className="st-slot-icon">
          <Icon size={16} />
        </span>
      )}
      <span className="st-slot-title">{title}</span>
      {!thumb && <span className="st-slot-sub">{sub}</span>}
    </button>
  )
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="st-field">
      <span className="st-field-label">
        {label}
        {hint}
      </span>
      {children}
    </label>
  )
}

/** A whole-width row in the rail: name on the left, current value and chevron on the right. */
export function RowPick({
  label,
  value,
  choices,
  onPick,
  search,
  disabled,
}: {
  label: string
  value: string
  choices: Choice[]
  onPick: (v: string) => void
  /** Filter box for long lists (voices, languages). On by default past a dozen options. */
  search?: boolean
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const current = choices.find((c) => c.value === value)
  const searchable = search ?? choices.length > 12
  const needle = q.trim().toLowerCase()
  const shown = needle ? choices.filter((c) => `${c.label} ${c.sub ?? ''} ${c.value}`.toLowerCase().includes(needle)) : choices
  // A list of model families gets the reference app's model picker instead of the plain menu.
  const families = useChoiceFamilies(choices, searchable)
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="st-row" onClick={() => !disabled && setOpen((v) => !v)} disabled={disabled}>
        <span>{label}</span>
        <span className="st-row-value">
          {current?.label ?? value}
          <ChevronDown size={13} />
        </span>
      </button>
      {open && families && (
        <Popover onClose={() => setOpen(false)} down tall className="is-models">
          <ModelMenu
            choices={choices}
            families={families}
            value={value}
            onPick={(v) => {
              onPick(v)
              setOpen(false)
            }}
          />
        </Popover>
      )}
      {open && !families && (
        <Popover onClose={() => setOpen(false)}>
          {searchable && <input className="st-pop-search" placeholder="Search…" value={q} autoFocus onChange={(e) => setQ(e.target.value)} />}
          {!shown.length && <p className="st-pop-item">Nothing matches.</p>}
          {shown.map((c) => (
            <button
              key={c.value}
              type="button"
              className={`st-pop-item ${c.value === value ? 'is-on' : ''}`}
              onClick={() => {
                onPick(c.value)
                setOpen(false)
              }}
            >
              {c.value === value ? <Check size={13} /> : <span style={{ width: 13 }} />}
              <span>{c.label}</span>
              {c.sub && <span className="st-pop-sub">{c.sub}</span>}
            </button>
          ))}
        </Popover>
      )}
    </div>
  )
}

/* ---------- page furniture ---------- */

export function Hero({ kicker, title, sub, lede, strip }: { kicker?: string; title: string; sub?: string; lede?: string; strip?: number }) {
  return (
    <div className="st-hero">
      {strip ? (
        <div className="st-strip">
          {Array.from({ length: strip }, (_, i) => (
            <div key={i} />
          ))}
        </div>
      ) : null}
      {kicker && <span className="pl-eyebrow pl-eyebrow--pill">{kicker}</span>}
      <h1 className="st-display">
        {title}
        {sub && <em>{sub}</em>}
      </h1>
      {lede && <p className="st-lede">{lede}</p>}
    </div>
  )
}

export function SectionHead({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <div className="st-section-head">
      <h2 className="st-section-title">{title}</h2>
      {right && <div className="st-section-right">{right}</div>}
    </div>
  )
}

export function Empty({ icon: Icon, title, sub, cta }: { icon: LucideIcon; title: string; sub?: string; cta?: ReactNode }) {
  return (
    <div className="st-empty pl-panel pl-panel--paper">
      <span className="st-empty-icon">
        <Icon size={20} />
      </span>
      <p className="st-empty-title">{title}</p>
      {sub && <p className="st-empty-sub">{sub}</p>}
      {cta}
    </div>
  )
}

export interface CardItem {
  id: string
  title: string
  sub?: string
  tag?: string
  cover?: string | null
  video?: boolean
}

export function CardGrid({ items, wide, onOpen }: { items: CardItem[]; wide?: boolean; onOpen?: (id: string) => void }) {
  return (
    <div className={`st-grid ${wide ? 'is-wide' : ''}`}>
      {items.map((it) => (
        <button key={it.id} type="button" className="pl-press st-gcard" onClick={() => onOpen?.(it.id)}>
          <span className="pl-panel st-gcard-face">
            <span className="st-gcard-cover">
              {it.cover ? it.video ? <video src={it.cover} muted loop playsInline preload="metadata" /> : <img src={it.cover} alt="" loading="lazy" /> : null}
            </span>
            <span className="st-gcard-body">
              <span className="min-w-0">
                <span className="st-gcard-title">{it.title}</span>
                {it.sub && <span className="st-gcard-sub"> {it.sub}</span>}
              </span>
              {it.tag && (
                <span className="st-gcard-tag">
                  <Badge quiet>{it.tag}</Badge>
                </span>
              )}
            </span>
          </span>
        </button>
      ))}
    </div>
  )
}

export function ToolCard({ title, sub, cta, onClick }: { title: string; sub: string; cta: string; onClick: () => void }) {
  return (
    <button type="button" className="pl-press st-tool" onClick={onClick}>
      <span className="pl-panel st-tool-face">
        <span className="st-tool-title">{title}</span>
        <span className="st-tool-sub">{sub}</span>
        <span className="st-tool-cta">{cta}</span>
      </span>
    </button>
  )
}
