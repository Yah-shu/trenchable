import type { ReactNode, CSSProperties } from 'react'

export type MaterialWeight = 'chrome' | 'panel' | 'sheet'

const weightClass: Record<MaterialWeight, string> = {
  chrome: 'material material-chrome',
  panel: 'material material-panel',
  sheet: 'material material-sheet',
}

type MaterialProps = {
  children?: ReactNode
  weight?: MaterialWeight
  className?: string
  style?: CSSProperties
  /** Always false — solid shell has no entrance animation */
  initial?: false
  role?: string
  'aria-label'?: string
}

/** Solid surface shell — no entrance animation (DESIGN.md: load fade off). */
export function Material({
  children,
  weight = 'panel',
  className = '',
  style,
  role,
  'aria-label': ariaLabel,
}: MaterialProps) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`${weightClass[weight]} ${className}`.trim()}
      style={style}
    >
      {children}
    </div>
  )
}
