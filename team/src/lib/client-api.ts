"use client";

import type { ElementKind, GenerationWithUser, Media, Profile } from "@/lib/types";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.json !== undefined ? { "content-type": "application/json" } : {}), ...init?.headers },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(body.details) ? body.details.map((d: unknown) => (typeof d === "string" ? d : (d as { message?: string }).message)).join(" ") : "";
    throw new ApiError([body.error, details].filter(Boolean).join(" — ") || `Request failed (${res.status})`, res.status, body.details);
  }
  return body as T;
}

/** API returns serialized generations; the UI works with the same shape. */
export type ApiGeneration = Pick<
  GenerationWithUser,
  | "id"
  | "batch_id"
  | "status"
  | "model"
  | "model_display_name"
  | "provider"
  | "media_type"
  | "prompt"
  | "params"
  | "result_url"
  | "cost_usd"
  | "actual_credits"
  | "estimated_cost_usd"
  | "duration_seconds"
  | "resolution"
  | "aspect_ratio"
  | "is_shared"
  | "source"
  | "fallback_reason"
  | "user_id"
  | "result_metadata"
  | "created_at"
  | "completed_at"
> & { error: string | null; user?: GenerationWithUser["user"] };

export type ApiMedia = Media & { user?: GenerationWithUser["user"] };

export type Paginated<T> = { data: T[]; page: number; limit: number; total: number; has_more: boolean };

// ─── credits ────────────────────────────────────────────────────────────────

/** The team's Kie balance. `credits` is null when Kie couldn't be reached. */
export type CreditBalance = { credits: number | null; topUpUrl: string };

export const getCredits = () => api<CreditBalance>("/api/credits", { cache: "no-store" });

// ─── elements ───────────────────────────────────────────────────────────────

/** A saved element as the API returns it. */
export type ApiElement = {
  id: string;
  name: string;
  kind: ElementKind;
  notes: string | null;
  image_urls: string[];
  cover_index: number;
  cover_url: string | null;
  created_by: string;
  creator: Pick<Profile, "id" | "display_name" | "avatar_url" | "is_bot"> | null;
  created_at: string;
  updated_at: string;
};

/**
 * Pictures for an element: each entry is a Media Library id or an image URL this app stores
 * (a library item's `url` or a generation's `result_url`). 1–12 per element.
 */
export type ElementInput = { name: string; kind: ElementKind; notes?: string; image_urls: string[]; cover_index?: number };
export type ElementPatch = Partial<Omit<ElementInput, "notes">> & { notes?: string | null };

export async function listElements(kind?: ElementKind): Promise<ApiElement[]> {
  const res = await api<{ data: ApiElement[] }>(`/api/elements${kind ? `?kind=${kind}` : ""}`);
  return res.data;
}

export const createElement = (input: ElementInput) => api<ApiElement>("/api/elements", { method: "POST", json: input });

export const updateElement = (id: string, patch: ElementPatch) =>
  api<ApiElement>(`/api/elements/${encodeURIComponent(id)}`, { method: "PATCH", json: patch });

export const deleteElement = (id: string) => api<{ deleted: true; id: string }>(`/api/elements/${encodeURIComponent(id)}`, { method: "DELETE" });

/** Force a download of a cross-origin file (the `download` attribute is ignored cross-origin). */
export async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
