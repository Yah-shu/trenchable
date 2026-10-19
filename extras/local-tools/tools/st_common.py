"""Shared helpers for the local tool CLIs.

The app calls each tool with this folder's own Python, in isolated mode:
    <tools>/venv/Scripts/python.exe -I <tools>/tools/<tool>.py ...    (Windows)
    <tools>/venv/bin/python -I <tools>/tools/<tool>.py ...            (macOS / Linux)
<tools> is the folder that holds this tools/ folder. The models and the model code sit next to it, in
<tools>/models and <tools>/repos (setup.ps1 / setup.sh put them there). No path outside <tools> is used.

Contract: stdout carries only `PROGRESS <0-100> <phase>` lines and one final `RESULT <json>` line (exit 0), or an
`ERROR <plain words>` line (non-zero exit). Anything libraries print goes to stderr. Each tool runs at low priority
and refuses to start when free RAM is under 3 GB (a watchdog stops it if free RAM falls under 2.5 GB).

Device: an NVIDIA (CUDA) or AMD (ROCm) GPU when PyTorch sees one, else Apple Silicon (MPS), else the CPU (slow).
Optional environment variables:
  TOOLS_DEVICE=cuda|mps|cpu                force one device
  TOOLS_MIN_FREE_GB, TOOLS_KILL_FREE_GB    change the RAM guard (0 turns that part off)
  TOOLS_FFMPEG, TOOLS_FFPROBE              full paths, when ffmpeg is not on PATH"""
import ctypes, json, os, re, shutil, subprocess, sys, threading, time, traceback

IS_WIN = os.name == "nt"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))).replace("\\", "/")
MODELS = ROOT + "/models"
REPOS = ROOT + "/repos"


def _torch_is_rocm():
    """True when the installed PyTorch is an AMD ROCm build. Found WITHOUT importing torch, because the ROCm
    settings below only work if they are in place before torch loads."""
    try:
        from importlib import metadata
        if "rocm" in metadata.version("torch").lower():
            return True
    except Exception:
        pass
    try:
        import importlib.util
        spec = importlib.util.find_spec("torch")
        for d in (spec.submodule_search_locations or []) if spec else []:
            p = os.path.join(d, "version.py")
            if os.path.isfile(p):
                with open(p, encoding="utf-8", errors="replace") as f:
                    # ROCm builds write  hip: Optional[str] = '6.4.x'  ; every other build has  = None
                    return re.search(r"^hip\s*(?::[^=\n]*)?=\s*['\"]", f.read(), re.M) is not None
    except Exception:
        pass
    return False


if _torch_is_rocm():
    # AMD ROCm only: matrix maths through rocBLAS instead of hipBLASLt. Needed on RX 6000-series cards and harmless
    # on newer ones. NVIDIA, Apple and CPU builds of PyTorch never get these.
    os.environ.setdefault("MIOPEN_GEMM_ENFORCE_BACKEND", "1")
    os.environ.setdefault("TORCH_BLAS_PREFER_HIPBLASLT", "0")
if sys.platform == "darwin":
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")  # an op Apple's GPU lacks runs on the CPU instead
os.environ.setdefault("PYTHONUTF8", "1")
os.environ.setdefault("HF_HUB_OFFLINE", "1")  # never fetch weights at run time


def _env_float(name, default):
    try:
        return float(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


def _find_exe(name, env):
    """An explicit path from `env`, else PATH, else the usual Homebrew / system folders (a Mac app started outside a
    terminal often has a short PATH), else the bare name."""
    p = os.environ.get(env, "").strip()
    if p:
        return p
    found = shutil.which(name)
    if found:
        return found
    if not IS_WIN:
        for d in ("/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"):
            c = os.path.join(d, name)
            if os.path.isfile(c):
                return c
    return name


FFMPEG = _find_exe("ffmpeg", "TOOLS_FFMPEG")
FFPROBE = _find_exe("ffprobe", "TOOLS_FFPROBE")
MIN_FREE_GB = _env_float("TOOLS_MIN_FREE_GB", 3.0)
KILL_FREE_GB = _env_float("TOOLS_KILL_FREE_GB", 2.5)
BELOW_NORMAL = 0x00004000
NO_WINDOW = 0x08000000
SPAWN_FLAGS = (BELOW_NORMAL | NO_WINDOW) if IS_WIN else 0  # creationflags for every child process (Windows only)

_OUT = sys.__stdout__
try:
    _OUT.reconfigure(encoding="utf-8", errors="replace")  # -I ignores PYTHONIOENCODING, so set it here
except Exception:
    pass
sys.stdout = sys.stderr  # keep stdout clean for the app's line parser
_T0 = time.time()


class _MEM(ctypes.Structure):
    _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong), ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong), ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong), ("sullAvailExtendedVirtual", ctypes.c_ulonglong)]


