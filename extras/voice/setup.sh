#!/usr/bin/env bash
# Installs the optional voice extra on macOS (Apple Silicon) or Linux: local speech-to-text (faster-whisper) for
# Voice change and Translate. Creates venv/ (Python 3.11 or 3.12), installs the pinned packages, downloads the
# Whisper model into cache/ (a Hugging Face cache the app reads offline), then runs an offline test with the exact
# settings the app uses. CPU only. Safe to run again: finished steps are checked and skipped.
#
#   bash setup.sh                 install with the default model (small, about 484 MB)
#   bash setup.sh --dry-run       print every step without doing it
#   bash setup.sh --help          all options
set -eo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/venv"
VPY="$VENV/bin/python"
STEPS="$HERE/setup_steps.py"
REQ="$HERE/requirements.txt"
PIPNET=(--retries 10 --timeout 120)

MODEL="small"
PYTHON=""
DRY=0

usage() {
  cat <<'EOF'
Usage: bash setup.sh [options]

  --model NAME     faster-whisper model (default small). If you change it, the app must be given the same name
                   (DUB_WHISPER_MODEL); installed.json records it.
  --python PATH    the python to build the venv with (3.11 or 3.12)
  --dry-run        print every step without doing it
  -h, --help       this text
EOF
}

title() { printf '\n== %s\n' "$1"; }
note() { printf '   %s\n' "$1"; }
warn() { printf '   WARNING: %s\n' "$1"; }
die() { printf '\nSETUP STOPPED: %s\n' "$1"; exit 1; }
show() { printf '   >'; printf ' %q' "$@"; printf '\n'; }

step() {
  local what="$1"; shift
  show "$@"
  [ "$DRY" = 1 ] && return 0
  "$@" || die "$what failed (exit code $?). Read the lines above, fix the cause and run setup again."
}

rc_of() { local rc=0; "$@" || rc=$?; return $rc; }

need_val() { [ $# -ge 2 ] && [ -n "$2" ] || die "$1 needs a value (see --help)"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --model) need_val "$@"; MODEL="$2"; shift 2 ;;
    --model=*) MODEL="${1#*=}"; shift ;;
    --python) need_val "$@"; PYTHON="$2"; shift 2 ;;
    --python=*) PYTHON="${1#*=}"; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n\n' "$1"; usage; exit 1 ;;
  esac
done

py_minor() {
  "$1" -c 'import sys; print(sys.version_info[0], sys.version_info[1])' 2>/dev/null | awk '$1 == 3 { m = $2 } END { if (m != "") print m }'
}

SYS_PY=""
SYS_MINOR=""
find_python() {
  local c m
  if [ -n "$PYTHON" ]; then
    m="$(py_minor "$PYTHON" || true)"
    if [ -n "$m" ] && [ "$m" -ge 11 ] && [ "$m" -le 12 ]; then SYS_PY="$PYTHON"; SYS_MINOR="$m"; return 0; fi
    die "$PYTHON is not Python 3.11 or 3.12."
  fi
  for c in python3.12 python3.11 python3; do
    command -v "$c" >/dev/null 2>&1 || continue
    m="$(py_minor "$c" || true)"
    if [ -n "$m" ] && [ "$m" -ge 11 ] && [ "$m" -le 12 ]; then SYS_PY="$(command -v "$c")"; SYS_MINOR="$m"; return 0; fi
    [ -n "$m" ] && note "Skipping $c (Python 3.$m; the voice extra needs 3.11 or 3.12)."
  done
  return 1
}

echo "Voice extra setup (speech-to-text for Voice change and Translate)"
echo "Folder: $HERE"
[ "$DRY" = 1 ] && echo "DRY RUN: every step is printed. Nothing is installed, downloaded or changed."
OS="$(uname -s)"
if [ "$OS" = "Darwin" ] && [ "$(uname -m)" != "arm64" ]; then
  warn "This is an Intel Mac. Only Apple Silicon Macs (M1 or newer) are supported; the install will likely fail."
