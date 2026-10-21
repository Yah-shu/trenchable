"use client";

import { Check, ImagePlus, Loader2, Pencil, Plus, Search, Star, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { UserAvatar } from "@/components/ui/misc";
import { ImageThumb } from "@/components/ui/thumb";
import type { ApiElement } from "@/lib/client-api";
import { ELEMENT_KIND_LABELS, elementBlockedReason, elementTarget, matchesSearch, mentionName, picturesInOrder } from "@/lib/client/elements";
import { canEditElement, ELEMENT_MAX_IMAGES, ELEMENT_NAME_MAX, ELEMENT_NOTES_MAX } from "@/lib/elements-rules";
import { ELEMENT_KINDS, type ElementKind, type Profile } from "@/lib/types";
import { ACCEPT } from "@/lib/upload";
import { cn } from "@/lib/utils";
import type { ComposerElementsApi, ComposerElementsSlot } from "./composer";
import { useStudioData } from "./studio-data";

type KindFilter = "all" | ElementKind;

const KIND_BADGE: Record<ElementKind, string> = {
  character: "pl-badge--coral",
  product: "pl-badge--info",
  location: "pl-badge--ok",
  style: "pl-badge--warn",
};

const isAdmin = (p: Profile) => p.role === "admin";
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** The composer's Elements tab: the team's elements, attached with one click. */
export function elementsSlotFor(profile: Profile): ComposerElementsSlot {
  return function ComposerElements(composer) {
    return <ElementsPanel profile={profile} composer={composer} />;
  };
}

/**
 * The team's saved elements (characters, products, locations, styles): search, a kind filter, and
 * a grid of cover pictures. In the composer a click attaches the element to the current model;
 * in the Library a click opens it. Creators and admins can edit and delete.
 */
export function ElementsPanel({ profile, composer }: { profile: Profile; composer?: ComposerElementsApi }) {
  const data = useStudioData();
  const [list, setList] = useState<ApiElement[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [query, setQuery] = useState("");
  // A fresh key per open, so the editor starts from the element as saved.
  const [editing, setEditing] = useState<{ key: number; element: ApiElement | null } | null>(null);

  useEffect(() => {
    let live = true;
    data
      .listElements()
      .then((l) => live && setList(l))
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [data]);

  const shown = useMemo(() => (list ?? []).filter((el) => (kind === "all" || el.kind === kind) && matchesSearch(el, query)), [list, kind, query]);
  const counts = useMemo(() => Object.fromEntries(ELEMENT_KINDS.map((k) => [k, (list ?? []).filter((el) => el.kind === k).length])) as Record<ElementKind, number>, [list]);

  const target = composer ? elementTarget(composer.model) : null;
  const modelBlocked = target?.kind === "none" ? target.reason : null;
  const actor = { userId: profile.id, isAdmin: isAdmin(profile) };
  const open = (element: ApiElement | null) => setEditing({ key: Date.now(), element });

  function attach(el: ApiElement) {
    if (!composer || !target) return;
    const pictures = picturesInOrder(el);
    const blocked = elementBlockedReason(target, pictures.length);
    if (blocked) return void toast.error(blocked);
    const refs = pictures.map((url, i) => ({ url, name: `${el.name} ${i + 1}` }));

    if (target.kind === "named") {
      const handle = mentionName(el.name);
      const err = composer.addElement(handle, refs.slice(0, target.max));
      if (err) return void toast.error(err);
      toast.success(`Added @${handle}`, { description: `Write @${handle} in the prompt to use ${el.name}.` });
      return composer.close();
    }

    let added = 0;
    let err: string | null = null;
    for (const ref of refs) {
      err = composer.addReference(ref, "image", { asReference: target.kind === "references" });
      if (err) break;
      added++;
    }
    if (!added) return void toast.error(err ?? `No room for ${el.name}.`);
    toast.success(added < refs.length ? `Added ${added} of ${refs.length} pictures of ${el.name}` : `Added ${el.name}`, {
      description: added < refs.length ? "The model has no room for the rest; the cover went first." : undefined,
    });
    composer.close();
  }

  const compact = Boolean(composer);

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-5")}>
      <div className={cn("flex flex-wrap items-center gap-2", !compact && "justify-between gap-3")}>
        <label className={cn("relative block", compact ? "min-w-0 flex-1" : "w-full sm:w-72")}>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-mute" />
          <input
            type="search"
            aria-label="Search elements"
            className={cn("pl-field !pl-8", compact ? "h-8 text-[13px]" : "h-10")}
            placeholder="Search elements"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        {compact ? (
          <button type="button" className="pl-pill pl-pill--sm" onClick={() => open(null)}>
            <Plus className="size-3.5" /> New
          </button>
        ) : (
          <Button variant="primary" onClick={() => open(null)}>
            <Plus /> New element
          </Button>
        )}
      </div>

      <div role="radiogroup" aria-label="Kind" className={cn("flex items-center gap-1.5", compact ? "flex-wrap gap-1" : "flex-wrap")}>
        {!compact ? <span className="pl-pill__label mr-1">Kind</span> : null}
        {(["all", ...ELEMENT_KINDS] as KindFilter[]).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn("pl-pill pl-pill--sm shrink-0", compact && "!h-7 !px-2.5 !text-[11.5px]", kind === k && "is-on")}
          >
            {k === "all" ? "All" : ELEMENT_KIND_LABELS[k].many}
            {!compact && list && k !== "all" && counts[k] ? <span className="text-[10px] tabular-nums opacity-60">{counts[k]}</span> : null}
          </button>
        ))}
      </div>

      {modelBlocked ? <p className="rounded-[10px] border border-hairline bg-paper px-3 py-2 text-[12px] leading-snug text-mute">{modelBlocked}</p> : null}

      {error ? (
        <p role="alert" className="px-1 py-3 text-[12px] text-bad">
          Couldn&apos;t load elements: {error}
        </p>
      ) : !list ? (
        <div className={gridClass(compact)}>
          {Array.from({ length: compact ? 6 : 10 }, (_, i) => (
            <div key={i} className="shimmer aspect-[4/5] rounded-[10px]" />
          ))}
        </div>
      ) : !list.length ? (
        <EmptyElements compact={compact} onNew={() => open(null)} />
      ) : !shown.length ? (
        <p className="px-1 py-6 text-center text-[12px] text-mute">No elements match{query ? ` “${query.trim()}”` : ""}.</p>
      ) : (
        <div className={cn(gridClass(compact), compact && "max-h-[300px] overflow-y-auto pr-0.5")}>
          {shown.map((el) => {
            const blocked = target ? elementBlockedReason(target, el.image_urls.length) : null;
            const editable = canEditElement(actor, el);
            return (
              <ElementTile
                key={el.id}
                element={el}
                compact={compact}
                disabledReason={blocked}
                onPick={() => (composer ? attach(el) : open(el))}
                onEdit={editable && composer ? () => open(el) : undefined}
              />
            );
          })}
        </div>
      )}

      {editing ? (
        <ElementEditor
          key={editing.key}
          profile={profile}
          element={editing.element}
          readOnly={editing.element ? !canEditElement(actor, editing.element) : false}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setList((prev) => [saved, ...(prev ?? []).filter((e) => e.id !== saved.id)]);
            setEditing(null);
          }}
          onDeleted={(id) => {
            setList((prev) => (prev ?? []).filter((e) => e.id !== id));
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}

const gridClass = (compact: boolean) => (compact ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6");

function KindBadge({ kind, className }: { kind: ElementKind; className?: string }) {
  return <span className={cn("pl-badge", KIND_BADGE[kind], className)}>{ELEMENT_KIND_LABELS[kind].one}</span>;
}

function ElementTile({
  element: el,
  compact,
  disabledReason,
  onPick,
  onEdit,
}: {
  element: ApiElement;
  compact: boolean;
  disabledReason: string | null;
  onPick: () => void;
  onEdit?: () => void;
}) {
  const cover = el.cover_url ?? el.image_urls[el.cover_index] ?? el.image_urls[0];
  const creator = el.creator?.display_name ?? "Unknown";
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onPick}
        disabled={Boolean(disabledReason)}
        title={disabledReason ?? (compact ? `Attach ${el.name}` : el.name)}
        aria-label={compact ? `Attach ${el.name}` : `Open ${el.name}`}
        className={cn("pl-tile w-full bg-canvas text-left disabled:cursor-not-allowed disabled:opacity-45", compact && "!rounded-[10px]")}
      >
        <div className="relative aspect-square overflow-hidden bg-paper">
          {cover ? (
            <ImageThumb src={cover} alt="" sizes={compact ? "130px" : "(max-width: 640px) 50vw, 220px"} className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
          ) : (
            <UserRound className="absolute inset-0 m-auto size-6 text-mute" />
          )}
          <KindBadge kind={el.kind} className={cn("absolute left-1.5 top-1.5", compact && "!px-1.5 !text-[10px]")} />
          <span className={cn("pl-badge pl-badge--ink absolute bottom-1.5 right-1.5 font-mono tabular-nums", compact && "!px-1.5 !text-[10px]")} title={`${el.image_urls.length} pictures`}>
            {el.image_urls.length}
          </span>
        </div>
        <div className={cn("border-t border-hairline", compact ? "px-2 py-1.5" : "px-2.5 py-2")}>
          <div className={cn("truncate font-semibold text-ink", compact ? "text-[12px]" : "text-[13px]")}>{el.name}</div>
          <div className={cn("mt-0.5 flex min-w-0 items-center gap-1 text-mute", compact ? "text-[10.5px]" : "text-[11.5px]")}>
            <UserAvatar name={creator} url={el.creator?.avatar_url} bot={el.creator?.is_bot} size={compact ? 13 : 16} />
            <span className="truncate">{creator}</span>
          </div>
        </div>
      </button>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${el.name}`}
          title="Edit"
          className="pl-iconbtn pl-iconbtn--sm absolute right-1.5 top-1.5 bg-canvas opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Pencil />
        </button>
      ) : null}
    </div>
  );
}

function EmptyElements({ compact, onNew }: { compact: boolean; onNew: () => void }) {
  return (
    <div className={cn("pl-panel pl-panel--paper items-center border-dashed text-center", compact ? "px-4 py-5" : "px-6 py-16")}>
      <UserRound className={cn("mx-auto", compact ? "size-5" : "size-7")} />
      <p className={cn("mt-1.5 font-semibold text-ink", compact ? "text-[13px]" : "font-display text-xl")}>No elements yet</p>
      <p className={cn("mx-auto mt-1 max-w-sm leading-snug text-mute", compact ? "text-[11.5px]" : "text-sm")}>
        Save a character, product, location or style once, with up to {ELEMENT_MAX_IMAGES} pictures, and drop it into any prompt.
      </p>
      <button type="button" className="pl-pill pl-pill--sm mx-auto mt-3" onClick={onNew}>
        <Plus className="size-3.5" /> New element
      </button>
    </div>
  );
}

// ─── the editor ─────────────────────────────────────────────────────────────

/** A picked picture: `ref` is what the API gets (a Media Library id or a stored URL), `url` what we show. */
type Picture = { ref: string; url: string; label: string };
type Source = "uploads" | "generated";

/**
 * Create or edit an element in a dialog: name, kind, notes, up to 12 pictures picked from uploads
 * or past generations (or uploaded here), and which one is the cover. Read-only for people who
 * can't change it.
 */
export function ElementEditor({
  profile,
  element,
  readOnly,
  onClose,
  onSaved,
  onDeleted,
}: {
  profile: Profile;
  element: ApiElement | null;
  readOnly?: boolean;
  onClose: () => void;
  onSaved: (el: ApiElement) => void;
  onDeleted: (id: string) => void;
}) {
  const data = useStudioData();
  const [name, setName] = useState(element?.name ?? "");
  const [kind, setKind] = useState<ElementKind>(element?.kind ?? "character");
  const [notes, setNotes] = useState(element?.notes ?? "");
  const [pictures, setPictures] = useState<Picture[]>(() => (element?.image_urls ?? []).map((url, i) => ({ ref: url, url, label: `${element?.name} ${i + 1}` })));
  const [cover, setCover] = useState(element?.cover_index ?? 0);
  const [source, setSource] = useState<Source>("uploads");
  const [pool, setPool] = useState<Partial<Record<Source, Picture[]>>>({});
  const [poolError, setPoolError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(0);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // The pictures to pick from, loaded per source the first time it's shown.
  const loaded = pool[source];
  useEffect(() => {
    if (readOnly || loaded) return;
    let live = true;
    const load =
      source === "uploads"
        ? data.listMedia("image", "uploads").then((r) => r.data.map((m): Picture => ({ ref: m.id, url: m.url, label: m.filename })))
        : data
            .listGenerations(new URLSearchParams({ media_type: "image", status: "completed", limit: "48" }))
            .then((r) => r.data.flatMap((g): Picture[] => (g.status === "completed" && g.media_type === "image" && g.result_url ? [{ ref: g.result_url, url: g.result_url, label: g.prompt ?? g.model_display_name }] : [])));
    load
      .then((list) => live && setPool((p) => ({ ...p, [source]: list })))
      .catch((e) => live && setPoolError(errorText(e)));
    return () => {
      live = false;
    };
  }, [data, source, loaded, readOnly]);

  const full = pictures.length >= ELEMENT_MAX_IMAGES;
  const isPicked = (url: string) => pictures.some((p) => p.url === url);
  const coverIndex = cover < pictures.length ? cover : 0;

  function toggle(p: Picture) {
    const at = pictures.findIndex((x) => x.url === p.url);
    if (at === -1) {
      if (!full) setPictures([...pictures, p]);
      return;
    }
    setPictures(pictures.filter((_, i) => i !== at));
    setCover((c) => (at < c ? c - 1 : at === c ? 0 : c));
  }

  async function upload(files: FileList | null) {
    const list = Array.from(files ?? []).filter((f) => f.type.startsWith("image/"));
    if (!list.length) return;
    setSource("uploads");
    for (const file of list) {
      setUploading((n) => n + 1);
      try {
        const m = await data.upload(file, profile.id);
        const pic: Picture = { ref: m.id, url: m.url, label: m.filename };
        setPool((p) => ({ ...p, uploads: [pic, ...(p.uploads ?? [])] }));
        setPictures((cur) => (cur.length < ELEMENT_MAX_IMAGES && !cur.some((x) => x.url === pic.url) ? [...cur, pic] : cur));
      } catch (e) {
        toast.error("Upload failed", { description: `${file.name}: ${errorText(e)}` });
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }

  const trimmed = name.trim();
  const problem = !trimmed
    ? "Give the element a name."
    : trimmed.length > ELEMENT_NAME_MAX
      ? `Names can be at most ${ELEMENT_NAME_MAX} characters.`
      : !pictures.length
        ? "Add at least one picture."
        : notes.trim().length > ELEMENT_NOTES_MAX
          ? `Notes can be at most ${ELEMENT_NOTES_MAX} characters.`
          : null;

  async function save() {
    if (problem || busy) return;
    setBusy("save");
    const body = { name: trimmed, kind, image_urls: pictures.map((p) => p.ref), cover_index: coverIndex };
    try {
      const saved = element
        ? await data.updateElement(element.id, { ...body, notes: notes.trim() || null })
        : await data.createElement({ ...body, ...(notes.trim() ? { notes: notes.trim() } : {}) });
      toast.success(element ? "Element saved" : "Element created", { description: saved.name });
      onSaved(saved);
    } catch (e) {
      toast.error(element ? "Couldn't save the element" : "Couldn't create the element", { description: errorText(e) });
      setBusy(null);
    }
  }

  async function remove() {
    if (!element || busy || !window.confirm(`Delete “${element.name}” for the whole team? Its pictures stay in the library.`)) return;
    setBusy("delete");
    try {
      await data.deleteElement(element.id);
      toast.success("Element deleted", { description: element.name });
      onDeleted(element.id);
    } catch (e) {
      toast.error("Couldn't delete the element", { description: errorText(e) });
      setBusy(null);
    }
  }

  const title = readOnly ? (element?.name ?? "Element") : element ? `Edit ${element.name}` : "New element";
  const description = readOnly
    ? `Saved by ${element?.creator?.display_name ?? "someone on the team"}. Only they or an admin can change it.`
    : `A ${ELEMENT_KIND_LABELS[kind].one.toLowerCase()} the whole team can drop into a prompt. Pick up to ${ELEMENT_MAX_IMAGES} pictures, then choose the cover.`;

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent title={title} description={description} className="flex max-w-[920px] flex-col" wide>
        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          {/* Details */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="el-name" className="pl-label">
                  Name
                </label>
                {!readOnly ? <span className={cn("font-mono text-[11px] tabular-nums", trimmed.length > ELEMENT_NAME_MAX ? "text-bad" : "text-mute")}>{trimmed.length}/{ELEMENT_NAME_MAX}</span> : null}
              </div>
              <input id="el-name" className="pl-field h-10" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead actor" maxLength={ELEMENT_NAME_MAX + 20} disabled={readOnly} autoFocus={!readOnly} />
            </div>

            <div className="space-y-1.5">
              <span className="pl-label">Kind</span>
              <div role="radiogroup" aria-label="Kind" className="grid grid-cols-2 gap-1.5">
                {ELEMENT_KINDS.map((k) => (
                  <button key={k} type="button" role="radio" aria-checked={kind === k} disabled={readOnly} onClick={() => setKind(k)} className={cn("pl-pill pl-pill--sm justify-center", kind === k && "is-on")}>
                    {ELEMENT_KIND_LABELS[k].one}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between">
                <label htmlFor="el-notes" className="pl-label">
                  Notes
                </label>
                <span className="text-[11px] text-mute">optional</span>
              </div>
              <textarea
                id="el-notes"
                className="pl-field min-h-[120px] resize-y py-2 text-[13px] leading-relaxed"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What to keep consistent: age, wardrobe, label colours, materials…"
                maxLength={ELEMENT_NOTES_MAX}
                disabled={readOnly}
              />
            </div>

            {element ? (
              <p className="flex items-center gap-1.5 text-[12px] text-mute">
                <UserAvatar name={element.creator?.display_name ?? "?"} url={element.creator?.avatar_url} bot={element.creator?.is_bot} size={18} />
                Saved by {element.creator?.display_name ?? "Unknown"}
              </p>
            ) : null}
          </div>

          {/* Pictures */}
          <div className="min-w-0 space-y-4">
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <span className="pl-label">Pictures</span>
                <span className="font-mono text-[11px] tabular-nums text-mute">
                  {pictures.length} of {ELEMENT_MAX_IMAGES}
                </span>
              </div>
              {pictures.length ? (
                <div className="grid grid-cols-6 gap-2">
                  {pictures.map((p, i) => (
                    <div key={p.url} className="relative aspect-square">
                      <button
                        type="button"
                        disabled={readOnly}
                        onClick={() => setCover(i)}
                        title={i === coverIndex ? "The cover" : "Make this the cover"}
                        aria-label={i === coverIndex ? `Picture ${i + 1}, the cover` : `Make picture ${i + 1} the cover`}
                        aria-pressed={i === coverIndex}
                        className={cn("relative block h-full w-full overflow-hidden rounded-[10px] border-2 bg-paper", i === coverIndex ? "border-ink ring-2 ring-coral ring-offset-1" : "border-hairline hover:border-ink")}
                      >
                        <ImageThumb src={p.url} alt={p.label} sizes="90px" className="h-full w-full object-cover" />
                      </button>
                      {i === coverIndex ? (
                        <span className="pl-badge pl-badge--coral pointer-events-none absolute bottom-1 left-1 !px-1.5 !text-[10px]">
                          <Star /> Cover
                        </span>
                      ) : null}
                      {!readOnly ? (
                        <button type="button" aria-label={`Remove picture ${i + 1}`} onClick={() => toggle(p)} className="absolute right-1 top-1 grid size-5 place-items-center rounded-full border border-ink bg-canvas hover:bg-coral">
                          <X className="size-3" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-[10px] border-2 border-dashed border-faint bg-paper px-4 py-5 text-center text-[12px] text-mute">Pick pictures below or upload new ones. The first becomes the cover.</p>
              )}
              {!readOnly && pictures.length > 1 ? <p className="pl-hint mt-1.5">Click a picture to make it the cover. The cover goes first when the element is attached.</p> : null}
            </div>

            {!readOnly ? (
              <div className="rounded-[12px] border border-hairline bg-paper p-3">
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <div className="pl-tabs">
                    {(
                      [
                        ["uploads", "Uploads"],
                        ["generated", "Generated"],
                      ] as const
                    ).map(([id, label]) => (
                      <button key={id} type="button" className={cn("pl-tab", source === id && "is-active")} onClick={() => setSource(id)}>
                        {label}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="pl-pill pl-pill--sm ml-auto" onClick={() => fileInput.current?.click()} disabled={uploading > 0 || full}>
                    {uploading > 0 ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                    {uploading > 0 ? `Uploading ${uploading}…` : "Upload"}
                  </button>
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    multiple
                    accept={ACCEPT.image}
                    onChange={(e) => {
                      void upload(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                {poolError ? (
                  <p role="alert" className="py-3 text-[12px] text-bad">
                    {poolError}
                  </p>
                ) : !loaded ? (
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {Array.from({ length: 12 }, (_, i) => (
                      <div key={i} className="shimmer aspect-square rounded-[8px]" />
                    ))}
                  </div>
                ) : !loaded.length ? (
                  <p className="py-6 text-center text-[12px] text-mute">{source === "uploads" ? "No uploaded pictures yet. Upload one here." : "No finished image generations yet."}</p>
                ) : (
                  <div className="grid max-h-[260px] grid-cols-4 gap-2 overflow-y-auto pr-0.5 sm:grid-cols-6">
                    {loaded.map((p) => {
                      const picked = isPicked(p.url);
                      const n = pictures.findIndex((x) => x.url === p.url) + 1;
                      return (
                        <button
                          key={p.url}
                          type="button"
                          onClick={() => toggle(p)}
                          disabled={!picked && full}
                          title={p.label}
                          aria-pressed={picked}
                          className={cn(
                            "relative aspect-square overflow-hidden rounded-[8px] border-2 bg-canvas transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                            picked ? "border-ink" : "border-hairline hover:border-ink",
                          )}
                        >
                          <ImageThumb src={p.url} alt={p.label} sizes="90px" className="h-full w-full object-cover" />
                          {picked ? (
                            <span className="absolute right-1 top-1 grid h-5 min-w-5 place-items-center rounded-full border border-ink bg-coral px-1 text-[10px] font-bold leading-none">{n}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
                {full ? (
                  <p className="pl-hint mt-2 flex items-center gap-1">
                    <Check className="size-3.5" /> {ELEMENT_MAX_IMAGES} pictures is the most an element holds. Remove one to pick another.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-hairline pt-4">
          {element && !readOnly ? (
            <Button variant="danger" size="sm" onClick={() => void remove()} disabled={Boolean(busy)}>
              {busy === "delete" ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
            </Button>
          ) : null}
          {!readOnly && problem && (name || pictures.length) ? <span className="text-[12px] text-mute">{problem}</span> : null}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={Boolean(busy)}>
              {readOnly ? "Close" : "Cancel"}
            </Button>
            {!readOnly ? (
              <Button variant="primary" onClick={() => void save()} disabled={Boolean(problem) || Boolean(busy) || uploading > 0}>
                {busy === "save" ? <Loader2 className="animate-spin" /> : null}
                {element ? "Save changes" : "Create element"}
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
