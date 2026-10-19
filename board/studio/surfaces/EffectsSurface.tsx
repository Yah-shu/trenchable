/**
 * Effects — the reference app's Effects in three levels, each with its own address
 * (surfaces/effects/route.ts):
 *
 *   home  (#/gen/effects)          hero, a cloud of every effect's name, the masonry of effects
 *   page  (#/gen/effects/<id>)     what the effect does, Generate, every result made with it
 *   use   (#/gen/effects/<id>/use) the rail that runs it, beside its own History
 *
 * The effects are the recipe catalogue (presets.ts). As on the reference app the recipe stays out of
 * your way: the form takes a picture and, if you switch Prompt on, a few words, and the recipe
 * is wrapped around them as the job goes out. A card's preview is your own newest result made
 * with that effect — told apart by the tracker's tags and by the recipe's words in the prompt
 * (presets.ts `recipeOfItem`) — and nothing is generated to make previews.
 */
import { presetById } from '../presets.ts'
import { EffectPage } from './effects/EffectPage.tsx'
import { EffectUse } from './effects/EffectUse.tsx'
import { EffectsHome } from './effects/EffectsHome.tsx'
import { isEffect } from './effects/data.ts'
import { useEffectView } from './effects/route.ts'
import './studio-pages.css'
import './effects/effects.css'

export function EffectsSurface() {
  const view = useEffectView(isEffect)
  const preset = view.level === 'home' ? null : presetById(view.id)
  // Keyed by level and effect, so each opens clean (and a Change lands on a fresh form).
  if (view.level === 'use' && preset) return <EffectUse key={`use:${preset.id}`} preset={preset} />
  if (view.level === 'page' && preset) return <EffectPage key={`page:${preset.id}`} preset={preset} />
  return <EffectsHome />
}
