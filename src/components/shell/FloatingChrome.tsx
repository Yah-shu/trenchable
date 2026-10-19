import type { ReactNode } from 'react'
import { Material } from '../motion/Material.tsx'

export function FloatingChrome({
  title,
  subtitle,
  meta,
  center,
  trailing,
}: {
  title: ReactNode
  subtitle?: ReactNode
  meta?: ReactNode
  center?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <Material
      weight="chrome"
      className="flex shrink-0 flex-col gap-2 rounded-[var(--radius-xl)] px-3 py-2.5 sm:px-4 sm:py-3 md:px-5"
      initial={false}
      role="banner"
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0 flex-1 space-y-0.5">
          <h1 className="studio-display truncate">{title}</h1>
          {/* Always reserve subtitle/meta rows on sm+ so mode switches don't jump height. */}
          <p className="studio-subtitle hidden truncate sm:block">
            {subtitle ?? '\u00A0'}
          </p>
          <div className="hidden min-h-[1rem] sm:block">
            {meta ?? (
              <p className="studio-meta invisible select-none" aria-hidden>
                {'\u00A0'}
              </p>
            )}
          </div>
        </div>
        {center && (
          <div className="hidden min-w-0 shrink-0 sm:flex sm:justify-center">
            {center}
          </div>
        )}
        <div className="ml-auto flex min-w-0 shrink-0 items-stretch justify-end">
          {trailing}
        </div>
      </div>
      {center && (
        <div className="w-full min-w-0 sm:hidden">
          {center}
        </div>
      )}
    </Material>
  )
}
