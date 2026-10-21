/**
 * The composer's form state and the rules around it: switching models (keeping what still
 * applies, or a family's remembered settings), where an attached file goes, the reference strip,
 * turning the form into request params, and loading a past generation's settings back in.
 * No React here, so the composer component stays about layout.
 */
import { familyMembers, getModel, models, type ModelConfig } from "@/config/models.config";
import type { ApiGeneration } from "@/lib/client-api";
import { familyKey, restoreChoice, type DraftFiles, type FamilySettings } from "@/lib/client/draft";
import { countKinds, renumberAfterRemoval, tokenFor, type RefCounts, type RefKind } from "@/lib/client/mentions";
import type { GenerationParams } from "@/lib/types";
import type { MediaRef } from "./media-input";
import { activeReferenceModes, type ElementDraft, type ReferenceState } from "./reference-modes";
import { reconcileSettings, settingsForRequest, type Settings, type VoiceOption } from "./settings-fields";

export type FormState = ReferenceState & {
  modelId: string;
  prompt: string;
  negativePrompt: string;
  /** Image models, avatar face, upscaler source. */
  images: MediaRef[];
  audio: MediaRef[];
  video: MediaRef[];
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  generateAudio: boolean;
  /** Model-specific settings (options.fields). */
  settings: Settings;
  variants: number;
  seed: string;
  isShared: boolean;
};

export const DEFAULT_MODEL = "nano-banana-pro";

export const modelOf = (s: Pick<FormState, "modelId">) => getModel(s.modelId) ?? models[0];

/**
 * Switch to `model`. With `remembered` (that family's last settings) those win where the model
 * still offers them; otherwise what's on screen carries over where it applies, and the model's
 * defaults fill the rest.
 */
export function reconcile(state: FormState, model: ModelConfig, voices?: VoiceOption[], remembered?: FamilySettings): FormState {
  const o = model.options;
  const keep = <T,>(v: T | undefined, allowed: T[] | undefined, fallback: T | undefined) => (allowed ? (v !== undefined && allowed.includes(v) ? v : fallback ?? allowed[0]) : undefined);
  const pick = <T,>(mem: T | undefined, current: T | undefined, allowed: T[] | undefined, fallback: T | undefined) =>
    mem !== undefined && allowed?.includes(mem) ? restoreChoice(mem, allowed, fallback) : keep(current, allowed, fallback);
  const r = o.references;
  const takesRefs = Boolean(r && (r.images || r.videos || r.audios));
  return {
    ...state,
    modelId: model.id,
    images: state.images.slice(0, o.maxImages ?? 0),
    frames: r?.frames ? state.frames.slice(0, r.frames === "start-end" ? 2 : 1) : [],
    refImages: state.refImages.slice(0, r?.images?.max ?? 0),
    refVideos: state.refVideos.slice(0, r?.videos?.max ?? 0),
    refAudios: state.refAudios.slice(0, r?.audios?.max ?? 0),
    elements: r?.elements ? state.elements.slice(0, r.elements.max).map((e) => ({ ...e, images: e.images.slice(0, r.elements!.maxImages) })) : [],
    refMode: !r?.frames && takesRefs ? "references" : r?.frames && !takesRefs ? "frames" : state.refMode,
    aspectRatio: pick(remembered?.aspectRatio, state.aspectRatio, o.aspectRatios, o.defaultAspectRatio),
    duration: pick(remembered?.duration, state.duration, o.durations, o.defaultDuration),
    resolution: pick(remembered?.resolution, state.resolution, o.resolutions, o.defaultResolution),
    generateAudio: o.audioToggle ? (remembered?.generateAudio ?? state.generateAudio) : false,
    variants: remembered?.variants ?? state.variants,
    settings: reconcileSettings({ ...state.settings, ...remembered?.settings }, model, voices),
  };
}

export function initialState(): FormState {
  const model = getModel(DEFAULT_MODEL) ?? models[0];
  return reconcile(
    {
      modelId: model.id,
      prompt: "",
      negativePrompt: "",
      images: [],
      audio: [],
      video: [],
      frames: [],
      refImages: [],
      refVideos: [],
      refAudios: [],
      elements: [],
      refMode: "frames",
      generateAudio: model.options.defaultGenerateAudio ?? false,
      settings: {},
      variants: 1,
      seed: "",
      isShared: true,
    },
    model,
  );
}

const durations = (refs: MediaRef[]) => (refs.length && refs.every((r) => r.durationSeconds != null) ? refs.map((r) => r.durationSeconds!) : undefined);

