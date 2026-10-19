"""Track one subject through a clip with SAM 2.1 Small (Apache-2.0, facebookresearch/sam2) from clicked points/box.
usage: segment.py --in clip.mp4 --out DIR --points '[{"x":0.52,"y":0.40,"label":1,"frame":0}, ...]'
                  [--box x0,y0,x1,y1] [--max-side 960] [--fps 24]
points: x/y normalised 0-1 over the frame; label 1 = subject, 0 = not subject; frame = index in the normalised
clip (at --fps, i.e. round(t * fps)); a point may give "t" (seconds) instead of "frame". --box is normalised 0-1
(values > 1 are read as pixels of the normalised clip) and applies to the first prompted frame.
-> RESULT {"masks": "DIR/mask.mp4", "alpha": "DIR/subject.webm", "preview": "DIR/preview.mp4",
           "coverage": [...], "frames": N, "fps": F, "size": [w, h], "normalized": "DIR/normalized.mp4"}"""
import argparse, json, os, shutil, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C

SAM_REPO = C.REPOS + "/sam2"
CKPT = C.MODELS + "/sam2.1_hiera_small.pt"
CFG = "configs/sam2.1/sam2.1_hiera_s.yaml"


def build(device):
    sys.path.insert(0, SAM_REPO)
    import warnings
    warnings.filterwarnings("ignore", category=UserWarning)
    from sam2.build_sam import build_sam2_video_predictor
    return build_sam2_video_predictor(CFG, CKPT, device=device)


def fill_holes(m, frac=0.002):
    """Close small holes/specks inside the mask (SAM's own hole filling needs a CUDA-only extension)."""
    import cv2, numpy as np
    m8 = m.astype(np.uint8)
    cs, hier = cv2.findContours(m8, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    if hier is not None:
        lim = frac * m.shape[0] * m.shape[1]
        for c, hh in zip(cs, hier[0]):
            if hh[3] >= 0 and cv2.contourArea(c) < lim:
                cv2.drawContours(m8, [c], -1, 1, -1)
    return m8.astype(bool)


def parse_points(text, n, fps):
    try:
        pts = json.loads(text) if text else []
    except Exception:
        raise ValueError("--points is not valid JSON")
    if isinstance(pts, dict):
        pts = [pts]
    out = {}
    for p in pts:
        f = int(round(float(p["t"]) * fps)) if "t" in p and "frame" not in p else int(p.get("frame", 0))
        f = max(0, min(n - 1, f))
        x, y = float(p["x"]), float(p["y"])
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise ValueError("point x/y must be normalised 0-1")
        out.setdefault(f, []).append((x, y, int(p.get("label", 1))))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--points", default="")
    ap.add_argument("--box", default="")
    ap.add_argument("--max-side", type=int, default=960)
    ap.add_argument("--fps", type=float, default=24)
    a = ap.parse_args()
    src = C.need_file(a.inp)
    if not a.points.strip() and not a.box.strip():
        C.fail("give at least one --points click or a --box")
    out = C.out_dir(a.out)
    import numpy as np, cv2

    C.progress(2, "normalising video")
    norm = os.path.join(out, "normalized.mp4")
    info = C.normalize(src, norm, a.max_side, a.fps)
    w, h = info["w"], info["h"]
    fdir = os.path.join(out, "_frames")
    shutil.rmtree(fdir, ignore_errors=True)
    os.makedirs(fdir)
    C.sh([C.FFMPEG, "-hide_banner", "-loglevel", "error", "-i", norm, "-q:v", "2", "-start_number", "0",
          os.path.join(fdir, "%05d.jpg")])
    n = len([f for f in os.listdir(fdir) if f.endswith(".jpg")])
    if n == 0:
        C.fail("the video has no frames")
    prompts = parse_points(a.points, n, a.fps)
    box = None
    if a.box:
        b = [float(v) for v in a.box.split(",")]
        if len(b) != 4:
            C.fail("--box needs x0,y0,x1,y1")
        box = np.array([b[0] * w, b[1] * h, b[2] * w, b[3] * h] if max(b) <= 1.0 else b, dtype=np.float32)
    if not prompts and box is None:
        C.fail("give at least one --points click or a --box")

    C.progress(6, f"loading SAM 2.1 ({n} frames {w}x{h})")
    import torch
    device = C.torch_device()
    pred = build(device)
    C.progress(10, "reading frames")
    with torch.inference_mode():
        state = pred.init_state(fdir, offload_video_to_cpu=n > 240, offload_state_to_cpu=n > 480)
        first = min(prompts) if prompts else 0
        if box is not None and first not in prompts:
            prompts[first] = []
        for f in sorted(prompts):
            ps = prompts[f]
            kw = {}
            if ps:
                kw["points"] = np.array([[x * w, y * h] for x, y, _ in ps], dtype=np.float32)
                kw["labels"] = np.array([l for _, _, l in ps], dtype=np.int32)
            if box is not None and f == first:
                kw["box"] = box
            pred.add_new_points_or_box(state, frame_idx=f, obj_id=1, **kw)
        masks = np.zeros((n, h, w), dtype=bool)
        done = 0
        passes = [False, True] if first > 0 else [False]
        for rev in passes:
            for fi, _, logits in pred.propagate_in_video(state, start_frame_idx=first, reverse=rev):
                masks[fi] = fill_holes((logits[0, 0] > 0.0).cpu().numpy())
                done += 1
                if done % 6 == 0:
                    C.progress(15 + 65 * done / n, f"tracking frame {done}/{n}")
    shutil.rmtree(fdir, ignore_errors=True)

    C.progress(82, "writing mask, cut-out and preview")
    mpath, apath, ppath = (os.path.join(out, x) for x in ("mask.mp4", "subject.webm", "preview.mp4"))
    wm = C.Writer(mpath, w, h, a.fps, kind="mask", crf=10)
    wa = C.Writer(apath, w, h, a.fps, kind="vp9a")
    wp = C.Writer(ppath, w, h, a.fps, audio=norm if info["audio"] else None, crf=20)
    tint = np.array([40, 220, 90], np.float32)
    cov = []
    for i, rgb in enumerate(C.read_frames(norm, w, h)):
        if i >= n:
            break
        m = masks[i]
        cov.append(round(float(m.mean()), 4))
        m8 = m.astype(np.uint8) * 255
        wm.write(np.repeat(m8[:, :, None], 3, axis=2))
        wa.write(np.dstack([rgb, cv2.GaussianBlur(m8, (3, 3), 0)]))
        pv = rgb.astype(np.float32)
        pv[m] = pv[m] * 0.55 + tint * 0.45
        pv = pv.astype(np.uint8)
        cs, _ = cv2.findContours(m8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(pv, cs, -1, (255, 255, 255), 2, cv2.LINE_AA)
        wp.write(pv)
        if i % 24 == 0:
            C.progress(82 + 17 * i / n, "writing mask, cut-out and preview")
    for wr in (wm, wa, wp):
        wr.close()
    if not any(cov):
        C.fail("SAM found no subject at the clicked points; click on the subject itself or add a box")
    C.result({"masks": C.path_out(mpath), "alpha": C.path_out(apath), "preview": C.path_out(ppath),
              "coverage": cov, "frames": n, "fps": a.fps, "size": [w, h], "normalized": C.path_out(norm)})


if __name__ == "__main__":
    C.run_main(main)