def free_gb():
    """Free physical RAM in GB (what the OS can hand out without swapping), or None if it cannot be read."""
    try:
        if IS_WIN:
            m = _MEM()
            m.dwLength = ctypes.sizeof(m)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))
            return m.ullAvailPhys / 2**30
        if sys.platform == "darwin":
            out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=10).stdout
            page = int(re.search(r"page size of (\d+)", out).group(1))
            pages = 0
            for k in ("free", "inactive", "speculative"):
                m = re.search(rf"^Pages {k}:\s+(\d+)", out, re.M)
                pages += int(m.group(1)) if m else 0
            return pages * page / 2**30
        with open("/proc/meminfo", encoding="ascii", errors="replace") as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    return int(line.split()[1]) / 2**20
    except Exception:
        pass
    return None


class _PMC(ctypes.Structure):
    _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong), ("PeakWorkingSetSize", ctypes.c_size_t),
                ("WorkingSetSize", ctypes.c_size_t), ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPagedPoolUsage", ctypes.c_size_t), ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                ("QuotaNonPagedPoolUsage", ctypes.c_size_t), ("PagefileUsage", ctypes.c_size_t),
                ("PeakPagefileUsage", ctypes.c_size_t)]


def _self_handle():
    k = ctypes.windll.kernel32
    k.GetCurrentProcess.restype = ctypes.c_void_p
    return k.GetCurrentProcess()


def peak_rss_gb():
    try:
        if IS_WIN:
            c = _PMC()
            c.cb = ctypes.sizeof(c)
            fn = ctypes.windll.psapi.GetProcessMemoryInfo
            fn.argtypes = [ctypes.c_void_p, ctypes.POINTER(_PMC), ctypes.c_ulong]
            fn(_self_handle(), ctypes.byref(c), c.cb)
            return c.PeakWorkingSetSize / 2**30
        import resource
        r = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        return r / 2**30 if sys.platform == "darwin" else r / 2**20  # macOS reports bytes, Linux KiB
    except Exception:
        return 0.0


def emit(line):
    _OUT.write(line + "\n")
    _OUT.flush()


def progress(pct, phase):
    emit(f"PROGRESS {max(0, min(100, int(pct)))} {phase}")


def fail(msg, code=1):
    emit("ERROR " + " ".join(str(msg).split()))
    _OUT.flush()
    os._exit(code)


def result(obj):
    stats = {"seconds": round(time.time() - _T0, 2), "peak_ram_gb": round(peak_rss_gb(), 2)}
    torch = sys.modules.get("torch")  # only tools that loaded torch report VRAM (no slow import for the rest)
    if torch is not None:
        try:
            if torch.cuda.is_available() and torch.cuda.max_memory_allocated() > 0:
                stats["peak_vram_gb"] = round(torch.cuda.max_memory_allocated() / 2**30, 2)
        except Exception:
            pass
    print("stats " + json.dumps(stats), file=sys.stderr, flush=True)
    emit("RESULT " + json.dumps(obj))
    sys.exit(0)


def _watchdog():
    while True:
        f = free_gb()
        if f is not None and f < KILL_FREE_GB:
            fail(f"stopped to protect the computer: free RAM fell to {f:.1f} GB (guard {KILL_FREE_GB:g} GB)", 3)
        time.sleep(1 if IS_WIN or sys.platform.startswith("linux") else 2)


