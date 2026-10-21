/**
 * The Studio feed's Filter and View choices, remembered in localStorage under `trenchable-team:feed`.
 * Filters go to the server (`/api/generations`); the tile size only changes the layout.
 */

export const FEED_KEY = "trenchable-team:feed";

export type FeedSort = "newest" | "oldest" | "cost";
export type FeedFilters = { model: string; media_type: string; user_id: string; from: string; to: string; sort: FeedSort };
export type FeedPrefs = { filters: FeedFilters; size: number };

export const EMPTY_FILTERS: FeedFilters = { model: "", media_type: "", user_id: "", from: "", to: "", sort: "newest" };

export const SIZE_MIN = 160;
export const SIZE_MAX = 520;
export const SIZE_DEFAULT = 280;

export const DEFAULT_PREFS: FeedPrefs = { filters: EMPTY_FILTERS, size: SIZE_DEFAULT };

const clampSize = (n: number) => Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n)));
const SORTS: FeedSort[] = ["newest", "oldest", "cost"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseFeedPrefs(raw: string | null | undefined): FeedPrefs {
  let data: Record<string, unknown> = {};
  try {
    const v = JSON.parse(raw ?? "{}") as unknown;
    if (v && typeof v === "object" && !Array.isArray(v)) data = v as Record<string, unknown>;
  } catch {
    // fall through to defaults
  }
  const f = (data.filters && typeof data.filters === "object" ? data.filters : {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    filters: {
      model: s(f.model),
      media_type: ["image", "video", "audio"].includes(s(f.media_type)) ? s(f.media_type) : "",
      user_id: s(f.user_id),
      from: DATE.test(s(f.from)) ? s(f.from) : "",
      to: DATE.test(s(f.to)) ? s(f.to) : "",
      sort: SORTS.includes(f.sort as FeedSort) ? (f.sort as FeedSort) : "newest",
    },
    size: typeof data.size === "number" && Number.isFinite(data.size) ? clampSize(data.size) : SIZE_DEFAULT,
  };
}

/** How many filters are on (sort doesn't count; a date range counts once). */
export function activeFilterCount(f: FeedFilters): number {
  return [f.model, f.media_type, f.user_id, f.from || f.to].filter(Boolean).length;
}

export function readFeedPrefs(storage: Pick<Storage, "getItem"> | null): FeedPrefs {
  try {
    return parseFeedPrefs(storage?.getItem(FEED_KEY));
  } catch {
    return DEFAULT_PREFS;
  }
}

export function writeFeedPrefs(storage: Pick<Storage, "setItem"> | null, prefs: FeedPrefs) {
  try {
    storage?.setItem(FEED_KEY, JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

/** Width the size scale is tuned for: at this width the default gives about four squares a row. */
const REF_WIDTH = 1400;
const ROW_MIN = 150;
const ROW_MAX = 620;

/**
 * The justified rows' target height for a tile size in a feed `width` px wide. Narrower feeds
 * scale it part of the way down, so a laptop keeps roughly the same count a row as a big screen.
 */
export const rowHeight = (size: number, width: number): number => {
  const atRef = ROW_MIN + ((clampSize(size) - SIZE_MIN) / (SIZE_MAX - SIZE_MIN)) * (ROW_MAX - ROW_MIN);
  const scale = 0.35 + 0.65 * Math.min(1.3, Math.max(0, width / REF_WIDTH));
  return Math.max(96, Math.round(atRef * scale));
};
