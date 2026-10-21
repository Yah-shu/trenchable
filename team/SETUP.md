# Setting up Trenchable Team

This takes you from the repo to a live site with you as admin. Plan on about an hour, much of it waiting. Do the
steps in order: later ones need values from earlier ones.

You end up with:

- A private website on Vercel, for example `https://your-team.vercel.app`.
- A Supabase project holding the logins, the records and every file.
- You as admin, adding editors yourself with temporary passwords.

Easiest route: open the `team/` folder in [Claude Code](https://claude.com/claude-code) and say *"Set this up for me,
following SETUP.md."* It can run the commands for you. Never paste secret keys into a chat, an email or Slack.

## What you need

| Service | What it's for | Cost to start |
|---|---|---|
| [GitHub](https://github.com) | Holds your copy of the code so Vercel can deploy it | Free |
| [Supabase](https://supabase.com) | Database, logins and file storage | Free; Pro $25/month later |
| [Vercel](https://vercel.com) | Runs the website | Hobby free; Pro $20/month for business use |
| [Kie.ai](https://kie.ai?ref=d63ec5bbbb733f26cd5d4ced27d29ee0) | Runs every model except ElevenLabs | Prepaid credits |
| [ElevenLabs](https://elevenlabs.io) | Voiceovers and dialogue | Optional; your existing plan |
| [Google AI Studio](https://aistudio.google.com) | Backup for Nano Banana and Omni Flash | Optional; pay as you go |

On your computer: **Node.js 20.9 or newer** with npm ([nodejs.org](https://nodejs.org)) and **git**. Check with
`node -v`.

Keep a notes file open, ideally in a password manager. You will collect about eight keys and addresses.

## 1. Collect your keys

### Kie.ai

1. [Sign up on Kie.ai](https://kie.ai?ref=d63ec5bbbb733f26cd5d4ced27d29ee0) and add credits. $10 to $25 is plenty to
   test with.
2. Copy your key from [kie.ai/api-key](https://kie.ai/api-key?ref=d63ec5bbbb733f26cd5d4ced27d29ee0). Save it as
   `KIE_API_KEY`.
3. If Kie lets you set a spending limit on the key, set one, so a mistake can't empty the balance.

### ElevenLabs (optional, for voice)

1. Open [Settings → API Keys](https://elevenlabs.io/app/settings/api-keys) and create a key. Give it a credit limit so
   the app can only use part of your monthly allowance.
2. Save it as `ELEVENLABS_API_KEY`.

Without it the ElevenLabs models can't run. Everything else works.

### Google (optional backup)

1. At [aistudio.google.com/apikey](https://aistudio.google.com/apikey), create a key. Save it as `GOOGLE_AI_API_KEY`.
2. Turn on billing for the Google Cloud project behind it. Omni Flash only works on the paid tier.
3. Leave `GOOGLE_BACKUP` empty for now. Set it to `on` only once billing works; otherwise Google refuses every backup
   job.

### Two random secrets

Run this twice and save the results as `API_SECRET_SALT` and `CRON_SECRET`:

```sh
openssl rand -hex 32
```

No `openssl`? `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` does the same.

`API_SECRET_SALT` protects API keys. Never change it once keys exist, or every key stops working.

## 2. Supabase

### Create the project

1. At [supabase.com/dashboard](https://supabase.com/dashboard), click **New project**.
2. Pick a US East region; Vercel's default servers are there. Set a strong database password and save it.
3. Wait a couple of minutes for it to start.

### Create the database

Run the four files in `supabase/migrations/` **in filename order**. In the dashboard: **SQL Editor → New query**, paste
the whole file, click **Run**, and expect "Success. No rows returned". Use a new query for each file.

| Order | File | What it adds |
|---|---|---|
| 1 | `20260914000000_init.sql` | Tables for profiles, API keys, generations and media; row-level security; the new-user trigger; the `media` and `generations` storage buckets; the `spend_stats()` function |
| 2 | `20260914120000_kie_provider.sql` | Kie as a provider, and backup tracking columns |
| 3 | `20260926000000_elevenlabs_provider.sql` | ElevenLabs as a provider |
| 4 | `20261021000000_elements.sql` | The `elements` table and its rules, and a column for the credits Kie actually charged |

With the Supabase CLI linked to the project, `supabase db push` runs them all instead.

The storage buckets are created by the first file. There is nothing to set up by hand under **Storage**.

### Copy the keys

Under **Project Settings → API Keys**:

| Supabase shows | Save it as |
|---|---|
| Project URL, like `https://abcd1234.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| Publishable key (`sb_publishable_…`), or the older anon key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| Secret key (`sb_secret_…`), or the older service_role key | `SUPABASE_SERVICE_ROLE_KEY` |

The secret key can read and change everything. Treat it like a bank password.

### Close public sign-up

**Authentication → Sign In / Providers → Email:** turn off **Allow new users to sign up**. Only admins create
accounts.

## 3. Try it on your computer

This catches typos before anything goes live.

```sh
cd team
npm install
cp .env.example .env.local
```

Fill in `.env.local`: each value right after the `=`, with no spaces, quotes or comments on the same line. Leave
`NEXT_PUBLIC_APP_URL` empty. The file never leaves your computer; it is in `.gitignore`.

Create your admin account. It asks for a password of at least 10 characters:

```sh
npm run create-admin -- you@example.com "Your Name"
```

Then start the app:

```sh
npm run dev
```

Open <http://localhost:3000>, sign in, pick **Nano Banana 2 Lite**, type a prompt and press **Ctrl+Enter**. It costs
about 2 cents. An image within about 30 seconds means Kie and Supabase both work. Press **Ctrl+C** to stop.

Kie can't call back to your computer, so locally the page simply polls for results.

## 4. Deploy on Vercel

1. Put the repo on GitHub (your own fork or copy of Trenchable).
2. At [vercel.com/new](https://vercel.com/new), import it.
3. Set **Root Directory** to `team`. Vercel then finds the Next.js app. This step matters: the repo root is the local
   app.
4. Open **Environment Variables** and add the values below. Shortcut: paste the whole of `.env.local` into the first
   **Name** box and Vercel splits it up. Then delete any variable left empty.
5. Click **Deploy** and wait two or three minutes. Note the address on the success screen.

| Name | Needed? | What it does |
|---|---|---|
| `KIE_API_KEY` | Yes | Runs every Kie model, paid from your Kie credits |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Publishable key, for sign-in |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Secret key, used only on the server |
| `API_SECRET_SALT` | Yes | Hashes API keys. Never change it after keys exist |
| `CRON_SECRET` | Yes | Lets the daily crons run. Without it nothing is swept or cleaned up |
| `ELEVENLABS_API_KEY` | For voice | ElevenLabs Voice and Dialogue, with your own voice library |
| `GOOGLE_AI_API_KEY` | Optional | The Google backup key |
| `GOOGLE_BACKUP` | Optional | `on` sends failed Nano Banana and Omni Flash jobs to Google. Empty = off |
| `NEXT_PUBLIC_APP_URL` | Custom domain only | Your site's address. On Vercel's own address it is detected |
| `SPEND_TIMEZONE` | Optional | Day boundaries on the Spend page. Default `America/New_York` |
| `API_DAILY_SPEND_CAP_USD` | Optional | Most each API key can spend in 24 hours. Empty = 500; `off` = no limit |
| `RETENTION_DAYS` | Optional | Days generated files are kept. Empty = 7; `off` keeps everything |

### Crons

`vercel.json` already schedules two daily jobs, and Vercel picks them up on deploy:

| Path | Schedule (UTC) | Job |
|---|---|---|
| `/api/cron/sync` | 07:00 | Finish jobs nobody is watching; re-copy files still on Kie's host |
| `/api/cron/cleanup` | 08:00 | Delete generated files older than `RETENTION_DAYS` |

Vercel sends `CRON_SECRET` with each call. If the variable is missing the routes answer 401 and do nothing. Both plans
run daily crons.

### Kie callback

Nothing to set. Each Kie job is sent with a callback to `https://<your site>/api/webhooks/kie`, built from the site
address. If you use a custom domain, set `NEXT_PUBLIC_APP_URL` so the callback points there.

### Custom domain (optional)

1. Add the domain under **Settings → Domains** in Vercel.
2. Set `NEXT_PUBLIC_APP_URL` to it, for example `https://studio.example.com`.
3. Redeploy: **Deployments → ⋯ → Redeploy**.

## 5. Check the live site

1. Sign in with the admin account from step 3. It is the same Supabase project, so it already exists.
2. Make a **Nano Banana 2 Lite** image.
3. Make a **Hailuo H3** video at 768P, 6 seconds, about $0.24. Video takes one to five minutes.
4. Open **Spend**. Both jobs are listed.
5. The credit balance shows on the right of the lane bar.

## 6. Add your team

1. Open **Team & API**. Only admins see it.
2. Under **Add someone**, enter the email and name, choose **Editor** or **Admin**, and create the account.
3. A box shows a temporary password and a ready-made message. Send it privately. It is shown only once.
4. They sign in, choose their own password, and land in the Studio. A **Temp password** tag shows who hasn't yet.
5. Send them [EDITOR-GUIDE.md](EDITOR-GUIDE.md).

| Task | How |
|---|---|
| Someone forgot their password | **Reset password** next to their name gives a new temporary one |
| Change your own password | The key icon in the lane bar |
| You, the admin, are locked out | On your computer: `npm run set-password -- you@example.com` |
| Make someone an admin | Change their role on **Team & API**, or `npm run create-admin -- their@email.com` |
| Remove someone | **Deactivate**. They are signed out at once; their past work and spend stay |

There is no reset-by-email. Supabase can send those if you set up custom SMTP and point its recovery link at
`/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/set-password`; the app already handles that link.

## 7. Connect Claude

Claude Code can then generate for you, and everything it makes shows in the feed and on Spend.

1. On **Team & API**, under **Add an API identity**, add one named "Claude" so its work shows under that name.
2. Under **API keys**, choose that bot in **Acts as**, give the key a label and create it. Copy the key (it starts with
   `tt_`). It is shown once.
3. Add the server to Claude Code:

   ```sh
   claude mcp add --transport http --scope user trenchable-team https://your-team.vercel.app/api/mcp --header "Authorization: Bearer tt_…"
   ```

   Or, from the `team/` folder, run `bash connect-claude-mcp.sh https://your-team.vercel.app`. It asks for the key
   without showing it, checks it against your site, and writes `.mcp.json` in the current folder.
4. Start a new Claude Code session and run `/mcp` to see that `trenchable-team` is connected. Then try *"use
   trenchable-team to list the models"*.

Clients that only speak stdio can use
`npx -y mcp-remote https://your-team.vercel.app/api/mcp --header "Authorization: Bearer tt_…"`. Connectors that need
OAuth, such as custom connectors on claude.ai, aren't supported.

Each key can spend `API_DAILY_SPEND_CAP_USD` (default $500) in any 24 hours; failed jobs don't count. To cut Claude
off, revoke its key.

## Local development

```sh
cd team
npm install
cp .env.example .env.local   # then fill it in
npm run dev                  # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` · `npm start` | Production build, and serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | Route types plus TypeScript |
| `npm test` | Model config, pricing, Kie adapter, routing, mentions, elements and more |
| `npm run create-admin -- <email> "<name>"` | Create the first admin, or promote someone |
| `npm run set-password -- <email>` | Set any account's password |

**Preview pages.** In development only, <http://localhost:3000/dev-preview> lists the Studio, Library, Spend, Team &
API, sign-in and set-password screens filled with sample data. They need no Supabase and no keys, and they return 404
in a production build.

**Repair scripts**, for rare storage problems. Both read `.env.local`:

- `node --env-file=.env.local scripts/recopy-provider-urls.mjs --days=3` copies finished files that never reached your
  storage.
- `node --env-file=.env.local scripts/repair-truncated.mjs` lists stored images that were cut short; add `--apply` to
  fetch them again from Kie (Kie keeps its copies about 14 days).

## Updating

1. Pull the new code into your copy and push it to GitHub. Vercel redeploys in about two minutes.
2. If the update adds files to `supabase/migrations/`, run only the new ones in the SQL Editor, in filename order. The
   elements file is safe to run more than once.
3. If the update lists new environment variables, add them in Vercel and redeploy.

## Troubleshooting

| Problem | Fix |
|---|---|
| `npm: command not found` | Install Node.js from nodejs.org, then open a new terminal |
| `Missing required environment variable: …` | Add it to `.env.local` locally, or in Vercel and redeploy |
| The Vercel build can't find a Next.js app | **Root Directory** must be `team` |
| An editor can't sign in | Check the email matches exactly. Then **Reset password** and send the new one |
| "Someone with that email already has an account" | They are already listed. Use **Reset password** |
| The credit balance isn't showing | Kie couldn't be reached or `KIE_API_KEY` is wrong. It hides itself rather than show a wrong number |
| Jobs fail with "Kie 401" | Wrong `KIE_API_KEY` |
| Jobs fail with "out of credits" or "Kie 402" | Top up on Kie |
| Jobs fail with "Kie 429" | Too many at once. Wait a moment |
| "Couldn't load your ElevenLabs voices" | `ELEVENLABS_API_KEY` is missing or wrong |
| Elements give a database error about `elements` | Run `20261021000000_elements.sql` |
| Old files are never removed, or idle jobs never finish | `CRON_SECRET` is missing in Vercel |
| Every API key stopped working | `API_SECRET_SALT` was changed. Put the old value back, or make new keys |
| Claude says the server refused the key | The key was revoked, or the address is wrong. It must end in `/api/mcp` |
| A **Backup** badge on a card | `GOOGLE_BACKUP=on`, and Kie failed that job, so Google ran it. Hover for the reason |
| Anything else | In Vercel open the project's **Logs** and find the red error |
