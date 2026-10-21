/**
 * The feed's justified rows: every row has one height, each tile keeps its own aspect ratio
 * (width = height × aspect), and a row's tiles are scaled so it exactly fills the width. The
 * last row isn't stretched unless it's nearly full: it keeps the target height and sits left.
 *
 * Pure layout here; the feed component measures the width and draws absolute boxes, so a
 * reflow moves tiles without remounting their media.
 */

export type Cell = { index: number; width: number; height: number };
export type Box = { index: number; x: number; y: number; width: number; height: number };

/** Narrowest and widest a tile may be, so one panorama can't turn its row into a sliver. */
export const ASPECT_MIN = 0.4;
export const ASPECT_MAX = 3;

export const clampAspect = (a: number): number => (Number.isFinite(a) && a > 0 ? Math.min(ASPECT_MAX, Math.max(ASPECT_MIN, a)) : 1);

/** A last row this full (at the target height) is stretched like the rest. */
const NEARLY_FULL = 0.85;

/**
 * Rows for tiles of these aspects in a box `width` wide. A row takes tiles until its height
 * would fall to the target, then keeps whichever of "with this tile" or "without it" lands
 * nearer the target (by ratio).
 */
export function rowsFor(aspects: number[], width: number, targetHeight: number, gap = 8): Cell[][] {
  if (!(width > 0) || !(targetHeight > 0) || !aspects.length) return [];
  const rows: Cell[][] = [];
  const heightOf = (sum: number, n: number) => (width - gap * (n - 1)) / sum;
  const close = (idx: number[], height: number) => rows.push(idx.map((index) => ({ index, width: clampAspect(aspects[index]) * height, height })));
  let row: number[] = [];
  let sum = 0;
  for (let i = 0; i < aspects.length; i++) {
    const a = clampAspect(aspects[i]);
    row.push(i);
    sum += a;
    const h = heightOf(sum, row.length);
    if (h > targetHeight) continue;
    const without = row.length > 1 ? heightOf(sum - a, row.length - 1) : Infinity;
    if (without / targetHeight < targetHeight / h) {
      row.pop();
      close(row, without);
      row = [i];
      sum = a;
      // A tile that alone is wider than the box at the target height is a row of its own.
      const alone = heightOf(a, 1);
      if (alone <= targetHeight) {
        close(row, alone);
        row = [];
        sum = 0;
      }
    } else {
      close(row, h);
      row = [];
      sum = 0;
    }
  }
  if (row.length) {
    const natural = sum * targetHeight + gap * (row.length - 1);
    close(row, natural / width >= NEARLY_FULL ? heightOf(sum, row.length) : targetHeight);
  }
  return rows;
}

/**
 * Fixed-count rows for narrow screens (phones get two a row): each row still fills the width
 * and keeps every tile's shape; a lone last tile takes one column's width.
 */
export function fixedRows(aspects: number[], width: number, perRow: number, gap = 8): Cell[][] {
  if (!(width > 0) || !aspects.length || perRow < 1) return [];
  const rows: Cell[][] = [];
  const col = (width - gap * (perRow - 1)) / perRow;
  for (let i = 0; i < aspects.length; i += perRow) {
    const idx = aspects.slice(i, i + perRow).map((_, j) => i + j);
    const sum = idx.reduce((s, k) => s + clampAspect(aspects[k]), 0);
    const height = idx.length === perRow ? (width - gap * (idx.length - 1)) / sum : Math.min(col / clampAspect(aspects[idx[0]]), col * 1.5);
    rows.push(idx.map((index) => ({ index, width: clampAspect(aspects[index]) * height, height })));
  }
  return rows;
}

/** The rows as absolute boxes, snapped to whole pixels so borders stay crisp. */
export function placeRows(rows: Cell[][], gap = 8): { boxes: Box[]; height: number } {
  const boxes: Box[] = [];
  let y = 0;
  for (const row of rows) {
    const h = Math.round(row[0]?.height ?? 0);
    let x = 0;
    for (const c of row) {
      const left = Math.round(x);
      const right = Math.round(x + c.width);
      boxes.push({ index: c.index, x: left, y, width: Math.max(1, right - left), height: h });
      x += c.width + gap;
    }
    y += h + gap;
  }
  return { boxes, height: Math.max(0, y - gap) };
}

/** "16:9", "9x16", "1.5" → width / height; "auto" and anything else → null. */
export function parseAspect(v: unknown): number | null {
  if (typeof v === "number") return v > 0 && Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase();
  const m = /^(\d+(?:\.\d+)?)\s*[:x/]\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (m) {
    const a = Number(m[1]) / Number(m[2]);
    return a > 0 && Number.isFinite(a) ? a : null;
  }
  if (/^\d+(\.\d+)?$/.test(s)) return Number(s) > 0 ? Number(s) : null;
  return null;
}

/* ---------- aspects measured from loaded files, for rows that don't say ---------- */

const STORE_KEY = "trenchable-team:aspects";
const STORE_MAX = 2000;
let measured: Map<string, number> | null = null;

function sessionStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function loadMeasured(): Map<string, number> {
  if (measured) return measured;
  measured = new Map();
  try {
    const raw = JSON.parse(sessionStore()?.getItem(STORE_KEY) ?? "{}") as unknown;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [k, v] of Object.entries(raw)) if (typeof v === "number" && v > 0 && Number.isFinite(v)) measured.set(k, v);
    }
  } catch {
    // Junk in storage: measure again.
  }
  return measured;
}

export const measuredAspect = (id: string): number | null => loadMeasured().get(id) ?? null;

/** Remember what a loaded image or video measured. True when that changes anything (lay out again). */
export function rememberAspect(id: string, width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return false;
  const map = loadMeasured();
  const a = width / height;
  const was = map.get(id);
  if (was !== undefined && Math.abs(was - a) < 0.005) return false;
  map.set(id, a);
  if (map.size > STORE_MAX) map.delete(map.keys().next().value as string);
  try {
    sessionStore()?.setItem(STORE_KEY, JSON.stringify(Object.fromEntries(map)));
  } catch {
    // Storage off or full: it lasts until the page closes.
  }
  return true;
}
