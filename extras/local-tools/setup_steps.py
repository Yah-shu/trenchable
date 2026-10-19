"""The setup steps that are the same on every OS. setup.ps1 and setup.sh call this; you do not need to run it.

usage: python -I setup_steps.py ffmpeg                   check ffmpeg/ffprobe and the filters/encoders the tools use
       python -I setup_steps.py torch-check --gpu X      is the right PyTorch build installed? (X: nvidia|amd|cpu|mac)
                                                         exit 0 = yes, 1 = not installed, 3 = wrong build
       python -I setup_steps.py assets [--dry-run] [--skip-models]
                                                         model code (pinned commits) into repos/, model files into
                                                         models/, every file checked by size and sha256
       python -I setup_steps.py check --gpu X            run tools/doctor.py --quick, explain the answer, and write
                                                         installed.json when everything is ready
       python -I setup_steps.py finish --gpu X           only write installed.json
Only the Python standard library is needed, so a dry run also works before the venv exists."""
import argparse, datetime, json, os, shutil, subprocess, sys, zipfile

sys.dont_write_bytecode = True  # a dry run leaves the folder exactly as it was
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "tools"))
import dl  # noqa: E402  (tools/dl.py: resumable download + sha256)

ROOT = HERE.replace("\\", "/")
MB = 1_000_000

# Model code, cloned shallow at the exact commits the tools were tested with.
REPOS = [
    ("Video-Depth-Anything", "DepthAnything/Video-Depth-Anything", "4f5ae23172ba60fd7bc11ef671cca678842c7072",
     "Apache-2.0"),
    ("sam2", "facebookresearch/sam2", "2b90b9f5ceec907a1c18123530e92e794ad901a4", "Apache-2.0"),
    ("Practical-RIFE", "hzwer/Practical-RIFE", "bbfd2ea90910789a860ea3e2b32a240cd577b75e", "MIT"),
]

# Model files from their official sources: (file in models/, url, bytes, sha256, what)
MODELS = [
    ("video_depth_anything_vits.pth",
     "https://huggingface.co/depth-anything/Video-Depth-Anything-Small/resolve/main/video_depth_anything_vits.pth",
     116_440_756, "13379300b739e659f076a59d52e9801bd8d38c541a7e71f73bbca4dcfb013609",
     "Video Depth Anything Small (Depth Map, Guided swap) - Apache-2.0"),
    ("sam2.1_hiera_small.pt",
     "https://huggingface.co/facebook/sam2.1-hiera-small/resolve/main/sam2.1_hiera_small.pt",
     184_416_285, "6d1aa6f30de5c92224f8172114de081d104bbd23dd9dc5c58996f0cad5dc4d38",
     "SAM 2.1 Small (Remove BG, Guided swap) - Apache-2.0"),
    ("face_landmarker.task",
     "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
     3_758_596, "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
     "MediaPipe Face Landmarker (Guided swap face mesh) - Apache-2.0"),
]

# RIFE 4.25 (FPS Boost) is only published on Google Drive (the "4.25" link in the Practical-RIFE README).
RIFE_ID = "1ZKjcbmt1hypiFprJPIKW0Tt0lr_2i7bg"
RIFE_URL = f"https://drive.usercontent.google.com/download?id={RIFE_ID}&export=download&confirm=t"
RIFE_PAGE = f"https://drive.google.com/file/d/{RIFE_ID}/view"
RIFE_ZIP = ROOT + "/dl/rife425/RIFE_v4.25.zip"
RIFE_ZIP_SIZE = 22_919_050
RIFE_ZIP_SHA = "e63d481b7ae5d4a4e6ad7ac5b410ff78f3bf7be3b51b2e38ca8152747abde5b4"
RIFE_DIR = ROOT + "/models/rife425/train_log"
RIFE_FILES = {  # the four files the tool needs from the zip's train_log/ folder
    "flownet.pkl": "6615790efd627772917205db291f51cd392528a157ecbb2ecaeec3bff8eb6de2",
    "IFNet_HDv3.py": "655b4c772b037967b86c2dd31c8fa3b5323b79dd9a0e0088708d89149bbc8a32",
    "RIFE_HDv3.py": "81bbd0648e499de79e44768d284005d9d57d0f6eb7c30adae407f22675055730",
    "refine.py": "0c5698b4a05b9f6ab551740575c1c35e248e5b1829bab6445186081ebe15f032",
}