fi

# ---------------------------------------------------------------- 1. Python
title "Step 1 of 5: Python"
RUN_PY=""
if [ -x "$VPY" ]; then
  VMINOR="$(py_minor "$VPY" || true)"
  if [ -z "$VMINOR" ] || [ "$VMINOR" -lt 11 ] || [ "$VMINOR" -gt 12 ]; then
    die "venv/ exists but its Python does not run or is not 3.11 or 3.12. Delete the venv folder and run setup again."
  fi
  note "venv/ already exists (Python 3.$VMINOR)."
  RUN_PY="$VPY"
elif find_python; then
  note "Using $SYS_PY (Python 3.$SYS_MINOR)."
  RUN_PY="$SYS_PY"
elif [ "$DRY" = 1 ]; then
  warn "Python 3.11 or 3.12 was not found. A real run would stop here; the dry run goes on with 'python3.12'."
  SYS_PY="python3.12"
  SYS_MINOR="12"
else
  if [ "$OS" = "Darwin" ]; then
    die "Python 3.12 was not found. Install it with: brew install python@3.12  (or from python.org), then run setup again."
  fi
  die "Python 3.12 was not found. Install it (Ubuntu 24.04: sudo apt install python3.12 python3.12-venv), then run setup again. Or pass --python /path/to/python3.12."
fi
FREE_GB="$(df -Pk "$HERE" 2>/dev/null | awk 'NR == 2 { printf "%d", $4 / 1048576 }' || true)"
[ -n "$FREE_GB" ] && note "Free space here: $FREE_GB GB (this setup needs about 1.5 GB)."

# ---------------------------------------------------------------- 2. venv
title "Step 2 of 5: virtual environment (venv/)"
if [ -x "$VPY" ]; then
  note "Already there."
else
  if [ "$DRY" != 1 ] && ! "$SYS_PY" -c 'import venv, ensurepip' >/dev/null 2>&1; then
    die "This Python cannot make a venv. On Debian/Ubuntu install it with: sudo apt install python3.$SYS_MINOR-venv"
  fi
  step "Creating the venv" "$SYS_PY" -m venv "$VENV"
fi
step "Updating pip" "$VPY" -m pip install --upgrade pip "${PIPNET[@]}"

# ---------------------------------------------------------------- 3. packages
title "Step 3 of 5: packages (requirements.txt)"
step "Installing the packages" "$VPY" -m pip install "${PIPNET[@]}" -r "$REQ"

# ---------------------------------------------------------------- 4. model
title "Step 4 of 5: Whisper model '$MODEL' into cache/"
DL_ARGS=(-I "$STEPS" download --model "$MODEL")
[ "$DRY" = 1 ] && DL_ARGS+=(--dry-run)
AP="$RUN_PY"
[ -x "$VPY" ] && AP="$VPY"
if [ -n "$AP" ]; then
  DCODE=0
  rc_of "$AP" "${DL_ARGS[@]}" || DCODE=$?
  [ "$DCODE" = 0 ] || die "The model download did not finish. Run setup again; it resumes where it stopped."
else
  show python3.12 "${DL_ARGS[@]}"
fi

# ---------------------------------------------------------------- 5. check
title "Step 5 of 5: offline test, exactly as the app runs it"
show "$VPY" -I "$STEPS" check --model "$MODEL"
if [ "$DRY" = 1 ]; then
  printf '\nDry run finished. Run again without --dry-run to do it.\n'
  exit 0
fi
"$VPY" -I "$STEPS" check --model "$MODEL" || die "The offline test failed (see above)."
printf '\nDone. Restart the app (or wait half a minute) and Voice change / Translate can transcribe.\n'
if [ "$MODEL" != "small" ]; then
  printf "Model '%s' is not the default: the app must run transcribe.py with DUB_WHISPER_MODEL=%s.\n" "$MODEL" "$MODEL"
fi
