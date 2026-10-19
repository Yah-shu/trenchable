<#
.SYNOPSIS
  Installs the optional local video tools: Remove BG, Depth Map, FPS Boost, SDR to HDR and the Guided swap guide.

.DESCRIPTION
  Creates venv\ (Python 3.10 to 3.12), installs PyTorch for your graphics card and the pinned packages, fetches the
  model code into repos\ and the model files into models\ (size and sha256 checked), then runs tools\doctor.py --quick.
  Safe to run again: finished steps are checked and skipped. Nothing outside this folder is changed (pip may keep a
  small download cache in your user folder).

.PARAMETER Gpu
  auto (default), nvidia, amd or cpu. auto picks from the graphics cards Windows reports.

.PARAMETER AmdTarget
  AMD only: your chip's gfx name, for example gfx1030 (RX 6900), gfx1100 (RX 7900), gfx1201 (RX 9070).
  Setup guesses it from the card name; pass it when the guess is wrong or missing.

.PARAMETER TorchIndex
  Where to get PyTorch instead of the default: a pip index URL, or a local folder of .whl files.

.PARAMETER TorchVersion
  Exact torch version to install (default: newest on the index; AMD default 2.13.0+rocm10.1.0).

.PARAMETER TorchvisionVersion
  Exact torchvision version (default: the one that matches torch; AMD default 0.28.0+rocm10.1.0).

.PARAMETER Python
  Full path to the python.exe to build the venv with (3.10 to 3.12; AMD needs 3.12).

.PARAMETER ReinstallTorch
  Install PyTorch again even if the right build is already there.

.PARAMETER SkipModels
  Do not download the model files (about 330 MB).

.PARAMETER DryRun
  Print every step without doing it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup.ps1 -Gpu amd -AmdTarget gfx1100

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [ValidateSet('auto', 'nvidia', 'amd', 'cpu')]
  [string]$Gpu = 'auto',
  [string]$AmdTarget = '',
  [string]$TorchIndex = '',
  [string]$TorchVersion = '',
  [string]$TorchvisionVersion = '',
  [string]$Python = '',
  [switch]$ReinstallTorch,
  [switch]$SkipModels,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$Here = $PSScriptRoot
$Venv = Join-Path $Here 'venv'
$VenvPy = Join-Path $Venv 'Scripts\python.exe'
$Steps = Join-Path $Here 'setup_steps.py'
$Doctor = Join-Path $Here 'tools\doctor.py'
$Req = Join-Path $Here 'requirements.txt'
$ReqNoDeps = Join-Path $Here 'requirements-nodeps.txt'

# Where PyTorch comes from, per graphics card.
$NvidiaIndex = 'https://download.pytorch.org/whl/cu130'     # RTX 20-series and newer, driver 580+
$NvidiaOldIndex = 'https://download.pytorch.org/whl/cu126'  # GTX 900/10-series (CUDA 13 dropped them)
$CpuIndex = 'https://download.pytorch.org/whl/cpu'
$AmdIndex = 'https://stable.repo.amd.com/rocm/whl-next/'    # AMD's Windows wheels, one package per chip (gfx...)
$AmdTorch = '2.13.0+rocm10.1.0'                              # tested with these tools on an RX 6000-series card
$AmdTorchvision = '0.28.0+rocm10.1.0'
$AmdDocs = 'https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html'
$PyPI = 'https://pypi.org/simple'
$PipNet = @('--retries', '10', '--timeout', '120')

# Card name -> AMD chip name (desktop cards and common APUs; laptop "M"/"S" cards differ, pass -AmdTarget for those).
$AmdMap = @(
  @('Radeon AI PRO R9700|RX 9070\b', 'gfx1201'),
  @('RX 9060\b', 'gfx1200'),
  @('RX 7900\b|PRO W7900\b|PRO W7800\b', 'gfx1100'),
  @('RX 7800\b|RX 7700\b|PRO W7700\b', 'gfx1101'),
  @('RX 7600\b|RX 7650\b|PRO W7600\b|PRO W7500\b', 'gfx1102'),
  @('RX 6[89][05]0\b|PRO W68[0-9]0\b', 'gfx1030'),
  @('RX 6700\b|RX 6750\b', 'gfx1031'),
  @('RX 6600\b|RX 6650\b|PRO W6600\b', 'gfx1032'),
  @('RX 6500\b|RX 6400\b', 'gfx1034'),
  @('Radeon 8060S|Radeon 8050S|Radeon 8040S', 'gfx1151'),
  @('Radeon 890M|Radeon 880M', 'gfx1150'),
  @('Radeon 860M|Radeon 840M', 'gfx1152'),
  @('Radeon 780M|Radeon 760M|Radeon 740M', 'gfx1103')
)

