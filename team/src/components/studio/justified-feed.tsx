"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { ApiGeneration } from "@/lib/client-api";
import { rowHeight } from "@/lib/client/feed-prefs";
import { fixedRows, measuredAspect, parseAspect, placeRows, rememberAspect, rowsFor } from "@/lib/client/justified";
import { isInFlight } from "./result-helpers";

const GAP = 8;
/** Below this width the feed is two tiles a row (phones). */
const NARROW = 640;
const AUDIO_ASPECT = 1.25;

/** A tile's shape, best first: what the file measured → the recorded size → the aspect it was asked for. */
function aspectOf(g: ApiGeneration): { a: number; known: boolean } {
  if (g.media_type === "audio") return { a: AUDIO_ASPECT, known: true };
  const visual = g.status === "completed" && Boolean(g.result_url);
  if (visual) {
    const m = measuredAspect(g.id);
    if (m) return { a: m, known: true };
    const meta = (g.result_metadata ?? {}) as { width?: unknown; height?: unknown };
    const w = Number(meta.width);
    const h = Number(meta.height);
    if (w > 0 && h > 0) return { a: w / h, known: true };
  }
  const asked = parseAspect(g.aspect_ratio) ?? parseAspect((g.params as { aspect_ratio?: unknown } | null)?.aspect_ratio);
  if (asked) return { a: asked, known: !visual };
  // Failed and running jobs without a shape hold a square-ish slot; video placeholders are wide.
  return { a: g.media_type === "video" ? 16 / 9 : 1, known: !visual };
}

/**
 * The feed in justified rows. It watches its own width and turns the View slider's size into a
 * target row height. Tiles sit in absolute boxes, so a reflow (a new job at the head, the slider,
 * the window) moves them without remounting their media. Finished tiles measure their file once it
 * loads; the layout runs again (once a frame at most) when one turns out a different shape.
 */
export function JustifiedFeed({ items, size, render }: { items: ApiGeneration[]; size: number; render: (g: ApiGeneration) => ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [, setMeasured] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const read = () => setWidth(Math.floor(el.clientWidth));
    read();
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    let raf = 0;
    const take = (media: Element | null) => {
      const cell = media?.closest<HTMLElement>("[data-measure]");
      const id = cell?.dataset.measure;
      if (!id) return;
      const w = media instanceof HTMLImageElement ? media.naturalWidth : media instanceof HTMLVideoElement ? media.videoWidth : 0;
      const h = media instanceof HTMLImageElement ? media.naturalHeight : media instanceof HTMLVideoElement ? media.videoHeight : 0;
      if (rememberAspect(id, w, h) && !raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          setMeasured((n) => n + 1);
        });
      }
    };
    const on = (e: Event) => take(e.target as Element);
    el.addEventListener("load", on, true);
    el.addEventListener("loadedmetadata", on, true);
    return () => {
      el.removeEventListener("load", on, true);
      el.removeEventListener("loadedmetadata", on, true);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Running jobs first (newest first), then everything else in the order the server sorted it.
  const ordered = [...items.filter(isInFlight), ...items.filter((g) => !isInFlight(g))];
  const aspects = ordered.map(aspectOf);
  const rows = width < NARROW ? fixedRows(aspects.map((x) => x.a), width, 2, GAP) : rowsFor(aspects.map((x) => x.a), width, rowHeight(size, width), GAP);
  const layout = placeRows(rows, GAP);

  return (
    <div ref={box} className="relative w-full" style={{ height: layout.height }}>
      {layout.boxes.map((b) => {
        const g = ordered[b.index];
        const measure = g.status === "completed" && g.result_url && g.media_type !== "audio";
        return (
          <div
            key={g.id}
            data-measure={measure ? g.id : undefined}
            className="absolute transition-[left,top,width,height] duration-200 ease-[var(--pl-ease)] hover:z-[5] focus-within:z-[5]"
            style={{ left: b.x, top: b.y, width: b.width, height: b.height }}
          >
            {render(g)}
          </div>
        );
      })}
    </div>
  );
}
