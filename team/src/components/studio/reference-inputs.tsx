"use client";

import { Plus, X } from "lucide-react";
import type { ModelConfig } from "@/config/models.config";
import { MediaInput, type MediaRef } from "./media-input";
import { activeReferenceModes, type ElementDraft, type ReferenceState } from "./reference-modes";

export { activeReferenceModes, type ElementDraft, type ReferenceState } from "./reference-modes";

const seconds = (refs: MediaRef[]) => refs.reduce((sum, r) => sum + (r.durationSeconds ?? 0), 0);
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * The limits that apply to the references right now, in a few plain words for the strip's
 * hint, e.g. "3 of 7 slots used (a video takes 2) · clips 2–15s each, 4 of 15s used".
 */
export function referenceHints(model: ModelConfig, value: ReferenceState): string[] {
  const spec = model.options.references;
  if (!spec) return [];
  const { useFrames, useRefs } = activeReferenceModes(model, value.refMode);
  const out: string[] = [];
  if (useFrames && spec.frames) out.push(spec.frames === "start-end" ? "Start frame, then an optional end frame" : "Optional start frame");
  if (!useRefs) return out;
  if (spec.slotBudget) {
    const used = value.refImages.length + value.refVideos.length * spec.slotBudget.videoWeight;
    out.push(`${used} of ${spec.slotBudget.max} reference slots used${spec.videos ? ` (a video takes ${spec.slotBudget.videoWeight})` : ""}`);
  } else if (spec.images) {
    out.push(`Up to ${plural(spec.images.max, "image")}`);
  }
  if (spec.videos) {
    const each = spec.videos.minSeconds && spec.videos.maxSeconds ? `${spec.videos.minSeconds}–${spec.videos.maxSeconds}s each` : spec.videos.maxSeconds ? `up to ${spec.videos.maxSeconds}s each` : "";
    const total = spec.videos.maxTotalSeconds ? `${Math.round(seconds(value.refVideos))} of ${spec.videos.maxTotalSeconds}s used` : "";
    const price = model.pricing.unit !== "flat" && "videoInputRates" in model.pricing && model.pricing.videoInputRates ? "a clip changes the price" : "";
    out.push([`${plural(spec.videos.max, "clip")}`, each, total, price].filter(Boolean).join(", "));
  }
  if (spec.audios) {
    const total = spec.audios.maxTotalSeconds ? `${Math.round(seconds(value.refAudios))} of ${spec.audios.maxTotalSeconds}s used` : "";
    out.push([`${plural(spec.audios.max, "audio clip")}`, total, spec.audios.requiresVisual ? "needs an image or video too" : ""].filter(Boolean).join(", "));
  }
  return out;
}

/** Kling-style elements: a named subject (a few photos) the prompt calls by `@name`. */
export function ElementsEditor({
  spec,
  userId,
  value,
  onChange,
}: {
  spec: NonNullable<NonNullable<ModelConfig["options"]["references"]>["elements"]>;
  userId: string;
  value: ElementDraft[];
  onChange: (elements: ElementDraft[]) => void;
}) {
  const update = (key: string, patch: Partial<ElementDraft>) => onChange(value.map((e) => (e.key === key ? { ...e, ...patch } : e)));

  return (
    <div className="space-y-3">
      <p className="pl-hint">
        Keep a character or product consistent: name it, add {spec.minImages}–{spec.maxImages} photos, then write <span className="font-mono text-ink">@name</span> in your prompt.
        {spec.requiresStartFrame ? " Needs a start frame." : ""}
      </p>

      {value.map((el, i) => (
        <div key={el.key} className="space-y-3 rounded-[10px] border border-hairline bg-paper p-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-semibold">@</span>
            <input
              aria-label={`Element ${i + 1} name`}
              value={el.name}
              onChange={(e) => update(el.key, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, "_").slice(0, 40) })}
              placeholder="hero"
              className="pl-field h-8 font-mono text-xs"
            />
            <button type="button" aria-label="Remove element" onClick={() => onChange(value.filter((e) => e.key !== el.key))} className="pl-iconbtn pl-iconbtn--sm shrink-0">
              <X />
            </button>
          </div>
          <MediaInput
            type="image"
            userId={userId}
            label={`Photos of @${el.name || "element"}`}
            hint={`${el.images.length} of ${spec.minImages}–${spec.maxImages}`}
            value={el.images}
            onChange={(images) => update(el.key, { images })}
            slots={spec.maxImages}
          />
        </div>
      ))}

      {value.length < spec.max ? (
        <button type="button" onClick={() => onChange([...value, { key: crypto.randomUUID(), name: `element_${value.length + 1}`, images: [] }])} className="pl-pill pl-pill--sm">
          <Plus className="size-3.5" /> Add element ({value.length} of {spec.max})
        </button>
      ) : null}
    </div>
  );
}
