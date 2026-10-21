/**
 * The reference state of the composer and which inputs a model shows. No React, so the form
 * rules (form.ts) and the tests can use it without loading components.
 */
import type { ModelConfig } from "@/config/models.config";
import type { MediaRef } from "./media-input";

export type ElementDraft = { key: string; name: string; images: MediaRef[] };

export type ReferenceState = {
  frames: MediaRef[];
  refImages: MediaRef[];
  refVideos: MediaRef[];
  refAudios: MediaRef[];
  elements: ElementDraft[];
  refMode: "frames" | "references";
};

/** Which inputs a model shows, given its spec and the frames/references toggle. */
export function activeReferenceModes(model: ModelConfig, refMode: ReferenceState["refMode"]) {
  const spec = model.options.references;
  const takesRefs = Boolean(spec && (spec.images || spec.videos || spec.audios));
  const exclusive = Boolean(spec?.frames && takesRefs && spec.framesExclusive);
  return {
    showToggle: exclusive,
    useFrames: Boolean(spec?.frames) && (!exclusive || refMode === "frames"),
    useRefs: takesRefs && (!exclusive || refMode === "references"),
  };
}
