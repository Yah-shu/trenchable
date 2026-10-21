"use client";

import { cn } from "@/lib/utils";

type Option<T extends string | number> = { value: T; label?: string };

/** Toggle-button row for aspect ratio, duration, resolution, tier. Selected = ink fill. */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className,
  size = "md",
  "aria-label": ariaLabel,
}: {
  value: T | undefined;
  options: Option<T>[];
  onChange: (v: T) => void;
  className?: string;
  size?: "sm" | "md";
  "aria-label"?: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[8px] border-2 border-ink font-sans font-semibold transition-colors",
              size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3 text-xs",
              active ? "bg-ink text-canvas" : "bg-canvas text-ink hover:bg-paper",
            )}
          >
            {o.label ?? String(o.value)}
          </button>
        );
      })}
    </div>
  );
}
