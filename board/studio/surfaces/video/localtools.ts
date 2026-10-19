/**
 * Edit Video's local tools and Genjutsu's Guided swap, client side: the runs the server is working on
 * (server/studio/localtools.ts, server/studio/guided.ts), whether the tools are installed, and the
 * Kie inputs a Reframe or a guided swap will send — so Generate can show their price before anything goes.
 *
 * Like audio/dub.ts: a run is not one Kie task, so it isn't in jobs.ts. This module polls
 * GET /api/studio/local and /guided while any run is going (2.5 s), and refreshes history once one lands.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { refreshHistory } from '../../api.ts'
import type { PriceRow } from '../../pricing.ts'

/* ---------- what the server says ---------- */

export type LocalTool = 'depth' | 'removebg' | 'fps' | 'hdr' | 'reframe' | 'mask'
export type Aspect = '9:16' | '1:1' | '16:9' | '4:5'
export type ReframeModel = 'wan/2-7-videoedit' | 'happyhorse/video-edit'

export interface Point {
  x: number
  y: number
  label: 0 | 1
}
export type Box = [number, number, number, number]

export interface LocalRequest {
  tool: LocalTool
  clipUrl: string
  name?: string
  colormap?: 'turbo' | 'gray'
  fps?: number
  points?: Point[]
  box?: Box
  green?: boolean
  maskRun?: string
  aspect?: Aspect
  model?: ReframeModel
  resolution?: '720p' | '1080p'
}

export interface LocalRun {
  id: string
  request: LocalRequest
  status: 'running' | 'done' | 'failed'
  phase: string
  step: string
  progress?: number
  createdAt: number
  updatedAt: number
  error?: string
  taskId?: string
  credits: number
  files?: Record<string, string>
  coverage?: number
}

export interface GuidedRun {
  id: string
  request: { clipUrl: string; name?: string; images: string[]; points: Point[]; box?: Box; faceOutline: boolean; prompt?: string }
  status: 'running' | 'review' | 'ready' | 'failed'
  action: 'prepare' | 'draft' | 'hd'
  step: string
  progress?: number
  createdAt: number
  updatedAt: number
  error?: string
  seconds?: number
  prepared?: { fingerprint: string; guide: string; mask: string; faceOutline: boolean; coverage?: number; at: number }
  approved?: { fingerprint: string; at: number }
  draft?: { kieTaskId?: string; taskId?: string; credits?: number; at?: number; prompt?: string }
  hd?: { kieTaskId?: string; taskId?: string; credits?: number; at?: number }
  credits: number
}

export interface Doctor {
  installed: boolean
  reason?: string
  gpu?: string
  tools: Record<string, string>
  checkedAt: number
}

export interface FrameInfo {
  image: string
  size: [number, number]
  duration: number
  fps: number
}

/* ---------- the tools ---------- */

export const LOCAL_MODEL_ID = {
  depth: 'studio/depth-map',
  removebg: 'studio/remove-background',
  fps: 'studio/fps-boost',
  hdr: 'studio/sdr-to-hdr',
  reframe: 'studio/reframe',
} as const
export const GUIDED_MODEL_ID = 'studio/guided-swap'

/** The Kie models Reframe can fill with (server REFRAME_MODELS): which frames each makes, how long a clip. */
export const REFRAME_MODELS: Record<ReframeModel, { title: string; sub: string; aspects: Aspect[]; maxSeconds: number }> = {
  'wan/2-7-videoedit': { title: 'Wan 2.7 Video Edit', sub: 'Cheapest; told the frame; up to 10 s', aspects: ['9:16', '1:1', '16:9'], maxSeconds: 10 },
  'happyhorse/video-edit': { title: 'HappyHorse Video Edit', sub: 'Follows the padded frame (does 4:5); up to 15 s', aspects: ['9:16', '1:1', '16:9', '4:5'], maxSeconds: 15 },
}

/** What a Reframe sends to Kie, as far as its price goes (the server adds the URL and the prompt). */
export function reframeEstimateInput(model: ReframeModel, aspect: Aspect, resolution: '720p' | '1080p', seconds: number): Record<string, unknown> {
  const input: Record<string, unknown> = { video_url: 'https://padded', prompt: 'fill the edges', resolution, duration: Math.max(1, Math.round(seconds)), audio_setting: 'origin' }
  if (model === 'wan/2-7-videoedit') input.aspect_ratio = aspect
  return input
}

