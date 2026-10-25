[CmdletBinding()]
param(
    [switch]$NoPause
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  VoiceGen Oui! Pre-Flight System Doctor (v0.3.0)           " -ForegroundColor White -BackgroundColor DarkBlue
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

$script:PassCount = 0
$script:WarnCount = 0
$script:FailCount = 0

function Write-Badge([string]$Status, [string]$Message, [string]$Details = "") {
    switch ($Status) {
        "OK" {
            Write-Host "  [OK]   " -ForegroundColor Green -NoNewline
            $script:PassCount++
        }
        "WARN" {
            Write-Host "  [WARN] " -ForegroundColor Yellow -NoNewline
            $script:WarnCount++
        }
        "FAIL" {
            Write-Host "  [FAIL] " -ForegroundColor Red -NoNewline
            $script:FailCount++
        }
        "INFO" {
            Write-Host "  [INFO] " -ForegroundColor Cyan -NoNewline
        }
    }
    Write-Host $Message -ForegroundColor White
    if ($Details) {
        Write-Host "         $Details" -ForegroundColor DarkGray
    }
}

function Test-PortOpen([string]$HostName, [int]$Port, [int]$TimeoutMs = 500) {
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

# --- 1. Windows Host Environment ---
Write-Host "1. Windows Host Environment" -ForegroundColor Cyan

$os = [System.Environment]::OSVersion.VersionString
Write-Badge "OK" "Operating System: $os"

$psVersion = $PSVersionTable.PSVersion.ToString()
Write-Badge "OK" "PowerShell Version: $psVersion"

$pythonCmd = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCmd) {
    try {
        $pyVer = & python --version 2>&1
        Write-Badge "OK" "Windows Python: $pyVer" ($pythonCmd.Source)
    } catch {
        Write-Badge "WARN" "Python detected on PATH but could not query version."
    }
} else {
    Write-Badge "WARN" "Python not found on Windows PATH." "Optional for the local LLM bridge; required if running bridge directly on Windows."
}

# --- 2. WSL2 Runtime ---
Write-Host ""
Write-Host "2. WSL2 Runtime Diagnostics" -ForegroundColor Cyan

$wslCmd = Get-Command wsl -ErrorAction SilentlyContinue
if (-not $wslCmd) {
    Write-Badge "FAIL" "WSL command (wsl.exe) not found on PATH." "Install WSL with: wsl --install"
} else {
    Write-Badge "OK" "WSL executable found." ($wslCmd.Source)

    $WslDistro = if ($env:VOICEGEN_OUI_WSL_DISTRO) { $env:VOICEGEN_OUI_WSL_DISTRO } else { "Ubuntu-22.04" }
    $WslUser = if ($env:VOICEGEN_OUI_WSL_USER) { $env:VOICEGEN_OUI_WSL_USER } else { "root" }

    $wslCheck = & wsl -d $WslDistro -u $WslUser -e echo "alive" 2>&1
    if ($LASTEXITCODE -eq 0 -and $wslCheck -match "alive") {
        Write-Badge "OK" "WSL2 target distro '$WslDistro' is reachable." "User: $WslUser"

        # --- 3. AMD GPU & ROCm Pass-Through ---
        Write-Host ""
        Write-Host "3. AMD ROCm & GPU Diagnostics (inside WSL)" -ForegroundColor Cyan

        & wsl -d $WslDistro -u $WslUser -e bash -c "test -c /dev/kfd" 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Badge "OK" "AMD ROCm kernel driver device (/dev/kfd) is present." "ROCm hardware acceleration is active."
        } else {
            & wsl -d $WslDistro -u $WslUser -e bash -c "which rocm-smi" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Write-Badge "WARN" "ROCm tools are installed, but /dev/kfd is currently uninitialized." "If you restarted recently, start the AMD driver service. See docs/ROCM_WSL_SETUP.md"
            } else {
                Write-Badge "WARN" "ROCm kernel interface (/dev/kfd) not detected in WSL." "Follow setup instructions in docs/ROCM_WSL_SETUP.md to enable AMD ROCm GPU pass-through."
            }
        }

        # Check Python venv in WSL
        $candidates = @(
            "/root/voicegen-oui-rocm72",
            "/root/voxcpm-wsl-rocm72",
            "/root/voxcpm-wsl-rocm",
            "/home/$WslUser/voicegen-oui-rocm72",
            "/home/$WslUser/voxcpm-wsl-rocm72",
            "/home/$WslUser/voxcpm-wsl-rocm"
        )
        if ($env:VOICEGEN_OUI_WSL_VENV) {
            $candidates = @($env:VOICEGEN_OUI_WSL_VENV) + $candidates
        }

        $foundVenv = $null
        foreach ($candidate in $candidates) {
            & wsl -d $WslDistro -u $WslUser -e bash -c "test -f '$candidate/bin/activate'" 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                $foundVenv = $candidate
                break
            }
        }

        if ($foundVenv) {
            Write-Badge "OK" "WSL Python virtual environment detected." ($foundVenv)
        } else {
            Write-Badge "WARN" "No standard WSL Python venv found." "Set VOICEGEN_OUI_WSL_VENV or configure per docs/ROCM_WSL_SETUP.md"
        }

    } else {
        Write-Badge "WARN" "Target WSL distro '$WslDistro' is not installed or not running." "Install Ubuntu 22.04 with: wsl --install -d Ubuntu-22.04"
    }
}