def say(msg=""):
    print(msg, flush=True)


def rel(p):
    return os.path.relpath(p, ROOT).replace("\\", "/")


def find_exe(name, env):
    p = os.environ.get(env, "").strip()
    if p:
        return p
    found = shutil.which(name)
    if found:
        return found
    if os.name != "nt":
        for d in ("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"):
            if os.path.isfile(os.path.join(d, name)):
                return os.path.join(d, name)
    return None


def ffmpeg_hint():
    if os.name == "nt":
        return "winget install Gyan.FFmpeg   (the full build; then open a NEW terminal so PATH updates)"
    if sys.platform == "darwin":
        return "brew install ffmpeg"
    return "sudo apt install ffmpeg   (Debian/Ubuntu)  or  sudo dnf install ffmpeg   (Fedora, with RPM Fusion)"


# ---------------------------------------------------------------- ffmpeg

def cmd_ffmpeg(_a):
    ff, fp = find_exe("ffmpeg", "TOOLS_FFMPEG"), find_exe("ffprobe", "TOOLS_FFPROBE")
    if not ff or not fp:
        say("WARNING: ffmpeg/ffprobe were not found. Every local tool needs them.")
        say("  Install:  " + ffmpeg_hint())
        return 0
    try:
        run = lambda *a: subprocess.run([ff, "-hide_banner", *a], capture_output=True, text=True,
                                        encoding="utf-8", errors="replace", timeout=60).stdout
        version = (run("-version").splitlines() or ["?"])[0]
        filters, encoders = run("-filters"), run("-encoders")
    except Exception as e:
        say(f"WARNING: ffmpeg at {ff} did not run ({type(e).__name__}). Install: " + ffmpeg_hint())
        return 0
    say(f"ffmpeg:  {ff}")
    say(f"         {version[:100]}")
    needs = [("libx264", encoders, "every tool"), ("libvpx-vp9", encoders, "Remove BG transparent cut-out"),
             ("zscale", filters, "SDR to HDR"), ("libx265", encoders, "SDR to HDR"),
             ("rubberband", filters, "pitch shift in the Guided swap guide")]
    missing = []
    for name, text, why in needs:
        ok = f" {name} " in text
        say(f"  {'ok     ' if ok else 'MISSING'}  {name:<11} ({why})")
        if not ok:
            missing.append(name)
    if missing:
        say("WARNING: this ffmpeg build lacks " + ", ".join(missing) + ". The tools that need it will show as not")
        say("  ready. A full build has everything: " + ffmpeg_hint())
    return 0


# ---------------------------------------------------------------- torch

def cmd_torch_check(a):
    try:
        import torch
    except Exception:
        say("PyTorch is not installed yet.")
        return 1
    hip = getattr(torch.version, "hip", None)
    kind = "amd" if hip else ("nvidia" if torch.version.cuda else "cpu")
    want = "cpu" if a.gpu == "mac" else a.gpu
    label = {"amd": f"AMD ROCm {hip}", "nvidia": f"NVIDIA CUDA {torch.version.cuda}", "cpu": "CPU / Apple"}[kind]
    if kind == want:
        say(f"PyTorch {torch.__version__} ({label}) is already installed.")
        return 0
    say(f"PyTorch {torch.__version__} is installed, but it is the {label} build. It will be replaced.")
    return 3


# ---------------------------------------------------------------- repos

def git_head(path, git):
    try:
        p = subprocess.run([git, "-C", path, "rev-parse", "HEAD"], capture_output=True, text=True, timeout=60)
        return p.stdout.strip() if p.returncode == 0 else None
    except Exception:
        return None