/** Seconds → Seedance's duration (server seedanceSeconds): whole seconds, 4–15. */
export const seedanceSeconds = (s: number) => Math.max(4, Math.min(15, Math.round(s) || 4))

/** A guided draft / HD, as far as the price goes: Seedance 2.5 with a reference video. */
export const guidedEstimateInput = (seconds: number, resolution: '480p' | '1080p'): Record<string, unknown> => ({
  prompt: 'guided swap',
  reference_video_urls: ['https://guide'],
  resolution,
  duration: seedanceSeconds(seconds),
  ...(resolution === '480p' ? { draft: true } : {}),
})

/**
 * What a guided swap costs on Kie's list: Seedance 2.5's "with video" per-second price (a reference video in;
 * 17 cr/s at 480p, 95 at 1080p on 2026-10-17) × the guide's seconds AND the seconds it renders — Kie bills the
 * input video too (e.g. a 5 s guide → 5 s out bills 17 × 10 = 170 credits). Kie lists no separate
 * price for finishing a draft, so the 1080p row billed the same way is an honest upper bound for the finish.
 * null when the row isn't on the list.
 */
export function guidedCost(rows: PriceRow[], seconds: number, resolution: '480p' | '720p' | '1080p'): { credits: number; perSecond: number; seconds: number; billed: number } | null {
  const row = rows.find((r) => r.page === 'seedance-2-5' && r.unit === 'second' && r.description.toLowerCase().includes(`${resolution} with video`))
  if (!row) return null
  const d = seedanceSeconds(seconds)
  const billed = d * 2
  return { credits: Math.round(row.credits * billed * 100) / 100, perSecond: row.credits, seconds: d, billed }
}

/** A per-second Kie price row for this model at this resolution × seconds (Reframe's fallback when the generic estimate can't pick a row). */
export function perSecondCost(rows: PriceRow[], modelId: string, resolution: string, seconds: number): { credits: number; perSecond: number } | null {
  const row = rows.find((r) => r.modelId === modelId && r.unit === 'second' && r.description.toLowerCase().includes(resolution.toLowerCase()))
  if (!row || !(seconds > 0)) return null
  return { credits: Math.round(row.credits * Math.max(1, Math.round(seconds)) * 100) / 100, perSecond: row.credits }
}

/** The pixel point on an image box → normalised 0–1, clamped. */
export function toUnit(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): { x: number; y: number } {
  const clamp = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 10000) / 10000
  return { x: clamp((clientX - rect.left) / Math.max(1, rect.width)), y: clamp((clientY - rect.top) / Math.max(1, rect.height)) }
}

/** Two corners → a box, or null when it is too small to mean anything (a click, not a drag). */
export function boxOf(a: { x: number; y: number }, b: { x: number; y: number }): Box | null {
  const box: Box = [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)]
  return box[2] - box[0] > 0.02 && box[3] - box[1] > 0.02 ? box : null
}

/* ---------- talking to the server ---------- */

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as { data?: T; error?: string }
  if (!res.ok || body.data === undefined) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body.data
}

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const enc = encodeURIComponent

