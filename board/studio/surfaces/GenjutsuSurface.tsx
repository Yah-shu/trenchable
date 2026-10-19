/**
 * Genjutsu ("Reality manipulation") — its own lane, `#/gen/genjutsu`, apart from Video (it began as
 * a special preset of Create Video). It has its own tabs across the top of the rail, as Video does:
 *
 *   Motion transfer · Objects swap — the RailStudio form (video/genjutsu/GenjutsuMode.tsx)
 *   Guided swap                    — Trenchable's guided pipeline, a rail of its own (GuidedSwap.tsx)
 *
 * This file owns the tab, the remembered state (genjutsu.ts: tab, style, Prompt switch, the
 * model last used on each route) and the handoffs addressed to `genjutsu`: the viewer's Use the
 * motion opens Motion transfer, a Reuse opens its job's own tab, a Motion Library pick keeps the
 * tab (`handoffPatch`). Video keeps its Motion Control tab, the simple one-character form.
 */
import { useCallback, useEffect, useState } from 'react'
import { takeHandoff, useHandoff } from '../handoff.ts'
import { TopTabs } from './video/ModeBar.tsx'
import { GenjutsuMode } from './video/genjutsu/GenjutsuMode.tsx'
import { GuidedSwap } from './video/genjutsu/GuidedSwap.tsx'
import { handoffPatch, loadState, saveState, type GenjutsuMode as Tab, type GenjutsuState } from './video/genjutsu/genjutsu.ts'

/** Theirs has the first two; Guided swap is Trenchable's (depth + mask + face guide → Seedance 2.5). */
const TABS: { id: Tab; label: string }[] = [
  { id: 'transfer', label: 'Motion transfer' },
  { id: 'swap', label: 'Objects swap' },
  { id: 'guided', label: 'Guided swap' },
]

/** The remembered state, with a waiting handoff's tab already on it, so the right rail mounts first. */
function initial(): GenjutsuState {
  const s = loadState()
  const h = takeHandoff('genjutsu')
  const p = h ? handoffPatch(h) : null
  return p ? { ...s, ...p } : s
}

export function GenjutsuSurface() {
  const [state, setState] = useState<GenjutsuState>(initial)
  useEffect(() => saveState(state), [state])
  const patch = useCallback((p: Partial<GenjutsuState>) => setState((s) => ({ ...s, ...p })), [])

  useHandoff('genjutsu', (h) => {
    const p = handoffPatch(h)
    if (p) patch(p)
  })

  const tabs = <TopTabs tabs={TABS} value={state.mode} onPick={(mode) => patch({ mode })} />
  // Guided swap is a pipeline on the server, not one Kie model's form: its own rail.
  if (state.mode === 'guided') return <GuidedSwap header={tabs} />
  return <GenjutsuMode header={tabs} state={state} setState={setState} />
}
