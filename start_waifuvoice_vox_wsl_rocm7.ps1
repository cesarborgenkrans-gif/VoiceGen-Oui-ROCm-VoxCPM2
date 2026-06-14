Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting WaifuVoice VoxCPM Engine (ROCm / WSL2)          " -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "============================================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

function Quote-Bash([string]$Value) {
    return "'" + $Value.Replace("'", "'""'""'") + "'"
}

$WslDistro = if ($env:WAIFUVOICE_WSL_DISTRO) { $env:WAIFUVOICE_WSL_DISTRO } else { "Ubuntu-22.04" }
$WslUser = if ($env:WAIFUVOICE_WSL_USER) { $env:WAIFUVOICE_WSL_USER } else { "root" }
$DefaultWslVenv = if ($WslUser -eq "root") { "/root/waifuvoice-rocm72" } else { "/home/$WslUser/waifuvoice-rocm72" }
$WslVenv = if ($env:WAIFUVOICE_WSL_VENV) { $env:WAIFUVOICE_WSL_VENV } else { $DefaultWslVenv }
$ProjectRoot = Split-Path -Parent $PSCommandPath

if ($env:WAIFUVOICE_WSL_PROJECT) {
    $WslProject = $env:WAIFUVOICE_WSL_PROJECT
} else {
    $WslProject = (& wsl -d $WslDistro -u $WslUser -e wslpath -a $ProjectRoot).Trim()
}

$ModelPathLine = ""
if ($env:VOXCPM_MODEL_PATH) {
    $ModelPathLine = "export VOXCPM_MODEL_PATH=$(Quote-Bash $env:VOXCPM_MODEL_PATH)"
}

$QuotedProject = Quote-Bash $WslProject
$QuotedVenv = Quote-Bash $WslVenv

$BashCommand = @"
set -e
export HSA_ENABLE_DXG_DETECTION=1
export HSA_OVERRIDE_GFX_VERSION=11.0.0
export LD_LIBRARY_PATH=/opt/rocm/lib
export MIOPEN_FIND_MODE=2
export HOST=0.0.0.0
export PYTHONPATH=./_backend
$ModelPathLine
cd $QuotedProject
source $QuotedVenv/bin/activate
python3 _backend/server.py
"@

Write-Host "WSL distro: $WslDistro" -ForegroundColor DarkCyan
Write-Host "WSL project: $WslProject" -ForegroundColor DarkCyan
Write-Host "WSL venv: $WslVenv" -ForegroundColor DarkCyan

wsl -d $WslDistro -u $WslUser -e bash -lc $BashCommand

Write-Host "Server process terminated." -ForegroundColor Red
