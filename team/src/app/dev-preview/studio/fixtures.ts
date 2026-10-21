/**
 * Sample data for the Studio dev preview: a dozen generations in every state, a fake team and
 * voices, and a data source that never touches the network. Pictures are SVGs drawn here; the
 * clips and the audio are tiny files in public/dev-preview/.
 */
import type { StudioData } from "@/components/studio/studio-data";
import type { Draft } from "@/lib/client/draft";
import type { VoiceOption } from "@/components/studio/settings-fields";
import type { ApiElement, ApiGeneration, ApiMedia, Paginated } from "@/lib/client-api";
import type { TypicalDurations } from "@/lib/job-status";
import type { Profile } from "@/lib/types";

export const previewProfile: Profile = {
  id: "u-me",
  email: "preview@example.com",
  display_name: "Team Admin",
  role: "admin",
  avatar_url: null,
  is_bot: false,
  created_at: "2026-01-01T00:00:00Z",
};

export const previewTeam: Pick<Profile, "id" | "display_name">[] = [
  { id: "u-me", display_name: "Team Admin" },
  { id: "u-two", display_name: "Editor Two" },
  { id: "u-three", display_name: "Editor Three" },
  { id: "u-bot", display_name: "Pipeline bot" },
];

export const previewVoices: VoiceOption[] = [
  { value: "v-warm", label: "Warm narrator", hint: "Calm, mid-range" },
  { value: "v-bright", label: "Bright host", hint: "Upbeat, quick" },
  { value: "v-deep", label: "Deep trailer", hint: "Low, slow" },
  { value: "v-soft", label: "Soft reader", hint: "Gentle, close-mic" },
  { value: "v-news", label: "Newsroom", hint: "Neutral, clear" },
];

export const previewDurations: TypicalDurations = {
  "kling-3-pro": { median: 150, p90: 240, n: 24 },
  "nano-banana-pro": { median: 28, p90: 45, n: 60 },
};

