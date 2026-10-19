#!/usr/bin/env bash
# Installs the optional local video tools (Remove BG, Depth Map, FPS Boost, SDR to HDR, Guided swap guide) on
# macOS (Apple Silicon) or Linux. Creates venv/ (Python 3.10 to 3.12), installs PyTorch for your graphics card and
# the pinned packages, fetches the model code into repos/ and the model files into models/ (size and sha256
# checked), then runs tools/doctor.py --quick. Safe to run again: finished steps are checked and skipped.
#
#   bash setup.sh                 pick everything automatically
#   bash setup.sh --gpu nvidia    or amd / cpu (Linux). On a Mac the Apple GPU is used automatically.
#   bash setup.sh --dry-run       print every step without doing it
#   bash setup.sh --help          all options
set -eo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HERE/venv"
VPY="$VENV/bin/python"
STEPS="$HERE/setup_steps.py"
REQ="$HERE/requirements.txt"
REQ_NODEPS="$HERE/requirements-nodeps.txt"

NVIDIA_INDEX="https://download.pytorch.org/whl/cu130"      # RTX 20-series and newer, driver 580+
NVIDIA_OLD_INDEX="https://download.pytorch.org/whl/cu126"  # GTX 900/10-series (CUDA 13 dropped them)
AMD_INDEX="https://download.pytorch.org/whl/rocm7.2"       # Linux ROCm build from pytorch.org
CPU_INDEX="https://download.pytorch.org/whl/cpu"
PYPI="https://pypi.org/simple"
PIPNET=(--retries 10 --timeout 120)

GPU="auto"
TORCH_INDEX=""
TORCH_VERSION=""
TORCHVISION_VERSION=""
PYTHON=""
REINSTALL=0
SKIP_MODELS=0
DRY=0

usage() {
  cat <<'EOF'
Usage: bash setup.sh [options]

  --gpu auto|nvidia|amd|cpu    graphics card to install PyTorch for (default auto). Ignored on a Mac, which
                               always uses the Apple GPU (MPS) when there is one.
  --torch-index URL|FOLDER     get PyTorch from this pip index URL, or from a local folder of .whl files
  --torch-version V            exact torch version (default: newest on the index)
  --torchvision-version V      exact torchvision version (default: the one that matches torch)
  --python PATH                the python to build the venv with (3.10 to 3.12)
  --reinstall-torch            install PyTorch again even if the right build is there
  --skip-models                do not download the model files (about 330 MB)
  --dry-run                    print every step without doing it
  -h, --help                   this text
EOF
}

title() { printf '\n== %s\n' "$1"; }
note() { printf '   %s\n' "$1"; }
warn() { printf '   WARNING: %s\n' "$1"; }
die() { printf '\nSETUP STOPPED: %s\n' "$1"; exit 1; }
show() { printf '   >'; printf ' %q' "$@"; printf '\n'; }

# Run a command and stop setup if it fails. In a dry run, only print it.
step() {
  local what="$1"; shift
  show "$@"
  [ "$DRY" = 1 ] && return 0
  "$@" || die "$what failed (exit code $?). Read the lines above, fix the cause and run setup again."
}

# Run a command and give back its exit code without stopping setup.
rc_of() { local rc=0; "$@" || rc=$?; return $rc; }

need_val() { [ $# -ge 2 ] && [ -n "$2" ] || die "$1 needs a value (see --help)"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --gpu) need_val "$@"; GPU="$2"; shift 2 ;;
    --gpu=*) GPU="${1#*=}"; shift ;;
    --torch-index) need_val "$@"; TORCH_INDEX="$2"; shift 2 ;;
    --torch-index=*) TORCH_INDEX="${1#*=}"; shift ;;
    --torch-version) need_val "$@"; TORCH_VERSION="$2"; shift 2 ;;
    --torch-version=*) TORCH_VERSION="${1#*=}"; shift ;;
    --torchvision-version) need_val "$@"; TORCHVISION_VERSION="$2"; shift 2 ;;
    --torchvision-version=*) TORCHVISION_VERSION="${1#*=}"; shift ;;
    --python) need_val "$@"; PYTHON="$2"; shift 2 ;;
    --python=*) PYTHON="${1#*=}"; shift ;;
    --reinstall-torch) REINSTALL=1; shift ;;
    --skip-models) SKIP_MODELS=1; shift ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) printf 'Unknown option: %s\n\n' "$1"; usage; exit 1 ;;
  esac
