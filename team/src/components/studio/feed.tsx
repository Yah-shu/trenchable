"use client";

import { Download, Loader2, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { toast } from "sonner";
import type { ApiGeneration } from "@/lib/client-api";
import { activeFilterCount, readFeedPrefs, writeFeedPrefs, type FeedFilters, type FeedPrefs } from "@/lib/client/feed-prefs";
import { browserStorage } from "@/lib/client/draft";
import { awaitingCopy, describeFailure, recentProviderTrouble, retriesOf, type TypicalDurations } from "@/lib/job-status";
import type { Profile } from "@/lib/types";
import { downloadZip } from "@/lib/zip";
import { FeedBar } from "./feed-bar";
import { JustifiedFeed } from "./justified-feed";
import { Pop } from "./parts";
import { isInFlight } from "./result-helpers";
import { useStudioData } from "./studio-data";
import { FeedTile } from "./tiles";
import { Viewer } from "./viewer";

export type FeedHandle = { prepend: (jobs: ApiGeneration[]) => void };

const POLL_MS = 3000;
const PAGE = 24;

/** Tells the nav's credits pill to refresh (a job finished, so the balance moved). */
const refreshCredits = () => window.dispatchEvent(new Event("trenchable:credits-refresh"));

export const Feed = forwardRef<
  FeedHandle,
  {
    currentUser: Profile;
    team: Pick<Profile, "id" | "display_name">[];
    /** How long each model usually takes, for the in-progress estimate on tiles. */
    typicalDurations?: TypicalDurations;
    /** Days a generated file is kept, for the "deletes soon" countdown. */
    retentionDays?: number | null;
    onRerun: (g: ApiGeneration) => void;
    onUseSettings: (g: ApiGeneration) => void;
    /** The viewer's Use as reference for this result, or null when the current model can't take it. */
    referenceAction: (g: ApiGeneration) => (() => void) | null;
    /** Room to leave under the feed for the floating composer. */
    bottomPad: number;
    /** Open the viewer on the first result once loaded (dev preview screenshots). */
    openViewer?: boolean;
  }
>(function Feed({ currentUser, team, typicalDurations, retentionDays, onRerun, onUseSettings, referenceAction, bottomPad, openViewer }, ref) {
  const data = useStudioData();
  const [prefs, setPrefs] = useState<FeedPrefs>(() => readFeedPrefs(browserStorage()));
  const filters = prefs.filters;
  const [items, setItems] = useState<ApiGeneration[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [viewerId, setViewerId] = useState<string | null>(null);
  const lastClickedRef = useRef<string | null>(null);
  const itemsRef = useRef(items);
  const autoOpened = useRef(false);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  // The lane bar above is sticky; Filter / View and the selection bar sit just under it, whatever its height.
  const [navH, setNavH] = useState(56);
  useEffect(() => {
    const bar = document.querySelector<HTMLElement>(".pl-lanebar");
    if (!bar) return;
    const read = () => setNavH(Math.round(bar.getBoundingClientRect().height));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  const changePrefs = (next: Partial<FeedPrefs>) =>
    setPrefs((p) => {
      const merged = { ...p, ...next };
      writeFeedPrefs(browserStorage(), merged);
      return merged;
    });

  const selected = new Set(selectedIds);
  const selectedItems = items.filter((i) => selected.has(i.id));
  const canModifyItem = useCallback((g: ApiGeneration) => currentUser.role === "admin" || g.user_id === currentUser.id, [currentUser]);
  const viewable = [...items.filter(isInFlight), ...items.filter((g) => !isInFlight(g))].filter((g) => g.status === "completed" && g.result_url && !awaitingCopy(g));

  /** Shift-click extends the selection from the previous click, like a file browser. */
  function toggleSelect(id: string, { shiftKey }: { shiftKey: boolean }) {
    const anchor = lastClickedRef.current;
    lastClickedRef.current = id;
    setSelectedIds((prev) => {
      if (shiftKey && anchor) {
        const from = items.findIndex((i) => i.id === anchor);
        const to = items.findIndex((i) => i.id === id);
        if (from !== -1 && to !== -1) {
          const range = items.slice(Math.min(from, to), Math.max(from, to) + 1).map((i) => i.id);
          return Array.from(new Set([...prev, ...range]));
        }
      }
      return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    });
  }

  async function downloadSelected(webp = false) {
    const ready = selectedItems.filter((g) => g.status === "completed" && g.result_url);
    if (!ready.length) return void toast.error("Nothing to download", { description: "Only finished generations can be downloaded." });
    setBulkBusy(true);
    const toastId = toast.loading(`Preparing ${ready.length} file(s)…`);
    try {
      await downloadZip(
        ready.map((g) => ({ url: g.result_url!, mediaType: g.media_type, model: g.model_display_name, prompt: g.prompt, createdAt: g.created_at })),
        `trenchable-${new Date().toISOString().slice(0, 10)}-${ready.length}-files.zip`,
        (done, n) => toast.loading(`${webp ? "Converting" : "Downloading"} ${done} of ${n}…`, { id: toastId }),
        { webp },
      );
      toast.success(`Downloaded ${ready.length} file(s)`, { id: toastId });
      setSelectedIds([]);
    } catch (e) {
      toast.error("Download failed", { id: toastId, description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBulkBusy(false);
    }
  }

  async function deleteSelected() {
    const mine = selectedItems.filter(canModifyItem);
    const skipped = selectedItems.length - mine.length;
    if (!mine.length) return void toast.error("You can only delete your own generations");
    if (!window.confirm(`Delete ${mine.length} generation(s)? This also removes the files from the library. This can't be undone.`)) return;
    setBulkBusy(true);
    const toastId = toast.loading(`Deleting ${mine.length}…`);
    const deleted: string[] = [];
    let failed = 0;
    for (const g of mine) {
      try {
        await data.remove(g.id);
        deleted.push(g.id);
      } catch {
        failed += 1;
      }
      toast.loading(`Deleting ${deleted.length + failed} of ${mine.length}…`, { id: toastId });
    }
    setItems((prev) => prev.filter((p) => !deleted.includes(p.id)));
    setTotal((t) => t - deleted.length);
    setSelectedIds([]);
    setBulkBusy(false);
    const notes = [failed ? `${failed} failed` : "", skipped ? `${skipped} skipped (not yours)` : ""].filter(Boolean).join(", ");
    toast[failed ? "error" : "success"](`Deleted ${deleted.length}`, { id: toastId, description: notes || undefined });
  }

  const load = useCallback(
    async (f: FeedFilters, p: number) => {
      setLoading(true);
      const qs = new URLSearchParams({ page: String(p), limit: String(PAGE), sort: f.sort });
      for (const k of ["model", "media_type", "user_id", "from", "to"] as const) if (f[k]) qs.set(k, f[k]);
      try {
        const res = await data.listGenerations(qs);
        setItems((prev) => (p === 1 ? res.data : [...prev, ...res.data.filter((d) => !prev.some((x) => x.id === d.id))]));
        setHasMore(res.has_more);
        setTotal(res.total);
        setPage(p);
        if (openViewer && !autoOpened.current) {
          autoOpened.current = true;
          const first = res.data.find((g) => g.status === "completed" && g.result_url && g.media_type === "image");
          if (first) setViewerId(first.id);
        }
      } catch (e) {
        toast.error("Couldn't load generations", { description: e instanceof Error ? e.message : String(e) });
      } finally {
        setLoading(false);
      }
    },
    [data, openViewer],
  );

  useEffect(() => {
    // Deferred a tick so the loading state isn't set synchronously inside the effect.
    const t = setTimeout(() => void load(filters, 1), 0);
    return () => clearTimeout(t);
  }, [filters, load]);

  useImperativeHandle(ref, () => ({
    prepend: (jobs) => {
      setItems((prev) => [...jobs, ...prev.filter((p) => !jobs.some((j) => j.id === p.id))]);
      setTotal((t) => t + jobs.length);
    },
  }));

  // Unified status polling: one endpoint regardless of provider.
  useEffect(() => {
    let stopped = false;
    const tick = async () => {
      const inflight = itemsRef.current.filter(isInFlight).slice(0, 12);
      await Promise.all(
        inflight.map(async (g) => {
          try {
            const s = await data.status(g.id);
            // Refetch the full row when the status moves or the job was retried (so the tile can say so).
            if (s.status === g.status && (s.retries ?? 0) === retriesOf(g).length) return;
            const full = await data.getGeneration(g.id);
            if (stopped) return;
            setItems((prev) => prev.map((p) => (p.id === g.id ? full : p)));
            if (!isInFlight(full)) refreshCredits();
            if (full.user_id === currentUser.id) {
              if (full.status === "completed") toast.success("Generation complete", { description: full.model_display_name });
              if (full.status === "failed") {
                const { title, advice } = describeFailure(full);
                toast.error(`${full.model_display_name}: ${title}`, { description: advice, duration: 15_000 });
              }
            }
          } catch {
            /* transient: try again next tick */
          }
        }),
      );
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    let timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [currentUser.id, data]);

  // Infinite load: the next page comes in as the sentinel nears the viewport.
  const sentinel = useRef<HTMLDivElement>(null);
  const more = useRef({ hasMore, loading, page, filters, load });
  useEffect(() => {
    more.current = { hasMore, loading, page, filters, load };
  });
  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        const m = more.current;
        if (entries.some((e) => e.isIntersecting) && m.hasMore && !m.loading) void m.load(m.filters, m.page + 1);
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  async function remove(g: ApiGeneration) {
    try {
      await data.remove(g.id);
      setItems((prev) => prev.filter((p) => p.id !== g.id));
      setTotal((t) => t - 1);
      toast.success("Deleted");
      return true;
    } catch (e) {
      toast.error("Delete failed", { description: e instanceof Error ? e.message : String(e) });
      return false;
    }
  }

  async function toggleShared(g: ApiGeneration) {
    try {
      const next = await data.setShared(g.id, !g.is_shared);
      setItems((prev) => prev.map((p) => (p.id === g.id ? { ...p, ...next, user: next.user ?? p.user } : p)));
      toast.success(next.is_shared ? "Shared with the team" : "Now private");
    } catch (e) {
      toast.error("Couldn't change sharing", { description: e instanceof Error ? e.message : String(e) });
    }
  }

  // A new filter reloads the list, so any selection is cleared with it.
  const changeFilters = (f: FeedFilters) => {
    setSelectedIds([]);
    changePrefs({ filters: f });
  };
  const filtered = activeFilterCount(filters) > 0;

  return (
    <section aria-label="Generations" className="relative min-w-0 px-3 pt-3 sm:px-4" style={{ paddingBottom: bottomPad + 32 }}>
      {/* Filter / View float top-right as the feed scrolls under them. */}
      <div className="pointer-events-none sticky z-30 flex h-9 justify-end" style={{ top: navH + 8 }}>
        <FeedBar filters={filters} size={prefs.size} currentUserId={currentUser.id} team={team} onFilters={changeFilters} onSize={(size) => changePrefs({ size })} />
      </div>
      <div className="-mt-9 mb-3 flex h-9 items-center gap-2 pr-44">
        <h1 className="font-display text-[20px] font-semibold leading-none">Generations</h1>
        <span className="pl-badge pl-badge--quiet tabular-nums">{total}</span>
      </div>

      <ProviderTroubleNotice items={items} />

      {selectedIds.length > 0 ? (
        <div style={{ top: navH + 12 }} className="fixed left-1/2 z-40 flex w-max max-w-[calc(100vw-24px)] -translate-x-1/2 flex-wrap items-center gap-2 rounded-pl border-2 border-ink bg-canvas px-3 py-2 shadow-pl-lg" role="toolbar" aria-label="Selection">
          <span className="text-[13px] font-semibold tabular-nums">{selectedIds.length} selected</span>
          <button type="button" className="pl-pill pl-pill--sm" disabled={bulkBusy} onClick={() => setSelectedIds(items.map((i) => i.id))}>
            Select all {items.length}
          </button>
          <Pop
            side="bottom"
            label="Download zip"
            trigger={({ open, toggle }) => (
              <button type="button" className="plinth-btn plinth-btn--xs" disabled={bulkBusy} onClick={toggle} aria-expanded={open}>
                <span className="plinth-btn__face">
                  <Download /> Download zip
                </span>
              </button>
            )}
          >
            {(close) => (
              <>
                <button type="button" className="pl-pop__item" onClick={() => (close(), void downloadSelected(false))}>
                  <span>
                    Original files<span className="block text-[11px] font-normal text-mute">Exactly as generated</span>
                  </span>
                </button>
                <button type="button" className="pl-pop__item" onClick={() => (close(), void downloadSelected(true))}>
                  <span>
                    Images as WebP<span className="block text-[11px] font-normal text-mute">Much smaller for web</span>
                  </span>
                </button>
              </>
            )}
          </Pop>
          <button type="button" className="plinth-btn plinth-btn--xs plinth-btn--bad" disabled={bulkBusy} onClick={deleteSelected}>
            <span className="plinth-btn__face">
              <Trash2 /> Delete
            </span>
          </button>
          <button type="button" className="pl-iconbtn pl-iconbtn--sm" aria-label="Clear selection" disabled={bulkBusy} onClick={() => setSelectedIds([])}>
            <X />
          </button>
        </div>
      ) : null}

      {loading && items.length === 0 ? (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="shimmer aspect-square rounded-pl border border-hairline" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="mx-auto mt-[12vh] max-w-md">
          <div className="pl-press">
            <div className="pl-panel pl-panel--paper items-center px-8 py-10 text-center">
              <span className="pl-logo__tile !size-12 !rounded-[12px]">
                <Sparkles className="size-5" />
              </span>
              <h2 className="mt-4 text-[22px] font-semibold">{filtered ? "Nothing matches these filters" : "Nothing here yet."}</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-mute">
                {filtered ? "Try clearing a filter." : "Pick a model, write a prompt and press Ctrl+Enter."}
              </p>
              {filtered ? (
                <button type="button" className="plinth-btn plinth-btn--sm plinth-btn--ghost mt-5" onClick={() => changeFilters({ ...filters, model: "", media_type: "", user_id: "", from: "", to: "" })}>
                  <span className="plinth-btn__face">Clear filters</span>
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <JustifiedFeed
          items={items}
          size={prefs.size}
          render={(g) => (
            <FeedTile
              gen={g}
              typicalDurations={typicalDurations}
              retentionDays={retentionDays}
              canModify={canModifyItem(g)}
              selected={selected.has(g.id)}
              anySelected={selectedIds.length > 0}
              onToggleSelect={toggleSelect}
              onOpen={(x) => setViewerId(x.id)}
              onRerun={onRerun}
              onUseSettings={onUseSettings}
              onDelete={(x) => void remove(x)}
            />
          )}
        />
      )}

      <div ref={sentinel} aria-hidden className="h-px" />
      {hasMore ? (
        <div className="mt-6 flex justify-center">
          <button type="button" className="plinth-btn plinth-btn--sm plinth-btn--ghost" onClick={() => load(filters, page + 1)} disabled={loading}>
            <span className="plinth-btn__face">
              {loading ? <Loader2 className="animate-spin" /> : null}
              {loading ? "Loading…" : "Load more"}
            </span>
          </button>
        </div>
      ) : null}

      {viewerId && viewable.some((g) => g.id === viewerId) ? (
        <Viewer
          items={viewable}
          id={viewerId}
          onStep={setViewerId}
          onClose={() => setViewerId(null)}
          actions={{
            canModify: canModifyItem,
            onRerun,
            onUseSettings: (g) => {
              setViewerId(null);
              onUseSettings(g);
            },
            referenceAction: (g) => {
              const run = referenceAction(g);
              return run
                ? () => {
                    run();
                    setViewerId(null);
                  }
                : null;
            },
            onDelete: (g) => {
              const i = viewable.findIndex((x) => x.id === g.id);
              const next = viewable[i + 1] ?? viewable[i - 1];
              void remove(g).then((ok) => ok && setViewerId(next && next.id !== g.id ? next.id : null));
            },
            onToggleShared: (g) => void toggleShared(g),
          }}
        />
      ) : null}
    </section>
  );
});

/** Heads-up when Kie is failing or retrying several recent jobs, so editors know it's not their settings. */
function ProviderTroubleNotice({ items }: { items: ApiGeneration[] }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const trouble = recentProviderTrouble(items, now);
  if (!trouble) return null;
  return (
    <div role="status" className="pl-panel mb-3 flex-row items-start gap-2.5 border-warn bg-warn-soft px-3.5 py-2.5 text-[13px] leading-snug">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
      <p>
        <span className="font-semibold">{trouble.provider} is having trouble right now.</span> {trouble.count} recent jobs hit errors on their side. Jobs are retried automatically; if yours
        still fails, try again in a few minutes. Failed jobs aren&apos;t charged.
      </p>
    </div>
  );
}
