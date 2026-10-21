/**
 * What the Studio composer remembers across reloads, in localStorage under `trenchable-team:draft`:
 * the prompt, the selected model, and per model family the last aspect, resolution, duration,
 * variants, audio toggle and settings, so switching back to a family brings back its own choices.
 *
 * Attached files are remembered too, but only for two days: after that they're dropped rather
 * than restored, so an old draft never quietly sends stale uploads.
 *
 * Pure functions over plain data; the storage is passed in so tests don't need a browser.
 */

export const DRAFT_KEY = "trenchable-team:draft";
export const FILE_LIFE_MS = 2 * 24 * 60 * 60 * 1000;

export type SettingValue = string | number | boolean;

/** One family's remembered choices. Every field is optional: unknown means "use the model's default". */
export type FamilySettings = {
  aspectRatio?: string;
  resolution?: string;
  duration?: number;
  variants?: number;
  generateAudio?: boolean;
  settings?: Record<string, SettingValue>;
};

export type DraftFile = { url: string; name: string; mediaId?: string; durationSeconds?: number; width?: number; height?: number };
export type DraftElement = { name: string; images: DraftFile[] };

/** The composer's attachments, by slot. */
export type DraftFiles = {
  images?: DraftFile[];
  frames?: DraftFile[];
  refImages?: DraftFile[];
  refVideos?: DraftFile[];
  refAudios?: DraftFile[];
  audio?: DraftFile[];
  video?: DraftFile[];
  elements?: DraftElement[];
  refMode?: "frames" | "references";
};

export type Draft = {
  prompt?: string;
  modelId?: string;
  /** Settings by family key (`familyKey`). */
  byFamily: Record<string, FamilySettings>;
  files?: DraftFiles;
  /** When `files` was last written (epoch ms). */
  filesAt?: number;
};

export const emptyDraft = (): Draft => ({ byFamily: {} });

/** Tiers of one family share settings; a model without a family is its own. */
export const familyKey = (model: { id: string; family?: string }) => model.family ?? model.id;

const isObj = (v: unknown): v is Record<string, unknown> => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function cleanFamily(v: unknown): FamilySettings | null {
  if (!isObj(v)) return null;
  const out: FamilySettings = {};
  if (str(v.aspectRatio)) out.aspectRatio = v.aspectRatio as string;
  if (str(v.resolution)) out.resolution = v.resolution as string;
  if (num(v.duration) !== undefined) out.duration = v.duration as number;
  if (num(v.variants) !== undefined) out.variants = clampVariants(v.variants as number);
  if (typeof v.generateAudio === "boolean") out.generateAudio = v.generateAudio;
  if (isObj(v.settings)) {
    const s: Record<string, SettingValue> = {};
    for (const [k, x] of Object.entries(v.settings)) if (typeof x === "string" || typeof x === "number" || typeof x === "boolean") s[k] = x;
    out.settings = s;
  }
  return out;
}

const cleanFile = (v: unknown): DraftFile | null =>
  isObj(v) && typeof v.url === "string" && v.url
    ? {
        url: v.url,
        name: str(v.name) ?? "Reference",
        ...(str(v.mediaId) ? { mediaId: v.mediaId as string } : {}),
        ...(num(v.durationSeconds) !== undefined ? { durationSeconds: v.durationSeconds as number } : {}),
        ...(num(v.width) !== undefined ? { width: v.width as number } : {}),
        ...(num(v.height) !== undefined ? { height: v.height as number } : {}),
      }
    : null;

const cleanFiles = (v: unknown): DraftFile[] | undefined => (Array.isArray(v) ? v.map(cleanFile).filter((f): f is DraftFile => f !== null) : undefined);

function cleanDraftFiles(v: unknown): DraftFiles | undefined {
  if (!isObj(v)) return undefined;
  const out: DraftFiles = {};
  for (const k of ["images", "frames", "refImages", "refVideos", "refAudios", "audio", "video"] as const) {
    const list = cleanFiles(v[k]);
    if (list) out[k] = list;
  }
  if (Array.isArray(v.elements)) {
    out.elements = v.elements.filter(isObj).map((e) => ({ name: str(e.name) ?? "element", images: cleanFiles(e.images) ?? [] }));
  }
  if (v.refMode === "frames" || v.refMode === "references") out.refMode = v.refMode;
  return out;
}

export const clampVariants = (n: number) => Math.min(4, Math.max(1, Math.round(n)));

/** Read a stored draft. Junk becomes an empty draft; files older than two days are dropped. */
export function parseDraft(raw: string | null | undefined, now = Date.now()): Draft {
  if (!raw) return emptyDraft();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyDraft();
  }
  if (!isObj(data)) return emptyDraft();
  const draft = emptyDraft();
  if (typeof data.prompt === "string") draft.prompt = data.prompt;
  if (typeof data.modelId === "string") draft.modelId = data.modelId;
  if (isObj(data.byFamily)) {
    for (const [k, v] of Object.entries(data.byFamily)) {
      const f = cleanFamily(v);
      if (f) draft.byFamily[k] = f;
    }
  }
  const filesAt = num(data.filesAt);
  if (filesAt !== undefined && now - filesAt <= FILE_LIFE_MS) {
    const files = cleanDraftFiles(data.files);
    if (files) {
      draft.files = files;
      draft.filesAt = filesAt;
    }
  }
  return draft;
}

export const serializeDraft = (d: Draft) => JSON.stringify(d);

/** A family's remembered settings, if it has any. */
export const familySettings = (d: Draft, key: string): FamilySettings | undefined => d.byFamily[key];

/** Record a family's current settings (replacing what it had). */
export function withFamilySettings(d: Draft, key: string, s: FamilySettings): Draft {
  return { ...d, byFamily: { ...d.byFamily, [key]: s } };
}

/** Record the attachments, stamping the time so they expire after two days. Unchanged files keep their stamp. */
export function withFiles(d: Draft, files: DraftFiles, now = Date.now()): Draft {
  const same = d.files && JSON.stringify(d.files) === JSON.stringify(files);
  return same ? d : { ...d, files, filesAt: now };
}

/** Whether any attachment is in the files. */
export const hasFiles = (f?: DraftFiles) =>
  Boolean(f && (["images", "frames", "refImages", "refVideos", "refAudios", "audio", "video"] as const).some((k) => (f[k]?.length ?? 0) > 0)) || Boolean(f?.elements?.length);

/**
 * A remembered value, if the model still offers it; otherwise the fallback.
 * `allowed` undefined means the model has no such option at all.
 */
export function restoreChoice<T>(remembered: T | undefined, allowed: T[] | undefined, fallback: T | undefined): T | undefined {
  if (!allowed) return undefined;
  if (remembered !== undefined && allowed.includes(remembered)) return remembered;
  return fallback !== undefined && allowed.includes(fallback) ? fallback : allowed[0];
}

type Store = Pick<Storage, "getItem" | "setItem">;

export function loadDraft(storage: Store | null, now = Date.now()): Draft {
  try {
    return parseDraft(storage?.getItem(DRAFT_KEY), now);
  } catch {
    return emptyDraft();
  }
}

/** Storage off or full: the draft just isn't kept. */
export function saveDraft(storage: Store | null, d: Draft) {
  try {
    storage?.setItem(DRAFT_KEY, serializeDraft(d));
  } catch {
    // ignore
  }
}

export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