done
case "$GPU" in auto|nvidia|amd|cpu|mps|mac) ;; *) die "--gpu must be auto, nvidia, amd or cpu (got '$GPU')" ;; esac

py_minor() {  # prints the minor version (12 for 3.12) of a python, or nothing
  "$1" -c 'import sys; print(sys.version_info[0], sys.version_info[1])' 2>/dev/null | awk '$1 == 3 { m = $2 } END { if (m != "") print m }'
}

SYS_PY=""
SYS_MINOR=""
find_python() {
  local c m
  if [ -n "$PYTHON" ]; then
    m="$(py_minor "$PYTHON" || true)"
    if [ -n "$m" ] && [ "$m" -ge 10 ] && [ "$m" -le 12 ]; then SYS_PY="$PYTHON"; SYS_MINOR="$m"; return 0; fi
    die "$PYTHON is not Python 3.10 to 3.12."
  fi
  for c in python3.12 python3.11 python3.10 python3; do
    command -v "$c" >/dev/null 2>&1 || continue
    m="$(py_minor "$c" || true)"
    if [ -n "$m" ] && [ "$m" -ge 10 ] && [ "$m" -le 12 ]; then SYS_PY="$(command -v "$c")"; SYS_MINOR="$m"; return 0; fi
    [ -n "$m" ] && note "Skipping $c (Python 3.$m; these tools need 3.10, 3.11 or 3.12)."
  done
  return 1
}

echo "Local tools setup (Remove BG, Depth Map, FPS Boost, SDR to HDR, Guided swap guide)"
echo "Folder: $HERE"
[ "$DRY" = 1 ] && echo "DRY RUN: every step is printed. Nothing is installed, downloaded or changed."

# ---------------------------------------------------------------- 1. graphics card
title "Step 1 of 8: graphics card"
OS="$(uname -s)"
NV_INDEX="$NVIDIA_INDEX"
if [ "$OS" = "Darwin" ]; then
  if [ "$(uname -m)" != "arm64" ]; then
    warn "This is an Intel Mac. Only Apple Silicon Macs (M1 or newer) are supported; the tools may not install."
  fi
  case "$GPU" in
    auto|cpu|mps|mac) GPU="mac" ;;
    *) die "On a Mac leave out --gpu (the Apple GPU is used automatically)." ;;
  esac
  note "macOS: PyTorch from PyPI, which uses the Apple GPU (MPS) when there is one."
else
  NAMES=""
  if command -v nvidia-smi >/dev/null 2>&1; then
    NAMES="$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || true)"
  fi
  if [ -z "$NAMES" ] && command -v lspci >/dev/null 2>&1; then
    NAMES="$(lspci 2>/dev/null | grep -iE 'vga|3d|display' | sed 's/^[^:]*: //' || true)"
  fi
  if [ -n "$NAMES" ]; then
    while IFS= read -r line; do note "Found: $line"; done <<<"$NAMES"
  fi
  if [ "$GPU" = "auto" ]; then
    if command -v nvidia-smi >/dev/null 2>&1 && nvidia-smi -L >/dev/null 2>&1; then
      GPU="nvidia"
    elif [ -e /dev/kfd ] || command -v rocminfo >/dev/null 2>&1; then
      GPU="amd"
    else
      GPU="cpu"
    fi
    note "Using --gpu $GPU. (Pass --gpu nvidia, amd or cpu to choose yourself.)"
  else
    note "Using --gpu $GPU (your choice)."
  fi
  [ "$GPU" = "mps" ] || [ "$GPU" = "mac" ] && die "--gpu $GPU is for Macs only."
  if [ "$GPU" = "nvidia" ] && printf '%s' "$NAMES" | grep -qE 'GTX (9[0-9][0-9]|10[0-9][0-9])\b|Quadro [MP][0-9]|TITAN X\b'; then
    NV_INDEX="$NVIDIA_OLD_INDEX"
    note "Older NVIDIA card found: using the CUDA 12.6 build of PyTorch (CUDA 13 no longer supports it)."
  fi