def repo_ok(path, sha, git):
    if os.path.isdir(os.path.join(path, ".git")) and git:
        return git_head(path, git) == sha
    marker = os.path.join(path, ".pinned-commit")
    if os.path.isfile(marker):
        with open(marker, encoding="ascii", errors="replace") as f:
            return f.read().strip() == sha
    return False


def remove_dir(path):
    """Delete a folder this setup made (only ever under repos/ or dl/)."""
    full = os.path.abspath(path)
    if not (full.startswith(os.path.abspath(ROOT + "/repos") + os.sep) or
            full.startswith(os.path.abspath(ROOT + "/dl") + os.sep)):
        raise RuntimeError("refusing to delete " + full)

    def unlock(fn, p, _exc):  # git marks pack files read-only on Windows
        os.chmod(p, 0o700)
        fn(p)
    if sys.version_info >= (3, 12):
        shutil.rmtree(full, onexc=unlock)
    else:
        shutil.rmtree(full, onerror=unlock)


def clone_git(path, slug, sha, git):
    if os.path.exists(path):
        remove_dir(path)
    steps = [[git, "init", "-q", path],
             [git, "-C", path, "remote", "add", "origin", f"https://github.com/{slug}.git"],
             [git, "-C", path, "fetch", "-q", "--depth", "1", "origin", sha],
             [git, "-C", path, "-c", "advice.detachedHead=false", "checkout", "-q", "--detach", "FETCH_HEAD"]]
    for s in steps:
        for attempt in range(3):
            if subprocess.run(s).returncode == 0:
                break
        else:
            raise RuntimeError("git step failed: " + " ".join(s[1:]))


def clone_zip(path, slug, sha):
    url = f"https://codeload.github.com/{slug}/zip/{sha}"
    z = ROOT + f"/dl/repos/{os.path.basename(path)}-{sha[:7]}.zip"
    dl.download(url, z, None, log=lambda m: say("    " + m))
    tmp = ROOT + f"/repos/.unpack-{os.path.basename(path)}"
    if os.path.exists(tmp):
        remove_dir(tmp)
    with zipfile.ZipFile(z) as zf:
        zf.extractall(tmp)
    inner = [d for d in os.listdir(tmp) if os.path.isdir(os.path.join(tmp, d))]
    if len(inner) != 1:
        raise RuntimeError("unexpected zip layout for " + slug)
    if os.path.exists(path):
        remove_dir(path)
    os.replace(os.path.join(tmp, inner[0]), path)
    remove_dir(tmp)
    with open(os.path.join(path, ".pinned-commit"), "w", encoding="ascii") as f:
        f.write(sha + "\n")
    os.remove(z)


def do_repos(dry):
    git = shutil.which("git")
    say("Model code (repos/):")
    bad = 0
    for name, slug, sha, lic in REPOS:
        path = ROOT + "/repos/" + name
        if repo_ok(path, sha, git):
            say(f"  ok        repos/{name} @ {sha[:7]} ({lic})")
            continue
        how = "git shallow fetch" if git else "zip download from GitHub (git not found)"
        say(f"  {'would get' if dry else 'getting  '} repos/{name} @ {sha[:7]} from github.com/{slug} ({how})")
        if dry:
            continue
        try:
            if git:
                try:
                    clone_git(path, slug, sha, git)
                except Exception as e:
                    say(f"    git did not work ({e}); trying the zip download instead")
                    clone_zip(path, slug, sha)
            else:
                clone_zip(path, slug, sha)
            if not repo_ok(path, sha, git if os.path.isdir(os.path.join(path, ".git")) else None):
                raise RuntimeError("the folder is not at the pinned commit after the download")
            say("    ok")
        except Exception as e:
            bad += 1
            say(f"    FAILED: {e}")
    return bad


# ---------------------------------------------------------------- models

def file_ok(path, size, sha):
    return os.path.isfile(path) and os.path.getsize(path) == size and dl.sha256_of(path) == sha


