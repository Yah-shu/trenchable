"""Guide video for motion transfer: the depth-coloured subject (inside the SAM mask) over the ORIGINAL background,
optional face mesh on top, pitched audio embedded.
Composition logic ported from the Genjutsu open-source workflow (MIT, (c) 2026 Sirio Berati,
github.com/sirioberati/Genjustsu-Open-Source-Workflow - pipeline.py composite() + raw_masks.py
clean_border_fragments() + mesh_worker.py): "What happens" steps 3-6 = normalise to 24 fps <= 960 px, coloured depth,
SAM masks applied to the depth, depth subject composited over the original background, review preview.
usage: guide.py --in clip.mp4 --depth DIR/depth.mp4 --mask DIR/mask.mp4 --out DIR [--mesh] [--audio file.wav]
-> RESULT {"guide": "DIR/guide.mp4", "preview": "DIR/guide_preview.mp4", "frames": N, "fps": F, "size": [w, h],
           "coverage": mean mask fraction, "audio": "pitched"|"original"|"given"|"none", ...}
Audio: --audio if given, else DIR/pitched.wav when audio.py already ran into the same --out folder, else the
clip's own audio."""
import argparse, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C


def clean_border_fragments(m):
    """Genjutsu raw_masks.clean_border_fragments: drop tiny, narrow components touching the left/right edge."""
    import cv2, numpy as np
    h, w = m.shape
    k, lab, st, _ = cv2.connectedComponentsWithStats(m.astype(np.uint8), connectivity=8)
    for ident in (set(lab[:, 0].tolist()) | set(lab[:, -1].tolist())) - {0}:
        if st[ident, cv2.CC_STAT_AREA] < h * w * 0.03 and st[ident, cv2.CC_STAT_WIDTH] <= max(6, int(w * 0.05)):
            m[lab == ident] = False
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--depth", required=True)
    ap.add_argument("--mask", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--mesh", action="store_true")
    ap.add_argument("--audio", default="")
    a = ap.parse_args()
    src, dep, msk = C.need_file(a.inp), C.need_file(a.depth, "--depth"), C.need_file(a.mask, "--mask")
    out = C.out_dir(a.out)
    import numpy as np, cv2

    di, mi = C.probe(dep), C.probe(msk)
    w, h, fps = di["w"], di["h"], round(di["fps"], 3)
    if abs(mi["fps"] - di["fps"]) > 0.01:
        C.fail(f"depth ({di['fps']:g} fps) and mask ({mi['fps']:g} fps) were made at different frame rates")
    C.progress(2, "normalising video to the depth size")
    norm = os.path.join(out, "normalized.mp4")
    ni = C.normalize(src, norm, fps=fps, size=(w, h))
    counts = [ni["frames"], di["frames"], mi["frames"]]
    if max(counts) - min(counts) > 2:
        C.fail(f"frame alignment failed (original/depth/mask = {counts}); rebuild depth and mask from the same clip")
    n = min(counts)

    if a.audio:
        audio, akind = C.need_file(a.audio, "--audio"), "given"
    elif os.path.isfile(os.path.join(out, "pitched.wav")):
        audio, akind = os.path.join(out, "pitched.wav"), "pitched"
    elif ni["audio"]:
        audio, akind = norm, "original"
    else:
        audio, akind = None, "none"

    mesh = None
    if a.mesh:
        from facemesh import Mesh
        mesh = Mesh(fps)
    gpath, ppath = os.path.join(out, "guide.mp4"), os.path.join(out, "guide_preview.mp4")
    pw, ph = C.fit(w * 2, h, 1920)
    wg = C.Writer(gpath, w, h, fps, audio=audio, crf=16)
    wp = C.Writer(ppath, pw, ph, fps, audio=audio, crf=22)
    cov, missing, saved = [], [], []
    frames = zip(C.read_frames(norm, w, h), C.read_frames(dep, w, h), C.read_frames(msk, w, h))
    for i, (rgb, d, m) in enumerate(frames):
        if i >= n:
            break
        mm = clean_border_fragments(m[:, :, 0] > 127)
        cov.append(float(mm.mean()))
        comp = np.where(mm[:, :, None], d, rgb).astype(np.uint8)
        if mesh:
            faces = mesh.detect(rgb, i)
            if not faces:
                missing.append(i)
            saved.append({"frame": i, "time": round(i / fps, 4),
                          "faces": [[{"x": round(x, 5), "y": round(y, 5), "z": round(z, 5)} for x, y, z in f]
                                    for f in faces]})
            comp = mesh.draw(comp, faces)
        wg.write(comp)
        left = rgb.copy()
        cs, _ = cv2.findContours(mm.astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(left, cs, -1, (60, 255, 120), 2, cv2.LINE_AA)
        wp.write(cv2.resize(np.hstack([left, comp]), (pw, ph), interpolation=cv2.INTER_AREA))
        if i % 12 == 0:
            C.progress(5 + 93 * i / n, f"compositing frame {i + 1}/{n}")
    wg.close()
    wp.close()
    if not any(cov):
        C.fail("the mask is empty in every frame; segment the subject again")
    res = {"guide": C.path_out(gpath), "preview": C.path_out(ppath), "frames": len(cov), "fps": fps, "size": [w, h],
           "coverage": round(sum(cov) / len(cov), 4), "audio": akind}
    if mesh:
        import json
        mesh.close()
        lm = os.path.join(out, "face-landmarks.json")
        with open(lm, "w", encoding="utf-8") as f:
            json.dump({"fps": fps, "size": [w, h], "points": 478, "frames": saved, "missing_frames": missing}, f,
                      separators=(",", ":"))
        res.update(landmarks=C.path_out(lm), mesh_tracked=len(cov) - len(missing), mesh_missing=missing)
    C.result(res)


if __name__ == "__main__":
    C.run_main(main)