fi

NEED_GB=3
[ "$GPU" = "nvidia" ] && NEED_GB=9
[ "$GPU" = "amd" ] && NEED_GB=20
FREE_GB="$(df -Pk "$HERE" 2>/dev/null | awk 'NR == 2 { printf "%d", $4 / 1048576 }' || true)"
if [ -n "$FREE_GB" ]; then
  note "Free space here: $FREE_GB GB (this setup needs about $NEED_GB GB)."
  [ "$FREE_GB" -lt "$NEED_GB" ] && warn "Not much room. Move this folder to a bigger disk and point the app at it with TRENCHABLE_TOOLS."
fi

# ---------------------------------------------------------------- 2. Python
title "Step 2 of 8: Python"
if [ -x "$VPY" ]; then
  VMINOR="$(py_minor "$VPY" || true)"
  if [ -z "$VMINOR" ] || [ "$VMINOR" -lt 10 ] || [ "$VMINOR" -gt 12 ]; then
    die "venv/ exists but its Python does not run or is not 3.10 to 3.12. Delete the venv folder and run setup again."
  fi
  note "venv/ already exists (Python 3.$VMINOR)."
  RUN_PY="$VPY"
elif ! find_python && [ "$DRY" = 1 ]; then
  warn "Python 3.10 to 3.12 was not found. A real run would stop here; the dry run goes on with 'python3.12'."
  SYS_PY="python3.12"
  SYS_MINOR="12"
  RUN_PY=""
else
  if [ -z "$SYS_PY" ]; then
    if [ "$OS" = "Darwin" ]; then
      die "Python 3.12 was not found. Install it with: brew install python@3.12  (or from python.org), then run setup again."
    fi
    die "Python 3.12 was not found. Install it (Ubuntu 24.04: sudo apt install python3.12 python3.12-venv), then run setup again. Or pass --python /path/to/python3.12."
  fi
  note "Using $SYS_PY (Python 3.$SYS_MINOR)."
  RUN_PY="$SYS_PY"
fi

# ---------------------------------------------------------------- 3. ffmpeg
title "Step 3 of 8: ffmpeg (checked, not installed)"
if [ -n "$RUN_PY" ]; then rc_of "$RUN_PY" -I "$STEPS" ffmpeg || true; else note "(skipped in this dry run: no Python)"; fi

# ---------------------------------------------------------------- 4. venv
title "Step 4 of 8: virtual environment (venv/)"
if [ -x "$VPY" ]; then
  note "Already there."
else
  if [ "$DRY" != 1 ] && ! "$SYS_PY" -c 'import venv, ensurepip' >/dev/null 2>&1; then
    die "This Python cannot make a venv. On Debian/Ubuntu install it with: sudo apt install python3.$SYS_MINOR-venv"
  fi
  step "Creating the venv" "$SYS_PY" -m venv "$VENV"
fi
step "Updating pip" "$VPY" -m pip install --upgrade pip "${PIPNET[@]}"

# ---------------------------------------------------------------- 5. PyTorch
title "Step 5 of 8: PyTorch for $GPU"
TCODE=1
if [ -x "$VPY" ]; then
  TCODE=0
  rc_of "$VPY" -I "$STEPS" torch-check --gpu "$GPU" || TCODE=$?
else
  note "(no venv yet, so PyTorch is not installed)"
fi
if [ "$TCODE" = 0 ] && [ "$REINSTALL" != 1 ]; then
  note "Skipping the PyTorch install. (Use --reinstall-torch to force it.)"
