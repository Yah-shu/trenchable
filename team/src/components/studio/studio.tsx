"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { getModel, type ModelConfig } from "@/config/models.config";
import type { ApiGeneration } from "@/lib/client-api";
import { browserStorage, familyKey, loadDraft, saveDraft, withFamilySettings, withFiles, type Draft } from "@/lib/client/draft";
import { estimateCost, validateParams } from "@/lib/generation-params";
import type { TypicalDurations } from "@/lib/job-status";
import type { Profile } from "@/lib/types";
import { Composer, type ComposerElementsSlot, type ComposerHandle } from "./composer";
import { Feed, type FeedHandle } from "./feed";
import { addFile, familySettingsOf, filesOf, initialState, modelOf, reconcile, stateFromGeneration, toParams, withDraftFiles, type FormState } from "./form";
import { refFromMedia } from "./media-input";
import type { VoiceOption } from "./settings-fields";
import { liveStudioData, StudioDataProvider, type StudioData } from "./studio-data";

export type StudioProps = {
  profile: Profile;
  team: Pick<Profile, "id" | "display_name">[];
  typicalDurations?: TypicalDurations;
  retentionDays?: number | null;
  /** ElevenLabs voices from the account, for the voice picker. */
  voices?: VoiceOption[];
  /** Where data comes from; the dev preview passes fixtures. Defaults to the real API. */
  data?: StudioData;
  /** The Elements tab of the add-media picker (the team's saved elements), when wired. */
  elementsSlot?: ComposerElementsSlot;
  /** Dev preview only: open the viewer / the model menu / the + popover's Elements tab on load for screenshots. */
  preview?: { viewer?: boolean; menu?: boolean; elements?: boolean };
};

const noop = () => () => {};
/** False during the server render and hydration, true after: the Studio reads localStorage, so it renders on the client. */
const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

/**
 * The Studio: a scrolling feed of the team's generations with the composer floating at the
 * bottom. The composer remembers its draft (prompt, model, per-family settings) in this browser.
 */
export function Studio(props: StudioProps) {
  const mounted = useMounted();
  return (
    <StudioDataProvider value={props.data ?? liveStudioData}>
      {mounted ? (
        <StudioInner {...props} />
      ) : (
        <div className="grid grid-cols-2 gap-2 px-3 pt-16 sm:px-4 md:grid-cols-4" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="shimmer aspect-square rounded-pl border border-hairline" />
          ))}
        </div>
      )}
    </StudioDataProvider>
  );
}

function stateFromDraft(d: Draft, voices?: VoiceOption[]): FormState {
  let s = initialState();
  if (d.files) s = withDraftFiles(s, d.files);
  s = { ...s, prompt: d.prompt ?? "" };
  const target = (d.modelId && getModel(d.modelId)) || modelOf(s);
  return reconcile(s, target, voices, d.byFamily[familyKey(target)]);
}

