"""Original + pitch-shifted soundtrack (ffmpeg Rubber Band, same duration) - the guide video's embedded audio.
usage: audio.py --in clip.mp4 --out DIR [--pitch 3]
-> RESULT {"original": "DIR/original.wav", "pitched": "DIR/pitched.wav", "semitones": 3, "duration": s}
Note: the Genjustsu workflow pitches isolated vocals (Demucs); this shifts the whole mix (no separation model)."""
import argparse, os, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import st_common as C

RATE = 48000


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="inp", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--pitch", type=float, default=3.0, help="semitones (+ up, - down)")
    a = ap.parse_args()
    src = C.need_file(a.inp)
    out = C.out_dir(a.out)
    if not C.probe(src)["audio"]:
        C.fail("the clip has no audio track")
    orig, pitched = os.path.join(out, "original.wav"), os.path.join(out, "pitched.wav")
    C.progress(10, "extracting audio")
    C.sh([C.FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-vn", "-ac", "2", "-ar", str(RATE),
          "-c:a", "pcm_s16le", orig])
    n = int(C.sh([C.FFPROBE, "-v", "error", "-select_streams", "a:0", "-count_packets", "-show_entries",
                  "stream=duration_ts", "-of", "default=nw=1:nk=1", orig], "ffprobe").strip() or 0)
    C.progress(40, f"pitch shift {a.pitch:+g} semitones")
    ratio = 2 ** (a.pitch / 12.0)
    af = (f"rubberband=pitch={ratio:.6f}:tempo=1:pitchq=quality:channels=together:transients=mixed,"
          f"apad=whole_len={n},atrim=end_sample={n}")
    C.sh([C.FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-i", orig, "-af", af, "-ar", str(RATE),
          "-c:a", "pcm_s16le", pitched])
    C.result({"original": C.path_out(orig), "pitched": C.path_out(pitched), "semitones": a.pitch,
              "duration": round(n / RATE, 3)})


if __name__ == "__main__":
    C.run_main(main)
