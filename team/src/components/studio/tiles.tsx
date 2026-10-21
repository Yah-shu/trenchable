"use client";

import { Check, Clock, CloudDownload, Copy, FileX, LifeBuoy, Lock, Music, Pause, Play, Repeat, RotateCw, SlidersHorizontal, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ImageThumb, VideoThumb } from "@/components/ui/thumb";
import { UserAvatar } from "@/components/ui/misc";
import { providerLabels } from "@/config/models.config";
import type { ApiGeneration } from "@/lib/client-api";
import { awaitingCopy, describeFailure, describeInFlight, expiryInfo, retriesOf, type TypicalDurations } from "@/lib/job-status";
import { cn } from "@/lib/utils";
import { audioTitleOf, clock, costLabel, DownloadButton, isInFlight, RelativeTime, takesOf, useNow } from "./result-helpers";

export type TileProps = {
  gen: ApiGeneration;
  typicalDurations?: TypicalDurations;
  /** Days a generated file is kept before the cleanup deletes it (null = kept forever). */
  retentionDays?: number | null;
  canModify: boolean;
  selected: boolean;
  /** While a selection is active, clicking a tile selects instead of opening it. */
  anySelected: boolean;
  onToggleSelect: (id: string, opts: { shiftKey: boolean }) => void;
  onOpen: (g: ApiGeneration) => void;
  onRerun: (g: ApiGeneration) => void;
  onUseSettings: (g: ApiGeneration) => void;
  onDelete: (g: ApiGeneration) => void;
};

/** One feed tile, whatever state the job is in. Fills its (absolutely placed) box. */
export function FeedTile(props: TileProps) {
  const { gen, retentionDays } = props;
  const expiry = expiryInfo(gen, useNow(60_000), retentionDays);
  if (isInFlight(gen)) return <JobTile {...props} />;
  if (gen.status === "completed" && gen.result_url) return awaitingCopy(gen) ? <NoteTile {...props} kind="copying" /> : <ResultTile {...props} expiryNotice={expiry.notice} />;
  if (expiry.deleted) return <NoteTile {...props} kind="removed" />;
  return <FailedTile {...props} />;
}

function Badges({ gen, expiryNotice }: { gen: ApiGeneration; expiryNotice?: string }) {
  const retries = retriesOf(gen);
  return (
    <>
      {gen.source === "api" ? <span className="pl-badge pl-badge--ink">API</span> : null}
      {retries.length ? (
        <span className="pl-badge pointer-events-auto" title={`Retried automatically after: ${retries.map((r) => r.error).join(" · ")}`}>
          <RotateCw /> Retried
        </span>
      ) : null}
      {gen.fallback_reason ? (
        <span className="pl-badge pl-badge--info pointer-events-auto" title={`Ran on the backup provider. ${gen.fallback_reason}`}>
          <LifeBuoy /> Backup
        </span>
      ) : null}
      {!gen.is_shared ? (
        <span className="pl-badge pl-badge--quiet !text-ink">
          <Lock /> Private
        </span>
      ) : null}
      {expiryNotice ? (
        <span className="pl-badge pl-badge--warn pointer-events-auto" title="Generated files are deleted after the retention period. Download it if you want to keep it.">
          <Clock /> {expiryNotice}
        </span>
      ) : null}
    </>
  );
}

function SelectBox({ gen, selected, onToggleSelect }: Pick<TileProps, "gen" | "selected" | "onToggleSelect">) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`Select ${gen.model_display_name} generation`}
      onClick={(e) => {
        e.stopPropagation();
        onToggleSelect(gen.id, { shiftKey: e.shiftKey });
      }}
      className={cn(
        "pointer-events-auto grid size-[22px] shrink-0 place-items-center rounded-[6px] border-2 border-ink transition-opacity",
        selected ? "bg-coral opacity-100" : "bg-canvas text-transparent opacity-0 hover:text-faint focus-visible:opacity-100 group-hover:opacity-100",
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </button>
  );
}

/** Top-left: the select box, then the badges. */
function TopLeft({ children }: { children: ReactNode }) {
  return <div className="pointer-events-none absolute left-2 top-2 z-[3] flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-1">{children}</div>;
}

function DeleteButton({ gen, onDelete }: { gen: ApiGeneration; onDelete: (g: ApiGeneration) => void }) {
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);
  return confirm ? (
    <button type="button" className="h-7 rounded-[8px] border-2 border-bad bg-bad-soft px-2 text-[11px] font-semibold text-bad" onClick={() => onDelete(gen)}>
      Delete?
    </button>
  ) : (
    <button type="button" className="pl-iconbtn pl-iconbtn--sm" title="Delete" aria-label="Delete" onClick={() => setConfirm(true)}>
      <Trash2 />
    </button>
  );
}

