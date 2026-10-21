"use client";

import { Check, Clapperboard, Image as ImageIcon, Music, Scaling, Search, UserRound, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { categoryLabels, categoryOrder, familyMembers, getModel, pickerEntries, type Category, type ModelConfig } from "@/config/models.config";
import { modelPriceTag } from "@/lib/client/cost";
import { cn } from "@/lib/utils";

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  video: Clapperboard,
  avatar: UserRound,
  image: ImageIcon,
  audio: Music,
  upscale: Scaling,
};

/** The models the menu lists first. Ids that leave the config just drop out. */
const FEATURED = ["nano-banana-pro", "gpt-image-2-5-flare", "kling-3-std", "seedance-2-fast", "suno", "elevenlabs-v3"];

type Row = { id: string; key: string; members: ModelConfig[]; head: string | null };

const keyOf = (m: ModelConfig) => m.family ?? m.id;

function matches(members: ModelConfig[], needle: string) {
  const m = members[0];
  const hay = [m.name, m.description, categoryLabels[m.category], m.id, ...members.map((x) => `${x.tier ?? ""} ${x.id}`)].join(" ").toLowerCase();
  return needle.split(/\s+/).every((w) => hay.includes(w));
}

/**
 * The model picker: a search box, Featured, then every model grouped by category. A family with
 * tiers (Standard / Pro / 4K) is one row with its tiers as chips. ↑ ↓ move, ← → pick a tier on
 * the active row, Enter chooses, Escape closes.
 */
export function ModelMenu({ value, onPick, onClose }: { value: ModelConfig; onPick: (m: ModelConfig) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const entries = useMemo(() => pickerEntries(), []);
  const rows = useMemo<Row[]>(() => {
    const needle = q.trim().toLowerCase();
    const toRow = (m: ModelConfig, section: string, head: string | null): Row => ({ id: `${section}:${keyOf(m)}`, key: keyOf(m), members: familyMembers(m), head });
    if (needle) {
      const hits = entries.filter((m) => matches(familyMembers(m), needle));
      return hits.map((m, i) => toRow(m, "r", i === 0 ? "Results" : null));
    }
    const out: Row[] = [];
    const featured = FEATURED.map((id) => getModel(id)).filter((m): m is ModelConfig => Boolean(m));
    const seen = new Set<string>();
    featured.forEach((m) => {
      if (seen.has(keyOf(m))) return;
      seen.add(keyOf(m));
      out.push(toRow(entries.find((e) => keyOf(e) === keyOf(m)) ?? m, "f", out.length === 0 ? "Featured" : null));
    });
    for (const cat of categoryOrder) {
      const inCat = entries.filter((m) => m.category === cat);
      inCat.forEach((m, i) => out.push(toRow(m, cat, i === 0 ? categoryLabels[cat] : null)));
    }
    return out;
  }, [q, entries]);

  const currentKey = keyOf(value);
  const [active, setActive] = useState(() => Math.max(0, rows.findIndex((r) => r.key === currentKey)));
  /** The tier each family row would pick (the current model's tier for its own family). */
  const [tierPick, setTierPick] = useState<Record<string, string>>(() => (value.family ? { [value.family]: value.id } : {}));
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => search.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  useLayoutEffect(() => {
    list.current?.querySelector<HTMLElement>(`[data-row="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const memberFor = (row: Row) => row.members.find((m) => m.id === tierPick[row.key]) ?? row.members[0];

  const onKey = (e: KeyboardEvent) => {
    const row = rows[active];
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!rows.length) return;
      setActive((a) => (a + (e.key === "ArrowDown" ? 1 : rows.length - 1)) % rows.length);
    } else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && row && row.members.length > 1) {
      e.preventDefault();
      const i = row.members.indexOf(memberFor(row));
      const next = row.members[(i + (e.key === "ArrowRight" ? 1 : row.members.length - 1)) % row.members.length];
      setTierPick((t) => ({ ...t, [row.key]: next.id }));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (row) onPick(memberFor(row));
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  return (
    <div className="flex max-h-[min(64vh,560px)] flex-col" onKeyDown={onKey}>
      <div className="relative m-1 mb-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
        <input
          ref={search}
          className="pl-field h-9 pl-8"
          placeholder="Search models…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          aria-label="Search models"
          aria-controls="model-menu-list"
          aria-activedescendant={rows[active] ? `mm-${rows[active].id}` : undefined}
        />
      </div>
      <div ref={list} id="model-menu-list" role="listbox" aria-label="Models" className="mt-1 min-h-0 flex-1 overflow-y-auto px-0.5 pb-1">
        {!rows.length ? <p className="px-3 py-6 text-center text-[13px] text-mute">No model matches “{q}”.</p> : null}
        {rows.map((row, i) => {
          const lead = row.members[0];
          const Icon = CATEGORY_ICONS[lead.category];
          const on = row.key === currentKey;
          const chosen = memberFor(row);
          const price = modelPriceTag(chosen);
          return (
            <div key={row.id}>
              {row.head ? <p className="px-2.5 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.08em] text-mute first:pt-1.5">{row.head}</p> : null}
              <div
                id={`mm-${row.id}`}
                data-row={i}
                role="option"
                aria-selected={on}
                tabIndex={-1}
                onMouseEnter={() => setActive(i)}
                onClick={() => onPick(chosen)}
                className={cn("flex cursor-pointer items-start gap-2.5 rounded-[9px] px-2 py-2", on ? "bg-coral-soft" : i === active ? "bg-paper" : "")}
              >
                <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-[8px] border-2 border-ink", on ? "bg-coral" : "bg-canvas")} aria-hidden>
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate font-display text-[14px] font-semibold leading-tight">{lead.name}</span>
                    {on && row.members.length === 1 ? <Check className="size-3.5 shrink-0" /> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] leading-snug text-mute">{lead.description}</span>
                  {row.members.length > 1 ? (
                    <span className="mt-1.5 flex flex-wrap gap-1" role="radiogroup" aria-label={`${lead.name} tier`}>
                      {row.members.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          role="radio"
                          aria-checked={m.id === chosen.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPick(m);
                          }}
                          className={cn(
                            "rounded-[6px] border px-1.5 py-[3px] text-[10.5px] font-semibold leading-none transition-colors",
                            m.id === chosen.id ? "border-ink bg-ink text-canvas" : "border-hairline bg-canvas hover:border-ink",
                          )}
                        >
                          {m.tier}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right leading-tight">
                  <span className="block text-[11.5px] font-semibold tabular-nums">{price.main}</span>
                  {price.sub ? <span className="block text-[10.5px] tabular-nums text-mute">{price.sub}</span> : null}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
