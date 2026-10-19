"""Resumable downloader for flaky connections: HTTP Range resume, retries, and an optional sha256 check.
usage: python -I dl.py <url> <out> [sha256]
Prints `ok <out> <bytes>` when done. A file already at <out> that matches the sha256 is kept and not fetched again.
Needs only the standard library (uses certifi's CA list when it is installed, which helps on macOS)."""
import hashlib, os, sys, time, urllib.error, urllib.request

UA = "Mozilla/5.0 (local-tools setup; python urllib)"


class DownloadError(Exception):
    pass


def _ssl_context():
    try:
        import certifi, ssl
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return None


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 22), b""):
            h.update(b)
    return h.hexdigest()


def download(url, out, want=None, attempts=40, log=print):
    """Fetch `url` to `out` (via `out`.part, resumed across runs). `want` = expected sha256 (hex) or None."""
    out = os.path.abspath(out)
    want = want.lower() if want else None
    if os.path.isfile(out) and (not want or sha256_of(out) == want):
        log(f"ok {out} {os.path.getsize(out)} (already there)")
        return out
    os.makedirs(os.path.dirname(out), exist_ok=True)
    part = out + ".part"
    ctx = _ssl_context()
    done = False
    for attempt in range(1, attempts + 1):
        have = os.path.getsize(part) if os.path.exists(part) else 0
        headers = {"User-Agent": UA}
        if have:
            headers["Range"] = f"bytes={have}-"
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60, context=ctx) as r:
                if r.status == 200 and have:  # server ignored the range: start over
                    have = 0
                    open(part, "wb").close()
                rng = r.headers.get("Content-Range") or ""
                length = r.headers.get("Content-Length")
                if "/" in rng and not rng.endswith("/*"):
                    total = int(rng.split("/")[-1])
                else:
                    total = have + int(length) if length else None
                with open(part, "ab") as f:
                    while True:
                        b = r.read(1 << 20)
                        if not b:
                            break
                        f.write(b)
            if total is None or os.path.getsize(part) >= total:  # unknown length: the stream ended cleanly
                done = True
                break
        except urllib.error.HTTPError as e:
            if e.code == 416 and have:  # the range starts at the end: already complete
                done = True
                break
            log(f"attempt {attempt}: HTTP {e.code}")
            if e.code in (401, 403, 404, 410):  # retrying will not help
                break
        except Exception as e:
            log(f"attempt {attempt}: {type(e).__name__} at {os.path.getsize(part) if os.path.exists(part) else 0} bytes")
        time.sleep(min(30, 2 * attempt))
    if not done:
        raise DownloadError("gave up downloading " + url)
    if want:
        got = sha256_of(part)
        if got != want:
            os.remove(part)
            raise DownloadError(f"sha256 mismatch for {out} (got {got[:16]}...); the bad file was deleted, run again")
    os.replace(part, out)
    log(f"ok {out} {os.path.getsize(out)}")
    return out


if __name__ == "__main__":
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    try:
        download(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else None,
                 log=lambda m: print(m, flush=True))
    except DownloadError as e:
        raise SystemExit(str(e))
