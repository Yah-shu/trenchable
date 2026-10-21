"use client";

import { ListFilter, SlidersHorizontal } from "lucide-react";
import { models } from "@/config/models.config";
import { activeFilterCount, EMPTY_FILTERS, SIZE_MAX, SIZE_MIN, type FeedFilters, type FeedSort } from "@/lib/client/feed-prefs";
import type { Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Pop, Seg } from "./parts";

/**
 * Filter and View over the feed. Filter narrows what the server returns (model, type, person,
 * dates) and sets the order; View sets the tile size. Both are remembered (feed-prefs.ts).
 */
export function FeedBar({
  filters,
  size,
  currentUserId,
  team,
  onFilters,
  onSize,
}: {
  filters: FeedFilters;
  size: number;
  currentUserId: string;
  team: Pick<Profile, "id" | "display_name">[];
  onFilters: (f: FeedFilters) => void;
  onSize: (n: number) => void;
}) {
  const active = activeFilterCount(filters);
  const set = <K extends keyof FeedFilters>(k: K, v: FeedFilters[K]) => onFilters({ ...filters, [k]: v });
  return (
    <div className="pointer-events-auto flex items-center gap-1.5">
      <Pop
        side="bottom"
        align="end"
        width={320}
        label="Filter"
        trigger={({ open, toggle }) => (
          <button type="button" className={cn("pl-pill pl-pill--sm shadow-pl", (open || active > 0) && "is-on")} onClick={toggle} aria-expanded={open}>
            <ListFilter className="size-3.5" /> Filter
            {active > 0 ? (
              <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-ink px-1 text-[10.5px] text-canvas" aria-label={`${active} on`}>
                {active}
              </span>
            ) : null}
          </button>
        )}
      >
        {() => (
          <div className="space-y-3 p-2">
            <div className="space-y-1.5">
              <label className="pl-label" htmlFor="feed-model">
                Model
              </label>
              <select id="feed-model" className="pl-field h-9" value={filters.model} onChange={(e) => set("model", e.target.value)}>
                <option value="">All models</option>
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.tier ? `${m.name} ${m.tier}` : m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="pl-label">Type</span>
              <Seg
                label="Type"
                value={filters.media_type}
                options={[
                  { value: "", label: "All" },
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                  { value: "audio", label: "Audio" },
                ]}
                onChange={(v) => set("media_type", v)}
              />
            </div>
            <div className="space-y-1.5">
              <label className="pl-label" htmlFor="feed-user">
                Person
              </label>
              <select id="feed-user" className="pl-field h-9" value={filters.user_id} onChange={(e) => set("user_id", e.target.value)}>
                <option value="">Everyone</option>
                {team.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.id === currentUserId ? "Me" : u.display_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="pl-label" htmlFor="feed-from">
                  From
                </label>
                <input id="feed-from" type="date" className="pl-field h-9 px-2 text-[13px]" value={filters.from} onChange={(e) => set("from", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="pl-label" htmlFor="feed-to">
                  To
                </label>
                <input id="feed-to" type="date" className="pl-field h-9 px-2 text-[13px]" value={filters.to} onChange={(e) => set("to", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="pl-label">Sort</span>
              <Seg<FeedSort>
                label="Sort"
                value={filters.sort}
                options={[
                  { value: "newest", label: "Newest" },
                  { value: "oldest", label: "Oldest" },
                  { value: "cost", label: "Highest cost" },
                ]}
                onChange={(v) => set("sort", v)}
              />
            </div>
            {active > 0 || filters.sort !== "newest" ? (
              <div className="flex justify-end border-t border-hairline pt-2.5">
                <button type="button" className="pl-pill pl-pill--sm" onClick={() => onFilters(EMPTY_FILTERS)}>
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        )}
      </Pop>
      <Pop
        side="bottom"
        align="end"
        width={240}
        label="View"
        trigger={({ open, toggle }) => (
          <button type="button" className={cn("pl-pill pl-pill--sm shadow-pl", open && "is-on")} onClick={toggle} aria-expanded={open}>
            <SlidersHorizontal className="size-3.5" /> View
          </button>
        )}
      >
        {() => (
          <div className="space-y-2 p-2">
            <label className="pl-label flex items-center justify-between" htmlFor="feed-size">
              Tile size <span className="font-normal text-mute">{size < 260 ? "Small" : size < 400 ? "Medium" : "Large"}</span>
            </label>
            <input id="feed-size" type="range" className="w-full" min={SIZE_MIN} max={SIZE_MAX} step={10} value={size} onChange={(e) => onSize(Number(e.target.value))} />
          </div>
        )}
      </Pop>
    </div>
  );
}
