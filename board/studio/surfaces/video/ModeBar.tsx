/**
 * The mode switch at the top of a rail (Video's Create / Extend / … and Audio's tabs).
 *
 * Their rail opens with its mode tabs; six of them don't fit one row of pill tabs in a
 * 330px rail, so this is a compact wrapping grid of icon + label buttons. `How` is the
 * "How it works" pane each mode fills with its own three steps.
 */
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import '../media.css'

export interface ModeSpec<T extends string> {
  id: T
  label: string
  icon: LucideIcon
}

export function ModeBar<T extends string>({ modes, value, onPick }: { modes: ModeSpec<T>[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="st-modebar" role="tablist">
      {modes.map(({ id, label, icon: Icon }) => (
        <button key={id} type="button" role="tab" aria-selected={id === value} className={`st-mode ${id === value ? 'is-active' : ''}`} onClick={() => onPick(id)}>
          <Icon size={14} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
}

/** A two- or three-way switch inside a mode (Frames / References, From a clip / From a photo). */
export function SubSwitch<T extends string>({ options, value, onPick }: { options: { id: T; label: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="st-subswitch" role="tablist">
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={o.id === value} className={o.id === value ? 'is-active' : ''} onClick={() => onPick(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** The "How it works" pane: a title, numbered steps, and an optional footnote. */
export function How({ title, steps, foot }: { title: string; steps: ReactNode[]; foot?: ReactNode }) {
  return (
    <div className="st-how pl-panel">
      <h3 className="st-how-title">{title}</h3>
      <ol className="st-how-steps">
        {steps.map((s, i) => (
          <li key={i}>
            <span className="st-how-num">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {foot && <p className="st-how-foot">{foot}</p>}
    </div>
  )
}

/** A short line of guidance under a rail control. */
export const Hint = ({ children, warn }: { children: ReactNode; warn?: boolean }) => <p className={`st-hint ${warn ? 'is-warn' : ''}`}>{children}</p>

/**
 * Video's three tabs across the top of the rail — Create Video · Edit Video · Motion
 * Control — as theirs: plain text tabs with the active one underlined, not mode pills.
 */
export function TopTabs<T extends string>({ tabs, value, onPick }: { tabs: { id: T; label: string }[]; value: T; onPick: (id: T) => void }) {
  return (
    <div className="st-vtabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === value} className={t.id === value ? 'is-active' : ''} onClick={() => onPick(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
