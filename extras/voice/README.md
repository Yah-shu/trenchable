# Voice extra (optional): speech-to-text for Voice change and Translate

## Contract for the server

| What | Value |
|---|---|
| Folder `<VOICE>` | `extras/voice` in the app folder, or the full path in env `TRENCHABLE_VOICE` |
| Python | `<VOICE>/venv/Scripts/python.exe` (Windows), `<VOICE>/venv/bin/python` (macOS / Linux) |
| Command | `<python> -I <app>/server/studio/dub/transcribe.py <audio.wav> <out.json>` (unchanged) |
| Env (required) | `HF_HOME=<VOICE>/cache` |
| Env (required) | `HF_HUB_CACHE=<VOICE>/cache/hub` |
| Env (required) | `HF_HUB_OFFLINE=1` |
| Env (optional) | `DUB_WHISPER_MODEL=<model>`: only when `installed.json` says a model other than `small` |
| Installed when | the Python above exists **and** `<VOICE>/installed.json` exists |

Notes:

- `transcribe.py` itself reads only `DUB_WHISPER_MODEL` (default `small`). The cache location is read by
  `huggingface_hub` inside faster-whisper. `HF_HOME` alone is enough on a clean machine. Pass `HF_HUB_CACHE` too:
  if the user's system already sets `HF_HUB_CACHE` (or the old name `HUGGINGFACE_HUB_CACHE`), that would win over
  `HF_HOME` and the model would not be found. The server spreads `process.env` first, so set these after it.
- `HF_HUB_OFFLINE=1` makes a missing model fail at once (`LocalEntryNotFoundError`) instead of downloading.
- The model sits at `<VOICE>/cache/hub/models--Systran--faster-whisper-small/snapshots/<rev>/` (`model.bin`,
  `config.json`, `tokenizer.json`, `vocabulary.txt`).
- `installed.json` is written only after setup's offline test passed. It looks like this:

  ```json
  {"setup": "ok", "model": "small", "repo": "Systran/faster-whisper-small", "python": "3.12.x", "cache": "cache",
   "env": {"HF_HOME": "cache", "HF_HUB_CACHE": "cache/hub", "HF_HUB_OFFLINE": "1", "DUB_WHISPER_MODEL": "small"},
   "date": "..."}
  ```

  The paths in `env` are relative to `<VOICE>`.
- Setup tested this exact contract: `setup_steps.py check` runs the app's own `transcribe.py` (when it finds it at
  `<VOICE>/../../server/studio/dub/transcribe.py`) with these variables, offline, on a one-second test file.

## What this does

Voice change and Translate first need to know what is said in the clip, and when. This extra does that part on
your own computer, for free, with faster-whisper (the Whisper "small" model). It runs on the processor, so no
graphics card is needed.

Without it, the app works as normal. Voice change and Translate just show "not installed".

## What you need

- **Python 3.12** (3.11 also works). Get it from python.org, or:
  `winget install Python.Python.3.12` (Windows), `brew install python@3.12` (Mac),
  `sudo apt install python3.12 python3.12-venv` (Ubuntu 24.04).
- **About 1.5 GB of free disk space:** about 0.5 GB for the packages and 0.5 GB for the model.
- **ffmpeg**, which the app itself uses to pull the sound out of the clip (`winget install Gyan.FFmpeg`,
  `brew install ffmpeg` or `sudo apt install ffmpeg`).
- Windows, Linux, or an Apple Silicon Mac (M1 or newer). Intel Macs are not supported.

## Install

Open a terminal in this folder (`extras/voice`).

**Windows** (PowerShell):

```
powershell -ExecutionPolicy Bypass -File setup.ps1
```

**Mac or Linux:**

```
bash setup.sh
```

Setup creates `venv/`, installs the packages from `requirements.txt`, downloads the model into `cache/` and then
runs an offline test, exactly as the app will. It is safe to run again; a broken-off download carries on.

To see the plan first, without changing anything: add `-DryRun` (Windows) or `--dry-run` (Mac/Linux).

Options: `-Model <name>` / `--model <name>` picks another faster-whisper model (for example `medium`; bigger is
slower but can be more accurate). The app then needs `DUB_WHISPER_MODEL` set to the same name.
`-Python <path>` / `--python <path>` picks the Python to use.

## Check it worked

The last step prints `ok` and `Wrote installed.json`. Then restart the app, or wait half a minute.

To test again later: `venv\Scripts\python.exe -I setup_steps.py check` (Windows) or
`venv/bin/python -I setup_steps.py check` (Mac / Linux).

## Where the app looks for this folder

By default the app uses `extras/voice` inside the app folder. To keep it elsewhere, move this whole folder and set
the environment variable `TRENCHABLE_VOICE` to its full path before you start the app.

## Start over

Delete `venv/`, `cache/` and `installed.json`, then run setup again.

## Licences

| Part | Licence |
|---|---|
| faster-whisper (SYSTRAN) | MIT |
| Whisper model weights (OpenAI), converted by Systran (`Systran/faster-whisper-small`) | MIT |
| CTranslate2 | MIT |
| Silero VAD (shipped inside faster-whisper) | MIT |
| ONNX Runtime | MIT |
| PyAV (av) | BSD-3-Clause |
| huggingface_hub, tokenizers | Apache-2.0 |
