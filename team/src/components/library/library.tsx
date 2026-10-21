"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Download, Images, Music, Sparkles, Trash2, Upload, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ElementsPanel } from "@/components/studio/elements-panel";
import { StudioDataProvider, type StudioData } from "@/components/studio/studio-data";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/misc";
import { Menu, MenuItem } from "@/components/ui/menu";
import { api, downloadFile, type ApiMedia, type Paginated } from "@/lib/client-api";
import { ImageThumb, VideoThumb } from "@/components/ui/thumb";
import { extensionFromUrl, formatBytes } from "@/lib/format";
import type { Profile } from "@/lib/types";
import { ACCEPT, uploadMedia } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { downloadAsWebp } from "@/lib/webp";

type TypeFilter = "all" | "image" | "video" | "audio";
type SourceFilter = "all" | "uploads" | "generated";
export type LibraryView = "media" | "elements";

/**
 * The Library: the team's media (uploads and generated outputs) and, on its own tab, the team's
 * saved elements. `elementsData` swaps the elements' data source (the dev preview's fixtures).
 */
export function Library({ profile, initialView = "media", elementsData }: { profile: Profile; initialView?: LibraryView; elementsData?: StudioData }) {
  const [view, setView] = useState<LibraryView>(initialView);
  const show = (v: LibraryView) => {
    setView(v);
    // Keep the tab in the address so a reload or a shared link lands on it.
    const url = new URL(window.location.href);
    if (v === "elements") url.searchParams.set("view", "elements");
    else url.searchParams.delete("view");
    window.history.replaceState(window.history.state, "", url);
  };
  const tabs = (
    <div className="pl-tabs mb-6" role="tablist" aria-label="Library sections">
      {(
        [
          ["media", "Media", Images],
          ["elements", "Elements", UserRound],
        ] as const
      ).map(([id, label, Icon]) => (
        <button key={id} type="button" role="tab" aria-selected={view === id} className={cn("pl-tab", view === id && "is-active")} onClick={() => show(id)}>
          <Icon className="size-4" /> {label}
        </button>
      ))}
    </div>
  );

  if (view === "elements") {
    const panel = <ElementsPanel profile={profile} />;
    return (
      <div className="min-h-[60vh]">
        <div className="mb-6">
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink sm:text-[40px] sm:leading-[1.05]">Elements</h1>
          <p className="mt-2 max-w-2xl text-sm text-mute">Characters, products, locations and styles the team saved, ready to drop into any prompt from the composer&apos;s + menu.</p>
        </div>
        {tabs}
        {elementsData ? <StudioDataProvider value={elementsData}>{panel}</StudioDataProvider> : panel}
      </div>
    );
  }
  return <MediaLibrary profile={profile} tabs={tabs} />;
}