def start():
    """Low priority (child processes inherit it) + RAM guard."""
    try:
        if IS_WIN:
            k = ctypes.windll.kernel32
            k.SetPriorityClass.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
            k.SetPriorityClass(_self_handle(), BELOW_NORMAL)
        else:
            os.nice(10)
    except Exception:
        pass
    f = free_gb()
    if MIN_FREE_GB > 0 and f is not None and f < MIN_FREE_GB:
        fail(f"not started: only {f:.1f} GB of RAM is free (needs {MIN_FREE_GB:g} GB). Close something and retry", 2)
    if KILL_FREE_GB > 0:
        threading.Thread(target=_watchdog, daemon=True).start()


def run_main(main):
    start()
    try:
        main()
    except SystemExit:
        raise
    except BaseException as e:  # plain words for the app, details on stderr
        traceback.print_exc(file=sys.stderr)
        msg = str(e) or type(e).__name__
        if "out of memory" in msg.lower():
            msg = "the GPU ran out of memory; try a smaller --max-side or a shorter clip (" + msg[:200] + ")"
        fail(f"{type(e).__name__}: {msg}"[:600])


def need_file(path, what="input"):
    if not path or not os.path.isfile(path):
        fail(f"{what} file not found: {path}")
    return os.path.abspath(path)


def out_dir(path):
    os.makedirs(path, exist_ok=True)
    return os.path.abspath(path)


def sh(cmd, what="ffmpeg"):
    p = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
                       creationflags=SPAWN_FLAGS)
    if p.returncode != 0:
        raise RuntimeError(f"{what} failed: " + (p.stderr or "").strip()[-600:])
    return p.stdout


def probe(path):
    """-> dict(w, h, fps, duration, frames, audio) of the first video stream."""
    j = json.loads(sh([FFPROBE, "-v", "error", "-show_entries",
                       "stream=codec_type,width,height,avg_frame_rate,r_frame_rate,nb_frames,duration:format=duration",
                       "-of", "json", path], "ffprobe"))
    v = next((s for s in j.get("streams", []) if s.get("codec_type") == "video"), None)
    if v is None:
        raise RuntimeError("no video stream in " + path)

    def rate(s):
        try:
            a, b = s.split("/")
            return float(a) / float(b) if float(b) else 0.0
        except Exception:
            return 0.0
    fps = rate(v.get("avg_frame_rate", "0/0")) or rate(v.get("r_frame_rate", "0/0")) or 24.0
    dur = float(v.get("duration") or j.get("format", {}).get("duration") or 0)
    n = int(v.get("nb_frames") or 0) or int(round(dur * fps))
    return {"w": int(v["width"]), "h": int(v["height"]), "fps": fps, "duration": dur, "frames": n,
            "audio": any(s.get("codec_type") == "audio" for s in j.get("streams", []))}


