"use client";

import { usePathname } from "next/navigation";
import { Nav } from "@/components/nav";
import type { Profile } from "@/lib/types";
import { PREVIEW_CREDITS, PREVIEW_MEDIA } from "./fixtures";

/**
 * Dev previews only: answer the few read-only GETs the shell and Library make with fixtures, so the
 * pages render without a backend. Every other request passes through untouched.
 */
if (typeof window !== "undefined" && !(window as { __previewFetch?: boolean }).__previewFetch) {
  (window as { __previewFetch?: boolean }).__previewFetch = true;
  const realFetch = window.fetch.bind(window);
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const previewFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method === "GET" && url.origin === window.location.origin) {
      if (url.pathname === "/api/credits") return json(PREVIEW_CREDITS);
      if (url.pathname === "/api/media") {
        const type = url.searchParams.get("type");
        const source = url.searchParams.get("source");
        const data = PREVIEW_MEDIA.filter(
          (m) => (!type || m.type === type) && (source === "uploads" ? !m.generation_id : source === "generated" ? Boolean(m.generation_id) : true),
        );
        return json({ data, page: 1, limit: 48, total: data.length, has_more: false });
      }
    }
    return realFetch(input, init);
  };
  window.fetch = Object.assign(previewFetch, window.fetch);
}

const PREVIEW_ROUTES: Record<string, string> = {
  "/": "/dev-preview/studio",
  "/library": "/dev-preview/pages/library",
  "/admin": "/dev-preview/pages/spend",
  "/admin/team": "/dev-preview/pages/team",
};

/** The real lane bar with a sample admin; hidden on the signed-out previews. */
export function PreviewShell({ profile, children }: { profile: Profile; children: React.ReactNode }) {
  const pathname = usePathname();
  const signedOut = pathname.startsWith("/dev-preview/pages/login") || pathname.startsWith("/dev-preview/pages/set-password");
  if (signedOut) return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col">
      <Nav profile={profile} hrefMap={PREVIEW_ROUTES} />
      <main className="flex w-full min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
