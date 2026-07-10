[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Destination,
    [string]$ModelId = "openbmb/VoxCPM2",
    [switch]$AcceptUpstreamLicense,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Convert-ToWslPath([string]$Value) {
    $converted = & wsl.exe wslpath -a $Value
    if ($LASTEXITCODE -ne 0 -or -not $converted) {
        throw "Could not convert Windows path to a WSL path: $Value"
    }
    return $converted.Trim()
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

    $home = if ($User -eq "root") { "/root" } else { "/home/$User" }
    foreach ($candidate in @("$home/voicegen-oui-rocm72", "$home/voxcpm-wsl-rocm72", "$home/voxcpm-wsl-rocm")) {
        & wsl.exe -d $Distro -u $User -- test -f "$candidate/bin/activate"
        if ($LASTEXITCODE -eq 0) {
            return $candidate
        }
    }

    throw "No compatible WSL Python venv found. Set VOICEGEN_OUI_WSL_VENV to the venv containing VoxCPM."
}

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
$WslDestination = Convert-ToWslPath $ModelDestination
$WslVenv = Get-WslVenv $WslDistro $WslUser
$QuotedDestination = Quote-Bash $WslDestination
$QuotedVenv = Quote-Bash $WslVenv
$QuotedModelId = Quote-Bash $ModelId
$ForceDownload = if ($Force) { "True" } else { "False" }

$BashCommand = @"
set -e
source $QuotedVenv/bin/activate
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
