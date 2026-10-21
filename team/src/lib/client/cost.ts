/**
 * Prices as the Studio shows them. Kie bills in credits, so Kie-routed models show credits and
 * dollars ("≈ 140 cr · $0.70"); models that run direct on ElevenLabs or Google show dollars only.
 * Credits are worked out from the USD estimate at the list rate in models.config.ts.
 */
import { KIE_USD_PER_CREDIT, type ModelConfig } from "@/config/models.config";
import type { CostEstimate } from "@/lib/generation-params";

export const usesCredits = (model: Pick<ModelConfig, "provider">) => model.provider === "kie";

/** Credits for a dollar amount, at Kie's list rate. */
export const creditsFor = (usd: number) => usd / KIE_USD_PER_CREDIT;

/** "140", "6.8", "0.4": whole numbers from 10 up, one decimal below. */
export function formatCredits(credits: number): string {
  if (!Number.isFinite(credits)) return "?";
  if (credits >= 10) return Math.round(credits).toLocaleString("en-US");
  return String(Math.round(credits * 10) / 10);
}

/** "$0.70", "$0.034", "$12.40": two decimals, more for small amounts. */
export function formatDollars(usd: number): string {
  if (!Number.isFinite(usd)) return "$?";
  if (usd === 0) return "$0";
  if (usd >= 1) return `$${usd.toFixed(2)}`;
  const s = usd.toFixed(4).replace(/0+$/, "");
  return `$${s.split(".")[1]?.length === 1 ? `${s}0` : s.endsWith(".") ? `${s}00` : s}`;
}

export type CostTag = {
  /** Short text for the Generate button, e.g. "≈ 140 cr · $0.70". Null when it can't be worked out yet. */
  label: string | null;
  /** Hover text: how the number was reached. */
  title: string;
};

/** The Generate button's cost tag for an estimate. */
export function costTag(model: Pick<ModelConfig, "provider" | "pricing" | "requiresAudio" | "requiresVideo">, estimate: CostEstimate, variants = 1): CostTag {
  const times = variants > 1 && estimate.perGeneration != null ? ` × ${variants} variants` : "";
  const credits = usesCredits(model);
  const rate = credits ? ` Kie bills in credits: 1 credit = $${KIE_USD_PER_CREDIT}.` : " Billed in dollars by the provider directly.";
  if (estimate.total == null) {
    const need = model.requiresAudio ? "Add audio to estimate." : model.requiresVideo ? "Add a video to estimate." : model.pricing.unit === "per_1k_chars" ? "Write the script to estimate." : "";
    return { label: null, title: `Estimate: ${estimate.basis}.${need ? ` ${need}` : ""}${rate}` };
  }
  const usd = formatDollars(estimate.total);
  const label = credits ? `≈ ${formatCredits(creditsFor(estimate.total))} cr · ${usd}` : `≈ ${usd}`;
  return { label, title: `Estimate: ${estimate.basis}${times}.${rate} The final price is what the provider reports.` };
}

/** The model menu's price: the cheapest rate, in credits (Kie) and dollars. */
export function modelPriceTag(model: Pick<ModelConfig, "provider" | "pricing">): { main: string; sub?: string } {
  const p = model.pricing;
  let usd: number;
  let unit: string;
  let from = false;
  if (p.unit === "flat") {
    usd = p.amount;
    unit = "/run";
  } else if (p.unit === "per_1k_chars") {
    usd = Math.min(...Object.values(p.rates));
    unit = "/1k chars";
  } else if (p.unit === "per_video") {
    // Per-second equivalent, so per-clip models compare fairly with per-second ones.
    const perSecond = Object.entries(p.rates).map(([key, rate]) => rate / (Number(key.split("|")[1]) || 1));
    usd = Math.min(...perSecond);
    unit = "/s";
    from = true;
  } else {
    const values = Object.values(p.rates);
    usd = Math.min(...values);
    unit = p.unit === "per_second" ? "/s" : "/image";
    from = values.length > 1;
  }
  const pre = from ? "from " : "";
  if (!usesCredits(model)) return { main: `${pre}${formatDollars(usd)}${unit}` };
  return { main: `${pre}${formatCredits(creditsFor(usd))} cr${unit}`, sub: `${formatDollars(usd)}${unit}` };
}
