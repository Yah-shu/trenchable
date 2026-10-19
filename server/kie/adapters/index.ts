import { KieApiError } from '../client.ts'
import type { Provider } from '../types.ts'
import { marketAdapter } from './market.ts'
import { runwayAdapter } from './runway.ts'
import { sunoAdapter } from './suno.ts'
import type { ProviderAdapter } from './types.ts'
import { veoAdapter } from './veo.ts'

const ADAPTERS: Record<Provider, ProviderAdapter> = {
  market: marketAdapter,
  suno: sunoAdapter,
  veo: veoAdapter,
  runway: runwayAdapter,
}

export function getProviderAdapter(provider: Provider): ProviderAdapter {
  const adapter = ADAPTERS[provider]
  if (!adapter) throw new KieApiError(`Unknown provider: ${provider}`, 400)
  return adapter
}
