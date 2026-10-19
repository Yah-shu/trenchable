import { AppFrame } from './AppFrame.tsx'

/**
 * Kie Studio inside Trenchable (its Plinth theme comes with it: theme/plinth-kie.css, via i18n/vite-plugin.mjs).
 * Reached as Studio's Advanced tab — the full per-model form, Suno and the Veo/Runway
 * workflows, which Studio's own surfaces do not cover.
 */
export function GenerateFrame({ active, className }: { active: boolean; className?: string }) {
  return <AppFrame src="/advanced.html" title="Advanced" active={active} className={className} />
}