export function toParams(s: FormState, model: ModelConfig): GenerationParams {
  const { useFrames, useRefs } = activeReferenceModes(model, s.refMode);
  return {
    prompt: s.prompt,
    negative_prompt: s.negativePrompt || undefined,
    image_urls: s.images.map((i) => i.url),
    start_frame_url: useFrames ? s.frames[0]?.url : undefined,
    end_frame_url: useFrames ? s.frames[1]?.url : undefined,
    reference_image_urls: useRefs ? s.refImages.map((r) => r.url) : undefined,
    reference_video_urls: useRefs ? s.refVideos.map((r) => r.url) : undefined,
    reference_video_durations: useRefs ? durations(s.refVideos) : undefined,
    reference_audio_urls: useRefs ? s.refAudios.map((r) => r.url) : undefined,
    reference_audio_durations: useRefs ? durations(s.refAudios) : undefined,
    elements: useFrames && s.elements.length ? s.elements.map((e) => ({ name: e.name, image_urls: e.images.map((i) => i.url) })) : undefined,
    audio_url: s.audio[0]?.url,
    audio_duration_seconds: s.audio[0]?.durationSeconds,
    video_url: s.video[0]?.url,
    source_video_duration_seconds: s.video[0]?.durationSeconds,
    aspect_ratio: s.aspectRatio,
    duration: s.duration,
    resolution: s.resolution,
    generate_audio: s.generateAudio || undefined,
    seed: s.seed ? Number(s.seed) : undefined,
    settings: settingsForRequest(s.settings, model),
  };
}

/** The settings a family remembers (see lib/client/draft.ts). */
export const familySettingsOf = (s: FormState): FamilySettings => ({
  aspectRatio: s.aspectRatio,
  resolution: s.resolution,
  duration: s.duration,
  variants: s.variants,
  generateAudio: s.generateAudio,
  settings: Object.fromEntries(Object.entries(s.settings).filter((e): e is [string, string | number | boolean] => e[1] !== undefined)),
});

export const familyKeyOf = (s: FormState) => familyKey(modelOf(s));

export const filesOf = (s: FormState): DraftFiles => ({
  images: s.images,
  frames: s.frames,
  refImages: s.refImages,
  refVideos: s.refVideos,
  refAudios: s.refAudios,
  audio: s.audio,
  video: s.video,
  elements: s.elements.map((e) => ({ name: e.name, images: e.images })),
  refMode: s.refMode,
});

export function withDraftFiles(s: FormState, f: DraftFiles): FormState {
  return {
    ...s,
    images: f.images ?? s.images,
    frames: f.frames ?? s.frames,
    refImages: f.refImages ?? s.refImages,
    refVideos: f.refVideos ?? s.refVideos,
    refAudios: f.refAudios ?? s.refAudios,
    audio: f.audio ?? s.audio,
    video: f.video ?? s.video,
    elements: f.elements ? f.elements.map((e, i) => ({ key: `${i}-${e.name}`, name: e.name, images: e.images })) : s.elements,
    refMode: f.refMode ?? s.refMode,
  };
}

// ─── the reference strip ────────────────────────────────────────────────────

/** What the composer's thumbnail strip holds for this model. */
export type StripMode = "refs" | "frames" | "images" | "video" | "none";

export function stripMode(model: ModelConfig, refMode: ReferenceState["refMode"]): StripMode {
  const { useFrames, useRefs } = activeReferenceModes(model, refMode);
  if (useRefs) return "refs";
  if (useFrames) return "frames";
  if ((model.options.maxImages ?? 0) > 0) return "images";
  if (model.requiresVideo) return "video";
  return "none";
}

type Slot = "images" | "frames" | "refImages" | "refVideos" | "refAudios" | "video";

export type StripItem = {
  key: string;
  kind: RefKind;
  ref: MediaRef;
  slot: Slot;
  index: number;
  /** The badge: the per-kind number (the `@image2` of the prompt), or "S"/"E" for frames. */
  badge: string;
  title: string;
};

const KIND_LABEL: Record<RefKind, string> = { image: "Image", video: "Video", audio: "Audio" };

