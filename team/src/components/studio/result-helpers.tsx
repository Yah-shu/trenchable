"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { ChevronDown, Download } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { downloadFile, type ApiGeneration } from "@/lib/client-api";
import { creditsFor, formatCredits, formatDollars } from "@/lib/client/cost";
import { extensionFromUrl } from "@/lib/format";
import { downloadAsWebp } from "@/lib/webp";
import { cn } from "@/lib/utils";
import { Pop } from "./parts";

/** Current time, refreshed every `intervalMs` so relative labels don't go stale. */
export function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export const isInFlight = (g: Pick<ApiGeneration, "status">) => g.status === "queued" || g.status === "processing";

/** Every output file of a job: the main result plus extra takes (Suno returns two). */
export function takesOf(gen: ApiGeneration): { url: string; title?: string; seconds?: number }[] {
  if (!gen.result_url) return [];
  const meta = (gen.result_metadata ?? {}) as { additional_files?: string[]; provider?: { tracks?: { title?: string; duration_seconds?: number }[] } };
  const tracks = meta.provider?.tracks ?? [];
  return [gen.result_url, ...(meta.additional_files ?? [])].map((url, i) => ({ url, title: tracks[i]?.title, seconds: tracks[i]?.duration_seconds }));
}

export const clock = (s?: number) => (s == null ? null : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);

export const audioTitleOf = (gen: ApiGeneration) => takesOf(gen)[0]?.title ?? (gen.params as { settings?: { title?: string } }).settings?.title;

/** Results are absolute URLs; resolve anything else against the page so the extension can be read. */
const absolute = (url: string) => (typeof window === "undefined" || /^[a-z]+:/i.test(url) ? url : new URL(url, window.location.href).href);
const extOf = (gen: ApiGeneration) => extensionFromUrl(absolute(gen.result_url!), gen.media_type);

export const fileNameOf = (gen: ApiGeneration) => `gen-${gen.model}-${gen.id.slice(0, 8)}.${extOf(gen)}`;

/** A generation's cost: credits and dollars for Kie, dollars for the rest. "~" while it's only an estimate. */
export function costLabel(gen: ApiGeneration): string | null {
  const cost = gen.cost_usd ?? gen.estimated_cost_usd;
  if (cost == null) return null;
  const usd = Number(cost);
  const approx = gen.cost_usd == null || isInFlight(gen) ? "~" : "";
  // Kie bills credits; a job that ran on a direct backup (Google, ElevenLabs) is billed in dollars.
  // Kie reports the credits it actually took; otherwise they're worked out from the dollars.
  const credits = gen.actual_credits != null && !approx ? Number(gen.actual_credits) : creditsFor(usd);
  return gen.provider === "kie" ? `${approx}${formatCredits(credits)} cr · ${formatDollars(usd)}` : `${approx}${formatDollars(usd)}`;
}

export function RelativeTime({ iso, className }: { iso: string; className?: string }) {
  useNow(30_000);
  return (
    <time dateTime={iso} title={new Date(iso).toLocaleString()} className={cn("whitespace-nowrap", className)} suppressHydrationWarning>
      {formatDistanceToNowStrict(new Date(iso), { addSuffix: true })}
    </time>
  );
}

/** The download choices: images offer WebP as well as the original, songs each take. */
export function downloadChoices(gen: ApiGeneration): { label: string; hint?: string; run: () => void }[] {
  if (!gen.result_url) return [];
  const name = fileNameOf(gen);
  const ext = extOf(gen);
  const original = () => void downloadFile(gen.result_url!, name);
  const takes = takesOf(gen);
  if (gen.media_type !== "image" && takes.length > 1) {
    return takes.map((t, i) => ({ label: `Take ${i + 1}`, hint: clock(t.seconds) ?? undefined, run: () => void downloadFile(t.url, name.replace(`.${ext}`, `-take${i + 1}.${ext}`)) }));
  }
  if (gen.media_type !== "image") return [{ label: "Download", run: original }];
  const webp = async () => {
    const toastId = toast.loading("Converting to WebP…");
    try {
      await downloadAsWebp(gen.result_url!, name);
      toast.success("Downloaded as WebP", { id: toastId });
    } catch (e) {
      toast.error("Couldn't convert to WebP", { id: toastId, description: `${e instanceof Error ? e.message : String(e)}. Downloading the original instead.` });
      original();
    }
  };
  return [
    { label: `Original .${ext}`, hint: "Exactly as generated", run: original },
    { label: "WebP", hint: "Much smaller, for web pages", run: () => void webp() },
  ];
}

/** A download button: straight download when there's one choice, a small menu otherwise. */
export function DownloadButton({ gen, variant, side = "bottom" }: { gen: ApiGeneration; variant: "icon" | "wide"; side?: "top" | "bottom" }) {
  const choices = downloadChoices(gen);
  if (!choices.length) return null;
  const wide = variant === "wide";
  const face = (onClick: () => void, open = false, menu = false) =>
    wide ? (
      <button type="button" className="plinth-btn plinth-btn--sm w-full" onClick={onClick} aria-expanded={menu ? open : undefined}>
        <span className="plinth-btn__face">
          <Download /> Download {menu ? <ChevronDown className="!size-3.5" /> : null}
        </span>
      </button>
    ) : (
      <button type="button" className={cn("pl-iconbtn pl-iconbtn--sm", open && "!bg-coral-soft")} title="Download" aria-label="Download" onClick={onClick}>
        <Download />
      </button>
    );
  if (choices.length === 1) return face(choices[0].run);
  return (
    <Pop
      side={side}
      align={wide ? "start" : "end"}
      className={wide ? "w-full" : undefined}
      label="Download"
      trigger={({ open, toggle }) => face(toggle, open, true)}
    >
      {(close) =>
        choices.map((c) => (
          <button
            key={c.label}
            type="button"
            className="pl-pop__item"
            onClick={() => {
              close();
              c.run();
            }}
          >
            <span className="flex-1">
              {c.label}
              {c.hint ? <span className="block text-[11px] font-normal text-mute">{c.hint}</span> : null}
            </span>
          </button>
        ))
      }
    </Pop>
  );
}