function Write-Title([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Note([string]$Text) { Write-Host "   $Text" }
function Write-Warn([string]$Text) { Write-Host "   WARNING: $Text" -ForegroundColor Yellow }

function Format-Arg([string]$A) { if ($A -match '\s') { '"' + $A + '"' } else { $A } }

function Show-Command([string]$Exe, [string[]]$Arguments) {
  $parts = @($Exe) + @($Arguments) | ForEach-Object { Format-Arg $_ }
  Write-Host ('   > ' + ($parts -join ' ')) -ForegroundColor DarkGray
}

# Runs a program with its output on screen and returns its exit code. (Windows PowerShell 5.1 can turn a program's
# warning lines into script errors when 'Stop' is set, so that is relaxed while it runs.)
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    & $Exe @Arguments | Out-Host
    return $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $old
  }
}

# Runs a program and stops setup if it fails. In a dry run it only prints the command.
function Invoke-Step([string]$Exe, [string[]]$Arguments, [string]$What) {
  Show-Command $Exe $Arguments
  if ($DryRun) { return }
  $code = Invoke-Native $Exe $Arguments
  if ($code -ne 0) { throw "$What failed (exit code $code). Read the lines above, fix the cause and run setup again." }
}

# Runs a program quietly and returns its exit code and stdout. Never throws.
function Get-Output([string]$Exe, [string[]]$Arguments) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Exe @Arguments 2>$null
    return @{ Code = $LASTEXITCODE; Text = (@($out) -join "`n").Trim() }
  } catch {
    return @{ Code = -1; Text = '' }
  } finally {
    $ErrorActionPreference = $old
  }
}

function Get-PyMinor([string]$Exe, [string[]]$Pre) {
  $r = Get-Output $Exe (@($Pre) + @('-c', 'import sys; print(sys.version_info[0], sys.version_info[1])'))
  if ($r.Code -eq 0 -and $r.Text -match '(?m)^3 (\d+)$') { return [int]$Matches[1] }
  return -1
}

function Find-Python {
  $cands = New-Object System.Collections.ArrayList
  if ($Python) {
    [void]$cands.Add(@($Python))
  } else {
    if (Get-Command py -ErrorAction SilentlyContinue) {
      foreach ($v in '3.12', '3.11', '3.10') { [void]$cands.Add(@('py', "-$v")) }
    }
    foreach ($n in 'python', 'python3') {
      if (Get-Command $n -ErrorAction SilentlyContinue) { [void]$cands.Add(@($n)) }
    }
  }
  foreach ($c in $cands) {
    $exe = $c[0]
    $pre = @($c | Select-Object -Skip 1)
    $minor = Get-PyMinor $exe $pre
    if ($minor -ge 10 -and $minor -le 12) { return @{ Exe = $exe; Pre = $pre; Minor = $minor } }
    if ($minor -gt 0) { Write-Note "Skipping $exe $($pre -join ' ') (Python 3.$minor; these tools need 3.10, 3.11 or 3.12)." }
  }
  return $null
}

function Get-GpuNames {
  try { return @(Get-CimInstance -ClassName Win32_VideoController -ErrorAction Stop | ForEach-Object { [string]$_.Name }) }
  catch { return @() }
}

function Get-AmdTarget([string[]]$Names) {
  foreach ($n in $Names) { foreach ($m in $AmdMap) { if ($n -match $m[0]) { return $m[1] } } }
  return ''
}