export function stripItems(s: FormState, model: ModelConfig): StripItem[] {
  const mode = stripMode(model, s.refMode);
  const list = (slot: Slot, kind: RefKind, refs: MediaRef[], label?: (i: number) => string) =>
    refs.map((ref, i): StripItem => ({
      key: `${slot}-${i}-${ref.url}`,
      kind,
      ref,
      slot,
      index: i,
      badge: label ? label(i) : String(i + 1),
      title: label ? (i === 0 ? "Start frame" : "End frame") : `${KIND_LABEL[kind]} ${i + 1}${mentionsEnabled(model, s.refMode) ? ` · ${tokenFor(kind, i + 1)}` : ""}`,
    }));
  if (mode === "refs") return [...list("refImages", "image", s.refImages), ...list("refVideos", "video", s.refVideos), ...list("refAudios", "audio", s.refAudios)];
  if (mode === "frames") return list("frames", "image", s.frames, (i) => (i === 0 ? "S" : "E"));
  if (mode === "images") {
    const labels = model.options.imageSlotLabels;
    return list("images", "image", s.images).map((it, i) => (labels?.[i] ? { ...it, title: labels[i] } : it));
  }
  if (mode === "video") return list("video", "video", s.video);
  return [];
}

/** Whether `@image1`-style tokens mean anything for this model. */
export function mentionsEnabled(model: ModelConfig, refMode: ReferenceState["refMode"]): boolean {
  const mode = stripMode(model, refMode);
  return mode === "refs" || (mode === "images" && model.inputTypes.includes("image-edit") && (model.options.maxImages ?? 0) > 1);
}

export function mentionCounts(s: FormState, model: ModelConfig): RefCounts {
  const mode = stripMode(model, s.refMode);
  if (mode === "refs") return { image: s.refImages.length, video: s.refVideos.length, audio: s.refAudios.length };
  if (mode === "images") return countKinds(s.images.map(() => "image" as const));
  return {};
}

/** Remaining room per reference kind (a shared slot budget counts a video as several images). */
function refRoom(s: FormState, model: ModelConfig) {
  const spec = model.options.references;
  if (!spec) return { image: 0, video: 0, audio: 0 };
  const budget = spec.slotBudget;
  const imageCap = spec.images ? Math.min(spec.images.max, budget ? budget.max - s.refVideos.length * budget.videoWeight : spec.images.max) : 0;
  const videoCap = spec.videos ? Math.min(spec.videos.max, budget ? Math.floor((budget.max - s.refImages.length) / budget.videoWeight) : spec.videos.max) : 0;
  return {
    image: Math.max(0, imageCap - s.refImages.length),
    video: Math.max(0, videoCap - s.refVideos.length),
    audio: Math.max(0, (spec.audios?.max ?? 0) - s.refAudios.length),
  };
}

/** Which kinds of file the strip can still take (for the file chooser and the dashed tile). */
export function stripAccepts(s: FormState, model: ModelConfig): RefKind[] {
  const mode = stripMode(model, s.refMode);
  const out: RefKind[] = [];
  if (mode === "refs") {
    const room = refRoom(s, model);
    for (const k of ["image", "video", "audio"] as const) if (room[k] > 0) out.push(k);
  } else if (mode === "frames") {
    if (s.frames.length < (model.options.references?.frames === "start-end" ? 2 : 1)) out.push("image");
  } else if (mode === "images") {
    if (s.images.length < (model.options.maxImages ?? 0)) out.push("image");
  } else if (mode === "video") {
    if (s.video.length < 1) out.push("video");
  }
  // An avatar also takes its audio by drop.
  if (model.requiresAudio && s.audio.length === 0 && !out.includes("audio")) out.push("audio");
  return out;
}

const article = (k: RefKind) => (k === "image" ? "an image" : k === "video" ? "a video" : "an audio file");

/**
 * Attach one file to wherever this model takes that kind. On a model where frames and references
 * are exclusive, a clip or audio file switches an empty frames form over to references.
 */
export function addFile(s: FormState, model: ModelConfig, kind: RefKind, ref: MediaRef): { next: FormState } | { error: string } {
  const spec = model.options.references;
  const mode = stripMode(model, s.refMode);
  if (mode === "frames" && spec?.framesExclusive && s.frames.length === 0 && ((kind === "video" && spec.videos) || (kind === "audio" && spec.audios))) {
    return addFile({ ...s, refMode: "references" }, model, kind, ref);
  }
  if (mode === "refs") {
    const room = refRoom(s, model);
    if (room[kind] > 0) {
      if (kind === "image") return { next: { ...s, refImages: [...s.refImages, ref] } };
      if (kind === "video") return { next: { ...s, refVideos: [...s.refVideos, ref] } };
      return { next: { ...s, refAudios: [...s.refAudios, ref] } };
    }
  }
  if (kind === "image") {
    if (mode === "frames" && s.frames.length < (spec?.frames === "start-end" ? 2 : 1)) return { next: { ...s, frames: [...s.frames, ref] } };
    if ((model.options.maxImages ?? 0) > s.images.length) return { next: { ...s, images: [...s.images, ref] } };
  }
  if (kind === "audio" && model.requiresAudio) return { next: { ...s, audio: [ref] } };
  if (kind === "video" && model.requiresVideo) return { next: { ...s, video: [ref] } };
  const takesKind = (kind === "image" && ((model.options.maxImages ?? 0) > 0 || spec?.frames || spec?.images)) || (kind === "video" && (spec?.videos || model.requiresVideo)) || (kind === "audio" && (spec?.audios || model.requiresAudio));
  return { error: takesKind ? `${model.name} has no room for another ${kind === "audio" ? "audio file" : kind}.` : `${model.name} can't take ${article(kind)}.` };
}

