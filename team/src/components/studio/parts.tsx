"use client";

import { Check, ChevronDown, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Close on an outside click or Escape. A dialog opened from inside the popover is portalled to
 * the body; clicks in it still count as inside (React events bubble through portals, so
 * `markInside` on the popover's `onMouseDownCapture` sees them), and Escape is left to it.
 */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const inside = useRef(false);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const wasInside = inside.current;
      inside.current = false;
      if (!wasInside && !ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      const focus = document.activeElement;
      if (focus && !ref.current?.contains(focus) && focus.closest("[role=dialog]")) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [ref, open, close]);
  return useCallback(() => {
    inside.current = true;
  }, []);
}

/**
 * A trigger with a `pl-pop` beside it. `side="top"` opens upward (the composer sits at the
 * bottom of the screen); `align="end"` lines it up with the trigger's right edge.
 */
export function Pop({
  trigger,
  children,
  side = "top",
  align = "start",
  width,
  className,
  popClassName,
  defaultOpen = false,
  label,
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  side?: "top" | "bottom";
  align?: "start" | "end";
  width?: number;
  className?: string;
  popClassName?: string;
  defaultOpen?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const box = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const markInside = useDismiss(box, open, close);
  const style: CSSProperties = width ? { width: `min(${width}px, calc(100vw - 24px))` } : {};
  return (
    <div ref={box} className={cn("relative", className)} onMouseDownCapture={markInside}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open ? (
        <div
          role="dialog"
          aria-label={label}
          style={style}
          className={cn(
            "pl-pop absolute z-50 max-h-[min(70vh,560px)] overflow-y-auto",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            align === "end" ? "right-0" : "left-0",
            popClassName,
          )}
        >
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}

export type Choice<T extends string | number> = { value: T; label: string; hint?: string };

/** A pill showing the current choice; opens a list of the others. */
export function ChoicePill<T extends string | number>({
  icon,
  label,
  value,
  choices,
  onPick,
  title,
  display,
}: {
  icon?: ReactNode;
  /** Small muted word before the value, e.g. "Scale". */
  label?: string;
  value: T | undefined;
  choices: Choice<T>[];
  onPick: (v: T) => void;
  title?: string;
  /** Text on the pill, when it differs from the choice's label. */
  display?: string;
}) {
  const current = choices.find((c) => c.value === value);
  return (
    <Pop
      label={title ?? label}
      trigger={({ open, toggle }) => (
        <button type="button" className={cn("pl-pill pl-pill--sm", open && "is-on")} onClick={toggle} title={title} aria-expanded={open}>
          {icon}
          {label ? <span className="pl-pill__label">{label}</span> : null}
          <span>{display ?? current?.label ?? "—"}</span>
          <ChevronDown className="size-3 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <div className="min-w-[160px]">
          {title ? <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">{title}</p> : null}
          {choices.map((c) => (
            <button
              key={String(c.value)}
              type="button"
              className={cn("pl-pop__item", c.value === value && "is-on")}
              onClick={() => {
                onPick(c.value);
                close();
              }}
            >
              <span className="flex-1">
                {c.label}
                {c.hint ? <span className="block text-[11px] font-normal text-mute">{c.hint}</span> : null}
              </span>
              {c.value === value ? <Check className="size-3.5" /> : null}
            </button>
          ))}
        </div>
      )}
    </Pop>
  );
}

/** − n + in a pill. */
export function Stepper({ value, min = 1, max, onChange, label }: { value: number; min?: number; max: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="pl-pill pl-pill--sm gap-1 px-1" role="group" aria-label={label} title={label}>
      <button type="button" aria-label="Fewer" className="grid size-6 place-items-center rounded-md hover:bg-paper-deep disabled:opacity-30" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Minus className="size-3" />
      </button>
      <span className="min-w-[2.2ch] text-center tabular-nums">{value}</span>
      <button type="button" aria-label="More" className="grid size-6 place-items-center rounded-md hover:bg-paper-deep disabled:opacity-30" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Plus className="size-3" />
      </button>
    </div>
  );
}

/** A two-or-more way choice inside a panel (ink tab strip). */
export function Seg<T extends string | number>({ value, options, onChange, label }: { value: T | undefined; options: Choice<T>[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="pl-tabs flex-wrap" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={o.value === value} className={cn("pl-tab", o.value === value && "is-active")} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A switch row: label on the left, the switch on the right. */
export function SwitchRow({ label, hint, on, onChange, id }: { label: ReactNode; hint?: ReactNode; on: boolean; onChange: (on: boolean) => void; id?: string }) {
  return (
    <button id={id} type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} className="flex w-full items-center gap-3 rounded-lg py-1 text-left">
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold">{label}</span>
        {hint ? <span className="block text-[11px] text-mute">{hint}</span> : null}
      </span>
      <span className={cn("relative h-[22px] w-[38px] shrink-0 rounded-full border-2 border-ink transition-colors", on ? "bg-coral" : "bg-paper-deep")} aria-hidden>
        <span className={cn("absolute top-[1px] size-4 rounded-full border-2 border-ink bg-canvas transition-[left]", on ? "left-[17px]" : "left-[1px]")} />
      </span>
    </button>
  );
}
