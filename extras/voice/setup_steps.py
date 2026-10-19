"""Setup steps for the voice extra (transcription for Voice change and Translate). setup.ps1 and setup.sh call
this with the venv's Python; you do not need to run it yourself.

usage: python -I setup_steps.py download [--model small] [--dry-run]
           fetch the faster-whisper model into cache/ (a Hugging Face cache; a cut-off download resumes)
       python -I setup_steps.py check [--model small]
           transcribe one second of audio OFFLINE with the same code, settings and environment the app uses,
           then write installed.json

Contract with the app (README.md has the details):
  python  venv/Scripts/python.exe (Windows) or venv/bin/python (macOS / Linux), run with -I
  env     HF_HOME=<this folder>/cache   HF_HUB_CACHE=<this folder>/cache/hub   HF_HUB_OFFLINE=1
          DUB_WHISPER_MODEL=<model>     (only needed when the model is not "small")"""
import argparse, datetime, glob, json, os, shutil, struct, subprocess, sys, tempfile, time, wave

sys.dont_write_bytecode = True  # a dry run leaves the folder exactly as it was
HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
HUB = os.path.join(CACHE, "hub")

# faster-whisper model names -> Hugging Face repo (the app's default is "small", about 484 MB)
REPOS = {
    "tiny": "Systran/faster-whisper-tiny", "tiny.en": "Systran/faster-whisper-tiny.en",
    "base": "Systran/faster-whisper-base", "base.en": "Systran/faster-whisper-base.en",
    "small": "Systran/faster-whisper-small", "small.en": "Systran/faster-whisper-small.en",
    "medium": "Systran/faster-whisper-medium", "medium.en": "Systran/faster-whisper-medium.en",
    "large-v3": "Systran/faster-whisper-large-v3", "large-v3-turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
    "turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
}

# The same calls as server/studio/dub/transcribe.py (used when that file is not found next to this folder).
CHECK_CODE = r"""
import json, os, sys
from faster_whisper import WhisperModel
model = WhisperModel(os.environ.get("DUB_WHISPER_MODEL", "small"), device="cpu", compute_type="int8")
segments, info = model.transcribe(sys.argv[1], word_timestamps=True, vad_filter=True)
n = sum(1 for _ in segments)
print(json.dumps({"segments": n, "language": info.language}))
"""


def say(msg=""):
    print(msg, flush=True)


def rel(p):
    return os.path.relpath(p, HERE).replace("\\", "/")


def contract_env(model):
    """The environment the app passes when it runs transcribe.py."""
    env = dict(os.environ)
    for k in ("HUGGINGFACE_HUB_CACHE", "TRANSFORMERS_CACHE", "HF_HUB_DISABLE_SYMLINKS"):
        env.pop(k, None)  # older names that could point somewhere else
    env.update(HF_HOME=CACHE, HF_HUB_CACHE=HUB, HF_HUB_OFFLINE="1", DUB_WHISPER_MODEL=model)
    return env


def cached(model):
    repo = REPOS.get(model, model if "/" in model else None)
    if not repo:
        return False
    folder = os.path.join(HUB, "models--" + repo.replace("/", "--"), "snapshots", "*", "model.bin")
    return bool(glob.glob(folder))


def cmd_download(a):
    repo = REPOS.get(a.model, a.model if "/" in a.model else "?")
    say(f"Whisper model '{a.model}' (huggingface.co/{repo}) -> {rel(HUB)}/")
    if cached(a.model):
        say("  already in the cache; it is checked again below")
        if a.dry_run:
            return 0
    elif a.dry_run:
        size = " (about 484 MB)" if a.model == "small" else ""
        say(f"  would download it{size} with faster_whisper.download_model('{a.model}') into that cache")
        return 0
    # Must be set before huggingface_hub is imported (it reads them once).
    os.environ.update(HF_HOME=CACHE, HF_HUB_CACHE=HUB, HF_HUB_DISABLE_TELEMETRY="1",
                      HF_HUB_DOWNLOAD_TIMEOUT="60", HF_HUB_DISABLE_SYMLINKS_WARNING="1")
    for k in ("HF_HUB_OFFLINE", "HUGGINGFACE_HUB_CACHE", "TRANSFORMERS_CACHE"):
        os.environ.pop(k, None)
    try:
        from faster_whisper import download_model
    except Exception as e:
        say(f"FAILED: faster-whisper is not installed in this Python ({type(e).__name__}). Run setup again.")
        return 2
    for attempt in range(1, 9):
        try:
            path = download_model(a.model)
            say(f"  ok  {rel(path)}")
            return 0
        except Exception as e:
            say(f"  attempt {attempt}: {type(e).__name__}: {str(e)[:200]}")
            time.sleep(min(30, 5 * attempt))
    say("FAILED: the model did not download. Check the connection and run setup again (it resumes).")
    return 2


def write_test_wav(path, seconds=1.0, rate=16000):
    """One second of near-silence (a faint hum), mono 16 kHz, like the WAV the app extracts."""
    import math
    n = int(seconds * rate)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"".join(struct.pack("<h", int(300 * math.sin(2 * math.pi * 220 * i / rate)))
                               for i in range(n)))


def cmd_check(a):
    tmp = tempfile.mkdtemp(prefix="voice-check-")
    try:
        wav, out = os.path.join(tmp, "test.wav"), os.path.join(tmp, "out.json")
        write_test_wav(wav)
        app_script = os.path.normpath(os.path.join(HERE, "..", "..", "server", "studio", "dub", "transcribe.py"))
        if os.path.isfile(app_script):
            cmd, what = [sys.executable, "-I", app_script, wav, out], "the app's own transcribe.py"
        else:
            cmd, what = [sys.executable, "-I", "-c", CHECK_CODE, wav], "the same calls as the app's transcribe.py"
        say(f"Offline test with {what}:")
        say(f"  HF_HOME={CACHE}")
        say(f"  HF_HUB_CACHE={HUB}")
        say(f"  HF_HUB_OFFLINE=1  DUB_WHISPER_MODEL={a.model}")
        t0 = time.time()
        p = subprocess.run(cmd, env=contract_env(a.model), capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=900)
        if p.returncode != 0:
            tail = " ".join((p.stderr or p.stdout or "").strip().splitlines()[-3:])[:500]
            say(f"FAILED (exit {p.returncode}): {tail}")
            if "offline" in tail.lower() or "cache" in tail.lower() or "LocalEntryNotFound" in tail:
                say("  The model is not in cache/. Run setup again so it downloads.")
            return 1
        say(f"  ok in {time.time() - t0:.1f} s: {(p.stdout or '').strip().splitlines()[-1:]}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    info = {"setup": "ok", "model": a.model, "repo": REPOS.get(a.model, a.model), "python": sys.version.split()[0],
            "cache": "cache", "env": {"HF_HOME": "cache", "HF_HUB_CACHE": "cache/hub", "HF_HUB_OFFLINE": "1",
                                      "DUB_WHISPER_MODEL": a.model},
            "date": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}
    with open(os.path.join(HERE, "installed.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, indent=1)
    say("Wrote installed.json")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Voice extra setup steps (called by setup.ps1 / setup.sh).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("download")
    d.add_argument("--model", default="small")
    d.add_argument("--dry-run", action="store_true")
    c = sub.add_parser("check")
    c.add_argument("--model", default="small")
    a = ap.parse_args()
    return {"download": cmd_download, "check": cmd_check}[a.cmd](a)


if __name__ == "__main__":
    sys.exit(main())
