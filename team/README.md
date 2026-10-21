# Trenchable Team

A hosted AI image, video and voice studio for a small team. Everyone signs in to one website, uses one
[Kie.ai](https://kie.ai?ref=d63ec5bbbb733f26cd5d4ced27d29ee0) balance, and sees the same feed of results.
It runs on Vercel, keeps logins, records and files in Supabase, and generates through Kie.

> Unofficial. Trenchable Team is not made by, endorsed by or connected with kie.ai or any model provider.

- Setting it up: [SETUP.md](SETUP.md)
- Using it day to day (for editors): [EDITOR-GUIDE.md](EDITOR-GUIDE.md)

## Team or local?

This folder is the team edition of [Trenchable](https://github.com/Yah-shu/trenchable). The root of that repo is the
local, single-user app.

| | Trenchable (repo root) | Trenchable Team (`team/`) |
|---|---|---|
| Who uses it | One person | A small team, plus Claude or scripts |
| Where it runs | Your own computer | A website on Vercel |
| Kie key | Yours, stored encrypted on your disk | One team key, kept on the server |
| Results | In the `data/` folder on your disk | In Supabase, shared in one feed |
| Logins | None | Accounts made by an admin |
| Spend tracking | Credits shown before each run | Plus a Spend page by day, model and person |
| Lanes | Image, Video, GenShitSu, Audio, Edit, Effects, Canvas and more | One Studio with 28 models, plus Library, Spend and Team & API |
| Cost to run | Free (only Kie credits) | Kie credits, plus Supabase and Vercel plans |

Pick local Trenchable when it's just you on one PC. Pick Trenchable Team when several people should share one site,
one balance and one history, and you want to see who spent what.

## What's in it

The look is Plinth, the same as Trenchable. Across the top is a lane bar:

| Lane | Who sees it | What it does |
|---|---|---|
| **Studio** | Everyone | Make images, video, voice and music, and browse the team's results |
| **Library** | Everyone | Every uploaded file and every output, ready to reuse as a reference |
| **Spend** | Admins | Spend today, this week and this month; a 30-day chart; spend by model and by person |
| **Team & API** | Admins | Add editors and API bots, reset passwords, create and revoke API keys |

On the right of the bar is the team's **Kie credit balance**. It refreshes every minute and after each generation.
Click it to top up on Kie.

### The Studio

- **The feed.** A justified grid of the team's generations, newest first. Running jobs sit in the grid with a
  progress estimate and turn into results in place. Filter by model, type, person and date, sort by newest, oldest or
  cost, and change the tile size under **View**.
- **The composer.** It floats at the bottom of the page.
  - Attach references from your computer, the Library or Elements. Each one gets a name like `@image1`, `@video1` or
    `@audio1`, and those mentions are highlighted in the prompt.
  - The model menu has search, a Featured group, every model grouped by type, and a tier switch for families
    (for example Kling 3.0 Standard, Pro or 4K).
  - Pills for aspect ratio, resolution and duration show only what the chosen model supports.
  - Variants 1 to 4.
  - **Advanced** holds the negative prompt and seed (on models that take them) and **Share with the team**.
  - **Ctrl+Enter** (or **Cmd+Enter**) generates.
- **The price before you press.** Kie models show credits and dollars (for example `≈ 140 cr · $0.70`).
  ElevenLabs models show dollars.
- **Remembered settings.** The composer keeps your prompt and model across reloads, and each model family remembers its
  own aspect, resolution, duration, variants and settings. Attached files are kept for two days.
- **The viewer.** Click a result to open it. **←/→** step through the feed, **D** downloads, **Esc** closes.
  Buttons: Re-run, Load settings, Use as reference, Copy prompt, Make private / Share with team, and Delete.
- **Bulk select.** Tick tiles (Shift-click selects a range), then **Download zip** (original files, or images as WebP)
  or **Delete**.

### Elements

Saved characters, products, locations and styles, shared by the whole team. Each element has a name, optional notes and
1 to 12 pictures. Attach one in one click from the composer's **+ → Elements** tab and its pictures become references.
Anyone can use an element; only the person who made it, or an admin, can change or delete it.
API and MCP callers pass `element_id` (one id or a list) in the generate params.

### Library

Uploads and generated outputs in one place, filtered by type and source. Drop files anywhere on the page to upload.
Uploaded files are never deleted by the cleanup.

### Spend

Every job stores an estimate when it starts. When a Kie job finishes, the credits Kie actually charged are recorded and
used instead. Failed jobs don't count, because Kie doesn't charge for them.

### Team & API

- **Add someone:** email, name and role (Editor or Admin). The app makes a temporary password, shown once, for you to
  send privately. They choose their own at first sign-in. No email service is needed.
- **Add an API identity:** a bot user that can't sign in, for Claude or a script, so its work shows under its own name.
- **API keys:** each key acts as one user. Keys start with `tt_`, are shown once and can be revoked. Each key has a
  rolling 24-hour spend cap.

### Claude and the API

The same features are open to scripts through a REST API (`/api/generate`, `/api/generations`, `/api/media`,
`/api/elements`, `/api/models`, `/api/credits`) and to Claude through an MCP server at `/api/mcp`. Both take
`Authorization: Bearer tt_…`. Work done through a key lands in the feed and on the Spend page like anyone else's.

| MCP tool | What it does |
|---|---|
| `list_models` | Every model with its options, references and prices |
| `estimate_cost` | Check and price a request without spending, plus the key's remaining budget |
| `generate` | Start jobs; can wait up to 240 seconds for the results |
| `wait_for_generations` · `get_generations` | Follow jobs; failures come with a plain reason |
| `list_generations` | Recent results from the team feed |
| `import_media` · `list_media` | Copy a URL into the Library · browse the Library |
| `list_elements` | The team's saved elements |
| `get_budget` | What this key spent in the last 24 hours, and its cap |
| `get_credit_balance` | The team's Kie balance and the top-up page |
| `get_song_timing` | Word and line timings for a finished Suno song |

[SETUP.md](SETUP.md#7-connect-claude) shows how to connect Claude Code.

### Housekeeping

| Job | When | What it does |
|---|---|---|
| Retries | On every job | Temporary Kie errors (timeouts, 429, 500s, maintenance) are resent up to 2 times at submit and 2 more times after Kie accepts the job. A job with no result 60 minutes after its last submit is marked failed. |
| Kie callback | When a job finishes | Kie calls `/api/webhooks/kie` so jobs finish even with nobody watching. The call is only a hint; the job is re-checked with Kie. |
| `/api/cron/sync` | Daily, 07:00 UTC | Sweeps jobs nobody is polling and re-copies files that were still on Kie's host |
| `/api/cron/cleanup` | Daily, 08:00 UTC | Deletes generated files older than `RETENTION_DAYS` (default 7). The card, prompt, settings and cost stay. Uploads are never deleted. |

Both crons need `CRON_SECRET`. Outputs are copied into your own storage because Kie deletes its copies after about 14 days.

## Models

28 models, all defined in [`src/config/models.config.ts`](src/config/models.config.ts). The composer, price
estimates, request checks and the API all read that one file. Prices below are the list prices in that file, taken
from Kie in autumn 2026 (1 credit = $0.005). Check Kie's pricing page before trusting them.

### Image

| Model | Rough price |
|---|---|
| Nano Banana 2 Lite | $0.02 (1K only) |
| Nano Banana 2 | $0.04 at 1K, $0.06 at 2K, $0.09 at 4K |
| Nano Banana Pro | $0.09 at 1K or 2K, $0.12 at 4K |
| GPT Image 2 | $0.03 at 1K, $0.05 at 2K, $0.08 at 4K |
| GPT Image 2.5 (Flare, Sunburst) | Same as GPT Image 2; can make transparent cut-outs |
| Flux 2 Pro | $0.025 at 1K, $0.035 at 2K |
| Seedream 5 Lite | $0.0275 |
| Seedream 5 Pro | $0.035 at 1K, $0.07 at 2K, plus a little per extra input image |

### Video

| Model | Rough price |
|---|---|
| Hailuo H3 | $0.04/s at 768P, $0.065/s at 2K, plus $0.02 per input image. 6 s at 768P ≈ $0.24 |
| Kling 2.6 | $0.055/s, $0.11/s with sound |
| Kling 3.0 Standard / Pro / 4K | $0.07 / $0.09 / $0.335 per second; sound raises Standard to $0.10 and Pro to $0.135 |
| Seedance 2.0 Fast | $0.0585/s at 480p, $0.124/s at 720p |
| Seedance 2.0 Pro | $0.095/s at 480p, $0.205/s at 720p, $0.51/s at 1080p |
| Seedance 2.5 | $0.14/s at 480p, $0.315/s at 720p, $0.57/s at 1080p; up to 30 s |
| Gemini Omni Flash 1.1 | $0.315 to $0.63 per clip (4 to 10 s), $0.735 to $1.05 at 4K |
| Kling AI Avatar Standard / Pro | $0.04/s at 720p / $0.08/s at 1080p, as long as the audio |

Reference videos add to the price on Seedance and Omni Flash. The composer shows the new total as you add them.

### Audio

| Model | Rough price |
|---|---|
| Suno V6 | $0.06 per run, two takes each |
| ElevenLabs Voice (v3, Multilingual v2) | $0.10 per 1,000 characters |
| ElevenLabs Voice (Flash 2.5) | $0.05 per 1,000 characters |
| ElevenLabs Dialogue | $0.10 per 1,000 characters |

ElevenLabs runs direct on your own ElevenLabs account (needs `ELEVENLABS_API_KEY`), so every voice in your library,
clones included, appears in the picker. Those characters come out of your ElevenLabs plan, so the Spend page shows
the list price rather than what a subscriber really pays.

### Upscale

| Model | Rough price |
|---|---|
| Recraft Crisp Upscale | $0.0025 per image |
| Topaz Image Upscale | $0.05 at 2x, $0.10 at 4x |
| Topaz Video Upscale | $0.04/s at 2x, $0.07/s at 4x |

**Google backup.** Nano Banana Pro, 2, 2 Lite and Omni Flash can move to Google's own API when Kie rejects or fails a
job. It is off unless `GOOGLE_BACKUP=on` and a billed `GOOGLE_AI_API_KEY` are set. Slow jobs are never moved, since Kie
would still finish and bill them. Moved jobs show a **Backup** badge and Google's price.

## What it costs

| Thing | Cost |
|---|---|
| Kie.ai | Pay as you go with prepaid credits. Roughly 2 to 12 cents an image, 25 cents to about a dollar for a short clip. Failed jobs are free. |
| Supabase | Free to start: 1 GB of files and 5 GB of downloads a month. Pro is $25/month for 100 GB and 250 GB. An output is about 6 MB, so the cleanup matters. |
| Vercel | Hobby is free but meant for non-commercial use. Pro is $20/month and is the right plan for a business. Both run the daily crons. |
| ElevenLabs | Optional. Uses your existing plan's characters. |
| Google AI key | Optional backup, off by default. |

## Who can do what

- **No public sign-up.** Sign-ups are switched off in Supabase; only admins create accounts.
- **Editors** generate, upload, use Elements, and see their own work plus anything shared. They can make their own
  results private or shared and delete their own work. They don't see Spend or Team & API.
- **Admins** see everything, private results included, and can delete anything.
- **Row-level security** in Postgres enforces those rules for every table. Nobody can change their own role, and the
  `generations` storage bucket is written only by the server.
- **API keys** are stored as an HMAC-SHA256 hash with your `API_SECRET_SALT`, so a leaked database row is useless
  without the salt. The key itself is shown once.
- **Spend caps.** Each API key can spend at most `API_DAILY_SPEND_CAP_USD` (default $500) in any 24 hours. A request
  that would pass the cap is refused before anything is sent. People using the website aren't capped.
- **Secrets stay on the server.** The Kie, ElevenLabs, Google and Supabase secret keys never reach the browser. The cron
  routes refuse calls without `CRON_SECRET`.
- **File links.** Stored files sit in public buckets under random ids, because Kie must be able to fetch references by
  URL. Anyone given a file's link can open it; links can't be guessed.

## Changing models

Edit `src/config/models.config.ts`, then run `npm test`. The tests check that every option has a price, every default
is valid and every Kie model has an input mapping. Kie prices are written in credits with `cr(…)`. Each model's input
fields are on its page at docs.kie.ai.

## Folder map

| Path | What it is |
|---|---|
| `src/app/` | Pages and API routes |
| `src/components/` | The Studio, Library, Spend and Team screens |
| `src/config/models.config.ts` | Every model, option and price |
| `src/providers/` | Kie, ElevenLabs and Google connections, retries and routing |
| `supabase/migrations/` | Database setup, run in filename order |
| `scripts/` | Admin and repair scripts, and the tests |
| `connect-claude-mcp.sh` | Connects Claude Code to your site |
| `vercel.json` | The two daily crons |

## Credits and licence

Trenchable Team is part of Trenchable and shares its licence, the **GNU General Public License v3.0 or later**. See
`LICENSE` and `NOTICE.md` at the root of the repo.

> The sign-up and top-up links here and in the app are a Kie.ai referral link from whoever shared Trenchable with you.
