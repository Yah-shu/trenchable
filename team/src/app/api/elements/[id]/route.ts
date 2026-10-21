import { handleRoute, HttpError, requireActor } from "@/lib/auth";
import { deleteElement, getElement, serializeElement, updateElement } from "@/lib/elements";
import { elementUpdateSchema } from "@/lib/elements-rules";

/** GET /api/elements/:id */
export async function GET(request: Request, ctx: RouteContext<"/api/elements/[id]">) {
  return handleRoute(async () => {
    await requireActor(request);
    const { id } = await ctx.params;
    return Response.json(serializeElement(await getElement(id)));
  });
}

/** PATCH /api/elements/:id — any of { name, kind, notes, image_urls, cover_index }. Creator or admin. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/elements/[id]">) {
  return handleRoute(async () => {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    const parsed = elementUpdateSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new HttpError(400, "Invalid element", parsed.error.issues);
    return Response.json(serializeElement(await updateElement(actor, id, parsed.data)));
  });
}

/** DELETE /api/elements/:id — creator or admin. The pictures stay in the Media Library. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/elements/[id]">) {
  return handleRoute(async () => {
    const actor = await requireActor(request);
    const { id } = await ctx.params;
    await deleteElement(actor, id);
    return Response.json({ deleted: true, id });
  });
}
