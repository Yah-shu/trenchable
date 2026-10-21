/** Sample data for the dev-only previews. Nothing here is real. */
import type { SpendStats } from "@/components/admin/spend-dashboard";
import type { ApiKeyRow, TeamMember } from "@/components/admin/team-manager";
import type { ApiMedia } from "@/lib/client-api";
import type { Profile } from "@/lib/types";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

export const PREVIEW_ADMIN: Profile = {
  id: "00000000-0000-4000-8000-000000000001",
  email: "admin@example.com",
  display_name: "Team Admin",
  role: "admin",
  avatar_url: null,
  is_bot: false,
  created_at: ago(24 * 90),
};

export const PREVIEW_CREDITS = { credits: 48_250, topUpUrl: "https://kie.ai/" };

/** Flat placeholder artwork in the Plinth colours, so the grid has something to show without a network. */
function art(bg: string, fg: string, shape: "circle" | "square" | "wave" | "stack", w = 600, h = 600) {
  const body =
    shape === "circle"
      ? `<circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 4}" fill="${fg}" stroke="#111" stroke-width="8"/>`
      : shape === "square"
        ? `<rect x="${w / 4}" y="${h / 4}" width="${w / 2}" height="${h / 2}" rx="36" fill="${fg}" stroke="#111" stroke-width="8"/>`
        : shape === "wave"
          ? `<path d="M0 ${h * 0.6} C ${w * 0.25} ${h * 0.4}, ${w * 0.5} ${h * 0.8}, ${w} ${h * 0.55} V ${h} H 0 Z" fill="${fg}" stroke="#111" stroke-width="8"/>`
          : `<rect x="${w * 0.22}" y="${h * 0.42}" width="${w * 0.56}" height="${h * 0.3}" rx="28" fill="#111"/><rect x="${w * 0.22}" y="${h * 0.34}" width="${w * 0.56}" height="${h * 0.3}" rx="28" fill="${fg}" stroke="#111" stroke-width="8"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${bg}"/>${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const user = (p: Profile) => ({ id: p.id, display_name: p.display_name, avatar_url: p.avatar_url, is_bot: p.is_bot });

export const PREVIEW_MEMBERS: TeamMember[] = [
  { ...PREVIEW_ADMIN, last_sign_in_at: ago(1), temp_password: false, deactivated: false },
  {
    id: "00000000-0000-4000-8000-000000000002",
    email: "design@example.com",
    display_name: "Design Editor",
    role: "editor",
    avatar_url: null,
    is_bot: false,
    created_at: ago(24 * 40),
    last_sign_in_at: ago(26),
    temp_password: false,
    deactivated: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    email: "motion@example.com",
    display_name: "Motion Editor",
    role: "editor",
    avatar_url: null,
    is_bot: false,
    created_at: ago(24 * 2),
    last_sign_in_at: null,
    temp_password: true,
    deactivated: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000004",
    email: "bot@example.invalid",
    display_name: "Script Bot",
    role: "editor",
    avatar_url: null,
    is_bot: true,
    created_at: ago(24 * 30),
    last_sign_in_at: null,
    temp_password: false,
    deactivated: false,
  },
  {
    id: "00000000-0000-4000-8000-000000000005",
    email: "former@example.com",
    display_name: "Former Editor",
    role: "editor",
    avatar_url: null,
    is_bot: false,
    created_at: ago(24 * 200),
    last_sign_in_at: ago(24 * 60),
    temp_password: false,
    deactivated: true,
  },
];

export const PREVIEW_KEYS: ApiKeyRow[] = [
  { id: "k1", user_id: PREVIEW_MEMBERS[3].id, key_prefix: "tt_a1b2c3", label: "Desktop MCP", last_used_at: ago(3), revoked_at: null, created_at: ago(24 * 20) },
  { id: "k2", user_id: PREVIEW_ADMIN.id, key_prefix: "tt_d4e5f6", label: "Nightly batch script", last_used_at: ago(30), revoked_at: null, created_at: ago(24 * 12) },
  { id: "k3", user_id: PREVIEW_ADMIN.id, key_prefix: "tt_778899", label: "Old laptop", last_used_at: ago(24 * 45), revoked_at: ago(24 * 40), created_at: ago(24 * 100) },
];

const DAILY = [
  1.2, 0.8, 2.6, 3.1, 1.9, 0.4, 0.6, 4.8, 5.2, 3.9, 2.2, 6.1, 1.1, 0.9, 3.3, 7.4, 6.8, 4.1, 2.0, 1.4, 5.6, 8.9, 7.2, 3.4, 2.9, 1.8, 4.4, 6.3, 5.1, 3.7,
];

export const PREVIEW_SPEND: SpendStats = {
  today: 3.7,
  week: 27.5,
  month: 115.3,
  all_time: 1284.62,
  count_all: 3412,
  by_model: [
    { model: "video-a", name: "Video model A", spend: 52.4, count: 61 },
    { model: "image-a", name: "Image model A", spend: 31.2, count: 820 },
    { model: "video-b", name: "Video model B", spend: 18.9, count: 22 },
    { model: "voice-a", name: "Voice model", spend: 8.1, count: 140 },
    { model: "upscale", name: "Upscaler", spend: 4.7, count: 95 },
  ],
  by_user: [
    { user_id: PREVIEW_MEMBERS[1].id, name: "Design Editor", spend: 61.3, count: 512 },
    { user_id: PREVIEW_ADMIN.id, name: "Team Admin", spend: 33.8, count: 301 },
    { user_id: PREVIEW_MEMBERS[3].id, name: "Script Bot", spend: 20.2, count: 325 },
  ],
  daily: DAILY.map((spend, i) => ({
    day: new Date(NOW - (DAILY.length - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    spend,
    count: Math.round(spend * 9),
  })),
};

const ART: [string, string, "circle" | "square" | "wave" | "stack"][] = [
  ["#ffe2db", "#fd9b9b", "circle"],
  ["#faf7f2", "#dbe9f8", "square"],
  ["#dff3e8", "#fbeed0", "wave"],
  ["#f3efe8", "#fd9b9b", "stack"],
  ["#dbe9f8", "#ffffff", "circle"],
  ["#fbeed0", "#ffe2db", "wave"],
  ["#ffffff", "#dff3e8", "square"],
  ["#fde0dc", "#faf7f2", "stack"],
];

export const PREVIEW_MEDIA: ApiMedia[] = [
  ...ART.map(([bg, fg, shape], i) => ({
    id: `m-img-${i}`,
    user_id: i % 2 ? PREVIEW_MEMBERS[1].id : PREVIEW_ADMIN.id,
    type: "image" as const,
    filename: [`hero-shot-0${i + 1}.png`, `moodboard-${i + 1}.jpg`, `packshot-${i + 1}.webp`, `scene-${i + 1}.png`][i % 4],
    storage_path: `preview/${i}.png`,
    url: art(bg, fg, shape),
    file_size_bytes: 1_200_000 + i * 310_000,
    metadata: { width: 1024, height: 1024, mime_type: "image/png" },
    generation_id: i % 3 === 0 ? null : `g-${i}`,
    created_at: ago(i * 5 + 1),
    user: user(i % 2 ? (PREVIEW_MEMBERS[1] as Profile) : PREVIEW_ADMIN),
  })),
  {
    id: "m-vid-1",
    user_id: PREVIEW_MEMBERS[3].id,
    type: "video",
    filename: "loop-take-3.mp4",
    storage_path: "preview/loop.mp4",
    url: "/dev-preview-missing.mp4",
    file_size_bytes: 6_400_000,
    metadata: { width: 1080, height: 1920, duration_seconds: 8 },
    generation_id: "g-v1",
    created_at: ago(9),
    user: user(PREVIEW_MEMBERS[3] as Profile),
  },
  {
    id: "m-aud-1",
    user_id: PREVIEW_ADMIN.id,
    type: "audio",
    filename: "voiceover-take-2.mp3",
    storage_path: "preview/vo.mp3",
    url: "/dev-preview-missing.mp3",
    file_size_bytes: 820_000,
    metadata: { duration_seconds: 14.6, mime_type: "audio/mpeg" },
    generation_id: "g-a1",
    created_at: ago(12),
    user: user(PREVIEW_ADMIN),
  },
  {
    id: "m-aud-2",
    user_id: PREVIEW_MEMBERS[1].id,
    type: "audio",
    filename: "music-bed.wav",
    storage_path: "preview/bed.wav",
    url: "/dev-preview-missing.wav",
    file_size_bytes: 4_100_000,
    metadata: { duration_seconds: 30, mime_type: "audio/wav" },
    generation_id: null,
    created_at: ago(40),
    user: user(PREVIEW_MEMBERS[1] as Profile),
  },
];
