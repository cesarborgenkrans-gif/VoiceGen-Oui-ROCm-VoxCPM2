$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $ScriptRoot "app\_backend\ai_addon_server.py"

if (-not $env:WAIFUVOICE_APP_ROOT) {
  $env:WAIFUVOICE_APP_ROOT = Join-Path $ScriptRoot "app"
}

if (-not $env:WAIFUVOICE_DATA_ROOT) {
  $env:WAIFUVOICE_DATA_ROOT = $ScriptRoot
}

if (-not $env:WAIFUVOICE_AI_ADDON_TARGET) {
  $env:WAIFUVOICE_AI_ADDON_TARGET = "http://127.0.0.1:3113"
}

if (-not $env:WAIFUVOICE_AI_ADDON_PORT) {
  $env:WAIFUVOICE_AI_ADDON_PORT = "3114"
}

$Python = $env:WAIFUVOICE_AI_ADDON_PYTHON
if ([string]::IsNullOrWhiteSpace($Python)) {
  $Python = "python"
}

Write-Host "Starting VoiceGen AI Addon..."
Write-Host "  Dashboard: http://127.0.0.1:$env:WAIFUVOICE_AI_ADDON_PORT/ai-addon.html"
Write-Host "  Gateway:   http://127.0.0.1:$env:WAIFUVOICE_AI_ADDON_PORT/api/generate"
Write-Host "  Target:    $env:WAIFUVOICE_AI_ADDON_TARGET"
Write-Host ""

& $Python $Server