$exitCode = 0
try {
  Write-Host 'Local tools setup (Remove BG, Depth Map, FPS Boost, SDR to HDR, Guided swap guide)' -ForegroundColor Green
  Write-Host "Folder: $Here"
  if ($DryRun) { Write-Host 'DRY RUN: every step is printed. Nothing is installed, downloaded or changed.' -ForegroundColor Yellow }

  # ---------------------------------------------------------------- 1. graphics card
  Write-Title 'Step 1 of 8: graphics card'
  $names = Get-GpuNames
  foreach ($n in $names) { Write-Note "Windows reports: $n" }
  $choice = $Gpu
  $target = ''
  if ($choice -eq 'auto') {
    if ($names -match 'NVIDIA') {
      $choice = 'nvidia'
    } elseif ($names -match 'AMD|Radeon') {
      if (Get-AmdTarget $names) {
        $choice = 'amd'
      } else {
        $choice = 'cpu'
        Write-Warn 'This AMD graphics chip is not on the list setup knows. Using the CPU build of PyTorch.'
        Write-Note 'If your chip is supported by AMD (see the README), run again with -Gpu amd -AmdTarget gfxNNNN.'
      }
    } else {
      $choice = 'cpu'
    }
    Write-Note "Using -Gpu $choice. (Pass -Gpu nvidia, amd or cpu to choose yourself.)"
  } else {
    Write-Note "Using -Gpu $choice (your choice)."
  }
  if ($choice -eq 'amd') {
    $target = $AmdTarget
    if (-not $target) { $target = Get-AmdTarget $names }
    if (-not $target) {
      throw "Setup could not tell which AMD chip you have. Run again with -AmdTarget, for example -AmdTarget gfx1100 for an RX 7900. The README has a table."
    }
    if ($target -notmatch '^gfx[0-9a-f]+$') { throw "-AmdTarget must look like gfx1030 (got '$target')." }
    Write-Note "AMD chip: $target"
  }
  $nvIndex = $NvidiaIndex
  if ($choice -eq 'nvidia' -and ($names -match 'GTX (9\d\d|10\d\d)\b|Quadro [MP]\d|TITAN X\b')) {
    $nvIndex = $NvidiaOldIndex
    Write-Note 'Older NVIDIA card found: using the CUDA 12.6 build of PyTorch (CUDA 13 no longer supports it).'
  }

  $needGb = 3
  if ($choice -eq 'nvidia') { $needGb = 9 } elseif ($choice -eq 'amd') { $needGb = 6 }
  try {
    $drive = Get-PSDrive -Name ((Split-Path -Qualifier $Here).TrimEnd(':')) -ErrorAction Stop
    $freeGb = [math]::Round($drive.Free / 1GB, 1)
    Write-Note "Free space on $($drive.Name): $freeGb GB (this setup needs about $needGb GB)."
    if ($freeGb -lt $needGb) { Write-Warn "Not much room. Move this folder to a bigger drive and point the app at it with TRENCHABLE_TOOLS." }
  } catch { }

  # ---------------------------------------------------------------- 2. Python
  Write-Title 'Step 2 of 8: Python'
  $py = $null
  if (Test-Path -LiteralPath $VenvPy) {
    $vminor = Get-PyMinor $VenvPy @()
    if ($vminor -lt 10 -or $vminor -gt 12) {
      throw "venv\ exists but its Python does not run or is not 3.10 to 3.12. Delete the venv folder and run setup again."
    }
    Write-Note "venv\ already exists (Python 3.$vminor)."
    $py = @{ Exe = $VenvPy; Pre = @(); Minor = $vminor }
  } else {
    $py = Find-Python
    if (-not $py) {
      throw "Python 3.12 was not found. Install it (winget install Python.Python.3.12, or python.org), open a new terminal and run setup again. Or pass -Python C:\path\to\python.exe."
    }
    Write-Note "Using $($py.Exe) $($py.Pre -join ' ') (Python 3.$($py.Minor))."
  }
  if ($choice -eq 'amd' -and $py.Minor -ne 12 -and -not $TorchIndex) {
    throw "AMD's PyTorch for Windows needs Python 3.12 (found 3.$($py.Minor)). Install Python 3.12 and run setup again (delete venv\ first if it exists)."
  }

  # ---------------------------------------------------------------- 3. ffmpeg
  Write-Title 'Step 3 of 8: ffmpeg (checked, not installed)'
  [void](Invoke-Native $py.Exe ($py.Pre + @('-I', $Steps, 'ffmpeg')))

  # ---------------------------------------------------------------- 4. venv
  Write-Title 'Step 4 of 8: virtual environment (venv\)'
  if (Test-Path -LiteralPath $VenvPy) {
    Write-Note 'Already there.'
  } else {
    Invoke-Step $py.Exe ($py.Pre + @('-m', 'venv', $Venv)) 'Creating the venv'
  }
  Invoke-Step $VenvPy (@('-m', 'pip', 'install', '--upgrade', 'pip') + $PipNet) 'Updating pip'

  # ---------------------------------------------------------------- 5. PyTorch
  Write-Title "Step 5 of 8: PyTorch for $choice"
  $tcode = 1
  if (Test-Path -LiteralPath $VenvPy) {
    $tcode = Invoke-Native $VenvPy @('-I', $Steps, 'torch-check', '--gpu', $choice)
  } else {
    Write-Note '(no venv yet, so PyTorch is not installed)'
  }
  if ($tcode -eq 0 -and -not $ReinstallTorch) {
    Write-Note 'Skipping the PyTorch install. (Use -ReinstallTorch to force it.)'
  } else {
    if ($tcode -eq 3 -or ($tcode -eq 0 -and $ReinstallTorch)) {
      Invoke-Step $VenvPy @('-m', 'pip', 'uninstall', '-y', 'torch', 'torchvision') 'Removing the old PyTorch'
    }
    $pkgT = 'torch'
    $pkgV = 'torchvision'
    $tv = $TorchVersion
    $vv = $TorchvisionVersion
    if ($choice -eq 'amd') {
      $pkgT = "torch[device-$target]"
      $pkgV = "torchvision[device-$target]"
      if (-not $tv -and -not $vv) { $tv = $AmdTorch; $vv = $AmdTorchvision }
    }
    if ($tv) { $pkgT = "$pkgT==$tv" }
    if ($vv) { $pkgV = "$pkgV==$vv" }
    if ($TorchIndex) {
      if (Test-Path -LiteralPath $TorchIndex -PathType Container) {
        $src = @('--find-links', (Resolve-Path -LiteralPath $TorchIndex).Path)
        Write-Note "Using the wheel files in $TorchIndex (plain dependencies still come from PyPI)."
      } else {
        $src = @('--index-url', $TorchIndex, '--extra-index-url', $PyPI)
      }
    } elseif ($choice -eq 'nvidia') {
      $src = @('--index-url', $nvIndex)
    } elseif ($choice -eq 'amd') {
      $src = @('--index-url', $AmdIndex, '--extra-index-url', $PyPI)
      Write-Note "AMD's ROCm wheels for Windows (needs a recent Adrenalin driver). AMD's own guide: $AmdDocs"
    } else {
      $src = @('--index-url', $CpuIndex)
    }
    Write-Note 'This is the big download (about 0.1 GB for CPU, 1.1 GB for AMD, 2 to 2.6 GB for NVIDIA).'
    Invoke-Step $VenvPy (@('-m', 'pip', 'install', '--no-cache-dir') + $PipNet + $src + @($pkgT, $pkgV)) 'Installing PyTorch'
  }

  # ---------------------------------------------------------------- 6. packages
  Write-Title 'Step 6 of 8: other packages (requirements.txt)'
  Invoke-Step $VenvPy (@('-m', 'pip', 'install') + $PipNet + @('-r', $Req)) 'Installing the packages'
  Invoke-Step $VenvPy (@('-m', 'pip', 'install', '--no-deps') + $PipNet + @('-r', $ReqNoDeps)) 'Installing MediaPipe'

  # ---------------------------------------------------------------- 7. model code + model files
  Write-Title 'Step 7 of 8: model code (repos\) and model files (models\)'
  $assetArgs = @('-I', $Steps, 'assets')
  if ($DryRun) { $assetArgs += '--dry-run' }
  if ($SkipModels) { $assetArgs += '--skip-models' }
  if (Test-Path -LiteralPath $VenvPy) { $ap = @{ Exe = $VenvPy; Pre = @() } } else { $ap = $py }
  $assetsCode = Invoke-Native $ap.Exe ($ap.Pre + $assetArgs)
  if ($assetsCode -ne 0) { $exitCode = 2 }

  # ---------------------------------------------------------------- 8. check
  Write-Title 'Step 8 of 8: check (tools\doctor.py --quick)'
  # setup_steps.py check runs doctor.py --quick, explains the answer and writes installed.json.
  $checkArgs = @('-I', $Steps, 'check', '--gpu', $choice)
  if ($DryRun) {
    Show-Command $VenvPy $checkArgs
    Write-Host ''
    Write-Host 'Dry run finished. Run again without -DryRun to do it.' -ForegroundColor Green
  } else {
    Show-Command $VenvPy $checkArgs
    $ccode = Invoke-Native $VenvPy $checkArgs
    if ($ccode -ne 0 -and $exitCode -eq 0) { $exitCode = 2 }
    if ($exitCode -eq 0) {
      Write-Host ''
      Write-Host 'Done. Restart the app (or wait half a minute) and the local tools show as ready.' -ForegroundColor Green
      Write-Host 'The full check loads every model:  venv\Scripts\python.exe -I tools\doctor.py'
    } else {
      Write-Host ''
      Write-Host 'Setup finished with problems (see the WARNING / FAILED lines above). Run it again after fixing them.' -ForegroundColor Yellow
    }
  }
} catch {
  Write-Host ''
  Write-Host "SETUP STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
}
exit $exitCode
