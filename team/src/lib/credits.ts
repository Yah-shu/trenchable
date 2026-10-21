import "server-only";
import { KIE_CREDITS_URL } from "@/lib/kie-links";
import { fetchKieCredits } from "@/providers/kie";

/** How long a balance is reused before Kie is asked again. */
export const CREDITS_TTL_MS = 60_000;

export type CreditBalance = { credits: number | null; topUpUrl: string };

let cached: { credits: number; at: number } | null = null;

/**
 * The Kie account's credit balance, cached in memory for a minute so a busy team page
 * doesn't ask Kie on every render. Any failure gives `credits: null` and is not cached.
 */
export async function getCreditBalance(opts: { now?: number; fetcher?: () => Promise<number> } = {}): Promise<CreditBalance> {
  const now = opts.now ?? Date.now();
  if (cached && now - cached.at < CREDITS_TTL_MS) return { credits: cached.credits, topUpUrl: KIE_CREDITS_URL };
  try {
    const credits = await (opts.fetcher ?? fetchKieCredits)();
    cached = { credits, at: now };
    return { credits, topUpUrl: KIE_CREDITS_URL };
  } catch (err) {
    console.warn("[credits] could not read the Kie balance:", err instanceof Error ? err.message : err);
    return { credits: null, topUpUrl: KIE_CREDITS_URL };
  }
}

/** Tests only: forget the cached balance. */
export function resetCreditCache() {
  cached = null;
}
