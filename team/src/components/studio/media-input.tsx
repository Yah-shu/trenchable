"use client";

import { FolderOpen, Loader2, Music, Upload, Video, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ImageThumb, VideoThumb } from "@/components/ui/thumb";
import type { ApiMedia } from "@/lib/client-api";
import type { MediaType } from "@/lib/types";
import { ACCEPT, mediaTypeOf } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { useStudioData } from "./studio-data";

/** A selected input asset (uploaded or picked from the library). */
export type MediaRef = { url: string; name: string; mediaId?: string; durationSeconds?: number; width?: number; height?: number };

export function refFromMedia(m: ApiMedia): MediaRef {
  return { url: m.url, name: m.filename, mediaId: m.id, durationSeconds: m.metadata?.duration_seconds, width: m.metadata?.width, height: m.metadata?.height };
}

/** The media library in a dialog: pick something already uploaded or generated. */
export function LibraryPicker({ type, open, onOpenChange, onPick }: { type: MediaType; open: boolean; onOpenChange: (o: boolean) => void; onPick: (m: ApiMedia) => void }) {
  const data = useStudioData();
  const [items, setItems] = useState<ApiMedia[] | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    data
      .listMedia(type)
      .then((r) => !cancelled && setItems(r.data))
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [open, type, data]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={`Choose ${type === "audio" ? "audio" : `an ${type}`} from the library`} wide>
        {!items ? (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <div key={i} className="shimmer aspect-square rounded-[10px]" />)}</div>
        ) : items.length === 0 ? (
          <p className="py-10 text-center text-sm text-mute">Nothing here yet. Upload one instead.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
            {items.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onPick(m);
                  onOpenChange(false);
                }}
                className="group overflow-hidden rounded-[10px] border-2 border-hairline bg-canvas text-left transition-colors hover:border-ink"
              >
                <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-paper">
                  {m.type === "image" ? (
                    <ImageThumb src={m.url} alt="" sizes="160px" className="h-full w-full object-cover" />
                  ) : m.type === "video" ? (
                    <VideoThumb src={m.url} className="h-full w-full object-cover" />
                  ) : (
                    <Music className="size-8 text-mute" />
                  )}
                </div>
                <div className="truncate px-2 py-1.5 text-[11px] text-mute">{m.filename}</div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Drop zone that uploads to Storage (and the library), or picks an existing library asset.
 * `slots` > 1 renders a row of slots (e.g. an element's photos).
 */
export function MediaInput({
  type,
  userId,
  value,
  onChange,
  slots = 1,
  slotLabels,
  label,
  hint,
}: {
  type: MediaType;
  userId: string;
  value: MediaRef[];
  onChange: (refs: MediaRef[]) => void;
  slots?: number;
  slotLabels?: string[];
  label: string;
  /** Small muted line under the label, e.g. limits or usage. */
  hint?: string;
}) {
  const data = useStudioData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const remaining = slots - value.length;

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files).filter((f) => mediaTypeOf(f) === type).slice(0, Math.max(0, remaining));
      if (!list.length) {
        toast.error(remaining <= 0 ? `Max ${slots} file(s) here` : `Please drop ${type === "audio" ? "an audio file" : `a ${type}`}`);
        return;
      }
      setUploading((n) => n + list.length);
      const added: MediaRef[] = [];
      for (const file of list) {
        try {
          added.push(refFromMedia(await data.upload(file, userId)));
        } catch (e) {
          toast.error("Upload failed", { description: e instanceof Error ? e.message : String(e) });
        } finally {
          setUploading((n) => n - 1);
        }
      }
      if (added.length) onChange([...value, ...added].slice(0, slots));
    },
    [onChange, remaining, slots, type, userId, value, data],
  );

  const Icon = type === "audio" ? Music : type === "video" ? Video : Upload;
  const tile = type === "audio" ? "" : "size-[72px]";

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="pl-label">{label}</span>
          {hint ? <div className="pl-hint mt-0.5">{hint}</div> : null}
        </div>
        {remaining > 0 ? (
          <button type="button" onClick={() => setPickerOpen(true)} className="pl-pill pl-pill--sm shrink-0">
            <FolderOpen className="size-3.5" /> From library
          </button>
        ) : null}
      </div>

      <div className={cn("flex flex-wrap gap-2", type === "audio" && "flex-col")}>
        {value.map((ref, i) => (
          <div key={`${ref.url}-${i}`} className={cn("group relative overflow-hidden rounded-[10px] border-2 border-ink bg-paper", tile)}>
            {type === "image" ? (
              <ImageThumb src={ref.url} alt={ref.name} sizes="72px" className="h-full w-full object-cover" />
            ) : type === "video" ? (
              <VideoThumb src={ref.url} className="h-full w-full object-cover" />
            ) : (
              <div className="flex items-center gap-3 py-2 pl-3 pr-9">
                <Music className="size-4 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">{ref.name}</div>
                  <audio src={ref.url} controls className="mt-1.5 h-7 w-full" />
                </div>
                {ref.durationSeconds ? <span className="font-mono text-[11px] text-mute">{ref.durationSeconds.toFixed(1)}s</span> : null}
              </div>
            )}
            {slotLabels?.[i] && type !== "audio" ? <span className="pl-badge absolute bottom-1 left-1 !px-1.5 !py-0.5 !text-[9px]">{slotLabels[i]}</span> : null}
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute right-1 top-1 grid size-5 place-items-center rounded-full border border-ink bg-canvas hover:bg-coral"
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {remaining > 0 ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "flex items-center justify-center gap-2 rounded-[10px] border-2 border-dashed px-3 text-center text-xs transition-colors",
              type === "audio" ? "py-4" : "size-[72px] flex-col gap-1 px-1",
              dragging ? "border-ink bg-coral-soft" : "border-faint bg-canvas text-mute hover:border-ink hover:text-ink",
            )}
          >
            {uploading > 0 ? <Loader2 className="size-4 animate-spin" /> : <Icon className="size-4" />}
            <span className={type === "audio" ? "" : "text-[10px] leading-tight"}>
              {uploading > 0 ? "Uploading…" : type === "audio" ? "Drop audio or click (mp3 or wav)" : value.length === 0 ? (slotLabels?.[0] ?? "Add") : "Add"}
            </span>
          </button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT[type]}
        multiple={slots > 1}
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <LibraryPicker type={type} open={pickerOpen} onOpenChange={setPickerOpen} onPick={(m) => onChange([...value, refFromMedia(m)].slice(0, slots))} />
    </div>
  );
}
