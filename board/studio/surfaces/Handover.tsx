/**
 * ShellSurface: the layout is here, but nothing is behind it — the page says what it would take rather than
 * pretending to work. A paper panel with an eyebrow.
 *
 * Handover is for surfaces another tool does instead; this app has none, so it renders nothing.
 */
import { Construction } from 'lucide-react'
import type { Surface } from '../nav.ts'

export function Handover(_props: { surface: Surface }) {
  return null
}

export function ShellSurface({ surface }: { surface: Surface }) {
  return (
    <div className="st-page">
      <div className="pl-press st-soon">
        <div className="pl-panel pl-panel--paper">
          <div className="pl-panel__body">
            <span className="pl-eyebrow">Not built yet</span>
            <h2 className="pl-h2 st-soon-title">
              <Construction size={20} /> {surface.label}
            </h2>
            {surface.missing && <p className="pl-lead st-soon-lede">{surface.missing}</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