/**
 * Before attaching a saved element's pictures as references: a model where frames and references
 * are exclusive switches to references when no frame is set (a set frame is never dropped).
 */
export function readyForReferences(s: FormState, model: ModelConfig): { next: FormState } | { error: string } {
  const { showToggle } = activeReferenceModes(model, s.refMode);
  if (!showToggle || s.refMode === "references") return { next: s };
  if (s.frames.length) return { error: `${model.name} can't mix frames and references. Remove the start frame (or switch to References) to use an element.` };
  return { next: { ...s, refMode: "references" } };
}

/** Take a file off the strip; with mentions on, later tokens of that kind move down to stay in step. */
export function removeStripItem(s: FormState, model: ModelConfig, item: StripItem): FormState {
  const drop = (list: MediaRef[]) => list.filter((_, i) => i !== item.index);
  const prompt = mentionsEnabled(model, s.refMode) ? renumberAfterRemoval(s.prompt, item.kind, item.index + 1) : s.prompt;
  return { ...s, prompt, [item.slot]: drop(s[item.slot]) };
}

// ─── loading a past generation ──────────────────────────────────────────────

/** The form as it was for a past generation (Load settings). Returns null if the model is gone. */
export function stateFromGeneration(s: FormState, g: Pick<ApiGeneration, "model" | "params">, voices?: VoiceOption[]): FormState | null {
  const m = getModel(g.model);
  if (!m) return null;
  const p = g.params as GenerationParams;
  const takesFrames = Boolean(m.options.references?.frames);
  const start = p.start_frame_url ?? (takesFrames ? p.image_urls?.[0] : undefined);
  const end = p.end_frame_url ?? (takesFrames ? p.image_urls?.[1] : undefined);
  const refs = (urls: string[] | undefined, label: string, secs?: number[]) => (urls ?? []).map((url, i) => ({ url, name: `${label} ${i + 1}`, durationSeconds: secs?.[i] }));
  const refImages = refs(p.reference_image_urls, "Reference image");
  const refVideos = refs(p.reference_video_urls, "Reference video", p.reference_video_durations);
  const refAudios = refs(p.reference_audio_urls, "Reference audio", p.reference_audio_durations);
  const base = reconcile(s, m, voices);
  return {
    ...base,
    prompt: p.prompt ?? "",
    negativePrompt: p.negative_prompt ?? "",
    images: takesFrames ? [] : (p.image_urls ?? []).map((url, i) => ({ url, name: `Reference ${i + 1}` })),
    frames: [start, end].filter((u): u is string => Boolean(u)).map((url, i) => ({ url, name: i === 0 ? "Start frame" : "End frame" })),
    refImages,
    refVideos,
    refAudios,
    elements: (p.elements ?? []).map((e, i): ElementDraft => ({ key: `${i}-${e.name}`, name: e.name, images: refs(e.image_urls, e.name) })),
    refMode: refImages.length + refVideos.length + refAudios.length > 0 ? "references" : "frames",
    audio: p.audio_url ? [{ url: p.audio_url, name: "Audio", durationSeconds: p.audio_duration_seconds }] : [],
    video: p.video_url ? [{ url: p.video_url, name: "Video", durationSeconds: p.source_video_duration_seconds }] : [],
    aspectRatio: p.aspect_ratio ?? base.aspectRatio,
    duration: p.duration ?? base.duration,
    resolution: p.resolution ?? base.resolution,
    generateAudio: Boolean(p.generate_audio),
    settings: reconcileSettings({ ...p.settings }, m, voices),
    seed: p.seed != null ? String(p.seed) : "",
  };
}

export const tiersOf = (model: ModelConfig) => familyMembers(model);
