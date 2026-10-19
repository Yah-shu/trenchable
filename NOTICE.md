# Notice

## Trenchable is a modified version of KIE STUDIO

KIE STUDIO — Copyright (C) 2025 KIE STUDIO contributors — <https://github.com/ozekimasaki/kie_studio>
Trenchable — modifications Copyright (C) 2026 Trenchable contributors

Both are free software under the GNU General Public License, version 3 or (at your option) any later version. The
full licence is in [`LICENSE`](LICENSE), together with KIE STUDIO's notice that it is an unofficial fan-made tool, not
affiliated with kie.ai. That notice applies to Trenchable too.

### What Trenchable changed (first published October 2026)

- **New front end:** the generation studio in `board/` (Image, Video, Genjutsu, Audio, Edit, Effects, Presets,
  Influencer, Marketing, Cinema, Canvas, Layers, Assets), with its own page shell (`board/main.tsx`).
- **New server parts** for that studio in `server/studio/` (pricing, elements and projects, uploads, local tools,
  guided swap, voice change and translate), plus `server/lib/`.
- **English interface** over KIE STUDIO's Japanese one, applied at load time (`i18n/`).
- **New look** (`theme/`), also applied to KIE STUDIO's own screens, which appear as the **Advanced** lane
  (`advanced.html` → `src/`).
- **Removed:** the desktop (Electrobun) build, its installers and auto-update packaging, and the command-line tool.
- **Optional extras** in `extras/` (local GPU video tools, local transcription), installed by their own setup scripts.

## Third-party parts

### MIT-licensed code

**Genjustsu — Open Source Workflow** by Sirio Berati, <https://github.com/sirioberati/Genjustsu-Open-Source-Workflow>.
Trenchable's Guided swap (`server/studio/guided.ts`, `extras/local-tools/tools/guide.py`,
`extras/local-tools/tools/facemesh.py`) is a port of its guide-video logic.

**Uiverse.io components** by uiverse-astronaut, <https://uiverse.io> (button, field, card and check styles in
`theme/plinth.css`). Uiverse publishes its components under the MIT licence.

```
MIT License

Copyright (c) 2026 Sirio Berati

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The same MIT terms apply to the Uiverse components, copyright their author (uiverse-astronaut).

### Fonts

Inter and Space Grotesk, under the SIL Open Font License 1.1, installed from npm (Fontsource).

### Downloaded by the optional setup scripts, not included here

Video Depth Anything Small (Apache-2.0), SAM 2.1 Small (Apache-2.0), Practical-RIFE and the RIFE 4.25 weights (MIT),
MediaPipe Face Landmarker (Apache-2.0), and the transcription model and packages listed in `extras/voice/README.md`.
Each keeps its own licence; see the READMEs in `extras/`.

### Services

Kie.ai, and any AI provider you add a key for, have their own terms. Generated media is subject to the terms of the
model that made it.
