/**
 * @mentions in the prompt: `@image1`, `@image2`… name the attached reference images in order,
 * `@video1` / `@audio1` the reference clips. The numbering is per kind and 1-based, so the
 * second image is `@image2` even if a clip was attached between them.
 *
 * The prompt is sent exactly as typed; these helpers only find the tokens (for the chips drawn
 * behind the textarea), pick the next one to insert, and keep numbers in step when a reference
 * is removed. Pure functions, no DOM.
 */

export type RefKind = "image" | "video" | "audio";
export type RefCounts = Partial<Record<RefKind, number>>;

export const REF_KINDS: RefKind[] = ["image", "video", "audio"];

export const tokenFor = (kind: RefKind, n: number) => `@${kind}${n}`;

/** One run of the prompt: plain text, or a token with its kind, number and whether that file is attached. */
export type PromptSegment = { text: string; ref?: { kind: RefKind; n: number; attached: boolean } };

// Tokens are found with a manual "starts a word" check rather than a lookbehind (ES2017 target).
const TOKEN = /@(image|video|audio)(\d+)/gi;

type Hit = { start: number; end: number; kind: RefKind; n: number };

function hits(prompt: string): Hit[] {
  const out: Hit[] = [];
  for (const m of prompt.matchAll(TOKEN)) {
    const start = m.index ?? 0;
    const before = start > 0 ? prompt[start - 1] : "";
    // "name@image1" is an address, not a mention.
    if (before && /[\w@]/.test(before)) continue;
    const end = start + m[0].length;
    // "@image1x" is a word, not a mention; "@image1," and "@image1." are fine.
    if (end < prompt.length && /\w/.test(prompt[end])) continue;
    out.push({ start, end, kind: m[1].toLowerCase() as RefKind, n: Number(m[2]) });
  }
  return out;
}

/** The tokens in a prompt, in order. */
export function mentionsIn(prompt: string): { kind: RefKind; n: number }[] {
  return hits(prompt).map(({ kind, n }) => ({ kind, n }));
}

/**
 * The prompt cut into text and tokens. The pieces join back to the exact prompt (the overlay
 * draws the same characters behind the textarea, so the caret never drifts), and a token whose
 * file isn't attached (`@image3` with two images) is marked so it can look different.
 */
export function promptSegments(prompt: string, counts: RefCounts): PromptSegment[] {
  const out: PromptSegment[] = [];
  let at = 0;
  for (const h of hits(prompt)) {
    if (h.start > at) out.push({ text: prompt.slice(at, h.start) });
    out.push({ text: prompt.slice(h.start, h.end), ref: { kind: h.kind, n: h.n, attached: h.n >= 1 && h.n <= (counts[h.kind] ?? 0) } });
    at = h.end;
  }
  if (at < prompt.length) out.push({ text: prompt.slice(at) });
  return out;
}

/** True when the prompt names a reference that isn't attached. */
export function hasMissingMentions(prompt: string, counts: RefCounts): boolean {
  return promptSegments(prompt, counts).some((s) => s.ref && !s.ref.attached);
}

/** The first attached reference the prompt doesn't mention yet (images, then videos, then audio), or null. */
export function nextFreeToken(prompt: string, counts: RefCounts): string | null {
  const used = new Set(mentionsIn(prompt).map((m) => tokenFor(m.kind, m.n)));
  for (const kind of REF_KINDS) {
    for (let n = 1; n <= (counts[kind] ?? 0); n++) {
      const t = tokenFor(kind, n);
      if (!used.has(t)) return t;
    }
  }
  return null;
}

/**
 * Put a token at the caret (the end when there's no caret), with a space either side where
 * the neighbouring text needs one. Returns the new text and where the caret should go.
 */
export function insertToken(text: string, token: string, caret: number | null): { next: string; cursor: number } {
  const at = caret == null ? text.length : Math.max(0, Math.min(text.length, caret));
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && /^\s/.test(after) ? "" : " ";
  const next = `${before}${lead}${token}${trail}${after}`;
  // The caret lands after the space that follows the token, whether it was added or already there.
  return { next, cursor: before.length + lead.length + token.length + 1 };
}

/**
 * Keep tokens pointing at the same files after reference `removed` of `kind` is taken out:
 * later numbers of that kind move down by one. A token for the removed file itself is left as
 * typed (it now shows as missing, or names whichever file took its place).
 */
export function renumberAfterRemoval(prompt: string, kind: RefKind, removed: number): string {
  let out = "";
  let at = 0;
  for (const h of hits(prompt)) {
    if (h.kind !== kind || h.n <= removed) continue;
    out += prompt.slice(at, h.start) + prompt.slice(h.start, h.start + 1 + kind.length) + String(h.n - 1);
    at = h.end;
  }
  return out + prompt.slice(at);
}

/** How many of each kind are attached, from a list of kinds in attach order. */
export function countKinds(kinds: RefKind[]): RefCounts {
  const c: RefCounts = {};
  for (const k of kinds) c[k] = (c[k] ?? 0) + 1;
  return c;
}