# --- 4. Model Weights & Runtime Storage ---
Write-Host ""
Write-Host "4. Model Weights & Runtime Storage" -ForegroundColor Cyan

$DataRoot = if ($env:VOICEGEN_OUI_DATA_ROOT) {
    $env:VOICEGEN_OUI_DATA_ROOT
} else {
    Join-Path $env:LOCALAPPDATA "VoiceGenOui"
}

$ModelPath = if ($env:VOXCPM_MODEL_PATH) {
    $env:VOXCPM_MODEL_PATH
} else {
    Join-Path $DataRoot "models\VoxCPM2"
}

Write-Badge "INFO" "Resolved Data Root: $DataRoot"
Write-Badge "INFO" "Resolved Model Path: $ModelPath"

$requiredFiles = @("config.json", "model.safetensors", "audiovae.pth")
$missingFiles = @()

foreach ($req in $requiredFiles) {
    $p = Join-Path $ModelPath $req
    if (-not (Test-Path $p)) {
        $missingFiles += $req
    }
}

if ($missingFiles.Count -eq 0) {
    Write-Badge "OK" "VoxCPM2 model weights verified (config.json, model.safetensors, audiovae.pth)."
} else {
    Write-Badge "WARN" "Missing model weights in $ModelPath." "Missing: $($missingFiles -join ', '). Run: .\download_voxcpm_models.ps1"
}

# --- 5. Network Ports & Active Services ---
Write-Host ""
Write-Host "5. Network Ports & Active Services" -ForegroundColor Cyan

# Port 3113 (VoiceGen Oui UI & Backend)
$port3113Open = Test-PortOpen "127.0.0.1" 3113
if ($port3113Open) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:3113/api/health" -TimeoutSec 2 -ErrorAction Stop
        Write-Badge "OK" "VoiceGen Oui server is currently RUNNING on port 3113."
    } catch {
        Write-Badge "WARN" "Port 3113 is in use by another process or server is starting."
    }
} else {
    Write-Badge "OK" "Port 3113 is available."
}

# Port 3115 (Windows LLM Bridge)
$port3115Open = Test-PortOpen "127.0.0.1" 3115
if ($port3115Open) {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:3115/health" -TimeoutSec 2 -ErrorAction Stop
        Write-Badge "OK" "Windows LLM Bridge is currently RUNNING on port 3115."
    } catch {
        Write-Badge "WARN" "Port 3115 is in use by another process."
    }
} else {
    Write-Badge "OK" "Port 3115 is available."
}

# --- Summary Verdict ---
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Doctor Summary: $($script:PassCount) Passed, $($script:WarnCount) Warnings, $($script:FailCount) Failures" -ForegroundColor White
Write-Host "============================================================" -ForegroundColor Cyan

if ($script:FailCount -gt 0) {
    Write-Host ""
    Write-Host "  Result: BLOCKING PREREQUISITES FOUND" -ForegroundColor Red
    Write-Host "  Please resolve the failures listed above before launching." -ForegroundColor DarkYellow
    Write-Host ""
} elseif ($script:WarnCount -gt 0) {
    Write-Host ""
    Write-Host "  Result: READY WITH WARNINGS" -ForegroundColor Yellow
    Write-Host "  You can start VoiceGen Oui!, but check the warnings above for optional components." -ForegroundColor DarkYellow
    Write-Host "  Launch command: .\start_voicegen_oui_voxcpm_wsl_rocm7.ps1" -ForegroundColor Cyan
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "  Result: ALL SYSTEMS GO!" -ForegroundColor Green
    Write-Host "  Your environment is 100% configured for VoiceGen Oui! ROCm." -ForegroundColor White
    Write-Host "  Launch command: .\start_voicegen_oui_voxcpm_wsl_rocm7.ps1" -ForegroundColor Cyan
    Write-Host ""
}

if (-not $NoPause) {
    Read-Host "Press Enter to close this diagnostic window"
}
