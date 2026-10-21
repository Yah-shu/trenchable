/**
 * Elements: validation and permission rules, kept free of server imports so they can be unit-tested
 * and reused by the client. The database lookups live in `elements.ts`.
 */
import { z } from "zod";
import { ELEMENT_KINDS, type Element } from "@/lib/types";

export const ELEMENT_NAME_MAX = 60;
export const ELEMENT_NOTES_MAX = 2000;
export const ELEMENT_MIN_IMAGES = 1;
export const ELEMENT_MAX_IMAGES = 12;

/** Buckets whose public URLs count as "stored by this app". */
const STORED_BUCKETS = ["media", "generations"] as const;
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "avif"]);

const uuid = z.uuid();
const isUuid = (v: string) => uuid.safeParse(v).success;

const name = z
  .string()
  .trim()
  .min(1, "Give the element a name.")
  .max(ELEMENT_NAME_MAX, `Names can be at most ${ELEMENT_NAME_MAX} characters.`);
const notes = z.string().trim().max(ELEMENT_NOTES_MAX, `Notes can be at most ${ELEMENT_NOTES_MAX} characters.`);
/** Each entry is a Media Library id or a public URL of a file this app stores. */
const imageRefs = z
  .array(z.string().trim().min(1))
  .min(ELEMENT_MIN_IMAGES, "Add at least one picture.")
  .max(ELEMENT_MAX_IMAGES, `An element holds at most ${ELEMENT_MAX_IMAGES} pictures.`);

export const elementCreateSchema = z.object({
  name,
  kind: z.enum(ELEMENT_KINDS),
  notes: notes.optional(),
  image_urls: imageRefs,
  cover_index: z.number().int().min(0).default(0),
});

export const elementUpdateSchema = z
  .object({
    name,
    kind: z.enum(ELEMENT_KINDS),
    notes: notes.nullable(),
    image_urls: imageRefs,
    cover_index: z.number().int().min(0),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update.");

export type ElementCreateInput = z.infer<typeof elementCreateSchema>;
export type ElementUpdateInput = z.infer<typeof elementUpdateSchema>;

/** Public URL prefix of a storage bucket, e.g. `https://x.supabase.co/storage/v1/object/public/media/`. */
const bucketPrefix = (supabaseUrl: string, bucket: string) => `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${bucket}/`;

/** True when `url` is an image file in one of this app's storage buckets. */
export function isStoredImageUrl(url: string, supabaseUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.search || parsed.hash) return false;
  if (!STORED_BUCKETS.some((b) => url.startsWith(bucketPrefix(supabaseUrl, b)))) return false;
  if (parsed.pathname.includes("..")) return false;
  const ext = parsed.pathname.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
}

export type ImageRef = { kind: "media_id"; id: string } | { kind: "url"; url: string };

/** Media ids are UUIDs; anything else is treated as a URL. */
export const parseImageRef = (ref: string): ImageRef => (isUuid(ref) ? { kind: "media_id", id: ref } : { kind: "url", url: ref });

/** The Media Library rows a list of refs points at, so the server can look them up in one query. */
export const mediaIdsIn = (refs: string[]) => [...new Set(refs.map(parseImageRef).flatMap((r) => (r.kind === "media_id" ? [r.id] : [])))];

export type MediaLookup = Map<string, { url: string; type: string }>;

/**
 * Turns image refs (media ids or stored URLs) into stored image URLs, keeping their order and
 * dropping repeats. Anything that isn't an image this app stores is reported, not kept.
 */
export function resolveImageRefs(
  refs: string[],
  supabaseUrl: string,
  media: MediaLookup,
): { ok: true; urls: string[] } | { ok: false; errors: string[] } {
  const urls: string[] = [];
  const errors: string[] = [];
  refs.forEach((ref, i) => {
    const parsed = parseImageRef(ref);
    let url: string;
    if (parsed.kind === "media_id") {
      const row = media.get(parsed.id);
      if (!row) return void errors.push(`Picture ${i + 1}: no Media Library item with id ${parsed.id}.`);
      if (row.type !== "image") return void errors.push(`Picture ${i + 1}: that Media Library item is a ${row.type}, not an image.`);
      url = row.url;
    } else {
      url = parsed.url;
    }
    if (!isStoredImageUrl(url, supabaseUrl)) {
      return void errors.push(`Picture ${i + 1}: use a Media Library id or an image URL from this app's storage (import outside files with POST /api/media first).`);
    }
    if (!urls.includes(url)) urls.push(url);
  });
  if (!errors.length && urls.length > ELEMENT_MAX_IMAGES) errors.push(`An element holds at most ${ELEMENT_MAX_IMAGES} pictures.`);
  return errors.length ? { ok: false, errors } : { ok: true, urls };
}

/** The cover must point at one of the pictures; out-of-range values fall back to the first. */
export const clampCover = (cover: number | undefined, count: number) => (cover != null && cover >= 0 && cover < count ? cover : 0);

/** Anyone on the team can read elements; only the creator or an admin can change or delete one. */
export function canEditElement(actor: { userId: string; isAdmin: boolean }, element: Pick<Element, "created_by">): boolean {
  return actor.isAdmin || element.created_by === actor.userId;
}
