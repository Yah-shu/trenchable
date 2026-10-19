"""Health check for the local tools: the device PyTorch uses, each model loads, ffmpeg has the needed filters and
encoders, and the model files and model code are in place.
usage: doctor.py [--quick]   (--quick checks the files but does not load the models)
-> RESULT {"gpu": "<card name>" | "Apple GPU (MPS)" | "CPU only (slow)", "device": "cuda" | "mps" | "cpu",
           "backend": "cuda 13.0" | "rocm 7.2" | "mps" | "cpu", "torch": "2.x", "free_ram_gb": x,
           "tools": {"depth"|"segment"|"frame"|"rife"|"facemesh"|"guide"|"hdr"|"audio": "ok" | "error ..."}}
A tool is ready only when its value is exactly "ok". With --quick the model tools read
"ok (model not loaded: --quick)" at best. "device": "cuda" also covers AMD GPUs (ROCm builds use the same name)."""
import argparse, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C

M, R = C.MODELS, C.REPOS
ASSETS = {  # files each tool needs besides Python packages (setup.ps1 / setup.sh fetch them)
    "depth": [M + "/video_depth_anything_vits.pth", R + "/Video-Depth-Anything/video_depth_anything/video_depth.py",
              R + "/Video-Depth-Anything/utils/util.py"],
    "segment": [M + "/sam2.1_hiera_small.pt", R + "/sam2/sam2/build_sam.py",
                R + "/sam2/sam2/configs/sam2.1/sam2.1_hiera_s.yaml"],
    "rife": [M + "/rife425/train_log/flownet.pkl", M + "/rife425/train_log/RIFE_HDv3.py",
             M + "/rife425/train_log/IFNet_HDv3.py", R + "/Practical-RIFE/model/warplayer.py",
             R + "/Practical-RIFE/model/loss.py"],
    "facemesh": [M + "/face_landmarker.task"],
}


def check(fn):
    try:
        fn()
        return "ok"
    except BaseException as e:  # noqa
        return ("error " + f"{type(e).__name__}: {e}")[:300]


def files(name):
    miss = [os.path.relpath(p, C.ROOT).replace("\\", "/") for p in ASSETS.get(name, []) if not os.path.isfile(p)]
    if miss:
        raise FileNotFoundError("missing " + ", ".join(miss) + " (run setup again)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    a = ap.parse_args()
    f = C.free_gb()
    res = {"gpu": None, "device": None, "backend": None, "torch": None,
           "free_ram_gb": round(f, 1) if f is not None else None, "tools": {}}
    T = res["tools"]

    C.progress(5, "checking ffmpeg")
    try:
        filters = C.sh([C.FFMPEG, "-hide_banner", "-filters"])
        encoders = C.sh([C.FFMPEG, "-hide_banner", "-encoders"])
        C.sh([C.FFPROBE, "-version"], "ffprobe")
        ff_err = None
    except Exception as e:
        filters = encoders = ""
        ff_err = f"ffmpeg/ffprobe not usable ({type(e).__name__}); install ffmpeg (see README) and restart the app"

    def need(text, *names):
        if ff_err:
            raise RuntimeError(ff_err)
        miss = [x for x in names if f" {x} " not in text]
        if miss:
            raise RuntimeError("ffmpeg lacks " + ", ".join(miss))
    ff = check(lambda: need(encoders, "libx264"))  # every tool writes H.264
    T["frame"] = ff
    T["audio"] = check(lambda: need(filters, "rubberband")) if ff == "ok" else ff
    T["hdr"] = check(lambda: (need(filters, "zscale"), need(encoders, "libx265"))) if ff == "ok" else ff

    C.progress(15, "checking PyTorch")
    state = {"dev": None, "err": None}
    try:
        import torch
        res["torch"] = torch.__version__
        res["backend"] = C.torch_backend()
        dev = C.torch_device()
        res["device"], res["gpu"] = dev.type, C.device_name(dev)
        x = torch.randn(256, 256, device=dev)
        float((x @ x).sum())  # a real kernel on the device, not just "is it listed"
        state["dev"] = dev
    except BaseException as e:  # noqa
        state["err"] = f"PyTorch is not working here ({type(e).__name__}: {str(e)[:160]}); run setup again"
        res["gpu"] = res["gpu"] or "not usable"

    def ready(name):
        if state["err"]:
            raise RuntimeError(state["err"])
        if ff != "ok":
            raise RuntimeError(ff[len("error "):] if ff.startswith("error ") else ff)
        files(name)
        return state["dev"]

    def depth():
        dev = ready("depth")
        import torch
        import depth as D
        m = D.load_model(dev)
        with torch.no_grad(), C.autocast(dev):
            m(torch.zeros(1, 2, 3, 140, 140, device=dev))

    def segment():
        dev = ready("segment")
        need(encoders, "libvpx-vp9")  # the transparent cut-out is VP9 with alpha
        import segment as S
        S.build(dev)

    def rife():
        dev = ready("rife")
        import torch
        import rife as R2
        m = R2.load(True, dev)
        z = torch.zeros(1, 3, 128, 128, device=dev)
        with torch.no_grad(), C.autocast(dev):
            m.inference(z, z, timestep=0.5)

    def facemesh():
        files("facemesh")
        import facemesh as F
        import numpy as np
        F.Mesh(24).detect(np.zeros((128, 128, 3), np.uint8), 0)

    def quick(name):
        ready(name)
        if name == "segment":
            need(encoders, "libvpx-vp9")

    steps = [("facemesh", facemesh)] + ([] if a.quick else [("depth", depth), ("segment", segment), ("rife", rife)])
    for i, (name, fn) in enumerate(steps):
        C.progress(20 + 75 * i / len(steps), "loading " + name)
        T[name] = check(fn)
    if a.quick:
        for name in ("depth", "segment", "rife"):
            T[name] = check(lambda n=name: quick(n)) + " (model not loaded: --quick)"
    T["guide"] = "ok" if T["facemesh"] == "ok" and T["frame"] == "ok" else "error needs facemesh + ffmpeg"
    C.result(res)


if __name__ == "__main__":
    C.run_main(main)
