"""Transcribe one clip for the Studio dub pipeline (Voice change, Translate) — local faster-whisper on CPU.

Usage: python -I transcribe.py <audio.wav> <out.json>
Writes {"language", "duration", "segments": [{"start", "end", "text", "words": [{"word", "start", "end"}]}]}
and prints {"segments": n, "language": "en"} on stdout.

The model comes from the voice extra's cache (HF_HOME is set by the caller, server/studio/dub.ts, to
extras/voice/cache, and HF_HUB_OFFLINE=1 so a missing model fails instead of downloading another one;
extras/voice/setup downloads it once).
"""
import json
import os
import sys

from faster_whisper import WhisperModel

MODEL = os.environ.get("DUB_WHISPER_MODEL", "small")


def main() -> None:
    audio, out_path = sys.argv[1], sys.argv[2]
    model = WhisperModel(MODEL, device="cpu", compute_type="int8")
    segments, info = model.transcribe(audio, word_timestamps=True, vad_filter=True)
    out = {"language": info.language, "duration": info.duration, "segments": []}
    for seg in segments:
        text = seg.text.strip()
        if not text:
            continue
        out["segments"].append(
            {
                "start": round(seg.start, 2),
                "end": round(seg.end, 2),
                "text": text,
                "words": [{"word": w.word.strip(), "start": round(w.start, 2), "end": round(w.end, 2)} for w in (seg.words or [])],
            }
        )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False)
    print(json.dumps({"segments": len(out["segments"]), "language": info.language}))


if __name__ == "__main__":
    main()
