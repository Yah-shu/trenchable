<#
.SYNOPSIS
  Installs the optional voice extra: local speech-to-text (faster-whisper) for Voice change and Translate.

.DESCRIPTION
  Creates venv\ (Python 3.11 or 3.12), installs the pinned packages from requirements.txt, downloads the Whisper
  model into cache\ (a Hugging Face cache the app reads offline), then runs an offline test with the exact settings
  the app uses. Runs on the CPU; no graphics card needed. Safe to run again: finished steps are checked and skipped.

.PARAMETER Model
  faster-whisper model name (default small, about 484 MB). If you change it, the app must be given the same name
  (DUB_WHISPER_MODEL). installed.json records it.

.PARAMETER Python
  Full path to the python.exe to build the venv with (3.11 or 3.12).

.PARAMETER DryRun
  Print every step without doing it.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File setup.ps1 -DryRun
#>
[CmdletBinding()]
param(
  [string]$Model = 'small',
  [string]$Python = '',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$Here = $PSScriptRoot
$Venv = Join-Path $Here 'venv'
$VenvPy = Join-Path $Venv 'Scripts\python.exe'
$Steps = Join-Path $Here 'setup_steps.py'
$Req = Join-Path $Here 'requirements.txt'
$PipNet = @('--retries', '10', '--timeout', '120')

function Write-Title([string]$Text) { Write-Host ''; Write-Host "== $Text" -ForegroundColor Cyan }
function Write-Note([string]$Text) { Write-Host "   $Text" }

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

function Get-PyMinor([string]$Exe, [string[]]$Pre) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $out = & $Exe @(@($Pre) + @('-c', 'import sys; print(sys.version_info[0], sys.version_info[1])')) 2>$null
    if ($LASTEXITCODE -eq 0 -and ((@($out) -join "`n") -match '(?m)^3 (\d+)$')) { return [int]$Matches[1] }
  } catch { } finally { $ErrorActionPreference = $old }
  return -1
}

function Find-Python {
  $cands = New-Object System.Collections.ArrayList
  if ($Python) {
    [void]$cands.Add(@($Python))
  } else {
    if (Get-Command py -ErrorAction SilentlyContinue) {
      foreach ($v in '3.12', '3.11') { [void]$cands.Add(@('py', "-$v")) }
    }
    foreach ($n in 'python', 'python3') {
      if (Get-Command $n -ErrorAction SilentlyContinue) { [void]$cands.Add(@($n)) }
    }
  }
  foreach ($c in $cands) {
    $exe = $c[0]
    $pre = @($c | Select-Object -Skip 1)
    $minor = Get-PyMinor $exe $pre
    if ($minor -ge 11 -and $minor -le 12) { return @{ Exe = $exe; Pre = $pre; Minor = $minor } }
    if ($minor -gt 0) { Write-Note "Skipping $exe $($pre -join ' ') (Python 3.$minor; the voice extra needs 3.11 or 3.12)." }
  }
  return $null
}

$exitCode = 0
try {
  Write-Host 'Voice extra setup (speech-to-text for Voice change and Translate)' -ForegroundColor Green
  Write-Host "Folder: $Here"
  if ($DryRun) { Write-Host 'DRY RUN: every step is printed. Nothing is installed, downloaded or changed.' -ForegroundColor Yellow }

  # ---------------------------------------------------------------- 1. Python
  Write-Title 'Step 1 of 5: Python'
  if (Test-Path -LiteralPath $VenvPy) {
    $vminor = Get-PyMinor $VenvPy @()
    if ($vminor -lt 11 -or $vminor -gt 12) {
      throw "venv\ exists but its Python does not run or is not 3.11 or 3.12. Delete the venv folder and run setup again."
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
  try {
    $drive = Get-PSDrive -Name ((Split-Path -Qualifier $Here).TrimEnd(':')) -ErrorAction Stop
    $freeGb = [math]::Round($drive.Free / 1GB, 1)
    Write-Note "Free space on $($drive.Name): $freeGb GB (this setup needs about 1.5 GB)."
  } catch { }

  # ---------------------------------------------------------------- 2. venv
  Write-Title 'Step 2 of 5: virtual environment (venv\)'
  if (Test-Path -LiteralPath $VenvPy) {
    Write-Note 'Already there.'
  } else {
    Invoke-Step $py.Exe ($py.Pre + @('-m', 'venv', $Venv)) 'Creating the venv'
  }
  Invoke-Step $VenvPy (@('-m', 'pip', 'install', '--upgrade', 'pip') + $PipNet) 'Updating pip'

  # ---------------------------------------------------------------- 3. packages
  Write-Title 'Step 3 of 5: packages (requirements.txt)'
  Invoke-Step $VenvPy (@('-m', 'pip', 'install') + $PipNet + @('-r', $Req)) 'Installing the packages'

  # ---------------------------------------------------------------- 4. model
  Write-Title "Step 4 of 5: Whisper model '$Model' into cache\"
  $dlArgs = @('-I', $Steps, 'download', '--model', $Model)
  if ($DryRun) { $dlArgs += '--dry-run' }
  if (Test-Path -LiteralPath $VenvPy) { $ap = @{ Exe = $VenvPy; Pre = @() } } else { $ap = $py }
  $dcode = Invoke-Native $ap.Exe ($ap.Pre + $dlArgs)
  if ($dcode -ne 0) { throw 'The model download did not finish. Run setup again; it resumes where it stopped.' }

  # ---------------------------------------------------------------- 5. check
  Write-Title 'Step 5 of 5: offline test, exactly as the app runs it'
  $checkArgs = @('-I', $Steps, 'check', '--model', $Model)
  Show-Command $VenvPy $checkArgs
  if ($DryRun) {
    Write-Host ''
    Write-Host 'Dry run finished. Run again without -DryRun to do it.' -ForegroundColor Green
  } else {
    $ccode = Invoke-Native $VenvPy $checkArgs
    if ($ccode -ne 0) { throw 'The offline test failed (see above).' }
    Write-Host ''
    Write-Host 'Done. Restart the app (or wait half a minute) and Voice change / Translate can transcribe.' -ForegroundColor Green
    if ($Model -ne 'small') { Write-Host "Model '$Model' is not the default: the app must run transcribe.py with DUB_WHISPER_MODEL=$Model." -ForegroundColor Yellow }
  }
} catch {
  Write-Host ''
  Write-Host "SETUP STOPPED: $($_.Exception.Message)" -ForegroundColor Red
  $exitCode = 1
}
exit $exitCode
