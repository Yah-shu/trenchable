"use client";

import {
  AtSign,
  AudioLines,
  ChevronDown,
  Clock,
  Frame,
  ImagePlus,
  Loader2,
  Maximize2,
  Music,
  Plus,
  Ratio,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { categoryLabels, getModel, providerLabels, type ModelConfig } from "@/config/models.config";
import { costTag } from "@/lib/client/cost";
import { insertToken, nextFreeToken, tokenFor, type RefKind } from "@/lib/client/mentions";
import type { ApiMedia } from "@/lib/client-api";
import type { CostEstimate, ValidationResult } from "@/lib/generation-params";
import type { GenerationParams, MediaType, Profile } from "@/lib/types";
import { ACCEPT, mediaTypeOf } from "@/lib/upload";
import { cn } from "@/lib/utils";
import { ImageThumb, VideoThumb } from "@/components/ui/thumb";
import { addFile, mentionCounts, mentionsEnabled, modelOf, readyForReferences, removeStripItem, stripAccepts, stripItems, stripMode, tiersOf, type FormState, type StripItem } from "./form";
import { refFromMedia, MediaInput, type MediaRef } from "./media-input";
import { CATEGORY_ICONS, ModelMenu } from "./model-menu";
import { ChoicePill, Pop, Seg, Stepper, SwitchRow } from "./parts";
import { PromptBox, type PromptBoxHandle } from "./prompt-box";
import { activeReferenceModes, ElementsEditor, referenceHints } from "./reference-inputs";
import { SettingsFields, type VoiceOption } from "./settings-fields";
import { useStudioData } from "./studio-data";

/**
 * The seam for saved Elements (characters, products, locations, styles): the Elements tab of the
 * + popover renders `elementsSlot`. Picking an element calls `addReference` for each of its
 * pictures (with `asReference`, so a frames/references model switches to references), or
 * `addElement` on a model with named elements. Without a slot the tab explains what will appear.
 */
export type AttachOptions = { asReference?: boolean };
export type ComposerElementsApi = {
  model: ModelConfig;
  /** Attach a file to the current model's references. Returns an error message if it has no room. */
  addReference: (ref: MediaRef, kind: RefKind, opts?: AttachOptions) => string | null;
  /** Add a named element (models with `references.elements`). Returns an error message if it can't. */
  addElement: (name: string, images: MediaRef[]) => string | null;
  close: () => void;
};
export type ComposerElementsSlot = (api: ComposerElementsApi) => ReactNode;

export type ComposerHandle = {
  focusPrompt: () => void;
  /** Attach a file (Use as reference). Returns an error message when the current model can't take it. */
  addReference: (ref: MediaRef, kind: RefKind) => string | null;
};

type Section = "settings" | "elements" | "audio";
const KIND_WORD: Record<RefKind, string> = { image: "Image", video: "Video", audio: "Audio" };

function defaultSection(model: ModelConfig, s: FormState): Section | null {
  if (model.requiresAudio && s.audio.length === 0) return "audio";
  if (model.category === "audio" && (model.options.fields ?? []).some((f) => !f.advanced)) return "settings";
  return null;
}

export const Composer = forwardRef<
  ComposerHandle,
  {
    state: FormState;
    setState: Dispatch<SetStateAction<FormState>>;
    profile: Profile;
    voices?: VoiceOption[];
    params: GenerationParams;
    validation: ValidationResult;
    estimate: CostEstimate;
    submitting: boolean;
    onSubmit: () => void;
    onSelectModel: (m: ModelConfig) => void;
    elementsSlot?: ComposerElementsSlot;
    /** Open the model menu on mount (dev preview screenshots). */
    menuOpen?: boolean;
    /** Open the + popover on its Elements tab on mount (dev preview screenshots). */
    elementsOpen?: boolean;
    onHeight?: (px: number) => void;
  }
>(function Composer({ state, setState, profile, voices, params, validation, estimate, submitting, onSubmit, onSelectModel, elementsSlot, menuOpen, elementsOpen, onHeight }, ref) {
  const data = useStudioData();
  const model = modelOf(state);
  const o = model.options;
  const tiers = tiersOf(model);
  const mode = stripMode(model, state.refMode);
  const items = stripItems(state, model);
  const accepts = stripAccepts(state, model);
  const mentions = mentionsEnabled(model, state.refMode);
  const counts = mentions ? mentionCounts(state, model) : null;
  const { showToggle } = activeReferenceModes(model, state.refMode);
  const takesFiles = mode !== "none" || Boolean(model.requiresAudio);

  const root = useRef<HTMLDivElement>(null);
  const prompt = useRef<PromptBoxHandle>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(0);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  // The open section follows the model: a new model opens on its own default (e.g. a voice model's settings).
  const [sec, setSec] = useState<{ model: string; open: Section | null }>({ model: "", open: null });
  const section = sec.model === model.id ? sec.open : defaultSection(model, state);
  const openSection = (s: Section | null) => setSec({ model: model.id, open: s });

  const update = (patch: Partial<FormState>) => setState((s) => ({ ...s, ...patch }));

  // The feed keeps clear of the composer, whatever its height.
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || !onHeight) return;
    const report = () => onHeight(el.getBoundingClientRect().height);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  // A note about the previous model is stale once another is picked.
  const [noteFor, setNoteFor] = useState(model.id);
  if (noteFor !== model.id) {
    setNoteFor(model.id);
    setNote(null);
  }

  // The latest state, for attaching several files in a row and for the viewer's Use as reference.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const attach = useCallback(
    (ref: MediaRef, kind: RefKind, opts?: AttachOptions): string | null => {
      const place = (cur: FormState) => {
        const m = modelOf(cur);
        const ready = opts?.asReference ? readyForReferences(cur, m) : { next: cur };
        return "error" in ready ? ready : addFile(ready.next, m, kind, ref);
      };
      const r = place(stateRef.current);
      if ("error" in r) {
        setNote(r.error);
        return r.error;
      }
      stateRef.current = r.next;
      setState((cur) => {
        const x = place(cur);
        return "error" in x ? cur : x.next;
      });
      return null;
    },
    [setState],
  );

  const addElement = (name: string, images: MediaRef[]): string | null => {
    const spec = model.options.references?.elements;
    if (!spec) return `${model.name} doesn't take named elements.`;
    if (state.elements.length >= spec.max) return `${model.name} takes up to ${spec.max} elements.`;
    setState((s) => ({ ...s, refMode: "frames", elements: [...s.elements, { key: crypto.randomUUID(), name, images: images.slice(0, spec.maxImages) }] }));
    openSection("elements");
    return null;
  };

  const addFiles = async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (!files.length) return;
    if (!takesFiles) {
      setNote(`${model.name} works from text only, so it can't take a file.`);
      return;
    }
    setNote(null);
    for (const file of files) {
      const kind = mediaTypeOf(file);
      if (!kind) {
        setNote(`Can't use ${file.name}: pick an image, video or audio file.`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const media = await data.upload(file, profile.id);
        if (attach(refFromMedia(media), kind)) break;
      } catch (e) {
        setNote(`Upload failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  const insertMention = (token: string) => {
    const at = prompt.current?.caret() ?? null;
    const { next, cursor } = insertToken(state.prompt, token, at);
    update({ prompt: next });
    prompt.current?.setCaret(cursor);
  };

  // Imperative bits the Studio needs: focus after Load settings, and Use as reference from the viewer.
  useImperativeHandle(ref, () => ({ focusPrompt: () => prompt.current?.focus(), addReference: attach }), [attach]);

  const cost = costTag(model, estimate, state.variants);
  const touched = Boolean(state.prompt || state.images.length || state.audio.length || state.video.length || items.length);
  const hints = referenceHints(model, state);
  const message = note
    ? { tone: "bad" as const, text: note }
    : !validation.ok && touched
      ? { tone: "bad" as const, text: validation.errors[0] }
      : hints.length && items.length
        ? { tone: "quiet" as const, text: hints.join(" · ") }
        : null;

  const sections: { id: Section; label: string; icon: LucideIcon; count?: number; missing?: boolean }[] = [];
  const mainFields = (o.fields ?? []).filter((f) => !f.advanced);
  if (mainFields.length) {
    const voice = mainFields.some((f) => f.optionsFrom === "voices");
    sections.push({ id: "settings", label: voice ? "Voice & settings" : model.category === "audio" ? "Song settings" : "Settings", icon: voice ? AudioLines : Settings2 });
  }
  if (activeReferenceModes(model, state.refMode).useFrames && o.references?.elements) sections.push({ id: "elements", label: "Elements", icon: UserRound, count: state.elements.length });
  if (model.requiresAudio) sections.push({ id: "audio", label: "Audio", icon: Music, count: state.audio.length, missing: state.audio.length === 0 });

  const promptLabel = o.promptLabel ?? "Prompt";
  const placeholder =
    model.category === "upscale"
      ? "No prompt needed. Add the file to upscale."
      : (o.promptPlaceholder ?? (model.mediaType === "video" ? "Describe the shot, subject, motion and camera…" : model.mediaType === "audio" ? "Write what should be heard…" : "Describe the image…"));

  return (
    <div
      ref={root}
      className={cn(
        "pl-panel fixed inset-x-0 bottom-4 z-40 mx-auto w-[min(1070px,calc(100%-32px))] gap-0 p-3 shadow-pl-lg transition-colors",
        "max-sm:bottom-0 max-sm:w-full max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:p-2.5",
        dragging && "bg-coral-soft",
      )}
      aria-label="Composer"
      role="region"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        setDragging(false);
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void addFiles(e.dataTransfer.files);
      }}
    >
      {/* Model-specific inputs: one section open at a time, above the prompt. */}
      {section && sections.some((s) => s.id === section) ? (
        <div className="mb-3 rounded-[10px] border border-hairline bg-paper">
          <div className="flex items-center justify-between gap-2 border-b border-hairline px-3 py-2">
            <span className="font-display text-[13px] font-semibold">{sections.find((s) => s.id === section)?.label}</span>
            <button type="button" className="pl-iconbtn pl-iconbtn--sm" aria-label="Close section" onClick={() => openSection(null)}>
              <X />
            </button>
          </div>
          <div className="max-h-[min(38vh,340px)] overflow-y-auto p-3">
            {section === "settings" ? <SettingsFields model={model} value={state.settings} onChange={(settings) => update({ settings })} voices={voices} /> : null}
            {section === "elements" && o.references?.elements ? (
              <ElementsEditor spec={o.references.elements} userId={profile.id} value={state.elements} onChange={(elements) => update({ elements })} />
            ) : null}
            {section === "audio" ? <MediaInput type="audio" userId={profile.id} label="Audio to lip-sync" hint="The avatar speaks this. mp3 or wav." value={state.audio} onChange={(audio) => update({ audio })} /> : null}
          </div>
        </div>
      ) : null}

      {/* Top row: the reference strip, then the prompt. */}
      <div className="flex items-start gap-2.5 max-sm:gap-2">
        {mode !== "none" ? (
          <RefStrip
            items={items}
            mentions={mentions}
            canAdd={accepts.some((k) => k !== "audio" || mode === "refs")}
            uploading={uploading > 0}
            onAdd={() => fileInput.current?.click()}
            onRemove={(it) => setState((s) => removeStripItem(s, modelOf(s), it))}
            emptyLabel={mode === "frames" ? "Start frame" : model.category === "upscale" ? (model.requiresVideo ? "Video" : "Image") : o.imageSlotLabels?.[0]}
          />
        ) : null}
        {model.category !== "upscale" ? (
          <PromptBox
            ref={prompt}
            label={promptLabel}
            value={state.prompt}
            onChange={(v) => {
              update({ prompt: v });
              if (note) setNote(null);
            }}
            placeholder={placeholder}
            counts={counts}
            maxLength={o.promptMaxLength}
            onPasteFiles={takesFiles ? (f) => void addFiles(f) : undefined}
          />
        ) : (
          <p className="flex min-h-[56px] flex-1 items-center px-1 text-[14px] text-mute">{placeholder}</p>
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        hidden
        multiple
        accept={(accepts.length ? accepts : (["image"] as MediaType[])).map((k) => ACCEPT[k]).join(",")}
        onChange={(e) => {
          void addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {message ? (
        <p role={message.tone === "bad" ? "alert" : undefined} className={cn("mt-1.5 px-1 text-[12px] leading-snug", message.tone === "bad" ? "text-bad" : "text-mute")}>
          {message.text}
        </p>
      ) : null}

      {/* Controls row. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-hairline pt-2.5">
        {takesFiles ? (
          <Pop
            label="Add media"
            trigger={({ open, toggle }) => (
              <button type="button" className={cn("pl-pill pl-pill--sm is-icon !w-[30px]", open && "is-on")} onClick={toggle} title="Add media: upload, library or saved elements" aria-label="Add media">
                <Plus className="size-4" />
              </button>
            )}
            width={elementsSlot ? 420 : 360}
            defaultOpen={elementsOpen}
          >
            {(close) => (
              <AddMedia
                defaultTab={elementsOpen ? "elements" : undefined}
                accepts={accepts}
                uploading={uploading > 0}
                onUpload={() => {
                  close();
                  fileInput.current?.click();
                }}
                onPick={(m) => {
                  close();
                  attach(refFromMedia(m), m.type);
                }}
                elements={elementsSlot ? elementsSlot({ model, addReference: attach, addElement, close }) : null}
              />
            )}
          </Pop>
        ) : null}

        {mentions ? (
          <Pop
            label="Mention a reference"
            trigger={({ open, toggle }) => (
              <button type="button" className={cn("pl-pill pl-pill--sm is-icon !w-[30px]", open && "is-on")} onClick={toggle} title="Mention an attached reference in the prompt" aria-label="Mention a reference">
                <AtSign className="size-4" />
              </button>
            )}
            width={280}
          >
            {(close) => {
              const next = counts ? nextFreeToken(state.prompt, counts) : null;
              return (
                <div>
                  <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-mute">Mention</p>
                  {next ? (
                    <button
                      type="button"
                      className="pl-pop__item is-on"
                      onClick={() => {
                        close();
                        insertMention(next);
                      }}
                    >
                      <AtSign className="size-3.5" /> Insert next: <span className="font-mono">{next}</span>
                    </button>
                  ) : null}
                  {items.map((it) => (
                    <button
                      key={it.key}
                      type="button"
                      className="pl-pop__item"
                      onClick={() => {
                        close();
                        insertMention(tokenFor(it.kind, it.index + 1));
                      }}
                    >
                      <Thumb item={it} className="size-8 rounded-md" />
                      <span className="flex-1">
                        {KIND_WORD[it.kind]} {it.index + 1}
                      </span>
                      <span className="font-mono text-[12px] text-mute">{tokenFor(it.kind, it.index + 1)}</span>
                    </button>
                  ))}
                  {!items.length ? <p className="px-2.5 py-2 text-[12px] leading-snug text-mute">Attach a reference first, then mention it as @image1.</p> : null}
                </div>
              );
            }}
          </Pop>
        ) : null}

        <ModelPill model={model} onPick={onSelectModel} defaultOpen={menuOpen} />

        {tiers.length > 1 ? (
          <ChoicePill title="Quality tier" value={model.id} choices={tiers.map((t) => ({ value: t.id, label: t.tier ?? t.name }))} onPick={(id) => onSelectModel(getModel(id)!)} />
        ) : null}

        {showToggle ? (
          <ChoicePill
            title="Guide the video with"
            icon={<Frame className="size-3.5" />}
            display={state.refMode === "frames" ? "Frames" : "References"}
            value={state.refMode}
            choices={[
              { value: "frames", label: o.references?.frames === "start-end" ? "Start / end frame" : "Start frame", hint: "Pin how the clip starts (and ends)" },
              { value: "references", label: "References", hint: "Characters, products, styles or motion to draw from" },
            ]}
            onPick={(refMode) => update({ refMode })}
          />
        ) : null}

        {o.aspectRatios && !(o.aspectRatioTextOnly && params.start_frame_url) ? (
          <ChoicePill title="Aspect ratio" icon={<Ratio className="size-3.5" />} value={state.aspectRatio} choices={o.aspectRatios.map((v) => ({ value: v, label: v }))} onPick={(aspectRatio) => update({ aspectRatio })} />
        ) : null}
        {o.resolutions && o.resolutions.length > 1 ? (
          <ChoicePill
            title={model.category === "upscale" ? "Scale" : "Resolution"}
            icon={<Maximize2 className="size-3.5" />}
            value={state.resolution}
            choices={o.resolutions.map((v) => ({ value: v, label: v }))}
            onPick={(resolution) => update({ resolution })}
          />
        ) : null}
        {o.durations ? (
          <ChoicePill title="Duration" icon={<Clock className="size-3.5" />} value={state.duration} choices={o.durations.map((v) => ({ value: v, label: `${v}s` }))} onPick={(duration) => update({ duration })} />
        ) : null}

        {sections.map((s) => (
          <button
            key={s.id}
            type="button"
            className={cn("pl-pill pl-pill--sm", section === s.id && "is-on")}
            aria-expanded={section === s.id}
            onClick={() => openSection(section === s.id ? null : s.id)}
          >
            <s.icon className="size-3.5" />
            {s.label}
            {s.count ? <span className="rounded-full bg-ink px-1.5 text-[10px] leading-4 text-canvas">{s.count}</span> : null}
            {s.missing ? <span className="size-1.5 rounded-full bg-bad" aria-label="needed" /> : null}
          </button>
        ))}

        <Stepper label="Variants" value={state.variants} max={4} onChange={(variants) => update({ variants })} />

        {o.audioToggle ? (
          <button type="button" className={cn("pl-pill pl-pill--sm", state.generateAudio && "is-on")} aria-pressed={state.generateAudio} onClick={() => update({ generateAudio: !state.generateAudio })} title="Generate sound with the video">
            {state.generateAudio ? <Volume2 className="size-3.5" /> : <VolumeX className="size-3.5" />}
            Audio
          </button>
        ) : null}

        <Pop
          label="Advanced"
          align="end"
          width={340}
          trigger={({ open, toggle }) => (
            <button type="button" className={cn("pl-pill pl-pill--sm", open && "is-on")} onClick={toggle} aria-expanded={open}>
              <SlidersHorizontal className="size-3.5" /> Advanced
              <ChevronDown className="size-3 opacity-60" />
            </button>
          )}
        >
          {() => (
            <div className="space-y-4 p-2">
              <SettingsFields model={model} value={state.settings} onChange={(settings) => update({ settings })} advanced voices={voices} />
              {o.supportsNegativePrompt ? (
                <div className="space-y-1.5">
                  <label htmlFor="neg" className="pl-label">
                    Negative prompt
                  </label>
                  <input id="neg" className="pl-field h-9" value={state.negativePrompt} onChange={(e) => update({ negativePrompt: e.target.value })} placeholder="blur, distortion, low quality" />
                </div>
              ) : null}
              {o.supportsSeed ? (
                <div className="space-y-1.5">
                  <label htmlFor="seed" className="pl-label">
                    Seed
                  </label>
                  <input id="seed" className="pl-field h-9 font-mono" inputMode="numeric" value={state.seed} onChange={(e) => update({ seed: e.target.value.replace(/\D/g, "") })} placeholder="Random" />
                </div>
              ) : null}
              <SwitchRow label="Share with the team" hint={state.isShared ? "Everyone on the team sees it in the feed." : "Only you (and admins) see it."} on={state.isShared} onChange={(isShared) => update({ isShared })} />
              <p className="border-t border-hairline pt-3 font-mono text-[11px] leading-relaxed text-mute">
                Routed via {providerLabels[model.provider]} · {model.endpoints?.[validation.ok ? validation.mode : model.inputTypes[0]] ?? model.providerModelId}
                {model.fallback ? ` · backup: ${providerLabels[model.fallback.provider]}` : ""}
              </p>
            </div>
          )}
        </Pop>

        <button
          type="button"
          className="plinth-btn plinth-btn--sm ml-auto max-sm:w-full"
          disabled={submitting || !validation.ok || uploading > 0}
          onClick={onSubmit}
          title={`${cost.title} Ctrl+Enter to generate.`}
        >
          <span className="plinth-btn__face whitespace-nowrap !py-[0.55em]">
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "Starting…" : state.variants > 1 ? `Generate ${state.variants}` : "Generate"}
            {cost.label ? (
              <span className="ml-1 inline-flex items-center gap-1 rounded-[7px] border-[1.5px] border-ink bg-canvas px-1.5 py-[3px] text-[11.5px] font-semibold tabular-nums">
                <Sparkles className="!size-3" />
                {cost.label.replace(/^≈ /, "")}
              </span>
            ) : null}
          </span>
        </button>
      </div>
    </div>
  );
});

function ModelPill({ model, onPick, defaultOpen }: { model: ModelConfig; onPick: (m: ModelConfig) => void; defaultOpen?: boolean }) {
  const Icon = CATEGORY_ICONS[model.category];
  return (
    <Pop
      label="Choose a model"
      width={392}
      defaultOpen={defaultOpen}
      popClassName="!max-h-none !overflow-visible"
      trigger={({ open, toggle }) => (
        <button type="button" className={cn("pl-pill pl-pill--sm max-w-[240px]", open && "is-on")} onClick={toggle} aria-expanded={open} aria-label={`Model: ${model.name}`} title={`${categoryLabels[model.category]}: ${model.description}`}>
          <Icon className="size-3.5 shrink-0" />
          <span className="truncate">{model.name}</span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <ModelMenu
          value={model}
          onClose={close}
          onPick={(m) => {
            onPick(m);
            close();
          }}
        />
      )}
    </Pop>
  );
}

function Thumb({ item, className }: { item: StripItem; className?: string }) {
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden bg-paper", className)}>
      {item.kind === "image" ? (
        <ImageThumb src={item.ref.url} alt={item.ref.name} sizes="56px" className="h-full w-full object-cover" />
      ) : item.kind === "video" ? (
        <VideoThumb src={item.ref.url} className="h-full w-full object-cover" />
      ) : (
        <Music className="size-4" />
      )}
    </span>
  );
}

/** The 56px thumbnails: numbered like the prompt's tokens, × to remove, a dashed tile to add more. */
function RefStrip({
  items,
  mentions,
  canAdd,
  uploading,
  onAdd,
  onRemove,
  emptyLabel,
}: {
  items: StripItem[];
  mentions: boolean;
  canAdd: boolean;
  uploading: boolean;
  onAdd: () => void;
  onRemove: (it: StripItem) => void;
  emptyLabel?: string;
}) {
  return (
    <div className="flex max-w-[50%] shrink-0 gap-1.5 overflow-x-auto pb-0.5 max-sm:max-w-[45%]">
      {items.map((it) => (
        <span key={it.key} className="relative size-14 shrink-0" title={it.title}>
          <Thumb item={it} className="size-14 rounded-[10px] border-2 border-ink" />
          <span className={cn("pointer-events-none absolute left-1 top-1 grid h-4 min-w-4 place-items-center rounded-full border border-ink px-1 text-[10px] font-bold leading-none", mentions ? "bg-coral" : "bg-canvas")}>
            {it.kind === "image" ? it.badge : `${it.kind === "video" ? "V" : "A"}${it.badge}`}
          </span>
          <button type="button" aria-label={`Remove ${it.title}`} onClick={() => onRemove(it)} className="absolute right-1 top-1 grid size-4 place-items-center rounded-full border border-ink bg-canvas hover:bg-coral">
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      {canAdd ? (
        <button
          type="button"
          onClick={onAdd}
          title="Add a reference (or drop / paste one)"
          aria-label="Add a reference"
          className="grid size-14 shrink-0 place-items-center rounded-[10px] border-2 border-dashed border-faint bg-canvas text-mute transition-colors hover:border-ink hover:bg-paper hover:text-ink"
        >
          {uploading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <span className="grid justify-items-center gap-0.5">
              <ImagePlus className="size-4" />
              {!items.length && emptyLabel ? <span className="max-w-[50px] truncate text-[9px] font-semibold">{emptyLabel}</span> : null}
            </span>
          )}
        </button>
      ) : null}
    </div>
  );
}

/** The + popover: upload, pick from the library, or attach a saved element. */
function AddMedia({
  accepts,
  uploading,
  onUpload,
  onPick,
  elements,
  defaultTab = "upload",
}: {
  accepts: RefKind[];
  uploading: boolean;
  onUpload: () => void;
  onPick: (m: ApiMedia) => void;
  elements: ReactNode;
  defaultTab?: "upload" | "library" | "elements";
}) {
  const [tab, setTab] = useState<"upload" | "library" | "elements">(defaultTab);
  const kinds = accepts.length ? accepts : (["image"] as RefKind[]);
  const [kind, setKind] = useState<RefKind>(kinds[0]);
  const shownKind = kinds.includes(kind) ? kind : kinds[0];
  return (
    <div className="p-1">
      <div className="pl-tabs mb-2 w-full">
        {(
          [
            ["upload", "Upload"],
            ["library", "Library"],
            ["elements", "Elements"],
          ] as const
        ).map(([id, label]) => (
          <button key={id} type="button" className={cn("pl-tab flex-1 justify-center", tab === id && "is-active")} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "upload" ? (
        <button type="button" onClick={onUpload} disabled={!accepts.length} className="flex w-full flex-col items-center gap-1.5 rounded-[10px] border-2 border-dashed border-faint bg-paper px-4 py-6 text-center hover:border-ink disabled:opacity-50">
          {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          <span className="text-[13px] font-semibold">{accepts.length ? "Upload from your computer" : "No room for another file"}</span>
          <span className="text-[11px] text-mute">{accepts.length ? `${kinds.map((k) => KIND_WORD[k].toLowerCase()).join(", ")} · or drop files on the composer` : "Remove one to add another."}</span>
        </button>
      ) : tab === "library" ? (
        <div className="space-y-2">
          {kinds.length > 1 ? <Seg label="Kind" value={shownKind} options={kinds.map((k) => ({ value: k, label: `${KIND_WORD[k]}s` }))} onChange={setKind} /> : null}
          <LibraryGrid kind={shownKind} onPick={onPick} />
        </div>
      ) : (
        <div data-slot="elements">
          {elements ?? (
            <div className="rounded-[10px] border border-hairline bg-paper px-4 py-5 text-center">
              <UserRound className="mx-auto size-5" />
              <p className="mt-1.5 text-[13px] font-semibold">Saved elements will live here</p>
              <p className="mt-0.5 text-[11.5px] leading-snug text-mute">Characters and products the team saves can be dropped into any prompt from this tab.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function LibraryGrid({ kind, onPick }: { kind: RefKind; onPick: (m: ApiMedia) => void }) {
  const data = useStudioData();
  const [items, setItems] = useState<{ kind: RefKind; list: ApiMedia[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    data
      .listMedia(kind)
      .then((r) => live && setItems({ kind, list: r.data }))
      .catch((e) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [kind, data]);
  if (error) return <p className="px-1 py-3 text-[12px] text-bad">{error}</p>;
  if (!items || items.kind !== kind) return <div className="grid grid-cols-4 gap-1.5">{Array.from({ length: 8 }, (_, i) => <div key={i} className="shimmer aspect-square rounded-lg" />)}</div>;
  if (!items.list.length) return <p className="px-1 py-4 text-center text-[12px] text-mute">Nothing in the library yet.</p>;
  return (
    <div className="grid max-h-[260px] grid-cols-4 gap-1.5 overflow-y-auto">
      {items.list.map((m) => (
        <button key={m.id} type="button" onClick={() => onPick(m)} title={m.filename} className="relative aspect-square overflow-hidden rounded-lg border-2 border-hairline bg-paper hover:border-ink">
          {m.type === "image" ? <ImageThumb src={m.url} alt={m.filename} sizes="80px" className="h-full w-full object-cover" /> : m.type === "video" ? <VideoThumb src={m.url} className="h-full w-full object-cover" /> : <Music className="m-auto size-5" />}
        </button>
      ))}
    </div>
  );
}
