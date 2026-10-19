"""MediaPipe Face Landmarker (Apache-2.0) face mesh: landmarks JSON + mesh drawn over a video. CPU only; the model is
models/face_landmarker.task (setup downloads it). Drawing style follows the Genjustsu workflow's mesh_worker.py (MIT,
Sirio Berati).
usage: facemesh.py --in clip.mp4 --out DIR [--over DIR/composite.mp4] [--max-side 960] [--fps 24]
-> RESULT {"landmarks": "DIR/face-landmarks.json", "overlay": "DIR/mesh.mp4", "frames": N, "tracked": k,
           "missing": [frame indexes without a face], "size": [w, h], "fps": F}
With --over, the clip is normalised to that video's exact size and frame rate so the mesh lines up with it;
otherwise to <= --max-side px at --fps (same working copy as depth.py / segment.py).
Landmark x/y are normalised 0-1 over the frame (478 points, MediaPipe order)."""
import argparse, json, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C

MODEL = C.MODELS + "/face_landmarker.task"


class Mesh:
    def __init__(self, fps):
        import mediapipe as mp
        self.mp = mp
        v = mp.tasks.vision
        opts = v.FaceLandmarkerOptions(base_options=mp.tasks.BaseOptions(model_asset_path=MODEL),
                                       running_mode=v.RunningMode.VIDEO, num_faces=1,
                                       min_face_detection_confidence=0.15, min_face_presence_confidence=0.15,
                                       min_tracking_confidence=0.15)
        self.det = v.FaceLandmarker.create_from_options(opts)
        self.fps = fps
        cn = v.FaceLandmarksConnections
        self.tess = [(c.start, c.end) for c in cn.FACE_LANDMARKS_TESSELATION]
        self.accents = [([(c.start, c.end) for c in getattr(cn, name)], col) for name, col in
                        [("FACE_LANDMARKS_LIPS", (255, 135, 100)), ("FACE_LANDMARKS_LEFT_EYE", (130, 255, 150)),
                         ("FACE_LANDMARKS_RIGHT_EYE", (130, 255, 150))]]

    def detect(self, rgb, i):
        import numpy as np
        img = self.mp.Image(image_format=self.mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        r = self.det.detect_for_video(img, int(round(i * 1000.0 / self.fps)))
        return [[(l.x, l.y, l.z) for l in face] for face in r.face_landmarks]

    def draw(self, img, faces):
        import cv2
        h, w = img.shape[:2]
        img = img.copy()
        for face in faces:
            pts = [(int(round(x * w)), int(round(y * h))) for x, y, _ in face]
            for s, e in self.tess:
                cv2.line(img, pts[s], pts[e], (50, 170, 205), 1, cv2.LINE_AA)
            for conns, col in self.accents:
                for s, e in conns:
                    cv2.line(img, pts[s], pts[e], col, 2, cv2.LINE_AA)
        return img

    def close(self):
        self.det.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--over", default="")
    ap.add_argument("--max-side", type=int, default=960)
    ap.add_argument("--fps", type=float, default=24)
    a = ap.parse_args()
    src = C.need_file(a.inp)
    out = C.out_dir(a.out)
    over = C.need_file(a.over, "--over") if a.over else None

    C.progress(2, "normalising video")
    norm = os.path.join(out, "normalized.mp4")
    if over:
        oi = C.probe(over)
        fps = round(oi["fps"], 3)
        info = C.normalize(src, norm, fps=fps, size=(oi["w"], oi["h"]))
    else:
        fps = a.fps
        info = C.normalize(src, norm, a.max_side, fps)
    w, h, n = info["w"], info["h"], max(1, info["frames"])

    C.progress(6, "tracking face")
    mesh = Mesh(fps)
    path = os.path.join(out, "mesh.mp4")
    audio_from = over if (over and C.probe(over)["audio"]) else (norm if info["audio"] else None)
    wr = C.Writer(path, w, h, fps, audio=audio_from, crf=16)
    bg = C.read_frames(over, w, h) if over else None
    saved, missing = [], []
    for i, rgb in enumerate(C.read_frames(norm, w, h)):
        faces = mesh.detect(rgb, i)
        if not faces:
            missing.append(i)
        saved.append({"frame": i, "time": round(i / fps, 4),
                      "faces": [[{"x": round(x, 5), "y": round(y, 5), "z": round(z, 5)} for x, y, z in f] for f in faces]})
        base = next(bg, None) if bg is not None else rgb
        if base is None:  # --over is shorter: stop where it ends
            saved.pop()
            break
        wr.write(mesh.draw(base, faces))
        if i % 12 == 0:
            C.progress(6 + 90 * i / n, f"face mesh frame {i + 1}/{n}")
    wr.close()
    mesh.close()
    lm = os.path.join(out, "face-landmarks.json")
    with open(lm, "w", encoding="utf-8") as f:
        json.dump({"fps": fps, "size": [w, h], "points": 478, "frames": saved, "missing_frames": missing}, f,
                  separators=(",", ":"))
    tracked = len(saved) - len([m for m in missing if m < len(saved)])
    if tracked == 0:
        C.fail("no face found in any frame (face mesh needs a visible face)")
    C.result({"landmarks": C.path_out(lm), "overlay": C.path_out(path), "frames": len(saved), "tracked": tracked,
              "missing": missing, "size": [w, h], "fps": fps})


if __name__ == "__main__":
    C.run_main(main)
