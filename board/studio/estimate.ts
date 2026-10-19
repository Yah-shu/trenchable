/**
 * The cost shown on Generate before a job runs.
 *
 * A thin hook over the price list (pricing.ts: Kie's own per-model prices, overridden by
 * what Kie actually charged for the same settings before): what one press of Generate
 * will cost for this model and these settings, or null when there is no honest number.
 * `jobs` is how many separate jobs one press sends; images inside one job come from the
 * input's own count field, which `estimateCredits` reads itself.
 */
import type { ModelDefinition } from './api.ts'
import { estimateCredits, usePricing } from './pricing.ts'

export interface Estimate {
  credits: number
  detail: string
}

export function useEstimate(model: ModelDefinition | null, input: Record<string, unknown> | null, jobs: number): Estimate | null {
  const prices = usePricing()
  if (!model || !input || !prices) return null
  const e = estimateCredits(model, input, prices, Math.max(1, jobs))
  if (!e) return null
  return { credits: e.credits, detail: `About ${e.credits} credits — ${e.detail}${e.basis === 'learned' ? ' (what Kie charged last time)' : ' (Kie price list)'}` }
}
