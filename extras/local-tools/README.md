# Local tools (optional)

These tools run on your own computer, mostly on the graphics card. They cost no Kie credits.
Without them the app works as normal. These buttons just show "not installed".

| In the app | What it does | Tool scripts |
|---|---|---|
| **Remove BG** | Cuts a person or object out of a video. You click on it once. You get a transparent video and a green-screen video. | `frame.py`, `segment.py` |
| **Depth Map** | Turns a video into a coloured depth video (near = warm, far = cool). | `depth.py` |
| **FPS Boost** | Makes new in-between frames, for example 30 fps to 60 fps. | `rife.py` |
| **SDR → HDR** | Converts a normal video to HDR10. No AI model, just maths and ffmpeg. | `hdr.py` |
| **Guided swap guide** | Builds the guide video for a motion transfer: depth-coloured subject, face outline and pitched voice. | `audio.py`, `depth.py`, `segment.py`, `facemesh.py`, `guide.py` |

## What you need

- **A graphics card is best.** NVIDIA (RTX 20-series or newer is easiest), AMD (RX 6000, 7000 or 9000 series), or an
  Apple Silicon Mac (M1 or newer). Without one the tools still run on the processor, but much more slowly.
- **Graphics memory:** Depth Map used about 8 GB in our test. Remove BG used about 3 GB and FPS Boost under 1 GB.
  A card with less memory may run out on Depth Map.
- **Memory (RAM):** 16 GB is comfortable. A tool will not start if less than 3 GB is free. It stops itself if free
  memory drops under 2.5 GB, so your computer does not freeze.