def fit(w, h, max_side):
    s = min(1.0, float(max_side) / max(w, h)) if max_side else 1.0
    return max(2, int(w * s) // 2 * 2), max(2, int(h * s) // 2 * 2)


def normalize(src, dst, max_side=960, fps=24, size=None):
    """Working copy like the Genjustsu workflow step 3: constant `fps`, longest side <= max_side (or exact `size`),
    H.264 + the source audio. Returns probe() of the result."""
    info = probe(src)
    w, h = size if size else fit(info["w"], info["h"], max_side)
    vf = f"fps={fps},scale={w}:{h}:flags=lanczos,setsar=1,format=yuv420p"
    cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vf", vf, "-c:v", "libx264", "-crf", "14",
           "-preset", "fast", "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]
    cmd += ["-c:a", "aac", "-b:a", "192k"] if info["audio"] else ["-an"]
    sh(cmd + [dst])
    return probe(dst)


def read_frames(path, w=None, h=None, pix="rgb24"):
    """Yield HxWx3 uint8 RGB frames (decoded by ffmpeg, optionally scaled to w x h)."""
    import numpy as np
    if w is None:
        i = probe(path)
        w, h = i["w"], i["h"]
    ch = 4 if pix == "rgba" else 3
    vf = ["-vf", f"scale={w}:{h}:flags=bilinear"]
    p = subprocess.Popen([FFMPEG, "-hide_banner", "-loglevel", "error", "-i", path, *vf, "-f", "rawvideo", "-pix_fmt",
                          pix, "-"], stdout=subprocess.PIPE, creationflags=SPAWN_FLAGS)
    n = w * h * ch
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            yield np.frombuffer(b, np.uint8).reshape(h, w, ch)
    finally:
        p.stdout.close()
        p.wait()


class Writer:
    """Pipe RGB(A) frames into ffmpeg. kind: 'h264' (yuv420p), 'mask' (gray h264), 'vp9a' (VP9 with alpha)."""

    def __init__(self, path, w, h, fps, kind="h264", audio=None, crf=16):
        self.path = path
        pix = "rgba" if kind == "vp9a" else "rgb24"
        cmd = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", pix, "-s", f"{w}x{h}",
               "-r", f"{fps}", "-i", "-"]
        if audio:
            cmd += ["-i", audio]
        cmd += ["-map", "0:v:0"] + (["-map", "1:a:0?"] if audio else [])
        if kind == "vp9a":
            cmd += ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-b:v", "0", "-crf", "30", "-row-mt", "1",
                    "-deadline", "good", "-cpu-used", "4", "-auto-alt-ref", "0"]
        else:
            cmd += ["-c:v", "libx264", "-preset", "fast", "-crf", str(crf), "-pix_fmt", "yuv420p",
                    "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]
            if kind == "mask":
                cmd += ["-tune", "grain"]
        if audio:
            cmd += ["-c:a", "aac", "-b:a", "192k"] if not audio.lower().endswith((".m4a", ".aac")) \
                else ["-c:a", "copy"]
        cmd += ["-movflags", "+faststart"] if path.lower().endswith(".mp4") else []
        self.p = subprocess.Popen(cmd + [path], stdin=subprocess.PIPE, stderr=subprocess.PIPE,
                                  creationflags=SPAWN_FLAGS)
        self.n = 0

    def write(self, frame):
        import numpy as np
        self.p.stdin.write(np.ascontiguousarray(frame, dtype=np.uint8).tobytes())
        self.n += 1

    def close(self):
        self.p.stdin.close()
        err = self.p.stderr.read().decode("utf-8", "replace")
        if self.p.wait() != 0:
            raise RuntimeError("ffmpeg encode failed for " + self.path + ": " + err.strip()[-400:])
        return self.path


def torch_device():
    """Where the GPU tools run: TOOLS_DEVICE if set, else CUDA/ROCm, else Apple MPS, else the CPU (slow)."""
    import torch
    want = os.environ.get("TOOLS_DEVICE", "").strip().lower()
    mps = getattr(torch.backends, "mps", None)
    has_mps = bool(mps is not None and mps.is_available())
    if want in ("cuda", "gpu", "rocm"):
        if not torch.cuda.is_available():
            raise RuntimeError("TOOLS_DEVICE=cuda, but PyTorch sees no NVIDIA/AMD GPU; run doctor.py, or run setup "
                               "again with the right GPU choice")
        return torch.device("cuda")
    if want == "mps":
        if not has_mps:
            raise RuntimeError("TOOLS_DEVICE=mps, but this PyTorch has no Apple GPU (MPS) support")
        return torch.device("mps")
    if want == "cpu":
        return torch.device("cpu")
    if torch.cuda.is_available():  # NVIDIA CUDA and AMD ROCm builds both answer here
        return torch.device("cuda")
    if has_mps:
        return torch.device("mps")
    return torch.device("cpu")


def device_name(dev):
    import torch
    if dev.type == "cuda":
        return torch.cuda.get_device_name(0)
    if dev.type == "mps":
        return "Apple GPU (MPS)"
    return "CPU only (slow)"


def torch_backend():
    """'rocm 7.2', 'cuda 13.0', 'mps' or 'cpu': what this PyTorch build was made for."""
    import torch
    hip = getattr(torch.version, "hip", None)
    if hip:
        return "rocm " + str(hip).split("-")[0]
    if torch.version.cuda:
        return "cuda " + str(torch.version.cuda)
    mps = getattr(torch.backends, "mps", None)
    if mps is not None and mps.is_built():
        return "mps"
    return "cpu"


def autocast(dev, enabled=True):
    """fp16 autocast on NVIDIA/AMD GPUs; Apple MPS and the CPU run in full precision (safer, and not slower there)."""
    import contextlib, torch
    if enabled and dev.type == "cuda":
        return torch.autocast("cuda", dtype=torch.float16)
    return contextlib.nullcontext()


def path_out(p):
    return os.path.abspath(p).replace("\\", "/")
