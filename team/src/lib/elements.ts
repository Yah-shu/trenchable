import "server-only";
import { z } from "zod";
import { HttpError, type Actor } from "@/lib/auth";
import {
  canEditElement,
  clampCover,
  mediaIdsIn,
  resolveImageRefs,
  type ElementCreateInput,
  type ElementUpdateInput,
  type MediaLookup,
} from "@/lib/elements-rules";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Element, ElementWithCreator } from "@/lib/types";

/**
 * Team Elements: saved characters, products, locations and styles. Reads are open to the whole team;
 * changes are limited to the creator or an admin (checked here, and again by RLS for direct clients).
 */

export const ELEMENT_SELECT = "*, creator:profiles!elements_created_by_fkey(id, display_name, avatar_url, is_bot)";

const actorRef = (actor: Actor) => ({ userId: actor.profile.id, isAdmin: actor.isAdmin });

/** Media ids → stored URLs, then the shared rules. */
async function resolveImages(refs: string[]): Promise<string[]> {
  const ids = mediaIdsIn(refs);
  const media: MediaLookup = new Map();
  if (ids.length) {
    const { data, error } = await createAdminClient().from("media").select("id, url, type").in("id", ids);
    if (error) throw new HttpError(500, error.message);
    for (const row of (data ?? []) as { id: string; url: string; type: string }[]) media.set(row.id, { url: row.url, type: row.type });
  }
  const resolved = resolveImageRefs(refs, env.supabaseUrl, media);
  if (!resolved.ok) throw new HttpError(422, "Invalid pictures", resolved.errors);
  return resolved.urls;
}

function assertCover(cover: number | undefined, count: number) {
  if (cover != null && cover >= count) throw new HttpError(422, "Invalid cover", [`cover_index must be between 0 and ${count - 1}.`]);
}

export async function listElements(opts: { kind?: Element["kind"]; limit?: number } = {}): Promise<ElementWithCreator[]> {
  let query = createAdminClient().from("elements").select(ELEMENT_SELECT).order("created_at", { ascending: false });
  if (opts.kind) query = query.eq("kind", opts.kind);
  if (opts.limit) query = query.limit(opts.limit);
  const { data, error } = await query;
  if (error) throw new HttpError(500, error.message);
  return (data ?? []) as ElementWithCreator[];
}

export async function getElement(id: string): Promise<ElementWithCreator> {
  if (!z.uuid().safeParse(id).success) throw new HttpError(404, "Element not found");
  const { data } = await createAdminClient().from("elements").select(ELEMENT_SELECT).eq("id", id).maybeSingle();
  if (!data) throw new HttpError(404, "Element not found");
  return data as ElementWithCreator;
}

export async function createElement(actor: Actor, input: ElementCreateInput): Promise<ElementWithCreator> {
  const imageUrls = await resolveImages(input.image_urls);
  assertCover(input.cover_index, imageUrls.length);
  const { data, error } = await createAdminClient()
    .from("elements")
    .insert({
      name: input.name,
      kind: input.kind,
      notes: input.notes || null,
      image_urls: imageUrls,
      cover_index: clampCover(input.cover_index, imageUrls.length),
      created_by: actor.profile.id,
    })
    .select(ELEMENT_SELECT)
    .single();
  if (error) throw new HttpError(500, `Could not save the element: ${error.message}`);
  return data as ElementWithCreator;
}

export async function updateElement(actor: Actor, id: string, input: ElementUpdateInput): Promise<ElementWithCreator> {
  const current = await getElement(id);
  if (!canEditElement(actorRef(actor), current)) throw new HttpError(403, "Only the person who made this element or an admin can change it");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) patch.name = input.name;
  if (input.kind !== undefined) patch.kind = input.kind;
  if (input.notes !== undefined) patch.notes = input.notes || null;

  const imageUrls = input.image_urls ? await resolveImages(input.image_urls) : current.image_urls;
  if (input.image_urls) patch.image_urls = imageUrls;
  assertCover(input.cover_index, imageUrls.length);
  if (input.cover_index !== undefined || input.image_urls) patch.cover_index = clampCover(input.cover_index ?? current.cover_index, imageUrls.length);

  const { data, error } = await createAdminClient().from("elements").update(patch).eq("id", id).select(ELEMENT_SELECT).single();
  if (error) throw new HttpError(500, `Could not update the element: ${error.message}`);
  return data as ElementWithCreator;
}

/** Deletes the element only; its pictures stay in the Media Library. */
export async function deleteElement(actor: Actor, id: string): Promise<void> {
  const current = await getElement(id);
  if (!canEditElement(actorRef(actor), current)) throw new HttpError(403, "Only the person who made this element or an admin can delete it");
  const { error } = await createAdminClient().from("elements").delete().eq("id", id);
  if (error) throw new HttpError(500, error.message);
}

/** Compact shape for API and MCP clients. */
export function serializeElement(el: ElementWithCreator | Element) {
  const creator = "creator" in el ? el.creator : undefined;
  return {
    id: el.id,
    name: el.name,
    kind: el.kind,
    notes: el.notes,
    image_urls: el.image_urls,
    cover_index: el.cover_index,
    cover_url: el.image_urls[el.cover_index] ?? el.image_urls[0] ?? null,
    created_by: el.created_by,
    creator: creator ? { id: creator.id, display_name: creator.display_name, avatar_url: creator.avatar_url, is_bot: creator.is_bot } : null,
    created_at: el.created_at,
    updated_at: el.updated_at,
  };
}

/** The pictures of the given elements, in order, for expanding `element_id` in generation params. */
export async function elementImageUrls(ids: string[]): Promise<string[]> {
  const elements = await Promise.all(ids.map((id) => getElement(id)));
  return elements.flatMap((el) => el.image_urls);
}