- **Disk space:** the model files are about 330 MB and the model code about 140 MB. Python and PyTorch take the most:

  | Your setup | Free space to plan for |
  |---|---|
  | NVIDIA | about 9 GB |
  | AMD on Windows | about 6 GB |
  | AMD on Linux | about 20 GB (AMD's Linux PyTorch download alone is 6 GB) |
  | Processor only, or a Mac | about 3 GB |

- **Python 3.12** (3.10 and 3.11 also work, except AMD on Windows, which needs 3.12). Get it from python.org,
  or: `winget install Python.Python.3.12` (Windows), `brew install python@3.12` (Mac),
  `sudo apt install python3.12 python3.12-venv` (Ubuntu 24.04).
- **git** is used to fetch the model code. If it is missing, setup downloads zip files from GitHub instead.
- **ffmpeg**, see below.

How fast is it? Times on an AMD RX 6000-series card, for each second of video:

| Tool | Seconds per second of video | Notes |
|---|---|---|
| Depth Map | about 5 | the first run is slower (one-time warm-up) |
| Remove BG | about 7 | one click on the subject |
| FPS Boost (30 → 60 fps) | about 2 | |
| SDR → HDR | about 3 | runs on the processor |
| Guided swap guide | about 1 to 1.5 | after depth and Remove BG; processor |

A newer NVIDIA card is usually faster. The processor-only setup is many times slower.

## Step 1: install ffmpeg

Every tool uses ffmpeg. SDR → HDR also needs its `zscale` filter and the `libx265` encoder. The pitch shift in the
Guided swap guide needs `rubberband`. Remove BG needs `libvpx-vp9`. The full builds below have all of them.

| System | Command |
|---|---|
| Windows | `winget install Gyan.FFmpeg` (the full build), then open a new terminal |
| Mac | `brew install ffmpeg` |
| Ubuntu / Debian | `sudo apt install ffmpeg` |
| Fedora | `sudo dnf install ffmpeg` (needs RPM Fusion) |

Setup checks ffmpeg and tells you if something is missing. It does not install ffmpeg for you.

## Step 2: run setup

Open a terminal in this folder (`extras/local-tools`).

**Windows** (PowerShell):

```
powershell -ExecutionPolicy Bypass -File setup.ps1
```

**Mac or Linux:**

```
bash setup.sh
```

Setup picks your graphics card by itself and tells you what it chose. It creates `venv/`, installs PyTorch and the
other packages, fetches the model code into `repos/` and the model files into `models/`. Every file is checked by
size and checksum. At the end it runs a quick check.

It is safe to run again. Finished steps are skipped. A download that broke off carries on where it stopped.

To see the plan first, without changing anything: add `-DryRun` (Windows) or `--dry-run` (Mac/Linux).

### Options

| Windows | Mac / Linux | What it does |
|---|---|---|
| `-Gpu nvidia\|amd\|cpu` | `--gpu nvidia\|amd\|cpu` | Choose the graphics card yourself (default: auto). On a Mac it is always the Apple GPU. |
| `-AmdTarget gfx1100` | (not needed) | AMD on Windows: your chip name, when setup cannot tell (see the table below). |
| `-TorchIndex <url or folder>` | `--torch-index <url or folder>` | Get PyTorch from another pip index, or from a folder of `.whl` files you downloaded. |
| `-TorchVersion 2.x.y` | `--torch-version 2.x.y` | Install this exact PyTorch version. Add the matching `-TorchvisionVersion` too. |
| `-Python C:\path\python.exe` | `--python /path/python3.12` | Build the venv with this Python. |
| `-ReinstallTorch` | `--reinstall-torch` | Install PyTorch again. |
| `-SkipModels` | `--skip-models` | Do not download the model files. |
| `-DryRun` | `--dry-run` | Print every step, do nothing. |

### Notes per graphics card

- **NVIDIA:** setup installs the CUDA 13.0 build of PyTorch. It needs a recent driver (version 580 or newer).
  GTX 900 and 10-series cards get the CUDA 12.6 build instead, because CUDA 13 dropped them. To pick yourself:
  `-TorchIndex https://download.pytorch.org/whl/cu126`.
- **AMD on Windows:** setup uses AMD's own PyTorch wheels (`stable.repo.amd.com/rocm/whl-next`), version
  2.13.0 with ROCm 10.1. That is the version these tools were tested with. It needs Python 3.12 and a recent Adrenalin
  driver. Each AMD chip has its own package, so setup needs your chip name. It reads it from the card name:

  | Card | Chip |
  |---|---|
  | RX 9070, Radeon AI PRO R9700 | gfx1201 |
  | RX 9060 | gfx1200 |
  | RX 7900 | gfx1100 |
  | RX 7800, RX 7700 | gfx1101 |
  | RX 7600 | gfx1102 |
  | RX 6900, RX 6950, RX 68x0 | gfx1030 |
  | RX 6700, RX 6750 | gfx1031 |
  | RX 6600, RX 6650 | gfx1032 |
  | Ryzen AI Max (Radeon 8060S / 8050S) | gfx1151 |
  | Ryzen AI 300 (Radeon 890M / 880M) | gfx1150 |
  | Ryzen 7040 / 8040 (Radeon 780M / 760M) | gfx1103 |

  Laptop cards (names ending in M or S) often use a different chip. Look yours up and pass `-AmdTarget`.
  AMD's own guide for PyTorch on Windows:
  https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html
- **AMD on Linux:** setup installs PyTorch's ROCm 7.2 build from pytorch.org. Your system needs the `amdgpu`
  driver with ROCm support (if `/dev/kfd` exists, it is there). Some RX 6000 cards that AMD does not list
  officially work if the app is started with `HSA_OVERRIDE_GFX_VERSION=10.3.0`.
- **Mac:** PyTorch comes from PyPI and uses the Apple GPU ("MPS"). Only Apple Silicon Macs are supported.
- **Processor only:** use `-Gpu cpu` / `--gpu cpu`. SDR → HDR, the face outline and the guide video run on the
  processor anyway, at full speed. FPS Boost is usable (about 30 seconds per second of video in our test). Depth Map
  and Remove BG are very slow on the processor (many minutes per second of video), and Depth Map needs about 4 GB of
  free RAM. They are fine for a short clip if you can wait.

## Step 3: check it worked

The last step of setup prints a short report, like this:

```
PyTorch 2.14.1+cu130 (cuda 13.0) runs on: NVIDIA GeForce RTX 4070
  frame     ok
  audio     ok
  hdr       ok
  facemesh  ok
  depth     ok (model not loaded: --quick)
  segment   ok (model not loaded: --quick)
  rife      ok (model not loaded: --quick)
  guide     ok
```

- "runs on" should name your graphics card. If it says `CPU only (slow)` but you have a graphics card, update the
  driver, restart, and run setup again.
- Any line that does not start with `ok` says what is missing.

The full check loads every model once (it takes up to a minute):

```
venv\Scripts\python.exe -I tools\doctor.py        (Windows)
venv/bin/python -I tools/doctor.py                (Mac / Linux)
```

Then restart the app, or wait half a minute. The local tools show as ready.

## Where the app looks for this folder

By default the app uses `extras/local-tools` inside the app folder. To keep the tools somewhere else (for example
on a bigger disk), move this whole folder and set the environment variable `TRENCHABLE_TOOLS` to its full path
before you start the app.

## If something goes wrong

- **"ffmpeg lacks zscale" (or rubberband):** your ffmpeg is a small build. Install a full build (Step 1).
- **The RIFE download fails:** RIFE 4.25 is only published on Google Drive. Setup then prints the manual steps:
  download `RIFE_v4.25.zip` in your browser, put it in `dl/rife425/`, and run setup again. Only FPS Boost waits
  for it.
- **"not started: only 2.1 GB of RAM is free":** close some programs and try again.
- **"the GPU ran out of memory":** use a shorter or smaller clip.
- **Start over:** delete `venv/` (and `models/`, `repos/`, `dl/` if you want), then run setup again.

## Licences

Everything that setup downloads may be used commercially.

| Part | Used for | Licence |
|---|---|---|
| Video Depth Anything **Small** weights + code (DepthAnything/Video-Depth-Anything) | Depth Map, Guided swap | Apache-2.0 |
| SAM 2.1 Small weights + code (facebookresearch/sam2) | Remove BG, Guided swap | Apache-2.0 |
| RIFE 4.25 weights + Practical-RIFE code (hzwer/Practical-RIFE) | FPS Boost | MIT |
| MediaPipe Face Landmarker model + library (Google) | Guided swap face outline | Apache-2.0 |
| Guide composite logic in `tools/guide.py`, ported from the Genjutsu open-source workflow (github.com/sirioberati/Genjustsu-Open-Source-Workflow, © 2026 Sirio Berati) | Guided swap | MIT |
| PyTorch, torchvision | all model tools | BSD-3-Clause |
| OpenCV, NumPy, Hydra and the other packages in `requirements.txt` | | Apache-2.0 / BSD / MIT |
| ffmpeg (installed by you) | everything | LGPL or GPL, depending on the build |

Not used on purpose: the Video Depth Anything **Base and Large** weights. Large is licensed for non-commercial use
only (CC BY-NC 4.0). Only the Small model is downloaded.

## For developers: how the app runs the tools

- Python: `<TOOLS>/venv/Scripts/python.exe` (Windows) or `<TOOLS>/venv/bin/python` (Mac/Linux), always with `-I`.
- Command: `<python> -I <TOOLS>/tools/<tool>.py --in clip.mp4 --out DIR ...` (arguments are in each script's docstring).
- Output on stdout: `PROGRESS <0-100> <phase>` lines, then one `RESULT <json>` line (exit 0), or one
  `ERROR <plain words>` line (exit not 0). Everything else goes to stderr.
- `<TOOLS>` is `extras/local-tools` or `TRENCHABLE_TOOLS`. The scripts find `models/` and `repos/` next to
  `tools/` by themselves, so no paths or environment variables need to be passed.
- Optional environment variables: `TOOLS_DEVICE=cuda|mps|cpu` (force a device), `TOOLS_MIN_FREE_GB` and
  `TOOLS_KILL_FREE_GB` (RAM guard; 0 turns it off), `TOOLS_FFMPEG` / `TOOLS_FFPROBE` (full paths). The AMD ROCm
  settings are set inside `tools/st_common.py`, and only when PyTorch is a ROCm build.
- `tools/doctor.py` answers `RESULT {"gpu", "device", "backend", "torch", "free_ram_gb", "tools": {name: "ok" | "error ..."}}`.
  A tool is ready only when its value is exactly `ok`. `installed.json` is written when setup reaches the end.
