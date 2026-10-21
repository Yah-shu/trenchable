import * as React from "react";
import { cn } from "@/lib/utils";

/** A flat Plinth panel (2px ink edge, 12px radius). */
export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("pl-panel block", className)} {...props} />;
}

const BADGE_TONE = {
  default: "pl-badge--quiet",
  coral: "pl-badge--coral",
  success: "pl-badge--ok",
  danger: "pl-badge--bad",
} as const;

export function Badge({ className, tone = "default", ...props }: React.ComponentProps<"span"> & { tone?: "default" | "coral" | "success" | "danger" }) {
  return <span className={cn("pl-badge", BADGE_TONE[tone], className)} {...props} />;
}

export function UserAvatar({ name, url, size = 20, bot }: { name: string; url?: string | null; size?: number; bot?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="shrink-0 rounded-full border-2 border-ink object-cover" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold leading-none text-ink",
        size >= 22 ? "border-2 border-ink" : "border border-ink",
        bot ? "bg-paper-deep" : "bg-coral-soft",
      )}
      style={{ width: size, height: size, fontSize: Math.max(8, size * 0.4) }}
    >
      {initials}
    </span>
  );
}

/** The max-width column the non-Studio pages sit in (the Studio page is full width). */
export function PageContainer({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1400px] px-4 pb-24 pt-8 sm:px-6 lg:px-8", className)} {...props} />;
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink sm:text-[40px] sm:leading-[1.05]">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm text-mute">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}