function MediaLibrary({ profile, tabs }: { profile: Profile; tabs: React.ReactNode }) {
  const router = useRouter();
  const [type, setType] = useState<TypeFilter>("all");
  const [source, setSource] = useState<SourceFilter>("all");
  const [items, setItems] = useState<ApiMedia[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [selected, setSelected] = useState<ApiMedia | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async (t: TypeFilter, s: SourceFilter, p: number) => {
    const qs = new URLSearchParams({ page: String(p), limit: "48" });
    if (t !== "all") qs.set("type", t);
    if (s !== "all") qs.set("source", s);
    try {
      const res = await api<Paginated<ApiMedia>>(`/api/media?${qs}`);
      setItems((prev) => (p === 1 ? res.data : [...prev, ...res.data]));
      setHasMore(res.has_more);
      setPage(p);
    } catch (e) {
      toast.error("Couldn't load the library", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(type, source, 1), 0);
    return () => clearTimeout(t);
  }, [type, source, load]);

  async function upload(files: FileList | File[]) {
    const list = Array.from(files);
    setUploading((n) => n + list.length);
    for (const file of list) {
      try {
        const media = await uploadMedia(file, profile.id);
        setItems((prev) => [{ ...media, user: { id: profile.id, display_name: profile.display_name, avatar_url: profile.avatar_url, is_bot: false } }, ...prev]);
        toast.success("Media uploaded", { description: file.name });
      } catch (e) {
        toast.error("Upload failed", { description: `${file.name}: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  async function remove(m: ApiMedia) {
    try {
      if (m.generation_id) await api(`/api/generate/${m.generation_id}`, { method: "DELETE" });
      else await api(`/api/media/${m.id}`, { method: "DELETE" });
      setItems((prev) => prev.filter((p) => p.id !== m.id));
      setSelected(null);
      toast.success("Deleted");
    } catch (e) {
      toast.error("Delete failed", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  const canDelete = (m: ApiMedia) => profile.role === "admin" || m.user_id === profile.id;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
      className={cn(
        "relative min-h-[60vh] rounded-[14px] transition-colors",
        dragging && "bg-coral-soft/40 outline-2 outline-dashed outline-offset-8 outline-ink",
      )}
    >
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-[-0.03em] text-ink sm:text-[40px] sm:leading-[1.05]">Media library</h1>
          <p className="mt-2 max-w-2xl text-sm text-mute">Reference images, voiceovers and every generated output, shared across the team.</p>
        </div>
        <Button variant="primary" onClick={() => fileRef.current?.click()} disabled={uploading > 0}>
          <Upload /> {uploading > 0 ? `Uploading ${uploading}…` : "Upload"}
        </Button>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={[ACCEPT.image, ACCEPT.video, ACCEPT.audio].join(",")}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {tabs}

      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-3">
        <PillFilter<TypeFilter>
          label="Type"
          value={type}
          onChange={(v) => {
            setLoading(true);
            setType(v);
          }}
          options={[
            { value: "all", label: "All" },
            { value: "image", label: "Images" },
            { value: "video", label: "Video" },
            { value: "audio", label: "Audio" },
          ]}
        />
        <PillFilter<SourceFilter>
          label="Source"
          value={source}
          onChange={(v) => {
            setLoading(true);
            setSource(v);
          }}
          options={[
            { value: "all", label: "Everything" },
            { value: "uploads", label: "Uploads" },
            { value: "generated", label: "Generated" },
          ]}
        />
      </div>

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="shimmer aspect-square rounded-[12px] border border-hairline" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="pl-panel pl-panel--paper items-center border-dashed px-6 py-20 text-center">
          <p className="font-display text-xl font-semibold text-ink">Nothing here yet</p>
          <p className="mt-2 text-sm text-mute">Drop images, video or audio anywhere on this page.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((m) => (
            <button key={m.id} type="button" onClick={() => setSelected(m)} className="pl-tile group bg-canvas text-left">
              <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-paper">
                {m.type === "image" ? (
                  <ImageThumb src={m.url} alt="" sizes="(max-width: 640px) 50vw, 220px" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
                ) : m.type === "video" ? (
                  <VideoThumb src={m.url} className="h-full w-full object-cover" />
                ) : (
                  <span className="grid size-14 place-items-center rounded-full border-2 border-ink bg-coral-soft">
                    <Music className="size-6 text-ink" />
                  </span>
                )}
                {m.generation_id ? (
                  <span className="pl-badge pl-badge--coral absolute left-2 top-2">
                    <Sparkles /> Generated
                  </span>
                ) : null}
                {m.metadata?.duration_seconds ? (
                  <span className="pl-badge pl-badge--ink absolute bottom-2 right-2 font-mono">{m.metadata.duration_seconds.toFixed(1)}s</span>
                ) : null}
              </div>
              <div className="truncate border-t border-hairline px-2.5 py-2 text-xs font-medium text-ink">{m.filename}</div>
            </button>
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="mt-8 flex justify-center">
          <Button variant="outline" onClick={() => {
              setLoading(true);
              void load(type, source, page + 1);
            }} disabled={loading}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      ) : null}

      <Dialog open={Boolean(selected)} onOpenChange={(o) => !o && setSelected(null)}>
        {selected ? (
          <DialogContent title={selected.filename} wide>
            <div className="grid gap-6 md:grid-cols-[1fr_260px]">
              <div className="flex items-center justify-center overflow-hidden rounded-[10px] border border-hairline bg-paper">
                {selected.type === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={selected.url} alt={selected.filename} className="max-h-[65vh] w-full object-contain" />
                ) : selected.type === "video" ? (
                  <video src={selected.url} controls autoPlay playsInline className="max-h-[65vh] w-full object-contain" />
                ) : (
                  <div className="w-full p-8">
                    <span className="mx-auto mb-6 grid size-16 place-items-center rounded-full border-2 border-ink bg-coral-soft">
                      <Music className="size-7 text-ink" />
                    </span>
                    <audio src={selected.url} controls className="w-full" />
                  </div>
                )}
              </div>
              <div className="space-y-5">
                <dl className="space-y-2 text-[13px]">
                  {[
                    ["Type", selected.type],
                    ["Size", formatBytes(selected.file_size_bytes)],
                    ...(selected.metadata?.width ? [["Dimensions", `${selected.metadata.width} × ${selected.metadata.height}`]] : []),
                    ...(selected.metadata?.duration_seconds ? [["Duration", `${selected.metadata.duration_seconds.toFixed(1)}s`]] : []),
                    ["Added", formatDistanceToNowStrict(new Date(selected.created_at), { addSuffix: true })],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 border-b border-hairline pb-2">
                      <dt className="text-mute">{k}</dt>
                      <dd className="text-right font-medium text-ink">{v}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-mute">By</dt>
                    <dd className="flex items-center gap-1.5 font-medium text-ink">
                      <UserAvatar name={selected.user?.display_name ?? "?"} bot={selected.user?.is_bot} size={20} />
                      {selected.user?.display_name ?? "Unknown"}
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-col gap-2 [&>*]:w-full [&_button]:w-full">
                  {selected ? (
                    <Button variant="primary" onClick={() => router.push(`/?use=${selected.id}`)}>
                      <Sparkles /> Use in generation
                    </Button>
                  ) : null}
                  <DownloadButton media={selected} />
                  {canDelete(selected) ? (
                    <Button
                      variant="danger"
                      onClick={() => {
                        if (window.confirm(selected.generation_id ? "Delete this generated output and its gallery entry?" : "Delete this file?")) void remove(selected);
                      }}
                    >
                      <Trash2 /> Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/** Images can be saved as WebP as well as the original file. */
function DownloadButton({ media }: { media: ApiMedia }) {
  const name = `${media.filename.replace(/\.[^.]+$/, "")}.${extensionFromUrl(media.url, media.type)}`;
  const original = () => downloadFile(media.url, name);

  if (media.type !== "image") {
    return (
      <Button variant="outline" onClick={original}>
        <Download /> Download
      </Button>
    );
  }

  const webp = async () => {
    const toastId = toast.loading("Converting to WebP…");
    try {
      await downloadAsWebp(media.url, name);
      toast.success("Downloaded as WebP", { id: toastId });
    } catch (e) {
      toast.error("Couldn't convert to WebP", { id: toastId, description: `${e instanceof Error ? e.message : String(e)} — downloading the original instead.` });
      void original();
    }
  };

  return (
    <Menu
      trigger={({ onClick }) => (
        <Button variant="outline" onClick={onClick}>
          <Download /> Download
        </Button>
      )}
    >
      {(close) => (
        <>
          <MenuItem onClick={() => { close(); void original(); }} hint="Exactly as generated">
            Original file
          </MenuItem>
          <MenuItem onClick={() => { close(); void webp(); }} hint="Much smaller, for web pages">
            WebP
          </MenuItem>
        </>
      )}
    </Menu>
  );
}

/** A labelled row of pill toggles (one choice). */
function PillFilter<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap items-center gap-1.5">
      <span className="pl-pill__label mr-1">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn("pl-pill pl-pill--sm", o.value === value && "is-on")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
