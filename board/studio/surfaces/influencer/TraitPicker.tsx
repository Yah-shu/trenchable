/**
 * The trait wall for the AI Influencer builder: the character type, then one fold per
 * trait group with its options as chips. A fold's summary shows what is picked, so the
 * closed groups still say what they will add to the prompt.
 */
import { Dices, RotateCcw } from 'lucide-react'
import { groupsFor, TIERS, toggleTrait, type Selection } from './traits.ts'
import { QuietBtn } from '../pageParts.tsx'
import '../studio-pages.css'

/** Groups open when the builder first shows: the ones that change the person most. */
const OPEN = new Set(['gender', 'age', 'ethnicity', 'skin_tone', 'body_type', 'hair', 'hair_colour', 'aesthetic'])

export function TraitPicker({
  tier,
  onTier,
  selection,
  onChange,
  onRandom,
  onReset,
}: {
  tier: string
  onTier: (id: string) => void
  selection: Selection
  onChange: (next: Selection) => void
  onRandom: () => void
  onReset: () => void
}) {
  const groups = groupsFor(tier)
  return (
    <div className="sp-traits">
      <div className="sp-traits-head">
        <span className="st-rail-head">Character type</span>
        <span className="sp-traits-tools">
          <QuietBtn icon={Dices} onClick={onRandom} title="Pick at random">
            Random
          </QuietBtn>
          <QuietBtn icon={RotateCcw} onClick={onReset} title="Back to the starting picks">
            Reset
          </QuietBtn>
        </span>
      </div>
      <div className="st-chips">
        {TIERS.map((t) => (
          <button key={t.id} type="button" className={`st-chip ${tier === t.id ? 'is-active' : ''}`} onClick={() => onTier(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {groups.map((g) => {
        const picked = selection[g.id] ?? []
        const names = picked.map((id) => g.options.find((x) => x.id === id)?.label).filter(Boolean)
        return (
          <details key={g.id} className="sp-trait" open={OPEN.has(g.id)}>
            <summary>
              <span>{g.label}</span>
              <span className="sp-trait-value">
                {names.length ? names.join(', ') : 'Any'}
                {g.max > 1 && <span className="sp-trait-max"> · up to {g.max}</span>}
              </span>
            </summary>
            <div className="st-chips">
              {g.options.map((opt) => {
                const on = picked.includes(opt.id)
                return (
                  <button key={opt.id} type="button" className={`st-chip ${on ? 'is-active' : ''}`} aria-pressed={on} onClick={() => onChange(toggleTrait(selection, g, opt.id))}>
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </details>
        )
      })}
    </div>
  )
}
