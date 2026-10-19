import {
  forwardRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
} from 'react'

type PressStyle = CSSProperties & { '--press-scale'?: number }

type PressableProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  scaleTo?: number
}

/** Instant press feedback on pointer-down; spring settle on release. */
export const Pressable = forwardRef<HTMLButtonElement, PressableProps>(
  function Pressable(
    { children, scaleTo = 0.96, disabled, className = '', style, ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={`studio-pressable ${className}`.trim()}
        style={{ '--press-scale': scaleTo, ...style } as PressStyle}
        {...rest}
      >
        {children}
      </button>
    )
  },
)

type PressableDivProps = HTMLAttributes<HTMLDivElement> & {
  scaleTo?: number
}

export function PressableDiv({
  children,
  scaleTo = 0.96,
  className,
  style,
  ...rest
}: PressableDivProps) {
  return (
    <div
      className={`studio-pressable ${className ?? ''}`.trim()}
      style={{ '--press-scale': scaleTo, ...style } as PressStyle}
      {...rest}
    >
      {children}
    </div>
  )
}