def do_models(dry):
    say("Model files (models/):")
    bad = 0
    for fname, url, size, sha, what in MODELS:
        path = ROOT + "/models/" + fname
        if file_ok(path, size, sha):
            say(f"  ok        models/{fname}  {what}")
            continue
        say(f"  {'would get' if dry else 'getting  '} models/{fname} ({size / MB:.0f} MB, sha256 {sha[:12]}...)  {what}")
        say(f"            from {url}")
        if dry:
            continue
        try:
            dl.download(url, path, sha, log=lambda m: say("    " + m))
        except Exception as e:
            bad += 1
            say(f"    FAILED: {e}. Run setup again to resume.")
    return bad + do_rife(dry)


def rife_manual():
    say("")
    say("  RIFE 4.25 (FPS Boost) could not be downloaded automatically. Do this by hand:")
    say(f"    1. Open {RIFE_PAGE} in a browser.")
    say("       (It is the '4.25' Google Drive link in the Practical-RIFE README, github.com/hzwer/Practical-RIFE.)")
    say(f"    2. Download RIFE_v4.25.zip (about {RIFE_ZIP_SIZE / MB:.0f} MB).")
    say(f"    3. Put it here: {RIFE_ZIP}")
    say("    4. Run setup again. It checks the file and unpacks it.")
    say("  The other tools work without it; only FPS Boost waits for this file.")


def find_rife_zip():
    """The zip at its usual place, or any zip in that folder with the right checksum (browsers rename downloads)."""
    folder = os.path.dirname(RIFE_ZIP)
    cands = [RIFE_ZIP] + ([os.path.join(folder, f) for f in sorted(os.listdir(folder)) if f.lower().endswith(".zip")]
                          if os.path.isdir(folder) else [])
    for c in cands:
        if os.path.isfile(c) and os.path.getsize(c) == RIFE_ZIP_SIZE and dl.sha256_of(c) == RIFE_ZIP_SHA:
            return c
    return None


def do_rife(dry):
    if all(os.path.isfile(os.path.join(RIFE_DIR, n)) and dl.sha256_of(os.path.join(RIFE_DIR, n)) == s
           for n, s in RIFE_FILES.items()):
        say("  ok        models/rife425/train_log/ (flownet.pkl + 3 .py)  RIFE 4.25 (FPS Boost) - MIT")
        return 0
    z = find_rife_zip()
    if dry:
        if z:
            say(f"  would unpack {rel(z)} -> models/rife425/train_log/  RIFE 4.25 (FPS Boost) - MIT")
        else:
            say(f"  would get {rel(RIFE_ZIP)} ({RIFE_ZIP_SIZE / MB:.0f} MB, sha256 {RIFE_ZIP_SHA[:12]}...) from Google Drive")
            say(f"            {RIFE_URL}")
            say("            then unpack train_log/{flownet.pkl, IFNet_HDv3.py, RIFE_HDv3.py, refine.py} into")
            say("            models/rife425/train_log/ (each file sha256 checked). If Drive refuses, setup prints")
            say("            the manual steps.")
        return 0
    if not z:
        say(f"  getting   {rel(RIFE_ZIP)} ({RIFE_ZIP_SIZE / MB:.0f} MB) from Google Drive  RIFE 4.25 (FPS Boost) - MIT")
        try:
            z = dl.download(RIFE_URL, RIFE_ZIP, RIFE_ZIP_SHA, attempts=8, log=lambda m: say("    " + m))
        except Exception as e:
            say(f"    FAILED: {e}")
            rife_manual()
            return 1
    say(f"  unpacking {rel(z)} -> models/rife425/train_log/")
    os.makedirs(RIFE_DIR, exist_ok=True)
    with zipfile.ZipFile(z) as zf:
        for name, sha in RIFE_FILES.items():
            dst = os.path.join(RIFE_DIR, name)
            with zf.open("train_log/" + name) as src, open(dst + ".tmp", "wb") as out:
                shutil.copyfileobj(src, out)
            if dl.sha256_of(dst + ".tmp") != sha:
                os.remove(dst + ".tmp")
                say(f"    FAILED: {name} in the zip has the wrong checksum")
                rife_manual()
                return 1
            os.replace(dst + ".tmp", dst)
    say("    ok")
    return 0


