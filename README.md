# Trenchable

An AI image, video and audio studio that runs on your own computer and uses your own [Kie.ai](https://kie.ai?ref=d63ec5bbbb733f26cd5d4ced27d29ee0) account.
One page, every model Kie offers, your results kept on your disk.

> Unofficial. Trenchable is not made by, endorsed by or connected with kie.ai or any model provider.

## What's in it

| Lane | What it does |
|---|---|
| **Image** | Text-to-image and image editing on every Kie image model, with references (`@Image 1`), saved characters (Elements) and per-model settings that are remembered |
| **Video** | Create Video (frames or references), Edit Video (edit, extend, upscale, lip-sync, reframe and more) and Motion Control |
| **GenShitSu** | Motion transfer (put your character through a clip's moves), Objects swap (replace a person, product or garment in a clip), styles that redraw every frame, and Guided swap (needs the local tools extra) |
| **Audio** | Voices, dialogue, music, voice isolation; Voice change and Translate for clips (need the voice extra) |
| **Edit** | Upscale, remove background, inpaint, reframe, relight, new camera angles |
| **Effects** · **Presets** | Ready-made recipes for images and clips |
| **Influencer** | Build a consistent AI character and make it move |
| **Marketing** · **Cinema** | Product-ad projects and a camera/lens/movement shot builder |
| **Canvas** · **Layers** | Chain one generation into the next; split an image into layers |
| **Assets** | Everything you made, searchable, with downloads and zips |
| **Advanced** | Every field of every model, Suno music, multi-step workflows, and Settings |

Every Generate button shows its price in Kie credits before you press it. Your credit balance is in the top-right corner;
click it to top up on Kie.

> The sign-up and top-up links (here and in the app) are a Kie.ai referral link from whoever shared Trenchable with you.

## Team edition

The `team/` folder holds **Trenchable Team**, the hosted multi-user version: one website on Vercel and Supabase where a
small team shares one Kie balance, one feed of results and a spend dashboard. Everything else on this page is about the
local app. For the team version see [`team/README.md`](team/README.md).

## What you need

- A **Kie.ai API key**: [sign up on Kie.ai](https://kie.ai?ref=d63ec5bbbb733f26cd5d4ced27d29ee0), add credits, copy your key from
  [kie.ai/api-key](https://kie.ai/api-key?ref=d63ec5bbbb733f26cd5d4ced27d29ee0). Generations are paid with your Kie credits.
- **Node.js** 20.19+ or 22.12+ (with npm): [nodejs.org](https://nodejs.org)
- **Bun** 1.2+ (runs the local server): [bun.sh](https://bun.sh)
- **ffmpeg** on your PATH, for downloads of edited clips, Voice change and the local tools
  (Windows: `winget install Gyan.FFmpeg` · macOS: `brew install ffmpeg` · Linux: your package manager)

Works on Windows, macOS and Linux.

## Install

```sh
git clone https://github.com/<you>/trenchable.git
cd trenchable
npm install
```

## Start

- **Windows:** double-click **`Start Trenchable.bat`**. Close its window to stop.
- **Any system:** `npm run dev`

Your browser opens at <http://localhost:5173>. The first time, paste your Kie API key in the banner at the top. It is
stored on this computer only, encrypted. You can change it later in **Advanced → Settings**.

## Where your things are kept

Everything stays inside the `data/` folder of this project: your history, downloaded copies of every result, your
elements and uploads, and the encrypted key. `data/` is in `.gitignore`, so it is never committed or shared. To move it,
see `.env.example`.

## Optional extras

Two groups of features need extra installs. Without them the app works fully; those buttons just say "not installed".

- **Local GPU tools** (free, on your graphics card): Remove Background, Depth Map, FPS Boost, SDR → HDR and the Guided
  swap guide. See [`extras/local-tools/README.md`](extras/local-tools/README.md).
- **Voice change and Translate** (transcription on your computer). See [`extras/voice/README.md`](extras/voice/README.md).
  Translating also needs an AI key (Gemini, OpenAI, Anthropic or xAI) in **Advanced → Settings → AI**.

## Safe by default

- The local server only listens on `127.0.0.1` and refuses requests from other websites, so nothing on the internet
  can reach it.
- Your Kie key never leaves the server side; the page never sees it.
- Nothing is sent anywhere except to Kie (and, if you add them, the AI providers you choose).

## Settings

Copy `.env.example` to `.env` to change ports, folders or add keys. Every setting is optional.

## Update

```sh
git pull
npm install
```

## Credits and licence

Trenchable is built on **KIE STUDIO** by ozekimasaki and its contributors
([github.com/ozekimasaki/kie_studio](https://github.com/ozekimasaki/kie_studio)), and is a modified version of it.
Like KIE STUDIO, it is free software under the **GNU General Public License v3.0 or later**: see [`LICENSE`](LICENSE)
and [`NOTICE.md`](NOTICE.md) for what was changed and the third-party parts.
