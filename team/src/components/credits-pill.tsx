"use client";

import { Wallet } from "lucide-react";
import { useEffect, useState } from "react";

/** Fire this window event after anything that spends credits to refresh the pill right away. */
export const CREDITS_REFRESH_EVENT = "trenchable:credits-refresh";

type CreditsResponse = { credits: number | null; topUpUrl: string };

/** The team's shared Kie balance. Hidden when the balance can't be read. */
export function CreditsPill() {
  const [data, setData] = useState<CreditsResponse | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/credits", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as Partial<CreditsResponse>;
        if (alive) setData(typeof body.credits === "number" && body.topUpUrl ? { credits: body.credits, topUpUrl: body.topUpUrl } : null);
      } catch {
        if (alive) setData(null);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    const onRefresh = () => void load();
    window.addEventListener(CREDITS_REFRESH_EVENT, onRefresh);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener(CREDITS_REFRESH_EVENT, onRefresh);
    };
  }, []);

  if (!data || data.credits == null) return null;

  return (
    <a
      href={data.topUpUrl}
      target="_blank"
      rel="noopener"
      title="Kie credit balance (shared by the team). Click to top up on Kie."
      className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[13px] font-semibold text-mute hover:underline"
    >
      <Wallet className="size-3.5" aria-hidden />
      <span>
        <b className="font-semibold text-ink">{data.credits.toLocaleString("en-US")}</b> credits
      </span>
    </a>
  );
}
