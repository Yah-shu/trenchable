import { z } from "zod";
import { handleRoute, HttpError, requireActor } from "@/lib/auth";
import { createElement, listElements, serializeElement } from "@/lib/elements";
import { elementCreateSchema } from "@/lib/elements-rules";
import { ELEMENT_KINDS } from "@/lib/types";

const listSchema = z.object({ kind: z.enum(ELEMENT_KINDS).optional() });

/** GET /api/elements[?kind=character|product|location|style] — the team's saved elements, newest first. → { data: Element[] } */
export async function GET(request: Request) {
  return handleRoute(async () => {
    await requireActor(request);
    const parsed = listSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) throw new HttpError(400, "Invalid query", parsed.error.issues);
    const elements = await listElements({ kind: parsed.data.kind });
    return Response.json({ data: elements.map(serializeElement) });
  });
}

/**
 * POST /api/elements — { name, kind, notes?, image_urls, cover_index? } → 201 Element
 * `image_urls` entries are Media Library ids or image URLs from this app's storage (1–12).
 */
export async function POST(request: Request) {
  return handleRoute(async () => {
    const actor = await requireActor(request);
    const parsed = elementCreateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid element", parsed.error.issues);
    return Response.json(serializeElement(await createElement(actor, parsed.data)), { status: 201 });
  });
}
