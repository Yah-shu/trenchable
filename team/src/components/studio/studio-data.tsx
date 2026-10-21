"use client";

import { createContext, useContext } from "react";
import {
  api,
  createElement,
  deleteElement,
  listElements,
  updateElement,
  type ApiElement,
  type ApiGeneration,
  type ApiMedia,
  type ElementInput,
  type ElementPatch,
  type Paginated,
} from "@/lib/client-api";
import { uploadMedia } from "@/lib/upload";

/**
 * Everything the Studio reads from or writes to the server, in one place. The real app uses
 * `liveStudioData` (the same endpoints as before); the dev preview hands in fixtures so it runs
 * with no network at all.
 */
export type StudioData = {
  listGenerations: (query: URLSearchParams) => Promise<Paginated<ApiGeneration>>;
  getGeneration: (id: string) => Promise<ApiGeneration>;
  status: (id: string) => Promise<{ status: ApiGeneration["status"]; retries?: number }>;
  generate: (body: { model: string; params: Record<string, unknown>; variants: number; is_shared: boolean }) => Promise<{ jobs: ApiGeneration[] }>;
  remove: (id: string) => Promise<void>;
  setShared: (id: string, isShared: boolean) => Promise<ApiGeneration>;
  getMedia: (id: string) => Promise<ApiMedia>;
  /** Library items of one type; `source` narrows to uploads or generated outputs. */
  listMedia: (type: ApiMedia["type"], source?: "uploads" | "generated") => Promise<Paginated<ApiMedia>>;
  upload: (file: File, userId: string) => Promise<ApiMedia>;
  /** The team's saved elements, newest first. */
  listElements: () => Promise<ApiElement[]>;
  createElement: (input: ElementInput) => Promise<ApiElement>;
  updateElement: (id: string, patch: ElementPatch) => Promise<ApiElement>;
  deleteElement: (id: string) => Promise<void>;
};

export const liveStudioData: StudioData = {
  listGenerations: (q) => api<Paginated<ApiGeneration>>(`/api/generations?${q}`),
  getGeneration: (id) => api<ApiGeneration>(`/api/generate/${id}`),
  status: (id) => api(`/api/generate/${id}/status`),
  generate: (body) => api<{ jobs: ApiGeneration[] }>("/api/generate", { method: "POST", json: body }),
  remove: async (id) => {
    await api(`/api/generate/${id}`, { method: "DELETE" });
  },
  setShared: (id, isShared) => api<ApiGeneration>(`/api/generate/${id}`, { method: "PATCH", json: { is_shared: isShared } }),
  getMedia: (id) => api<ApiMedia>(`/api/media/${id}`),
  listMedia: (type, source) => api<Paginated<ApiMedia>>(`/api/media?type=${type}&limit=60${source ? `&source=${source}` : ""}`),
  upload: (file, userId) => uploadMedia(file, userId),
  listElements: () => listElements(),
  createElement: (input) => createElement(input),
  updateElement: (id, patch) => updateElement(id, patch),
  deleteElement: async (id) => {
    await deleteElement(id);
  },
};

const StudioDataContext = createContext<StudioData>(liveStudioData);

export const StudioDataProvider = StudioDataContext.Provider;
export const useStudioData = () => useContext(StudioDataContext);