function StudioInner({ profile, team, typicalDurations, retentionDays, voices, data = liveStudioData, elementsSlot, preview }: StudioProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read once: this component only renders in the browser (see `useMounted`).
  const [savedDraft] = useState(() => loadDraft(browserStorage()));
  const draft = useRef<Draft>(savedDraft);
  const [state, setState] = useState<FormState>(() => stateFromDraft(savedDraft, voices));
  const [submitting, setSubmitting] = useState(false);
  const [composerHeight, setComposerHeight] = useState(180);
  const feed = useRef<FeedHandle>(null);
  const composer = useRef<ComposerHandle>(null);

  const model = modelOf(state);
  const params = toParams(state, model);
  const validation = validateParams(model, params);
  const estimate = estimateCost(model, validation.ok ? validation.params : params, state.variants, { sourceVideoSeconds: state.video[0]?.durationSeconds });

  // Remember the draft: prompt, model, this family's settings, and the attachments (kept two days).
  useEffect(() => {
    const m = modelOf(state);
    let d: Draft = { ...draft.current, prompt: state.prompt, modelId: m.id };
    d = withFamilySettings(d, familyKey(m), familySettingsOf(state));
    d = withFiles(d, filesOf(state));
    draft.current = d;
    saveDraft(browserStorage(), d);
  }, [state]);

  /** Switching family brings back that family's last settings; a tier switch keeps what's on screen. */
  const selectModel = useCallback(
    (m: ModelConfig) =>
      setState((s) => {
        const sameFamily = familyKey(modelOf(s)) === familyKey(m);
        return reconcile(s, m, voices, sameFamily ? undefined : draft.current.byFamily[familyKey(m)]);
      }),
    [voices],
  );

  // "Use in generation" from the Media Library → /?use=<mediaId>. Wins over the draft.
  useEffect(() => {
    const id = searchParams.get("use");
    if (!id) return;
    data
      .getMedia(id)
      .then((m) => {
        const ref = refFromMedia(m);
        setState((s) => {
          const current = modelOf(s);
          const r = current.options.references;
          if (m.type === "audio") {
            if (r?.audios && s.refAudios.length < r.audios.max) return { ...s, refMode: "references", refAudios: [...s.refAudios, ref] };
            return { ...reconcile(s, getModel("kling-avatar-standard")!, voices), audio: [ref] };
          }
          if (m.type === "video") {
            if (r?.videos && s.refVideos.length < r.videos.max) return { ...s, refMode: "references", refVideos: [...s.refVideos, ref] };
            return { ...reconcile(s, getModel("topaz-video-upscale")!, voices), video: [ref] };
          }
          // Images: a reference if the form is in references mode, otherwise the next free frame.
          if (r?.images && s.refMode === "references" && s.refImages.length < r.images.max) return { ...s, refImages: [...s.refImages, ref] };
          const frameSlots = r?.frames === "start-end" ? 2 : r?.frames ? 1 : 0;
          if (frameSlots && s.frames.length < frameSlots) return { ...s, refMode: "frames", frames: [...s.frames, ref] };
          const target = (current.options.maxImages ?? 0) > s.images.length ? current : getModel("nano-banana-pro")!;
          const next = reconcile(s, target, voices);
          return { ...next, images: [...next.images, ref].slice(0, target.options.maxImages ?? 1) };
        });
        toast.success("Added to the composer", { description: m.filename });
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : String(e)))
      .finally(() => router.replace("/", { scroll: false }));
    // `voices` only affects reconcile defaults; re-running this effect when it loads isn't wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, router, data]);

  async function submit(overrides?: { model: string; params: Record<string, unknown>; variants?: number }) {
    if (submitting) return;
    if (!overrides && !validation.ok) {
      toast.error("Can't generate yet", { description: validation.errors.join(" ") });
      return;
    }
    setSubmitting(true);
    try {
      const res = await data.generate(
        overrides
          ? { model: overrides.model, params: overrides.params, variants: overrides.variants ?? 1, is_shared: state.isShared }
          : { model: model.id, params: params as Record<string, unknown>, variants: state.variants, is_shared: state.isShared },
      );
      feed.current?.prepend(res.jobs.map((j) => ({ ...j, user: { id: profile.id, display_name: profile.display_name, avatar_url: profile.avatar_url, is_bot: false } })));
    } catch (e) {
      toast.error("Generation failed to start", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSubmitting(false);
    }
  }

  // Ctrl/Cmd + Enter to generate (a ref keeps the listener stable while seeing the latest form).
  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void submitRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function loadSettings(g: ApiGeneration) {
    const next = stateFromGeneration(state, g, voices);
    if (!next) {
      toast.error("That model is no longer available");
      return;
    }
    setState(next);
    setTimeout(() => composer.current?.focusPrompt(), 50);
    toast.success("Settings loaded", { description: g.model_display_name });
  }

  const rerun = (g: ApiGeneration) => void submit({ model: g.model, params: g.params as Record<string, unknown> });

  /** Use as reference: only offered when the current model has room for this kind of file. */
  const referenceAction = (g: ApiGeneration) => {
    if (!g.result_url || g.media_type === "audio") return null;
    const kind = g.media_type;
    const ref = { url: g.result_url, name: `${g.model_display_name} result`, durationSeconds: g.duration_seconds != null ? Number(g.duration_seconds) : undefined };
    if ("error" in addFile(state, model, kind, ref)) return null;
    return () => {
      const error = composer.current?.addReference(ref, kind);
      if (error) toast.error(error);
      else toast.success("Added to the references");
    };
  };

  return (
    <div className="relative">
      <Feed
        ref={feed}
        currentUser={profile}
        team={team}
        typicalDurations={typicalDurations}
        retentionDays={retentionDays}
        onRerun={rerun}
        onUseSettings={loadSettings}
        referenceAction={referenceAction}
        bottomPad={composerHeight}
        openViewer={preview?.viewer}
      />
      <Composer
        ref={composer}
        state={state}
        setState={setState}
        profile={profile}
        voices={voices}
        params={params}
        validation={validation}
        estimate={estimate}
        submitting={submitting}
        onSubmit={() => void submit()}
        onSelectModel={selectModel}
        elementsSlot={elementsSlot}
        menuOpen={preview?.menu}
        elementsOpen={preview?.elements}
        onHeight={setComposerHeight}
      />
    </div>
  );
}