else
  if [ "$TCODE" = 3 ] || { [ "$TCODE" = 0 ] && [ "$REINSTALL" = 1 ]; }; then
    step "Removing the old PyTorch" "$VPY" -m pip uninstall -y torch torchvision
  fi
  PKG_T="torch"
  PKG_V="torchvision"
  [ -n "$TORCH_VERSION" ] && PKG_T="torch==$TORCH_VERSION"
  [ -n "$TORCHVISION_VERSION" ] && PKG_V="torchvision==$TORCHVISION_VERSION"
  SRC=()
  if [ -n "$TORCH_INDEX" ]; then
    if [ -d "$TORCH_INDEX" ]; then
      SRC=(--find-links "$(cd "$TORCH_INDEX" && pwd)")
      note "Using the wheel files in $TORCH_INDEX (plain dependencies still come from PyPI)."
    else
      SRC=(--index-url "$TORCH_INDEX" --extra-index-url "$PYPI")
    fi
  elif [ "$GPU" = "nvidia" ]; then
    SRC=(--index-url "$NV_INDEX")
  elif [ "$GPU" = "amd" ]; then
    SRC=(--index-url "$AMD_INDEX")
    note "PyTorch's ROCm build for Linux. Your card needs AMD's ROCm support (the amdgpu driver; see the README)."
  elif [ "$GPU" = "cpu" ]; then
    SRC=(--index-url "$CPU_INDEX")
  fi  # mac: plain PyPI
  note "This is the big download (about 0.1 GB on a Mac or for CPU, 3 GB for NVIDIA, 6 GB for AMD ROCm)."
  step "Installing PyTorch" "$VPY" -m pip install --no-cache-dir "${PIPNET[@]}" ${SRC[@]+"${SRC[@]}"} "$PKG_T" "$PKG_V"
fi

# ---------------------------------------------------------------- 6. packages
title "Step 6 of 8: other packages (requirements.txt)"
step "Installing the packages" "$VPY" -m pip install "${PIPNET[@]}" -r "$REQ"
step "Installing MediaPipe" "$VPY" -m pip install --no-deps "${PIPNET[@]}" -r "$REQ_NODEPS"

# ---------------------------------------------------------------- 7. model code + model files
title "Step 7 of 8: model code (repos/) and model files (models/)"
ASSET_ARGS=(-I "$STEPS" assets)
[ "$DRY" = 1 ] && ASSET_ARGS+=(--dry-run)
[ "$SKIP_MODELS" = 1 ] && ASSET_ARGS+=(--skip-models)
AP="$RUN_PY"
[ -x "$VPY" ] && AP="$VPY"
EXIT=0
ACODE=0
if [ -n "$AP" ]; then rc_of "$AP" "${ASSET_ARGS[@]}" || ACODE=$?; else show python3.12 "${ASSET_ARGS[@]}"; fi
[ "$ACODE" != 0 ] && EXIT=2

# ---------------------------------------------------------------- 8. check
title "Step 8 of 8: check (tools/doctor.py --quick)"
# setup_steps.py check runs doctor.py --quick, explains the answer and writes installed.json.
show "$VPY" -I "$STEPS" check --gpu "$GPU"
if [ "$DRY" = 1 ]; then
  printf '\nDry run finished. Run again without --dry-run to do it.\n'
  exit 0
fi
CCODE=0
rc_of "$VPY" -I "$STEPS" check --gpu "$GPU" || CCODE=$?
[ "$CCODE" != 0 ] && EXIT=2
if [ "$EXIT" = 0 ]; then
  printf '\nDone. Restart the app (or wait half a minute) and the local tools show as ready.\n'
  printf 'The full check loads every model:  venv/bin/python -I tools/doctor.py\n'
else
  printf '\nSetup finished with problems (see the WARNING / FAILED lines above). Run it again after fixing them.\n'
fi
exit "$EXIT"
