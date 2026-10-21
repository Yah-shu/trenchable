"use client";

import { ChevronLeft, ChevronRight, Copy, ImagePlus, Lock, Music, Repeat, SlidersHorizontal, Trash2, Users, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/ui/misc";
import { providerLabels } from "@/config/models.config";
import type { ApiGeneration } from "@/lib/client-api";
import type { GenerationParams } from "@/lib/types";
import { cn } from "@/lib/utils";
import { audioTitleOf, clock, costLabel, downloadChoices, DownloadButton, RelativeTime, takesOf } from "./result-helpers";

export type ViewerActions = {
  canModify: (g: ApiGeneration) => boolean;
  onRerun: (g: ApiGeneration) => void;
  onUseSettings: (g: ApiGeneration) => void;
  /** Null when the current model can't take this kind of file. */
  referenceAction: (g: ApiGeneration) => (() => void) | null;
  onDelete: (g: ApiGeneration) => void;
  onToggleShared: (g: ApiGeneration) => void;
};

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

function settingsRows(g: ApiGeneration): [string, string][] {
  const p = (g.params ?? {}) as GenerationParams;
  const rows: [string, string][] = [];
  rows.push(["Type", g.media_type[0].toUpperCase() + g.media_type.slice(1)]);
  if (g.aspect_ratio ?? p.aspect_ratio) rows.push(["Aspect", String(g.aspect_ratio ?? p.aspect_ratio)]);
  if (g.resolution ?? p.resolution) rows.push(["Resolution", String(g.resolution ?? p.resolution)]);
  if (g.duration_seconds ?? p.duration) rows.push(["Duration", `${Math.round(Number(g.duration_seconds ?? p.duration) * 10) / 10}s`]);
  if (p.generate_audio) rows.push(["Audio", "On"]);
  const refs = [
    (p.image_urls?.length ?? 0) && `${p.image_urls!.length} image${p.image_urls!.length === 1 ? "" : "s"}`,
    p.start_frame_url && (p.end_frame_url ? "start + end frame" : "start frame"),
    (p.reference_image_urls?.length ?? 0) && `${p.reference_image_urls!.length} reference image${p.reference_image_urls!.length === 1 ? "" : "s"}`,
    (p.reference_video_urls?.length ?? 0) && `${p.reference_video_urls!.length} reference clip${p.reference_video_urls!.length === 1 ? "" : "s"}`,
    (p.reference_audio_urls?.length ?? 0) && `${p.reference_audio_urls!.length} reference audio`,
    (p.elements?.length ?? 0) && `${p.elements!.length} element${p.elements!.length === 1 ? "" : "s"}`,
  ].filter(Boolean);
  if (refs.length) rows.push(["Inputs", refs.join(", ")]);
  for (const [k, v] of Object.entries(p.settings ?? {})) {
    if (v === "" || v == null) continue;
    rows.push([k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()), typeof v === "boolean" ? (v ? "On" : "Off") : String(v)]);
  }
  if (p.negative_prompt) rows.push(["Negative", p.negative_prompt]);
  if (p.seed != null) rows.push(["Seed", String(p.seed)]);
  rows.push(["Provider", `${providerLabels[g.provider] ?? g.provider}${g.fallback_reason ? " (backup)" : ""}`]);
  return rows;
}

/**
 * The fullscreen viewer: the result on a paper stage with previous/next and a strip of the
 * feed's other results, and a side panel with who made it, what it cost, the prompt, the
 * settings and every action. ← → step, D downloads, Esc closes; keys are ignored while typing.
 */