export const localApi = {
  doctor: (fresh = false) => call<Doctor>(`/api/studio/local/doctor${fresh ? '?fresh=1' : ''}`),
  frame: (clipUrl: string) => call<FrameInfo>('/api/studio/local/frame', json('POST', { clipUrl })),
  start: (r: LocalRequest) => call<LocalRun>('/api/studio/local', json('POST', r)),
  list: () => call<{ runs: LocalRun[] }>('/api/studio/local'),
  retry: (id: string) => call<LocalRun>(`/api/studio/local/${enc(id)}/retry`, json('POST')),
  dismiss: (id: string) => call<{ ok: boolean }>(`/api/studio/local/${enc(id)}`, { method: 'DELETE' }),
  guided: {
    start: (r: GuidedRun['request']) => call<GuidedRun>('/api/studio/guided', json('POST', r)),
    list: () => call<{ runs: GuidedRun[] }>('/api/studio/guided'),
    prepare: (id: string, patch: { points?: Point[]; box?: Box | null; faceOutline?: boolean }) => call<GuidedRun>(`/api/studio/guided/${enc(id)}/prepare`, json('POST', patch)),
    approve: (id: string, fingerprint: string) => call<GuidedRun>(`/api/studio/guided/${enc(id)}/approve`, json('POST', { fingerprint })),
    draft: (id: string, patch: { prompt?: string; images?: string[] }) => call<GuidedRun>(`/api/studio/guided/${enc(id)}/draft`, json('POST', patch)),
    hd: (id: string) => call<GuidedRun>(`/api/studio/guided/${enc(id)}/hd`, json('POST')),
    retry: (id: string) => call<GuidedRun>(`/api/studio/guided/${enc(id)}/retry`, json('POST')),
    dismiss: (id: string) => call<{ ok: boolean }>(`/api/studio/guided/${enc(id)}`, { method: 'DELETE' }),
  },
}

/* ---------- polled lists, shared by every rail that shows them ---------- */

interface Store<T extends { id: string; status: string }> {
  use: (on?: boolean) => T[]
  put: (run: T) => void
  drop: (id: string) => void
  poll: () => Promise<void>
}

/** A list the server keeps, asked again every 2.5 s while anything in it runs. `landed`: a run just finished. */
function polled<T extends { id: string; status: string }>(list: () => Promise<T[]>, landed: (before: T, after: T) => boolean): Store<T> {
  let runs: T[] = []
  const listeners = new Set<() => void>()
  let timer: number | null = null
  let users = 0
  const emit = (next: T[]) => {
    const done = runs.some((r) => next.some((n) => n.id === r.id && landed(r, n)))
    runs = next
    for (const l of listeners) l()
    if (done) void refreshHistory()
  }
  const poll = async () => {
    if (timer !== null) window.clearTimeout(timer)
    timer = null
    try {
      emit(await list())
    } catch {
      // The server restarting is not a failed run; try again shortly.
    }
    if (users > 0 && runs.some((r) => r.status === 'running')) timer = window.setTimeout(() => void poll(), 2_500)
  }
  const subscribe = (l: () => void) => {
    listeners.add(l)
    return () => listeners.delete(l)
  }
  return {
    use(on = true) {
      useEffect(() => {
        if (!on) return
        users++
        void poll()
        return () => {
          users--
        }
      }, [on])
      return useSyncExternalStore(subscribe, () => runs, () => runs)
    },
    put(run) {
      emit([run, ...runs.filter((r) => r.id !== run.id)])
      void poll()
    },
    drop(id) {
      emit(runs.filter((r) => r.id !== id))
    },
    poll,
  }
}

export const localRuns = polled<LocalRun>(
  async () => (await localApi.list()).runs,
  (a, b) => a.status === 'running' && b.status === 'done' && Boolean(b.taskId),
)

export const guidedRuns = polled<GuidedRun>(
  async () => (await localApi.guided.list()).runs,
  (a, b) => a.status === 'running' && b.status !== 'running' && (b.draft?.taskId !== a.draft?.taskId || b.hd?.taskId !== a.hd?.taskId),
)

/* ---------- are the tools installed? ---------- */

let doctorCache: Promise<Doctor> | null = null

/** doctor.py's answer, asked once per page (the server caches it too); null while asking. */
export function useDoctor(): Doctor | null {
  const [doc, setDoc] = useState<Doctor | null>(null)
  useEffect(() => {
    let live = true
    doctorCache ??= localApi.doctor().catch((e: unknown) => ({ installed: false, reason: (e as Error).message, tools: {}, checkedAt: Date.now() }))
    void doctorCache.then((d) => live && setDoc(d))
    return () => {
      live = false
    }
  }, [])
  return doc
}

/** Why a local tool can't run, in plain words, or null when it can. */
export function notReady(doc: Doctor | null, tools: string[]): string | null {
  if (!doc) return null
  if (!doc.installed) return doc.reason ?? 'Local tools are not installed on this PC yet.'
  for (const t of tools) {
    const v = doc.tools[t]
    if (v !== undefined && v !== 'ok') return `${t}: ${v}`
  }
  return null
}
