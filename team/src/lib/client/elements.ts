/**
 * Saved elements in the composer: where an element's pictures go on the current model, and in
 * which order. Mirrors the server's `withElementImages` rule (reference images on video models
 * that take them, otherwise the image slots of a model without frames), plus Kling-style named
 * elements. Pure functions, no React.
 */
import type { ModelConfig } from "@/config/models.config";
import type { ElementKind } from "@/lib/types";

export const ELEMENT_KIND_LABELS: Record<ElementKind, { one: string; many: string }> = {
  character: { one: "Character", many: "Characters" },
  product: { one: "Product", many: "Products" },
  location: { one: "Location", many: "Locations" },
  style: { one: "Style", many: "Styles" },
};

/**
 * Where an element goes on `model`:
 *   references → each picture becomes a reference image (`@image1`, `@image2`…)
 *   images     → each picture fills one of the model's image slots
 *   named      → one named element (`@name`) with `min`–`max` pictures
 *   none       → the model can't use it; `reason` says why
 */
export type ElementTarget =
  | { kind: "references"; max: number }
  | { kind: "images"; max: number }
  | { kind: "named"; min: number; max: number }
  | { kind: "none"; reason: string };

const nameOf = (m: ModelConfig) => (m.tier ? `${m.name} ${m.tier}` : m.name);

export function elementTarget(model: ModelConfig): ElementTarget {
  const refs = model.options.references;
  if (refs?.images?.max) return { kind: "references", max: refs.images.max };
  if (refs?.elements) return { kind: "named", min: refs.elements.minImages, max: refs.elements.maxImages };
  const slots = model.options.maxImages ?? 0;
  if (!refs?.frames && slots > 0 && model.category !== "upscale") return { kind: "images", max: slots };
  if (model.category === "upscale") return { kind: "none", reason: `${nameOf(model)} upscales one file, so it can't use an element.` };
  if (refs?.frames) return { kind: "none", reason: `${nameOf(model)} takes a start frame, not reference pictures. Pick a single picture from the Library tab instead.` };
  if (model.mediaType === "audio") return { kind: "none", reason: `${nameOf(model)} makes audio, so it can't use pictures.` };
  return { kind: "none", reason: `${nameOf(model)} works from text only, so it can't use an element.` };
}

/** Why this element can't go on this model right now, or null when it can. */
export function elementBlockedReason(target: ElementTarget, pictureCount: number): string | null {
  if (target.kind === "none") return target.reason;
  if (target.kind === "named" && pictureCount < target.min) return `This model needs at least ${target.min} pictures per element; this one has ${pictureCount}.`;
  return null;
}

/** The pictures in attach order: the cover first, then the rest as saved. */
export function picturesInOrder(el: { image_urls: string[]; cover_index: number }): string[] {
  const cover = el.image_urls[el.cover_index] ?? el.image_urls[0];
  return cover ? [cover, ...el.image_urls.filter((u) => u !== cover)] : [];
}

/** A prompt-safe `@name` for a named element: letters, digits and underscores, lower case. */
export function mentionName(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
  return clean || "element";
}

/** Case-insensitive match on the element's name, notes, kind or creator. */
export function matchesSearch(el: { name: string; notes: string | null; kind: ElementKind; creator: { display_name: string } | null }, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [el.name, el.notes ?? "", ELEMENT_KIND_LABELS[el.kind].one, el.creator?.display_name ?? ""].some((s) => s.toLowerCase().includes(q));
}
