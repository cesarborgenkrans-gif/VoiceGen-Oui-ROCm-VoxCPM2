@echo off
setlocal

set "VOICEGEN_OUI_DATA=%LOCALAPPDATA%\VoiceGenOui"
if not exist "%VOICEGEN_OUI_DATA%" mkdir "%VOICEGEN_OUI_DATA%"

start "" explorer.exe "%VOICEGEN_OUI_DATA%"
