Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting VoiceGen VoxCPM Engine (ROCm / WSL2)            " -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "============================================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

function Quote-Bash([string]$Value) {
    return "'" + $Value.Replace("'", "'""'""'") + "'"
}

function Convert-ToWslPath([string]$Value) {
    if ($Value.StartsWith("/")) {
        return $Value
    }
    return (& wsl -d $WslDistro -u $WslUser -e wslpath -a $Value).Trim()
}

function Get-WslVenv {
    if ($env:WAIFUVOICE_WSL_VENV) {
        return $env:WAIFUVOICE_WSL_VENV
    }

    $Candidates = if ($WslUser -eq "root") {
        @(
            "/root/waifuvoice-rocm72",
            "/root/voxcpm-wsl-rocm72",
            "/root/voxcpm-wsl-rocm"
        )
    } else {
        @(
            "/home/$WslUser/waifuvoice-rocm72",
            "/home/$WslUser/voxcpm-wsl-rocm72",
            "/home/$WslUser/voxcpm-wsl-rocm"
        )
    }

    foreach ($Candidate in $Candidates) {
        $ActivatePath = Quote-Bash "$Candidate/bin/activate"
        & wsl -d $WslDistro -u $WslUser -e bash -lc "test -f $ActivatePath"
        if ($LASTEXITCODE -eq 0) {
            return $Candidate
        }
    }

    throw "No WSL Python venv found. Set WAIFUVOICE_WSL_VENV to a venv containing bin/activate."
}

$WslDistro = if ($env:WAIFUVOICE_WSL_DISTRO) { $env:WAIFUVOICE_WSL_DISTRO } else { "Ubuntu-22.04" }
$WslUser = if ($env:WAIFUVOICE_WSL_USER) { $env:WAIFUVOICE_WSL_USER } else { "root" }
$WslVenv = Get-WslVenv
$DataRootWindows = Split-Path -Parent $PSCommandPath
$AppRootWindows = Join-Path $DataRootWindows "app"

$DataRoot = if ($env:WAIFUVOICE_DATA_ROOT) { $env:WAIFUVOICE_DATA_ROOT } else { $DataRootWindows }
$AppRoot = if ($env:WAIFUVOICE_APP_ROOT) { $env:WAIFUVOICE_APP_ROOT } else { $AppRootWindows }
$WslDataRoot = Convert-ToWslPath $DataRoot
$WslAppRoot = Convert-ToWslPath $AppRoot

$ModelPathLine = ""
if ($env:VOXCPM_MODEL_PATH) {
    $ModelPathLine = "export VOXCPM_MODEL_PATH=$(Quote-Bash (Convert-ToWslPath $env:VOXCPM_MODEL_PATH))"
}

$QuotedDataRoot = Quote-Bash $WslDataRoot
$QuotedAppRoot = Quote-Bash $WslAppRoot
$QuotedVenv = Quote-Bash $WslVenv

$BashCommand = @"
set -e
export HSA_ENABLE_DXG_DETECTION=1
export HSA_OVERRIDE_GFX_VERSION=11.0.0
export LD_LIBRARY_PATH=/opt/rocm/lib
export MIOPEN_FIND_MODE=2
export HOST=0.0.0.0
export PYTHONPATH=./_backend
export WAIFUVOICE_DATA_ROOT=$QuotedDataRoot
export WAIFUVOICE_APP_ROOT=$QuotedAppRoot
$ModelPathLine
cd $QuotedAppRoot
source $QuotedVenv/bin/activate
python3 _backend/server.py
"@

Write-Host "WSL distro: $WslDistro" -ForegroundColor DarkCyan
Write-Host "WSL data root: $WslDataRoot" -ForegroundColor DarkCyan
Write-Host "WSL app root: $WslAppRoot" -ForegroundColor DarkCyan
Write-Host "WSL venv: $WslVenv" -ForegroundColor DarkCyan

wsl -d $WslDistro -u $WslUser -e bash -lc $BashCommand

Write-Host "Server process terminated." -ForegroundColor Red
Read-Host "Press Enter to close this window"