export function Viewer({ items, id, onStep, onClose, actions }: { items: ApiGeneration[]; id: string; onStep: (id: string) => void; onClose: () => void; actions: ViewerActions }) {
  const index = Math.max(0, items.findIndex((g) => g.id === id));
  const g = items[index];
  const frame = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Keys and focus: the viewer takes focus so Escape works straight away.
  const keys = useRef({ items, index, onStep, onClose });
  useEffect(() => {
    keys.current = { items, index, onStep, onClose };
  });
  useEffect(() => {
    frame.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = keys.current;
      if (e.key === "Escape") {
        e.preventDefault();
        k.onClose();
      } else if (e.key === "ArrowLeft" && k.index > 0) {
        e.preventDefault();
        k.onStep(k.items[k.index - 1].id);
      } else if (e.key === "ArrowRight" && k.index < k.items.length - 1) {
        e.preventDefault();
        k.onStep(k.items[k.index + 1].id);
      } else if (e.key === "d" || e.key === "D") {
        const cur = k.items[k.index];
        if (cur) downloadChoices(cur)[0]?.run();
      }
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  const [seen, setSeen] = useState(id);
  if (seen !== id) {
    setSeen(id);
    setPromptOpen(false);
    setConfirmDelete(false);
  }
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>(`[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [id]);

  if (!g) return null;
  const canModify = actions.canModify(g);
  const asReference = actions.referenceAction(g);
  const cost = costLabel(g);
  const takes = takesOf(g);
  const long = (g.prompt?.length ?? 0) > 280;

  return (
    <div className="fixed inset-0 z-[70] flex p-4 max-md:p-0" role="dialog" aria-modal="true" aria-label={`${g.model_display_name} result`}>
      <div className="absolute inset-0 bg-ink/55" onClick={onClose} aria-hidden />
      <div
        ref={frame}
        tabIndex={-1}
        className="relative grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_360px] grid-rows-[minmax(0,1fr)] overflow-hidden rounded-pl border-2 border-ink bg-canvas outline-none max-md:grid-cols-1 max-md:grid-rows-[auto_auto] max-md:overflow-y-auto max-md:rounded-none max-md:border-0"
      >
        {/* Stage */}
        <section className="relative flex min-h-0 min-w-0 flex-col bg-paper max-md:min-h-[62vh]">
          <div className="flex items-center gap-2 border-b border-hairline bg-canvas px-3 py-2.5">
            <span className="text-[12px] font-semibold tabular-nums text-mute">
              {index + 1} of {items.length}
            </span>
            <span className="ml-auto hidden text-[11px] text-mute sm:block">
              <Kbd>←</Kbd>
              <Kbd>→</Kbd> step · <Kbd>D</Kbd> download · <Kbd>Esc</Kbd> close
            </span>
            <button type="button" className="pl-iconbtn pl-iconbtn--sm md:hidden" aria-label="Close" onClick={onClose}>
              <X />
            </button>
          </div>
          <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden px-16 py-4 max-sm:px-3">
            {g.media_type === "image" ? (
              // Full size only once someone opens it.
              // eslint-disable-next-line @next/next/no-img-element
              <img key={g.id} src={g.result_url!} alt={g.prompt ?? ""} className="max-h-full max-w-full rounded-[10px] border-2 border-ink bg-paper-deep object-contain max-md:max-h-[56vh]" />
            ) : g.media_type === "video" ? (
              <video key={g.id} src={g.result_url!} controls autoPlay playsInline className="max-h-full max-w-full rounded-[10px] border-2 border-ink bg-ink object-contain max-md:max-h-[56vh]" />
            ) : (
              <div className="grid w-[min(520px,100%)] justify-items-center gap-3.5 rounded-pl border-2 border-ink bg-canvas px-6 py-7 text-center">
                <span className="grid size-16 place-items-center rounded-full border-2 border-ink bg-coral-soft">
                  <Music className="size-7" />
                </span>
                <span className="font-display text-[17px] font-semibold">{audioTitleOf(g) ?? g.model_display_name}</span>
                {takes.map((t, i) => (
                  <div key={t.url} className="w-full space-y-1 text-left">
                    {takes.length > 1 ? (
                      <div className="flex justify-between text-[12px] text-mute">
                        <span>
                          Take {i + 1}
                          {t.title ? ` · ${t.title}` : ""}
                        </span>
                        <span className="font-mono">{clock(t.seconds)}</span>
                      </div>
                    ) : null}
                    <audio src={t.url} controls preload="metadata" autoPlay={i === 0} className="w-full" />
                  </div>
                ))}
              </div>
            )}
            <button type="button" className="pl-iconbtn absolute left-3 top-1/2 size-10 -translate-y-1/2 rounded-full disabled:opacity-30 max-sm:hidden" aria-label="Previous" disabled={index === 0} onClick={() => onStep(items[index - 1].id)}>
              <ChevronLeft />
            </button>
            <button
              type="button"
              className="pl-iconbtn absolute right-3 top-1/2 size-10 -translate-y-1/2 rounded-full disabled:opacity-30 max-sm:hidden"
              aria-label="Next"
              disabled={index >= items.length - 1}
              onClick={() => onStep(items[index + 1].id)}
            >
              <ChevronRight />
            </button>
          </div>
          {items.length > 1 ? (
            <div ref={strip} className="flex gap-1.5 overflow-x-auto border-t border-hairline bg-canvas px-3 py-2.5">
              {items.map((x) => (
                <button
                  key={x.id}
                  data-id={x.id}
                  type="button"
                  onClick={() => onStep(x.id)}
                  aria-label={`Show ${x.model_display_name} result`}
                  aria-current={x.id === g.id}
                  className={cn("grid size-14 shrink-0 place-items-center overflow-hidden rounded-[9px] border-2 bg-paper", x.id === g.id ? "border-ink ring-2 ring-coral" : "border-hairline hover:border-ink")}
                >
                  {x.media_type === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.result_url!} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : x.media_type === "video" ? (
                    <video src={`${x.result_url}#t=0.1`} muted preload="metadata" className="h-full w-full object-cover" />
                  ) : (
                    <Music className="size-4 text-mute" />
                  )}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        {/* Side panel */}
        <aside className="flex min-h-0 flex-col overflow-y-auto border-l-2 border-ink bg-canvas max-md:border-l-0 max-md:border-t-2 max-md:overflow-visible">
          <div className="sticky top-0 z-[1] flex items-start gap-2 border-b border-hairline bg-canvas px-4 pb-3 pt-3.5">
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-[18px] font-semibold leading-tight">{g.model_display_name}</h2>
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-mute">
                <UserAvatar name={g.user?.display_name ?? "?"} url={g.user?.avatar_url} bot={g.user?.is_bot} size={18} />
                <span className="truncate">{g.user?.display_name ?? "Unknown"}</span>
                <span>·</span>
                <RelativeTime iso={g.created_at} />
              </p>
            </div>
            <button type="button" className="pl-iconbtn pl-iconbtn--sm max-md:hidden" aria-label="Close" onClick={onClose}>
              <X />
            </button>
          </div>

          <div className="space-y-2 border-b border-hairline px-4 py-3">
            <div className="grid grid-cols-2 gap-2">
              <DownloadButton gen={g} variant="wide" />
              <button type="button" className="plinth-btn plinth-btn--sm plinth-btn--ghost w-full" onClick={() => actions.onRerun(g)}>
                <span className="plinth-btn__face">
                  <Repeat /> Re-run
                </span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <Tool icon={<SlidersHorizontal />} label="Load settings" onClick={() => actions.onUseSettings(g)} />
              <Tool icon={<ImagePlus />} label="Use as reference" onClick={asReference ?? undefined} disabled={!asReference} title={asReference ? "Add it to the composer's references" : "The current model can't take this as a reference"} />
              {g.prompt ? (
                <Tool
                  icon={<Copy />}
                  label="Copy prompt"
                  onClick={() => {
                    void navigator.clipboard.writeText(g.prompt!);
                    toast.success("Prompt copied");
                  }}
                />
              ) : null}
              {canModify ? (
                <Tool icon={g.is_shared ? <Lock /> : <Users />} label={g.is_shared ? "Make private" : "Share with team"} onClick={() => actions.onToggleShared(g)} />
              ) : null}
              {canModify ? (
                confirmDelete ? (
                  <button type="button" className="flex min-h-[34px] items-center gap-2 rounded-[10px] border-2 border-bad bg-bad-soft px-2.5 text-[13px] font-semibold text-bad" onClick={() => actions.onDelete(g)}>
                    <Trash2 className="size-4" /> Confirm delete
                  </button>
                ) : (
                  <Tool icon={<Trash2 />} label="Delete" danger onClick={() => setConfirmDelete(true)} />
                )
              ) : null}
            </div>
          </div>

          {cost ? (
            <div className="flex items-center justify-between border-b border-hairline px-4 py-3 text-[13px]">
              <span className="text-mute">Cost</span>
              <span className="font-semibold tabular-nums">{cost}</span>
            </div>
          ) : null}

          {g.prompt ? (
            <div className="border-b border-hairline px-4 py-3">
              <p className="mb-2 flex items-center text-[12px] font-semibold text-mute">
                Prompt
                <button
                  type="button"
                  className="ml-auto inline-flex items-center gap-1 text-[12px] font-semibold text-ink underline underline-offset-2"
                  onClick={() => {
                    void navigator.clipboard.writeText(g.prompt!);
                    toast.success("Prompt copied");
                  }}
                >
                  <Copy className="size-3" /> Copy
                </button>
              </p>
              <p className={cn("whitespace-pre-wrap break-words text-[13px] leading-relaxed", !promptOpen && long && "line-clamp-6")}>{g.prompt}</p>
              {long ? (
                <button type="button" className="mt-1.5 text-[12px] font-semibold underline underline-offset-2" onClick={() => setPromptOpen((v) => !v)}>
                  {promptOpen ? "Show less" : "Show full prompt"}
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="px-4 py-3">
            <p className="mb-2 text-[12px] font-semibold text-mute">Settings</p>
            <dl className="grid grid-cols-[minmax(84px,auto)_1fr] gap-x-3 gap-y-1.5 text-[12.5px] leading-snug">
              {settingsRows(g).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-mute">{k}</dt>
                  <dd className="min-w-0 break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="mx-0.5 inline-block min-w-[18px] rounded-[5px] border border-hairline bg-paper px-1 py-px text-center font-mono text-[10px] font-semibold text-ink">{children}</kbd>;
}

function Tool({ icon, label, onClick, disabled, danger, title }: { icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; danger?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className={cn(
        "flex min-h-[34px] items-center gap-2 rounded-[10px] border border-hairline bg-canvas px-2.5 text-left text-[13px] font-medium transition-colors hover:border-ink hover:bg-paper disabled:cursor-not-allowed disabled:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0",
        danger && "hover:bg-bad-soft",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
