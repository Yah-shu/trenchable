import { handleRoute, requireActor } from "@/lib/auth";
import { getCreditBalance } from "@/lib/credits";

/**
 * GET /api/credits — the team's Kie credit balance.
 * → { credits: number | null, topUpUrl: string }   (credits is null when Kie can't be reached)
 * The balance is cached on the server for 60s; the response itself is never cached.
 */
export async function GET(request: Request) {
  return handleRoute(async () => {
    await requireActor(request);
    return Response.json(await getCreditBalance(), { headers: { "Cache-Control": "no-store" } });
  });
}
