/**
 * What every Effects level reads: history, which recipe each row came from (presets.ts
 * `recipeOfItem` — the tracker's tags, then the prompt's own recipe words), and each
 * effect's cover, worked out once per change of history or tags.
 */
import { useMemo } from 'react'
import { useHistory } from '../../api.ts'
import { PRESETS, recipeCovers, taskRecipes, type Preset } from '../../presets.ts'
import { useAllTracked } from '../track.ts'

export function useEffectIndex() {
  const tracked = useAllTracked()
  const { items } = useHistory()
  const byTask = useMemo(() => taskRecipes(tracked), [tracked])
  const covers = useMemo(() => recipeCovers(items, byTask), [items, byTask])
  return { items, byTask, covers }
}

/** Every recipe is an effect here: the catalogue's camera moves, effects, motion and looks. */
export const EFFECTS: Preset[] = PRESETS

const IDS = new Set(EFFECTS.map((p) => p.id))
export const isEffect = (id: string) => IDS.has(id)

/** Filters on the home, remembered per browser (a convenience; never needed to run). */
const FILTER_KEY = 'studio.effects.filters'

export interface HomeFilters {
  group: string
  type: string
}

export function loadFilters(): HomeFilters {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FILTER_KEY) ?? '{}') as Partial<HomeFilters>
    return { group: typeof raw.group === 'string' ? raw.group : 'all', type: typeof raw.type === 'string' ? raw.type : 'video' }
  } catch {
    return { group: 'all', type: 'video' }
  }
}

export function saveFilters(f: HomeFilters) {
  try {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(f))
  } catch {
    // Storage off: the filters reset on the next visit.
  }
}

/** An effect's own extra direction: the Prompt toggle and what is typed under it. */
export interface PromptState {
  on: boolean
  text: string
}

const promptKey = (id: string) => `studio.effects.prompt.${id}`

export function loadPrompt(id: string, fallbackOn: boolean): PromptState {
  try {
    const raw = JSON.parse(window.localStorage.getItem(promptKey(id)) ?? 'null') as Partial<PromptState> | null
    if (!raw || typeof raw !== 'object') return { on: fallbackOn, text: '' }
    return { on: typeof raw.on === 'boolean' ? raw.on : fallbackOn, text: typeof raw.text === 'string' ? raw.text : '' }
  } catch {
    return { on: fallbackOn, text: '' }
  }
}

export function savePrompt(id: string, p: PromptState) {
  try {
    window.localStorage.setItem(promptKey(id), JSON.stringify(p))
  } catch {
    // Storage off: the prompt is kept for this visit only.
  }
}
