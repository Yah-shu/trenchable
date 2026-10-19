"""Frame interpolation to a higher frame rate with RIFE 4.25 (MIT, hzwer/Practical-RIFE).
Runs on the GPU (NVIDIA CUDA / AMD ROCm, fp16), on Apple MPS, or on the CPU (slow); MPS and CPU use fp32.
usage: rife.py --in clip.mp4 --out DIR [--fps 60] [--scale 0] [--fp32]
-> RESULT {"video": "DIR/interp.mp4", "fps": F, "frames": N, "source_fps": f, "size": [w, h]}
Keeps the clip's resolution and audio. Any target rate works (each output frame is interpolated at its exact time
between the two nearest source frames); hard scene cuts are not blended (nearest frame is repeated instead)."""
import argparse, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C

RIFE_REPO = C.REPOS + "/Practical-RIFE"
RIFE_MODEL = C.MODELS + "/rife425"  # contains train_log/ (flownet.pkl + IFNet_HDv3.py + RIFE_HDv3.py + refine.py)


def load(fp16=True, device=None):
    sys.path.insert(0, RIFE_MODEL)
    sys.path.insert(1, RIFE_REPO)
    from train_log.RIFE_HDv3 import Model
    m = Model()  # RIFE puts itself on CUDA when it can, else on the CPU
    m.load_model(RIFE_MODEL + "/train_log", -1)
    if device is not None:
        m.flownet.to(device)  # the device the tool chose (this is what makes Apple MPS work)
    m.eval()
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--fps", type=float, default=60)
    ap.add_argument("--scale", type=float, default=0, help="flow scale; 0 = auto (1.0 up to 1080p, 0.5 above)")
    ap.add_argument("--fp32", action="store_true")
    a = ap.parse_args()
    src = C.need_file(a.inp)
    out = C.out_dir(a.out)
    import numpy as np, torch, torch.nn.functional as F
    info = C.probe(src)
    w, h, sfps, n = info["w"] // 2 * 2, info["h"] // 2 * 2, info["fps"], info["frames"]
    if a.fps <= 0:
        C.fail("--fps must be positive")
    scale = a.scale or (1.0 if max(w, h) <= 2048 else 0.5)
    C.progress(3, "loading RIFE 4.25")
    dev = C.torch_device()
    torch.set_grad_enabled(False)
    model = load(not a.fp32, dev)
    dt = torch.float32
    tmp = max(128, int(128 / scale))
    ph, pw = ((h - 1) // tmp + 1) * tmp, ((w - 1) // tmp + 1) * tmp

    def tens(img):
        t = torch.from_numpy(np.ascontiguousarray(img)).to(dev).permute(2, 0, 1)[None].to(dt) / 255.0
        return F.pad(t, (0, pw - w, 0, ph - h))

    def small(img):
        return img[::max(1, h // 64), ::max(1, w // 64)].astype(np.float32).mean(axis=2)

    m_out = max(1, int(round(n * a.fps / sfps)))
    path = os.path.join(out, "interp.mp4")
    wr = C.Writer(path, w, h, a.fps, audio=src if info["audio"] else None, crf=16)
    frames = C.read_frames(src, w, h)
    prev = next(frames, None)
    if prev is None:
        C.fail("the video has no frames")
    nxt = next(frames, None)
    i = 0  # index of `prev`
    t_prev = t_nxt = None
    cut = False
    for k in range(m_out):
        t = k * sfps / a.fps
        while nxt is not None and t >= i + 1:
            prev, nxt, i = nxt, next(frames, None), i + 1
            t_prev = t_nxt = None
        frac = t - i
        if nxt is None or frac < 1e-3:
            wr.write(prev)
        else:
            if t_prev is None:
                t_prev, t_nxt = tens(prev), tens(nxt)
                cut = float(np.abs(small(prev) - small(nxt)).mean()) > 45.0
            if cut:
                wr.write(prev if frac < 0.5 else nxt)
            else:
                with C.autocast(dev, enabled=not a.fp32):
                    mid = model.inference(t_prev, t_nxt, timestep=frac, scale=scale)
                wr.write((mid[0, :, :h, :w].float().clamp(0, 1) * 255.0 + 0.5).byte().permute(1, 2, 0).cpu().numpy())
        if k % 12 == 0:
            C.progress(5 + 94 * k / m_out, f"frame {k + 1}/{m_out}")
    wr.close()
    C.result({"video": C.path_out(path), "fps": a.fps, "frames": wr.n, "source_fps": round(sfps, 3), "size": [w, h]})


if __name__ == "__main__":
    C.run_main(main)