/** A small landscape-ish picture: sky, sun, two hills, in a few palettes. */
export function art(w: number, h: number, p: [string, string, string, string], shape: "hills" | "rings" | "blocks" = "hills") {
  const [sky, sun, near, far] = p;
  const body =
    shape === "rings"
      ? `<circle cx="${w * 0.5}" cy="${h * 0.5}" r="${Math.min(w, h) * 0.36}" fill="none" stroke="${near}" stroke-width="${Math.min(w, h) * 0.08}"/><circle cx="${w * 0.5}" cy="${h * 0.5}" r="${Math.min(w, h) * 0.18}" fill="${sun}"/><rect x="0" y="${h * 0.82}" width="${w}" height="${h * 0.18}" fill="${far}"/>`
      : shape === "blocks"
        ? `<rect x="${w * 0.12}" y="${h * 0.3}" width="${w * 0.3}" height="${h * 0.5}" rx="${w * 0.03}" fill="${near}"/><rect x="${w * 0.48}" y="${h * 0.18}" width="${w * 0.38}" height="${h * 0.62}" rx="${w * 0.03}" fill="${far}"/><circle cx="${w * 0.67}" cy="${h * 0.42}" r="${Math.min(w, h) * 0.1}" fill="${sun}"/><rect x="0" y="${h * 0.8}" width="${w}" height="${h * 0.2}" fill="#111111" opacity="0.08"/>`
        : `<circle cx="${w * 0.7}" cy="${h * 0.34}" r="${Math.min(w, h) * 0.13}" fill="${sun}"/><path d="M0 ${h * 0.72} Q ${w * 0.3} ${h * 0.48} ${w * 0.62} ${h * 0.7} T ${w} ${h * 0.64} V ${h} H 0 Z" fill="${far}"/><path d="M0 ${h * 0.86} Q ${w * 0.42} ${h * 0.66} ${w} ${h * 0.84} V ${h} H 0 Z" fill="${near}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky}"/><stop offset="1" stop-color="#faf7f2"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/>${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const NOW = Date.now();
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();
const DAY = 86_400;

const people = {
  me: { id: "u-me", display_name: "Team Admin", avatar_url: null, is_bot: false },
  two: { id: "u-two", display_name: "Editor Two", avatar_url: null, is_bot: false },
  three: { id: "u-three", display_name: "Editor Three", avatar_url: null, is_bot: false },
  bot: { id: "u-bot", display_name: "Pipeline bot", avatar_url: null, is_bot: true },
};

type Over = Partial<ApiGeneration> & Pick<ApiGeneration, "id" | "model" | "model_display_name" | "media_type" | "status">;

function gen(o: Over): ApiGeneration {
  const user = o.user ?? people.me;
  return {
    batch_id: null,
    provider: "kie",
    prompt: null,
    params: {},
    result_url: null,
    cost_usd: null,
    estimated_cost_usd: null,
    actual_credits: null,
    duration_seconds: null,
    resolution: null,
    aspect_ratio: null,
    is_shared: true,
    source: "web",
    fallback_reason: null,
    user_id: user.id,
    result_metadata: null,
    created_at: ago(600),
    completed_at: null,
    error: null,
    ...o,
    user,
  };
}

const retry = (error: string) => ({ retries: [{ stage: "in-flight", error, at: ago(400) }] });

export const previewGenerations: ApiGeneration[] = [
  gen({
    id: "g-run-video",
    model: "kling-3-pro",
    model_display_name: "Kling 3.0 Pro",
    media_type: "video",
    status: "processing",
    prompt: "Slow dolly toward a ceramic mug on a sunlit kitchen table, steam rising, shallow depth of field",
    params: { aspect_ratio: "16:9", duration: 5 },
    aspect_ratio: "16:9",
    estimated_cost_usd: 0.7,
    created_at: ago(70),
  }),
  gen({
    id: "g-run-image",
    model: "nano-banana-pro",
    model_display_name: "Nano Banana Pro",
    media_type: "image",
    status: "queued",
    prompt: "Flat-lay of a linen apron with @image1 pinned to the pocket",
    params: { aspect_ratio: "3:4" },
    aspect_ratio: "3:4",
    estimated_cost_usd: 0.09,
    created_at: ago(9),
  }),
  gen({
    id: "g-img-1",
    model: "nano-banana-pro",
    model_display_name: "Nano Banana Pro",
    media_type: "image",
    status: "completed",
    prompt: "Warm editorial photo of rolling hills at golden hour, soft film grain, a single tree on the ridge, wide negative space for a headline",
    params: { aspect_ratio: "3:4", resolution: "2K", seed: 4412 },
    aspect_ratio: "3:4",
    resolution: "2K",
    result_url: art(600, 800, ["#ffd9c9", "#fd9b9b", "#2f4f3a", "#8fb39a"]),
    cost_usd: 0.09,
    created_at: ago(1800),
    completed_at: ago(1770),
  }),
  gen({
    id: "g-vid-1",
    model: "seedance-2",
    model_display_name: "Seedance 2.0 Pro",
    media_type: "video",
    status: "completed",
    prompt: "Abstract coral and blue light drifting across paper, macro, slow and calm",
    params: { aspect_ratio: "16:9", duration: 5, resolution: "720p", generate_audio: true },
    aspect_ratio: "16:9",
    resolution: "720p",
    duration_seconds: 5,
    result_url: "/dev-preview/wide.mp4",
    cost_usd: 0.55,
    actual_credits: 110,
    result_metadata: retry("Kie returned 500"),
    created_at: ago(500),
    completed_at: ago(380),
    user: people.two,
  }),
  gen({
    id: "g-audio-1",
    model: "suno",
    model_display_name: "Suno",
    media_type: "audio",
    status: "completed",
    prompt: "[Verse]\nMorning light on the window\nCoffee cooling on the sill",
    params: { settings: { title: "Window Light", style: "lo-fi acoustic, warm" } },
    duration_seconds: 124,
    result_url: "/dev-preview/tone.mp3",
    result_metadata: { additional_files: ["/dev-preview/tone.mp3"], provider: { tracks: [{ title: "Window Light", duration_seconds: 124 }, { title: "Window Light (take 2)", duration_seconds: 131 }] } },
    cost_usd: 0.06,
    created_at: ago(3000),
    completed_at: ago(2950),
    user: people.three,
  }),
  gen({
    id: "g-img-2",
    model: "gpt-image-2-5-flare",
    model_display_name: "GPT Image 2.5 Flare",
    media_type: "image",
    status: "completed",
    source: "api",
    prompt: "Geometric poster, concentric rings, coral on cream, Swiss style",
    params: { aspect_ratio: "1:1" },
    aspect_ratio: "1:1",
    result_url: art(800, 800, ["#ffe2db", "#111111", "#fd9b9b", "#f3efe8"], "rings"),
    cost_usd: 0.04,
    created_at: ago(4200),
    completed_at: ago(4180),
    user: people.bot,
  }),
  gen({
    id: "g-fail-1",
    model: "hailuo-h3",
    model_display_name: "Hailuo H3",
    media_type: "video",
    status: "failed",
    prompt: "A crowded stadium crowd chanting",
    params: { aspect_ratio: "16:9", duration: 6 },
    aspect_ratio: "16:9",
    error: "Content flagged by safety policy (sensitive content)",
    created_at: ago(5200),
    user: people.two,
  }),
  gen({
    id: "g-img-3",
    model: "seedream-5-pro",
    model_display_name: "Seedream 5 Pro",
    media_type: "image",
    status: "completed",
    prompt: "Studio product shot, two pastel boxes on a plinth, soft shadow, catalogue lighting",
    params: { aspect_ratio: "16:9" },
    aspect_ratio: "16:9",
    result_url: art(1280, 720, ["#dbe9f8", "#fd9b9b", "#ffffff", "#ffe2db"], "blocks"),
    cost_usd: 0.035,
    created_at: ago(6 * DAY + 600),
    completed_at: ago(6 * DAY),
  }),
  gen({
    id: "g-vid-2",
    model: "gemini-omni-1.1-flash",
    model_display_name: "Omni 1.1 Flash",
    media_type: "video",
    status: "completed",
    provider: "google",
    fallback_reason: "Kie stalled for 10 minutes",
    prompt: "Vertical clip, green and gold ink blooming in water, slow motion",
    params: { aspect_ratio: "9:16", duration: 4 },
    aspect_ratio: "9:16",
    duration_seconds: 4,
    result_url: "/dev-preview/tall.mp4",
    cost_usd: 0.4,
    created_at: ago(8000),
    completed_at: ago(7700),
  }),
  gen({
    id: "g-img-4",
    model: "nano-banana-2",
    model_display_name: "Nano Banana 2",
    media_type: "image",
    status: "completed",
    is_shared: false,
    prompt: "Tall moody landscape, deep green hills, pale sun, mist in the valley",
    params: { aspect_ratio: "9:16" },
    aspect_ratio: "9:16",
    result_url: art(720, 1280, ["#dff3e8", "#fbeed0", "#1f8a5b", "#9cc9ae"]),
    cost_usd: 0.06,
    created_at: ago(9000),
    completed_at: ago(8980),
  }),
  gen({
    id: "g-fail-2",
    model: "nano-banana-pro",
    model_display_name: "Nano Banana Pro",
    media_type: "image",
    status: "failed",
    prompt: "Isometric illustration of a tiny print shop",
    params: { aspect_ratio: "4:3" },
    aspect_ratio: "4:3",
    error: "Kie returned 500: internal server error",
    result_metadata: retry("Kie returned 500"),
    created_at: ago(700),
    user: people.three,
  }),
  gen({
    id: "g-img-5",
    model: "flux-2-pro",
    model_display_name: "Flux 2 Pro",
    media_type: "image",
    status: "completed",
    prompt: "Warm sunset over layered dunes, minimal, poster palette",
    params: { aspect_ratio: "4:3" },
    aspect_ratio: "4:3",
    result_url: art(1024, 768, ["#fbeed0", "#fd9b9b", "#b7791f", "#e8c79a"]),
    cost_usd: 0.05,
    created_at: ago(12000),
    completed_at: ago(11980),
    user: people.two,
  }),
  gen({
    id: "g-tts-1",
    model: "elevenlabs-v3",
    model_display_name: "ElevenLabs v3",
    media_type: "audio",
    status: "completed",
    provider: "elevenlabs",
    prompt: "Welcome back. Today we are making three short clips for the spring launch.",
    params: { settings: { voice: "v-warm" } },
    duration_seconds: 6,
    result_url: "/dev-preview/tone.mp3",
    cost_usd: 0.01,
    created_at: ago(14000),
    completed_at: ago(13990),
  }),
];

const libraryMedia: ApiMedia[] = [
  { id: "m1", user_id: "u-me", type: "image", filename: "hills.svg", storage_path: "", url: art(600, 800, ["#ffd9c9", "#fd9b9b", "#2f4f3a", "#8fb39a"]), file_size_bytes: 1, metadata: { width: 600, height: 800 }, generation_id: null, created_at: ago(100) },
  { id: "m2", user_id: "u-me", type: "image", filename: "rings.svg", storage_path: "", url: art(800, 800, ["#ffe2db", "#111111", "#fd9b9b", "#f3efe8"], "rings"), file_size_bytes: 1, metadata: { width: 800, height: 800 }, generation_id: null, created_at: ago(200) },
  { id: "m3", user_id: "u-me", type: "image", filename: "blocks.svg", storage_path: "", url: art(1280, 720, ["#dbe9f8", "#fd9b9b", "#ffffff", "#ffe2db"], "blocks"), file_size_bytes: 1, metadata: { width: 1280, height: 720 }, generation_id: null, created_at: ago(300) },
];

/** A head-and-shoulders figure for the character elements. */
function figure(bg: string, skin: string, top: string, hair: string, w = 600, h = 750) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/><path d="M${w * 0.14} ${h} C ${w * 0.16} ${h * 0.7}, ${w * 0.84} ${h * 0.7}, ${w * 0.86} ${h} Z" fill="${top}"/><rect x="${w * 0.44}" y="${h * 0.5}" width="${w * 0.12}" height="${h * 0.14}" fill="${skin}"/><ellipse cx="${w / 2}" cy="${h * 0.4}" rx="${w * 0.17}" ry="${h * 0.16}" fill="${skin}"/><path d="M${w * 0.32} ${h * 0.38} C ${w * 0.3} ${h * 0.18}, ${w * 0.7} ${h * 0.18}, ${w * 0.68} ${h * 0.38} C ${w * 0.62} ${h * 0.28}, ${w * 0.4} ${h * 0.28}, ${w * 0.32} ${h * 0.38} Z" fill="${hair}"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** A bottle on a plinth for the product elements. */
function bottle(bg: string, body: string, cap: string, w = 600, h = 600) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/><rect x="${w * 0.2}" y="${h * 0.78}" width="${w * 0.6}" height="${h * 0.1}" rx="8" fill="#111111" opacity="0.12"/><rect x="${w * 0.36}" y="${h * 0.3}" width="${w * 0.28}" height="${h * 0.5}" rx="${w * 0.05}" fill="${body}" stroke="#111111" stroke-width="6"/><rect x="${w * 0.43}" y="${h * 0.18}" width="${w * 0.14}" height="${h * 0.13}" rx="6" fill="${cap}" stroke="#111111" stroke-width="6"/><rect x="${w * 0.39}" y="${h * 0.46}" width="${w * 0.22}" height="${h * 0.14}" rx="4" fill="#ffffff" opacity="0.85"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const element = (o: Pick<ApiElement, "id" | "name" | "kind" | "image_urls"> & Partial<ApiElement>, by: (typeof people)[keyof typeof people], hoursAgo: number): ApiElement => {
  const cover_index = o.cover_index ?? 0;
  return { notes: null, cover_index, cover_url: o.image_urls[cover_index] ?? null, created_by: by.id, creator: by, created_at: ago(hoursAgo * 3600), updated_at: ago(hoursAgo * 3600), ...o };
};

/** The team's saved elements in the preview: a few of each kind, by different people. */
export const previewElements: ApiElement[] = [
  element(
    {
      id: "el-lead",
      name: "Lead presenter",
      kind: "character",
      notes: "Mid-thirties, short dark hair, coral knit top. Same face in every shot.",
      image_urls: [figure("#ffe2db", "#e8b796", "#fd9b9b", "#2b2118"), figure("#f3efe8", "#e8b796", "#fd9b9b", "#2b2118"), figure("#dbe9f8", "#e8b796", "#fd9b9b", "#2b2118")],
    },
    people.me,
    2,
  ),
  element({ id: "el-bottle", name: "Amber bottle", kind: "product", image_urls: [bottle("#fbeed0", "#d98a2b", "#111111"), bottle("#ffffff", "#d98a2b", "#111111")] }, people.two, 5),
  element({ id: "el-host", name: "Studio host", kind: "character", image_urls: [figure("#dff3e8", "#c98f6b", "#1f8a5b", "#5a3a22"), figure("#f3efe8", "#c98f6b", "#1f8a5b", "#5a3a22")] }, people.three, 9),
  element(
    { id: "el-loft", name: "Sunlit loft", kind: "location", cover_index: 1, image_urls: [art(800, 600, ["#fbeed0", "#fd9b9b", "#b7791f", "#e8c79a"], "blocks"), art(800, 600, ["#ffd9c9", "#fd9b9b", "#2f4f3a", "#8fb39a"])] },
    people.me,
    20,
  ),
  element({ id: "el-rings", name: "Poster rings", kind: "style", image_urls: [art(800, 800, ["#ffe2db", "#111111", "#fd9b9b", "#f3efe8"], "rings")] }, people.bot, 30),
  element({ id: "el-mint", name: "Mint tin", kind: "product", image_urls: [bottle("#dff3e8", "#9cc9ae", "#1f8a5b"), bottle("#f3efe8", "#9cc9ae", "#1f8a5b"), bottle("#dbe9f8", "#9cc9ae", "#1f8a5b"), bottle("#ffffff", "#9cc9ae", "#1f8a5b")] }, people.two, 48),
  element({ id: "el-dunes", name: "Dune field", kind: "location", image_urls: [art(1024, 768, ["#fbeed0", "#fd9b9b", "#b7791f", "#e8c79a"])] }, people.three, 72),
];

const page = <T,>(data: T[], p: number, limit: number): Paginated<T> => ({ data: data.slice((p - 1) * limit, p * limit), page: p, limit, total: data.length, has_more: p * limit < data.length });

/** A data source over the fixtures: filters, paging, delete and share work; nothing leaves the browser. */
export function previewData(): StudioData {
  let rows = [...previewGenerations];
  let elements = [...previewElements];
  const urlOf = (ref: string) => libraryMedia.find((m) => m.id === ref)?.url ?? ref;
  return {
    async listGenerations(q) {
      const f = (k: string) => q.get(k) ?? "";
      let list = rows.filter((g) => (!f("model") || g.model === f("model")) && (!f("media_type") || g.media_type === f("media_type")) && (!f("user_id") || g.user_id === f("user_id")));
      if (f("sort") === "oldest") list = [...list].reverse();
      if (f("sort") === "cost") list = [...list].sort((a, b) => Number(b.cost_usd ?? b.estimated_cost_usd ?? 0) - Number(a.cost_usd ?? a.estimated_cost_usd ?? 0));
      return page(list, Number(f("page") || 1), Number(f("limit") || 24));
    },
    async getGeneration(id) {
      const g = rows.find((r) => r.id === id);
      if (!g) throw new Error("Not found");
      return g;
    },
    async status(id) {
      const g = rows.find((r) => r.id === id);
      return { status: g?.status ?? "failed", retries: ((g?.result_metadata?.retries as unknown[] | undefined) ?? []).length };
    },
    async generate(body) {
      const jobs = Array.from({ length: body.variants }, (_, i) =>
        gen({
          id: `g-new-${Date.now()}-${i}`,
          model: body.model,
          model_display_name: body.model,
          media_type: "image",
          status: "queued",
          prompt: String(body.params.prompt ?? ""),
          params: body.params,
          is_shared: body.is_shared,
          created_at: new Date().toISOString(),
        }),
      );
      rows = [...jobs, ...rows];
      return { jobs };
    },
    async remove(id) {
      rows = rows.filter((r) => r.id !== id);
    },
    async setShared(id, isShared) {
      rows = rows.map((r) => (r.id === id ? { ...r, is_shared: isShared } : r));
      return rows.find((r) => r.id === id)!;
    },
    async getMedia(id) {
      const m = libraryMedia.find((x) => x.id === id);
      if (!m) throw new Error("Not in the preview library");
      return m;
    },
    async listMedia(type, source) {
      return page(libraryMedia.filter((m) => m.type === type && (source === "uploads" ? !m.generation_id : source === "generated" ? Boolean(m.generation_id) : true)), 1, 60);
    },
    async upload(file) {
      const type = file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image";
      const media: ApiMedia = { id: `m-${Date.now()}`, user_id: "u-me", type, filename: file.name, storage_path: "", url: URL.createObjectURL(file), file_size_bytes: file.size, metadata: null, generation_id: null, created_at: new Date().toISOString() };
      libraryMedia.unshift(media);
      return media;
    },
    async listElements() {
      return elements;
    },
    async createElement(input) {
      const image_urls = input.image_urls.map(urlOf);
      const now = new Date().toISOString();
      const cover_index = Math.min(input.cover_index ?? 0, image_urls.length - 1);
      const el: ApiElement = { id: `el-${Date.now()}`, name: input.name, kind: input.kind, notes: input.notes ?? null, image_urls, cover_index, cover_url: image_urls[cover_index] ?? null, created_by: people.me.id, creator: people.me, created_at: now, updated_at: now };
      elements = [el, ...elements];
      return el;
    },
    async updateElement(id, patch) {
      const cur = elements.find((e) => e.id === id);
      if (!cur) throw new Error("Not found");
      const image_urls = patch.image_urls ? patch.image_urls.map(urlOf) : cur.image_urls;
      const cover_index = Math.min(patch.cover_index ?? cur.cover_index, image_urls.length - 1);
      const next: ApiElement = { ...cur, ...patch, notes: patch.notes === undefined ? cur.notes : patch.notes, image_urls, cover_index, cover_url: image_urls[cover_index] ?? null, updated_at: new Date().toISOString() };
      elements = [next, ...elements.filter((e) => e.id !== id)];
      return next;
    },
    async deleteElement(id) {
      elements = elements.filter((e) => e.id !== id);
    },
  };
}

/** A composer draft with references attached and @mentions in the prompt (one of them missing). */
export function previewDraft(): Draft {
  // Absolute links, as real uploads are (the composer checks they're http(s)).
  const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
  return {
    modelId: "seedance-2-fast",
    prompt: "Make @image1 walk through the street from @video1 at dusk, wearing the jacket from @image3. Keep the camera low and steady.",
    byFamily: { "seedance-2": { aspectRatio: "9:16", duration: 8, resolution: "720p", variants: 2, generateAudio: true } },
    files: {
      refMode: "references",
      refImages: [
        { url: `${origin}/dev-preview/hills.svg`, name: "hills.svg", width: 600, height: 800 },
        { url: `${origin}/dev-preview/rings.svg`, name: "rings.svg", width: 800, height: 800 },
      ],
      refVideos: [{ url: `${origin}/dev-preview/wide.mp4`, name: "street.mp4", durationSeconds: 3 }],
    },
    filesAt: Date.now(),
  };
}
