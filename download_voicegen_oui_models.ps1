[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Destination,
    [string]$ModelId = "openbmb/VoxCPM2",
    [switch]$AcceptUpstreamLicense,
    [switch]$Force,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

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

function Quote-Bash([string]$Value) {
    $singleQuote = [string][char]39
    $escapedSingleQuote = $singleQuote + '"' + $singleQuote + '"' + $singleQuote
    return $singleQuote + $Value.Replace($singleQuote, $escapedSingleQuote) + $singleQuote
}

function Get-WslVenv([string]$Distro, [string]$User) {
    if ($env:VOICEGEN_OUI_WSL_VENV) {
        return $env:VOICEGEN_OUI_WSL_VENV
    }

    $WslHome = if ($User -eq "root") { "/root" } else { "/home/$User" }
    foreach ($candidate in @("$WslHome/voicegen-oui-rocm72", "$WslHome/voxcpm-wsl-rocm72", "$WslHome/voxcpm-wsl-rocm")) {
        & wsl.exe -d $Distro -u $User -- test -f "$candidate/bin/activate"
        if ($LASTEXITCODE -eq 0) {
            return $candidate
        }
    }

    throw "No compatible WSL Python venv found. Set VOICEGEN_OUI_WSL_VENV to the venv containing VoxCPM."
}

function Show-KawaiiSpinner([string]$Message) {
    $frames = @([char]0x280B, [char]0x2819, [char]0x2839, [char]0x2838, [char]0x283C, [char]0x2834, [char]0x2826, [char]0x2827, [char]0x2807, [char]0x280F)
    foreach ($frame in $frames) {
        Write-Host -NoNewline "`r[$frame] $Message"
        Start-Sleep -Milliseconds 70
    }
    Write-Host "`r[ok] $Message"
}

$PauseAtEnd = -not $NoPause -and -not $WhatIfPreference
$exitCode = 0

try {
$DataRoot = if ($env:VOICEGEN_OUI_DATA_ROOT) {
    $env:VOICEGEN_OUI_DATA_ROOT
} else {
    Join-Path $env:LOCALAPPDATA "VoiceGenOui"
}
$ModelDestination = if ($Destination) {
    $Destination
} else {
    Join-Path $DataRoot "models\VoxCPM2"
}
$ModelDestination = [System.IO.Path]::GetFullPath($ModelDestination)
$WslDistro = if ($env:VOICEGEN_OUI_WSL_DISTRO) { $env:VOICEGEN_OUI_WSL_DISTRO } else { "Ubuntu-22.04" }
$WslUser = if ($env:VOICEGEN_OUI_WSL_USER) { $env:VOICEGEN_OUI_WSL_USER } else { "root" }
$RequiredFiles = @("config.json", "model.safetensors", "audiovae.pth")

Write-Host "VoiceGen Oui! VoxCPM2 Model Installer" -ForegroundColor Cyan
Write-Host "Model source: https://huggingface.co/$ModelId"
Write-Host "Destination:  $ModelDestination"
Write-Host ""
Write-Host "This downloads upstream model weights. Review the upstream model card and license before continuing." -ForegroundColor Yellow

if (-not $PSCmdlet.ShouldProcess($ModelDestination, "Download $ModelId model files")) {
    return
}

if (-not $AcceptUpstreamLicense) {
    $answer = Read-Host "Type Y to confirm that you reviewed the upstream model terms and want to download"
    if ($answer -notmatch "^(?i:y|yes)$") {
        Write-Host "Download cancelled."
        return
    }
}

$missingBefore = $RequiredFiles | Where-Object { -not (Test-Path (Join-Path $ModelDestination $_) -PathType Leaf) }
if ($missingBefore.Count -eq 0 -and -not $Force) {
    Write-Host "VoxCPM2 already exists at the destination. Use -Force to refresh it." -ForegroundColor Green
    return
}

New-Item -ItemType Directory -Force -Path $ModelDestination | Out-Null
Show-KawaiiSpinner "Preparing the WSL download bridge..."
$WslDestination = Convert-ToWslPath $ModelDestination
$WslVenv = Get-WslVenv $WslDistro $WslUser
$QuotedDestination = Quote-Bash $WslDestination
$QuotedVenv = Quote-Bash $WslVenv
$QuotedModelId = Quote-Bash $ModelId
$ForceDownload = if ($Force) { "True" } else { "False" }

$BashCommand = @"
set -e
source $QuotedVenv/bin/activate
export PYTHONUNBUFFERED=1
export HF_HUB_DISABLE_PROGRESS_BARS=0
python3 -c 'import huggingface_hub' || python3 -m pip install huggingface-hub
export VOICEGEN_OUI_MODEL_DEST=$QuotedDestination
export VOICEGEN_OUI_MODEL_ID=$QuotedModelId
export VOICEGEN_OUI_FORCE_DOWNLOAD=$ForceDownload
python3 - <<'PY'
import os
from pathlib import Path
from huggingface_hub import snapshot_download

target = Path(os.environ['VOICEGEN_OUI_MODEL_DEST'])
model_id = os.environ['VOICEGEN_OUI_MODEL_ID']
snapshot_download(
    repo_id=model_id,
    local_dir=target,
    force_download=os.environ['VOICEGEN_OUI_FORCE_DOWNLOAD'] == 'True',
)

required = ('config.json', 'model.safetensors', 'audiovae.pth')
missing = [name for name in required if not (target / name).is_file()]
if missing:
    raise SystemExit('Download finished, but required model files are missing: ' + ', '.join(missing))
print('Verified VoxCPM2 model files in ' + str(target))
PY
"@

Write-Host "Using WSL distro: $WslDistro" -ForegroundColor DarkCyan
Write-Host "Using WSL venv:   $WslVenv" -ForegroundColor DarkCyan
Write-Host "Downloading model files now. Hugging Face progress bars and file output will appear below." -ForegroundColor Cyan
& wsl.exe -d $WslDistro -u $WslUser -- bash -lc $BashCommand
if ($LASTEXITCODE -ne 0) {
    throw "Model download failed. Read the WSL output above for the upstream download error."
}

$missingAfter = $RequiredFiles | Where-Object { -not (Test-Path (Join-Path $ModelDestination $_) -PathType Leaf) }
if ($missingAfter.Count -gt 0) {
    throw "Model download completed without all required files: $($missingAfter -join ', ')"
}

$sizeGiB = [math]::Round(((Get-ChildItem -LiteralPath $ModelDestination -Recurse -File | Measure-Object -Property Length -Sum).Sum / 1GB), 2)
Write-Host "VoxCPM2 is ready at $ModelDestination ($sizeGiB GiB)." -ForegroundColor Green
if ($Destination) {
    Write-Host "Set VOXCPM_MODEL_PATH to this folder before launching VoiceGen Oui!." -ForegroundColor Yellow
}
} catch {
    $exitCode = 1
    Write-Host "Model install failed: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($PauseAtEnd) {
        Write-Host ""
        Read-Host "Press Enter to close this installer" | Out-Null
    }
}

if ($exitCode -ne 0) {
    exit $exitCode
}
