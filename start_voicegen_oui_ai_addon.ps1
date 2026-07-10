$ErrorActionPreference = "Stop"

$ScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Server = Join-Path $ScriptRoot "app\_backend\ai_addon_server.py"

if (-not $env:VOICEGEN_OUI_APP_ROOT) {
  $env:VOICEGEN_OUI_APP_ROOT = Join-Path $ScriptRoot "app"
}

if (-not $env:VOICEGEN_OUI_DATA_ROOT) {
  $env:VOICEGEN_OUI_DATA_ROOT = Join-Path $env:LOCALAPPDATA "VoiceGenOui"
}

if (-not $env:VOICEGEN_OUI_AI_ADDON_TARGET) {
  $env:VOICEGEN_OUI_AI_ADDON_TARGET = "http://127.0.0.1:3113"
}

if (-not $env:VOICEGEN_OUI_AI_ADDON_PORT) {
  $env:VOICEGEN_OUI_AI_ADDON_PORT = "3114"
}

$Python = $env:VOICEGEN_OUI_AI_ADDON_PYTHON
if ([string]::IsNullOrWhiteSpace($Python)) {
  $Python = "python"
}

Write-Host "Starting VoiceGen Oui! AI Addon..."
Write-Host "  Dashboard: http://127.0.0.1:$env:VOICEGEN_OUI_AI_ADDON_PORT/ai-addon.html"
Write-Host "  Gateway:   http://127.0.0.1:$env:VOICEGEN_OUI_AI_ADDON_PORT/api/generate"
Write-Host "  Target:    $env:VOICEGEN_OUI_AI_ADDON_TARGET"
Write-Host ""

& $Python $Server