function Actions({ gen, canModify, onRerun, onUseSettings, onDelete, always = false }: Pick<TileProps, "gen" | "canModify" | "onRerun" | "onUseSettings" | "onDelete"> & { always?: boolean }) {
  return (
    <div
      className={cn("absolute right-2 top-2 z-[3] flex gap-1 transition-opacity", always ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover:opacity-100")}
      onClick={(e) => e.stopPropagation()}
    >
      {gen.result_url && gen.status === "completed" ? <DownloadButton gen={gen} variant="icon" /> : null}
      {gen.prompt ? (
        <button
          type="button"
          className="pl-iconbtn pl-iconbtn--sm"
          title="Copy prompt"
          aria-label="Copy prompt"
          onClick={() => {
            void navigator.clipboard.writeText(gen.prompt!);
            toast.success("Prompt copied");
          }}
        >
          <Copy />
        </button>
      ) : null}
      <button type="button" className="pl-iconbtn pl-iconbtn--sm" title="Re-run with the same settings" aria-label="Re-run with the same settings" onClick={() => onRerun(gen)}>
        <Repeat />
      </button>
      <button type="button" className="pl-iconbtn pl-iconbtn--sm" title="Load settings into the composer" aria-label="Load settings into the composer" onClick={() => onUseSettings(gen)}>
        <SlidersHorizontal />
      </button>
      {canModify ? <DeleteButton gen={gen} onDelete={onDelete} /> : null}
    </div>
  );
}

/** Who made it, when, and what it cost: slides in at the bottom on hover. */
function Meta({ gen }: { gen: ApiGeneration }) {
  const cost = costLabel(gen);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] space-y-0.5 border-t border-hairline bg-canvas px-2.5 py-1.5 text-[11.5px] leading-tight opacity-0 transition-opacity group-hover:opacity-100">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-semibold">{gen.model_display_name}</span>
        {cost ? <span className="shrink-0 whitespace-nowrap font-semibold tabular-nums">{cost}</span> : null}
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-mute">
        <UserAvatar name={gen.user?.display_name ?? "?"} url={gen.user?.avatar_url} bot={gen.user?.is_bot} size={14} />
        <span className="truncate">{gen.user?.display_name ?? "Unknown"}</span>
        <span>·</span>
        <RelativeTime iso={gen.created_at} />
      </div>
    </div>
  );
}

function ResultTile(props: TileProps & { expiryNotice?: string }) {
  const { gen, selected, anySelected, onToggleSelect, onOpen, expiryNotice } = props;
  return (
    <article className={cn("pl-tile group h-full w-full", selected && "!border-2 !border-ink ring-[3px] ring-coral")}>
      <button
        type="button"
        className="absolute inset-0 block h-full w-full cursor-zoom-in"
        aria-label={anySelected ? `Select ${gen.model_display_name} generation` : `Open ${gen.model_display_name} result`}
        onClick={(e) => (anySelected ? onToggleSelect(gen.id, { shiftKey: e.shiftKey }) : onOpen(gen))}
      >
        {gen.media_type === "image" ? (
          <ImageThumb src={gen.result_url!} alt={gen.prompt ?? ""} sizes="(max-width: 640px) 50vw, 420px" className="h-full w-full object-cover" />
        ) : gen.media_type === "video" ? (
          <VideoThumb src={gen.result_url!} className="h-full w-full object-cover" />
        ) : (
          <span className="block h-full w-full bg-paper-deep" />
        )}
      </button>
      {gen.media_type === "audio" ? <AudioFace gen={gen} /> : null}
      {gen.media_type === "video" && gen.duration_seconds ? (
        <span className="pl-badge pointer-events-none absolute bottom-2 left-2 z-[1] group-hover:opacity-0">
          <Play className="fill-current" /> {Math.round(Number(gen.duration_seconds))}s
        </span>
      ) : null}
      <TopLeft>
        <SelectBox gen={gen} selected={selected} onToggleSelect={onToggleSelect} />
        <Badges gen={gen} expiryNotice={expiryNotice} />
      </TopLeft>
      <Actions {...props} />
      <Meta gen={gen} />
    </article>
  );
}

/** An audio result: a music icon, its title, and a play button that plays it right in the feed. */
function AudioFace({ gen }: { gen: ApiGeneration }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const title = audioTitleOf(gen);
  const takes = takesOf(gen).length;
  const length = clock(gen.duration_seconds != null ? Number(gen.duration_seconds) : undefined);
  return (
    <div className="pointer-events-none absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 px-4 pb-6 text-center">
      <span className="grid size-11 place-items-center rounded-full border-2 border-ink bg-canvas">
        <Music className="size-5" />
      </span>
      <span className="line-clamp-2 max-w-full font-display text-[15px] font-semibold leading-tight">{title ?? gen.model_display_name}</span>
      <span className="text-[11px] text-mute">{[length, takes > 1 ? `${takes} takes` : null].filter(Boolean).join(" · ") || "Audio"}</span>
      <button
        type="button"
        className="plinth-btn plinth-btn--xs pointer-events-auto"
        aria-label={playing ? "Pause" : "Play"}
        onClick={(e) => {
          e.stopPropagation();
          const el = audio.current;
          if (!el) return;
          if (el.paused) void el.play().catch(() => setPlaying(false));
          else el.pause();
        }}
      >
        <span className="plinth-btn__face">
          {playing ? <Pause /> : <Play />} {playing ? "Pause" : "Play"}
        </span>
      </button>
      {/* Loads metadata only; the file downloads when someone presses play. */}
      <audio ref={audio} src={gen.result_url!} preload="none" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)} />
    </div>
  );
}

