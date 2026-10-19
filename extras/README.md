# Extras (optional)

Everything in the app runs on a Kie.ai API key. Two groups of features also need software on your own computer.
They are optional. Until you install them, those buttons show "not installed" and everything else works.

| Extra | What it unlocks in the app | Needs | Setup guide |
|---|---|---|---|
| **Local tools** (`local-tools/`) | Remove BG, Depth Map, FPS Boost, SDR → HDR, and the guide video for the Guided swap | A graphics card is best (NVIDIA, AMD or Apple Silicon); processor-only works but is slow. 3 to 20 GB of disk, depending on the card. ffmpeg. | [local-tools/README.md](local-tools/README.md) |
| **Voice** (`voice/`) | Voice change and Translate (the step that writes down what is said, and when) | Any computer; runs on the processor. About 1.5 GB of disk. | [voice/README.md](voice/README.md) |

Both run free, on your computer, and use no Kie credits.

## Quick start

1. Install **Python 3.12** and **ffmpeg** (each guide shows the one-line command for your system).
2. Open a terminal in the extra's folder and run its setup:
   - Windows: `powershell -ExecutionPolicy Bypass -File setup.ps1`
   - Mac / Linux: `bash setup.sh`
3. Restart the app.

Add `-DryRun` (Windows) or `--dry-run` (Mac / Linux) to see every step first without changing anything.
Setup is safe to run again: it skips what is already done.

## Where the app looks

| Extra | Default folder | Or set this environment variable to the full path |
|---|---|---|
| Local tools | `extras/local-tools` | `TRENCHABLE_TOOLS` |
| Voice | `extras/voice` | `TRENCHABLE_VOICE` |

Each folder keeps everything it downloads inside itself (`venv/`, `models/`, `repos/`, `cache/`). These folders are
in `.gitignore`. To remove an extra, delete what setup made in its folder.
