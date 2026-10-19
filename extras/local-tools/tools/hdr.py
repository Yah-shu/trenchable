"""SDR (BT.709) -> HDR10 (BT.2020 primaries, PQ, 10-bit HEVC with mastering metadata). No model.
usage: hdr.py --in clip.mp4 --out DIR [--peak 600] [--white 203] [--crf 18]
-> RESULT {"video": "DIR/hdr.mp4", "max_cll": nits, "max_fall": nits, "peak": nits}
Pipeline: ffmpeg zscale linearises the SDR picture (BT.1886 display EOTF) -> gentle inverse-tone expansion on
luminance (SDR white -> --white nits as in ITU-R BT.2408; everything below 60% linear is a straight line, only the
top highlights roll up to --peak nits, hue kept by scaling R,G,B together) -> BT.709->BT.2020 primaries -> PQ ->
x265 Main10 with HDR10 SEI (P3-D65 mastering display, MaxCLL/MaxFALL measured on a quick pre-pass). Audio copied."""
import argparse, os, subprocess, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C

M709_2020 = [[0.627404, 0.329283, 0.043313], [0.069097, 0.919540, 0.011362], [0.016391, 0.088013, 0.895595]]
KNEE = 0.6


def linear_reader(src, w, h):
    import numpy as np
    vf = (f"zscale=w={w}:h={h}:filter=spline36:tin=bt709:min=bt709:pin=bt709:rin=limited:"
          f"t=linear:p=bt709:npl=100,format=gbrpf32le")
    p = subprocess.Popen([C.FFMPEG, "-hide_banner", "-loglevel", "error", "-i", src, "-vf", vf, "-f", "rawvideo",
                          "-pix_fmt", "gbrpf32le", "-"], stdout=subprocess.PIPE,
                         creationflags=C.SPAWN_FLAGS)
    n = w * h * 3 * 4
    try:
        while True:
            b = p.stdout.read(n)
            if len(b) < n:
                break
            g, bl, r = np.frombuffer(b, np.float32).reshape(3, h, w)
            yield np.stack([r, g, bl], axis=-1)
    finally:
        p.stdout.close()
        p.wait()


def expand(rgb, white, peak):
    """linear SDR RGB (1.0 = SDR white) -> linear BT.2020 RGB in nits."""
    import numpy as np
    rgb = np.clip(rgb, 0.0, 1.0)
    y = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)
    a = white * (1 - KNEE) / max(peak - white * KNEE, 1e-3)  # slope match at the knee (C1-continuous)
    t = np.clip((y - KNEE) / (1 - KNEE), 0.0, 1.0)
    hi = white * KNEE + (peak - white * KNEE) * (a * t + (1 - a) * t ** 3)
    nits = np.where(y > KNEE, hi, white * y)
    gain = nits / np.maximum(y, 1e-6)
    out = (rgb * gain[..., None]) @ np.array(M709_2020, np.float32).T
    return np.clip(out, 0.0, peak)


def pq(nits):
    import numpy as np
    m1, m2, c1, c2, c3 = 2610 / 16384, 2523 / 4096 * 128, 3424 / 4096, 2413 / 4096 * 32, 2392 / 4096 * 32
    l = np.power(np.clip(nits / 10000.0, 0, 1), m1)
    return np.power((c1 + c2 * l) / (1 + c3 * l), m2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--peak", type=float, default=600.0, help="nits for SDR 100%% highlights (gentle: 400-1000)")
    ap.add_argument("--white", type=float, default=203.0, help="nits for SDR diffuse white (BT.2408: 203)")
    ap.add_argument("--crf", type=int, default=18)
    a = ap.parse_args()
    src = C.need_file(a.inp)
    out = C.out_dir(a.out)
    import numpy as np
    trc = C.sh([C.FFPROBE, "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=color_transfer", "-of",
                "default=nw=1:nk=1", src], "ffprobe").strip()
    if trc in ("smpte2084", "arib-std-b67"):
        C.fail(f"this clip is already HDR ({trc})")
    info = C.probe(src)
    w, h = info["w"] // 2 * 2, info["h"] // 2 * 2
    n = max(1, info["frames"])

    C.progress(3, "measuring highlights")
    sw, sh_ = C.fit(w, h, 480)
    cll = fall = 0.0
    for i, f in enumerate(linear_reader(src, sw, sh_)):
        m = expand(f, a.white, a.peak).max(axis=-1)
        cll, fall = max(cll, float(m.max())), max(fall, float(m.mean()))
        if i % 24 == 0:
            C.progress(3 + 12 * i / n, "measuring highlights")
    cll, fall = int(round(min(cll, a.peak))), int(round(fall))

    path = os.path.join(out, "hdr.mp4")
    x265 = (f"hdr10=1:hdr10-opt=1:repeat-headers=1:colorprim=bt2020:transfer=smpte2084:colormatrix=bt2020nc:"
            f"range=limited:master-display=G(13250,34500)B(7500,3000)R(34000,16000)WP(15635,16450)"
            f"L({int(a.peak * 10000)},50):max-cll={cll},{fall}:log-level=error")
    cmd = [C.FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb48le", "-s",
           f"{w}x{h}", "-r", f"{info['fps']:.6f}", "-i", "-", "-i", src, "-map", "0:v:0", "-map", "1:a:0?",
           "-vf", "scale=in_range=full:out_range=limited:out_color_matrix=bt2020:flags=spline,format=yuv420p10le",
           "-c:v", "libx265", "-preset", "medium", "-crf", str(a.crf), "-profile:v", "main10", "-tag:v", "hvc1",
           "-x265-params", x265, "-color_primaries", "bt2020", "-color_trc", "smpte2084", "-colorspace", "bt2020nc",
           "-color_range", "tv", "-c:a", "copy", "-movflags", "+faststart", path]
    enc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=C.SPAWN_FLAGS)
    for i, f in enumerate(linear_reader(src, w, h)):
        e = pq(expand(f, a.white, a.peak))
        enc.stdin.write((e * 65535.0 + 0.5).astype("<u2").tobytes())
        if i % 12 == 0:
            C.progress(15 + 84 * i / n, f"HDR frame {i + 1}/{n}")
    enc.stdin.close()
    err = enc.stderr.read().decode("utf-8", "replace")
    if enc.wait() != 0:
        C.fail("x265 encode failed: " + err.strip()[-300:])
    C.result({"video": C.path_out(path), "max_cll": cll, "max_fall": fall, "peak": a.peak, "white": a.white})


if __name__ == "__main__":
    C.run_main(main)
