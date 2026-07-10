[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$Destination,
    [string]$ModelId = "openbmb/VoxCPM2",
    [switch]$AcceptUpstreamLicense,
    [switch]$Force,
    [switch]$NoPause
)

$ErrorActionPreference = "Stop"

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
Show-KawaiiSpinner "Reading the upstream model manifest..."

$encodedModelId = ($ModelId.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
$manifestUrl = "https://huggingface.co/api/models/$encodedModelId/tree/main?recursive=true&expand=false"
$manifest = Invoke-RestMethod -Uri $manifestUrl -TimeoutSec 60
$modelFiles = @($manifest | Where-Object { $_.type -eq "file" -and $_.path -notmatch "(^|/)\.\.($|/)" })
if ($modelFiles.Count -eq 0) {
    throw "The Hugging Face model manifest did not contain downloadable files."
}

$curl = Get-Command curl.exe -ErrorAction SilentlyContinue
if (-not $curl) {
    throw "curl.exe was not found. VoiceGen Oui! needs the built-in Windows curl command to download model files."
}

Write-Host "Downloading $($modelFiles.Count) upstream files now. Each file shows curl's normal resumable progress bar." -ForegroundColor Cyan
$fileIndex = 0
foreach ($modelFile in $modelFiles) {
    $fileIndex++
    $relativePath = $modelFile.path -replace '/', '\\'
    $targetPath = Join-Path $ModelDestination $relativePath
    $targetDirectory = Split-Path -Parent $targetPath
    New-Item -ItemType Directory -Force -Path $targetDirectory | Out-Null

    $expectedSize = [int64]$modelFile.size
    if ((Test-Path $targetPath -PathType Leaf) -and -not $Force -and (Get-Item $targetPath).Length -eq $expectedSize) {
        Write-Host "[$fileIndex/$($modelFiles.Count)] Already complete: $($modelFile.path)" -ForegroundColor DarkGreen
        continue
    }
    if ($Force -and (Test-Path $targetPath -PathType Leaf)) {
        Remove-Item -LiteralPath $targetPath -Force
    }

    $encodedPath = ($modelFile.path.Split('/') | ForEach-Object { [uri]::EscapeDataString($_) }) -join '/'
    $downloadUrl = "https://huggingface.co/$encodedModelId/resolve/main/$encodedPath"
    Write-Host "[$fileIndex/$($modelFiles.Count)] Downloading: $($modelFile.path)" -ForegroundColor Cyan
    $curlArgs = @("--location", "--fail", "--continue-at", "-", "--progress-bar", "--output", $targetPath)
    if ($env:HF_TOKEN) {
        $curlArgs += @("--header", "Authorization: Bearer $env:HF_TOKEN")
    }
    $curlArgs += $downloadUrl
    & $curl.Source @curlArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Download failed for $($modelFile.path). Re-run the installer to resume it."
    }
    if (-not (Test-Path $targetPath -PathType Leaf) -or (Get-Item $targetPath).Length -ne $expectedSize) {
        throw "Downloaded file size does not match the upstream manifest: $($modelFile.path)"
    }
}

$incompleteFiles = @($modelFiles | Where-Object {
    $target = Join-Path $ModelDestination ($_.path -replace '/', '\\')
    -not (Test-Path $target -PathType Leaf) -or (Get-Item $target).Length -ne [int64]$_.size
})
if ($incompleteFiles.Count -gt 0) {
    throw "Model download is incomplete: $($incompleteFiles.path -join ', ')"
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
