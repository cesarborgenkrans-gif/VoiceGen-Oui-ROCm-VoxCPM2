param(
    [switch]$NoBrowser
)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Starting VoiceGen Oui! (ROCm / WSL2)                     " -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "============================================================" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

function Quote-Bash([string]$Value) {
    return "'" + $Value.Replace("'", "'""'""'") + "'"
}

function Convert-ToWslPath([string]$Value) {
    if ($Value.StartsWith("/")) {
        return $Value
    }

    $fullPath = [System.IO.Path]::GetFullPath($Value)
    if ($fullPath -notmatch "^(?<drive>[A-Za-z]):\\(?<rest>.*)$") {
        throw "VoiceGen Oui! requires a local Windows drive path, not: $Value"
    }

    $drive = $Matches.drive.ToLowerInvariant()
    $rest = $Matches.rest -replace "\\", "/"
    return "/mnt/$drive/$rest"
}

function Get-WslVenv {
    if ($env:VOICEGEN_OUI_WSL_VENV) {
        return $env:VOICEGEN_OUI_WSL_VENV
    }

    $Candidates = if ($WslUser -eq "root") {
        @(
            "/root/voicegen-oui-rocm72",
            "/root/voxcpm-wsl-rocm72",
            "/root/voxcpm-wsl-rocm"
        )
    } else {
        @(
            "/home/$WslUser/voicegen-oui-rocm72",
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

    throw "No WSL Python venv found. Set VOICEGEN_OUI_WSL_VENV to a venv containing bin/activate."
}

function Get-VoiceGenHealth([string]$HealthUrl) {
    try {
        return Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2 -ErrorAction Stop
    } catch {
        return $null
    }
}

function Test-TcpPort([string]$HostName, [int]$Port, [int]$TimeoutMs = 700) {
    $Client = [System.Net.Sockets.TcpClient]::new()
    try {
        $Connect = $Client.BeginConnect($HostName, $Port, $null, $null)
        if (-not $Connect.AsyncWaitHandle.WaitOne($TimeoutMs)) {
            return $false
        }
        $Client.EndConnect($Connect)
        return $Client.Connected
    } catch {
        return $false
    } finally {
        $Client.Dispose()
    }
}

$WslDistro = if ($env:VOICEGEN_OUI_WSL_DISTRO) { $env:VOICEGEN_OUI_WSL_DISTRO } else { "Ubuntu-22.04" }
$WslUser = if ($env:VOICEGEN_OUI_WSL_USER) { $env:VOICEGEN_OUI_WSL_USER } else { "root" }
$WslVenv = Get-WslVenv
$SourceRootWindows = Split-Path -Parent $PSCommandPath
$AppRootWindows = Join-Path $SourceRootWindows "app"

$DataRoot = if ($env:VOICEGEN_OUI_DATA_ROOT) { $env:VOICEGEN_OUI_DATA_ROOT } else { Join-Path $env:LOCALAPPDATA "VoiceGenOui" }
$AppRoot = if ($env:VOICEGEN_OUI_APP_ROOT) { $env:VOICEGEN_OUI_APP_ROOT } else { $AppRootWindows }
foreach ($RuntimeDirectory in @($DataRoot, (Join-Path $DataRoot "outputs"), (Join-Path $DataRoot "personas"), (Join-Path $DataRoot "logs"), (Join-Path $DataRoot "models"))) {
    New-Item -ItemType Directory -Path $RuntimeDirectory -Force | Out-Null
}
$WslDataRoot = Convert-ToWslPath $DataRoot
$WslAppRoot = Convert-ToWslPath $AppRoot
$VoiceGenUrl = "http://localhost:3113/"
$HealthUrl = "http://127.0.0.1:3113/api/health"

$ExistingHealth = Get-VoiceGenHealth $HealthUrl
if ($ExistingHealth) {
    $ExistingAppRoot = ([string]$ExistingHealth.app_root).TrimEnd("/")
    if ($ExistingHealth.status -ne "ok" -or $ExistingAppRoot -ne $WslAppRoot.TrimEnd("/")) {
        throw "Port 3113 is serving a different application. Stop that service before starting VoiceGen."
    }
    Write-Host "VoiceGen is already running at $VoiceGenUrl" -ForegroundColor Green
    if (-not $NoBrowser) {
        Start-Process $VoiceGenUrl
    }
    exit 0
}

if (Test-TcpPort "127.0.0.1" 3113) {
    throw "Port 3113 is already in use, but it is not responding as VoiceGen. Stop the conflicting service and try again."
}

$ModelPathWindows = if ($env:VOXCPM_MODEL_PATH) {
    $env:VOXCPM_MODEL_PATH
} elseif (Test-Path (Join-Path $DataRoot "models\VoxCPM2")) {
    Join-Path $DataRoot "models\VoxCPM2"
} else {
    Join-Path $SourceRootWindows "models\VoxCPM2"
}
$ModelPathLine = "export VOXCPM_MODEL_PATH=$(Quote-Bash (Convert-ToWslPath $ModelPathWindows))"

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
export VOICEGEN_OUI_DATA_ROOT=$QuotedDataRoot
export VOICEGEN_OUI_APP_ROOT=$QuotedAppRoot
$ModelPathLine
cd $QuotedAppRoot
source $QuotedVenv/bin/activate
python3 _backend/server.py
"@

Write-Host "WSL distro: $WslDistro" -ForegroundColor DarkCyan
Write-Host "Windows data root: $DataRoot" -ForegroundColor DarkCyan
Write-Host "WSL data root: $WslDataRoot" -ForegroundColor DarkCyan
Write-Host "WSL app root: $WslAppRoot" -ForegroundColor DarkCyan
Write-Host "WSL venv: $WslVenv" -ForegroundColor DarkCyan

$BrowserJob = $null
if (-not $NoBrowser) {
    $BrowserJob = Start-Job -ScriptBlock {
        param($HealthUrl, $VoiceGenUrl)
        for ($Attempt = 0; $Attempt -lt 180; $Attempt++) {
            try {
                $Health = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2 -ErrorAction Stop
                if ($Health.status -eq "ok") {
                    Start-Process $VoiceGenUrl
                    return
                }
            } catch {
                Start-Sleep -Milliseconds 500
            }
        }
    } -ArgumentList $HealthUrl, $VoiceGenUrl
}

try {
    wsl -d $WslDistro -u $WslUser -e bash -lc $BashCommand
} finally {
    if ($BrowserJob) {
        Stop-Job $BrowserJob -ErrorAction SilentlyContinue
        Remove-Job $BrowserJob -Force -ErrorAction SilentlyContinue
    }
}

Write-Host "Server process terminated." -ForegroundColor Red
Read-Host "Press Enter to close this window"