function JobTile(props: TileProps) {
  const { gen, typicalDurations, selected, onToggleSelect } = props;
  const now = useNow(1000);
  const { label, progress, expected, notes } = describeInFlight(gen, now, typicalDurations);
  const s = Math.max(0, Math.floor((now - new Date(gen.created_at).getTime()) / 1000));
  return (
    <article className={cn("pl-tile is-job is-generating group h-full w-full", selected && "ring-[3px] ring-coral")} aria-busy="true">
      <div className="relative flex h-full flex-col items-center justify-center gap-1.5 overflow-y-auto px-4 py-8 text-center">
        <span className="font-display text-[15px] font-semibold">{label}</span>
        <span className="font-mono text-[11px] text-mute">{s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`}</span>
        {progress != null ? (
          <div className="h-2 w-32 max-w-full overflow-hidden rounded-full border-[1.5px] border-ink bg-canvas" role="progressbar" aria-label="Estimated progress" aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full bg-coral transition-[width] duration-1000 ease-linear" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        ) : (
          <div className="shimmer h-2 w-32 max-w-full rounded-full border-[1.5px] border-ink" />
        )}
        {expected ? <p className="text-[11px] text-mute">{expected}</p> : null}
        {notes.map((note) => (
          <p key={note} className="max-w-[30ch] text-[11px] leading-snug text-mute">
            {note}
          </p>
        ))}
        <p className="mt-1 max-w-full truncate text-[11px] font-semibold">{gen.model_display_name}</p>
      </div>
      <TopLeft>
        <SelectBox gen={gen} selected={selected} onToggleSelect={onToggleSelect} />
        <Badges gen={gen} />
      </TopLeft>
    </article>
  );
}

function FailedTile(props: TileProps) {
  const { gen, selected, onToggleSelect } = props;
  const { title, advice, detail } = describeFailure(gen);
  return (
    <article className={cn("pl-tile is-failed group h-full w-full", selected && "ring-[3px] ring-coral")}>
      <div className="flex h-full flex-col items-center justify-center gap-1.5 overflow-y-auto px-4 pb-4 pt-10 text-center">
        <TriangleAlert className="size-5 shrink-0 text-bad" />
        <p className="font-display text-[14px] font-semibold leading-tight">{title}</p>
        <p className="text-[12px] leading-snug">{advice}</p>
        <p className="line-clamp-2 font-mono text-[10px] leading-snug text-mute" title={detail}>
          {detail}
        </p>
        <p className="text-[11px] text-mute">
          {gen.model_display_name} · <RelativeTime iso={gen.created_at} />
        </p>
      </div>
      <TopLeft>
        <SelectBox gen={gen} selected={selected} onToggleSelect={onToggleSelect} />
        <Badges gen={gen} />
      </TopLeft>
      <Actions {...props} always />
    </article>
  );
}

/** A finished job without a file to show: still copying over, or removed after the retention window. */
function NoteTile(props: TileProps & { kind: "copying" | "removed" }) {
  const { gen, kind, selected, onToggleSelect } = props;
  const days = (gen.result_metadata?.retention_days as number | undefined) ?? 7;
  return (
    <article className={cn("pl-tile group h-full w-full", selected && "ring-[3px] ring-coral")}>
      <div className="flex h-full flex-col items-center justify-center gap-1.5 overflow-y-auto px-5 pb-4 pt-10 text-center">
        {kind === "copying" ? <CloudDownload className="size-5 text-mute" /> : <FileX className="size-5 text-mute" />}
        <p className="font-display text-[14px] font-semibold">{kind === "copying" ? "Finishing up" : `File removed after ${days} days`}</p>
        <p className="text-[12px] leading-snug text-mute">
          {kind === "copying"
            ? `${providerLabels[gen.provider] ?? gen.provider} is being slow to hand the file over. It'll appear here shortly; the job is done and paid for.`
            : "The prompt and settings are kept. Press re-run to make it again."}
        </p>
      </div>
      <TopLeft>
        <SelectBox gen={gen} selected={selected} onToggleSelect={onToggleSelect} />
        <Badges gen={gen} />
      </TopLeft>
      <Actions {...props} always={kind === "removed"} />
    </article>
  );
}