def cmd_assets(a):
    say(f"Tools folder: {ROOT}")
    if a.dry_run:
        say("(dry run: nothing is downloaded or changed)")
    bad = do_repos(a.dry_run)
    if a.skip_models:
        say("Model files: skipped (--skip-models).")
    else:
        bad += do_models(a.dry_run)
    if bad:
        say(f"{bad} step(s) did not finish. Fix the message above and run setup again; finished parts are kept.")
        return 2
    return 0


# ---------------------------------------------------------------- check + finish

def cmd_check(a):
    """Run tools/doctor.py --quick with this (venv) Python, show the answer in plain words, and write installed.json
    when it is good. Exit 0 = ready, 1 = doctor did not run, 4 = a GPU was chosen but PyTorch does not see it,
    5 = some tools are not ready."""
    doctor = os.path.join(HERE, "tools", "doctor.py")
    p = subprocess.run([sys.executable, "-I", doctor, "--quick"], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    lines = (p.stdout or "").splitlines()
    res = next((l[7:] for l in reversed(lines) if l.startswith("RESULT ")), None)
    if res is None:
        err = next((l[6:] for l in reversed(lines) if l.startswith("ERROR ")), None)
        say("doctor.py did not finish: " + (err or (p.stderr or "").strip()[-400:] or f"exit {p.returncode}"))
        return 1
    d = json.loads(res)
    say(f"PyTorch {d.get('torch')} ({d.get('backend')}) runs on: {d.get('gpu')}")
    tools = d.get("tools", {})
    for name, v in tools.items():
        say(f"  {name:<9} {v}")
    code = 0
    not_ready = sorted(k for k, v in tools.items() if not str(v).startswith("ok"))
    want = {"nvidia": "cuda", "amd": "rocm"}.get(a.gpu)  # ROCm builds also call their device "cuda"
    if want and not (d.get("device") == "cuda" and str(d.get("backend") or "").startswith(want)):
        say("WARNING: PyTorch does not see your graphics card, so the tools would run on the CPU (slow).")
        say("  Update the graphics driver, restart the computer and run setup again. The README lists more fixes.")
        return 4
    if not_ready:
        say("Not ready yet: " + ", ".join(not_ready) + " (see the 'error' lines above). The other tools work.")
        code = 5
    cmd_finish(a, not_ready, d.get("gpu"))
    return code


def cmd_finish(a, not_ready=None, gpu=None):
    info = {"setup": "ok", "gpu_choice": a.gpu, "gpu": gpu, "not_ready": not_ready or [],
            "python": sys.version.split()[0],
            "date": datetime.datetime.now().astimezone().isoformat(timespec="seconds")}
    try:
        import torch
        info["torch"] = torch.__version__
        info["torch_cuda"] = torch.version.cuda
        info["torch_rocm"] = getattr(torch.version, "hip", None)
    except Exception:
        pass
    with open(os.path.join(HERE, "installed.json"), "w", encoding="utf-8") as f:
        json.dump(info, f, indent=1)
    say("Wrote installed.json")
    return 0


def main():
    ap = argparse.ArgumentParser(description="Local tools setup steps (called by setup.ps1 / setup.sh).")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ffmpeg")
    t = sub.add_parser("torch-check")
    t.add_argument("--gpu", required=True, choices=["nvidia", "amd", "cpu", "mac"])
    s = sub.add_parser("assets")
    s.add_argument("--dry-run", action="store_true")
    s.add_argument("--skip-models", action="store_true")
    c = sub.add_parser("check")
    c.add_argument("--gpu", required=True, choices=["nvidia", "amd", "cpu", "mac"])
    f = sub.add_parser("finish")
    f.add_argument("--gpu", required=True)
    a = ap.parse_args()
    fn = {"ffmpeg": cmd_ffmpeg, "torch-check": cmd_torch_check, "assets": cmd_assets, "check": cmd_check,
          "finish": cmd_finish}[a.cmd]
    return fn(a)


if __name__ == "__main__":
    sys.exit(main())
