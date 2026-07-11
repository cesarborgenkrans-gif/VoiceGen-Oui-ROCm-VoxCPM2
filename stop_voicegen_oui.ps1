param(
    [switch]$NoPause
)

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

function Test-VoiceGenHealth {
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:3113/api/health" -TimeoutSec 2 -ErrorAction Stop
        return $health.status -eq "ok"
    } catch {
        return $false
    }
}

$SourceRootWindows = Split-Path -Parent $PSCommandPath
$AppRootWindows = if ($env:VOICEGEN_OUI_APP_ROOT) { $env:VOICEGEN_OUI_APP_ROOT } else { Join-Path $SourceRootWindows "app" }
$DataRoot = if ($env:VOICEGEN_OUI_DATA_ROOT) { $env:VOICEGEN_OUI_DATA_ROOT } else { Join-Path $env:LOCALAPPDATA "VoiceGenOui" }
$WslDistro = if ($env:VOICEGEN_OUI_WSL_DISTRO) { $env:VOICEGEN_OUI_WSL_DISTRO } else { "Ubuntu-22.04" }
$WslUser = if ($env:VOICEGEN_OUI_WSL_USER) { $env:VOICEGEN_OUI_WSL_USER } else { "root" }
$WslAppRoot = Convert-ToWslPath $AppRootWindows
$WslPidPath = Convert-ToWslPath (Join-Path $DataRoot "voicegen-server.pid")
$QuotedAppRoot = Quote-Bash $WslAppRoot
$QuotedPidPath = Quote-Bash $WslPidPath

if (-not (Test-VoiceGenHealth)) {
    Write-Host "VoiceGen is not responding on port 3113." -ForegroundColor Yellow
}

$BashCommand = @"
set -u
pid_file=$QuotedPidPath
app_root=$QuotedAppRoot
pid=''
if test -r `$pid_file; then
    pid=`$(tr -dc '0-9' < `$pid_file)
fi

if test -n `$pid && test -d /proc/`$pid; then
    current_root=`$(readlink -f /proc/`$pid/cwd 2>/dev/null || true)
    if test `$current_root != `$app_root; then
        pid=''
    fi
else
    pid=''
fi

if test -z `$pid; then
    while read -r candidate; do
        test -n `$candidate || continue
        current_root=`$(readlink -f /proc/`$candidate/cwd 2>/dev/null || true)
        if test `$current_root = `$app_root; then
            pid=`$candidate
            break
        fi
    done < <(pgrep -f 'python3 _backend/server.py' || true)
fi

if test -z `$pid; then
    rm -f `$pid_file
    echo VoiceGen server process was not found.
    exit 0
fi

echo Stopping VoiceGen server PID `$pid...
kill -TERM `$pid
for attempt in `$(seq 1 20); do
    test -d /proc/`$pid || break
    sleep 0.25
done
if test -d /proc/`$pid; then
    echo VoiceGen did not stop after the graceful request; terminating the verified process.
    kill -KILL `$pid
fi
rm -f `$pid_file
echo VoiceGen server stopped.
"@
$BashCommand = $BashCommand -replace "`r`n", "`n"

& wsl -d $WslDistro -u $WslUser -e bash -lc $BashCommand
if ($LASTEXITCODE -ne 0) {
    throw "The WSL stop command failed with exit code $LASTEXITCODE."
}

if (-not $NoPause) {
    Read-Host "Press Enter to close this window"
}
