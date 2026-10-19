"""One still frame for the click-to-select UI (no GPU).
usage: frame.py --in clip.mp4 --out DIR --t 0 [--name frame.png]
-> RESULT {"image": "DIR/frame.png", "size": [w, h], "duration": s, "fps": f, "t": t, "frame_24": round(t*24)}
size = the clip's own resolution (clicks are sent to segment.py normalised 0-1, so resolution does not matter);
frame_24 = the frame index segment.py uses at its default --fps 24."""
import argparse, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--t", type=float, default=0.0)
    ap.add_argument("--name", default="frame.png")
    a = ap.parse_args()
    src = C.need_file(a.inp)
    out = C.out_dir(a.out)
    info = C.probe(src)
    t = max(0.0, min(a.t, max(0.0, info["duration"] - 1.0 / max(info["fps"], 1))))
    img = os.path.join(out, a.name)
    C.progress(10, "extracting frame")
    C.sh([C.FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-ss", f"{t:.3f}", "-i", src, "-frames:v", "1",
          "-update", "1", img])
    if not os.path.isfile(img):
        C.fail("could not read a frame at that time")
    C.result({"image": C.path_out(img), "size": [info["w"], info["h"]], "duration": round(info["duration"], 3),
              "fps": round(info["fps"], 3), "t": round(t, 3), "frame_24": int(round(t * 24))})


if __name__ == "__main__":
    C.run_main(main)
