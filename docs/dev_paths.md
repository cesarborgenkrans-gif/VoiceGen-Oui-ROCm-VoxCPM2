# VoiceGen Oui! Runtime Paths

VoiceGen Oui! keeps source code and mutable user data separate.

```text
VoiceGen-Oui-ROCm-VoxCPM2/                 source checkout
  app/                                     browser UI and backend source
  docs/                                    setup and public documentation
  models/                                  legacy local-model fallback, ignored by git

%LOCALAPPDATA%\VoiceGenOui\                runtime data root
  outputs/                                 generated WAV files and metadata.json
  personas/                                custom local personas
  logs/                                    AI addon event log
  models/VoxCPM2/                          preferred model installation location
```

The launcher creates the runtime folders automatically and passes the Windows path to WSL. Existing source-checkout models remain a fallback so a migration does not break a working installation.

## Overrides

```text
VOICEGEN_OUI_WSL_DISTRO
VOICEGEN_OUI_WSL_USER
VOICEGEN_OUI_WSL_VENV
VOICEGEN_OUI_DATA_ROOT
VOICEGEN_OUI_APP_ROOT
VOICEGEN_OUI_OUTPUTS_DIR
VOICEGEN_OUI_CUSTOM_PERSONAS_PATH
VOICEGEN_OUI_VRAM_REQUIRED_GIB
VOICEGEN_OUI_AI_ADDON_PORT
VOICEGEN_OUI_AI_ADDON_TARGET
VOICEGEN_OUI_AI_ADDON_LOG
VOXCPM_MODEL_PATH
```

`VOICEGEN_OUI_DATA_ROOT` defaults to `%LOCALAPPDATA%\VoiceGenOui`. `VOXCPM_MODEL_PATH` takes precedence when a model is stored elsewhere, such as a larger data drive.

## Routes

```text
/                              VoiceGen Oui! UI
/outputs/<filename>            generated audio from the runtime data root
/api/health                    resolved app and data paths
/api/outputs                   output history
/api/generate                  synthesis request
```

The repository `.gitignore` remains a second safety layer. It is not the primary boundary for user data.
