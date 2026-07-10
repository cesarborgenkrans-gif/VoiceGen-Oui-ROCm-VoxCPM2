# VoiceGen Development Paths

This project uses the repo root as the user-owned data root and `app/` as the application source folder.

## Recommended Repository Location

For easy access to your models, custom personas, and generated audio, we recommend cloning this repository somewhere easily accessible in your Windows file system, such as your Documents folder:

```text
C:\Users\YourName\Documents\VoiceGen
```

## WSL Path Equivalents

Even though the code lives on your Windows drive, the included launcher relies on WSL2 to run the Python backend and access your GPU. The launcher will automatically translate your Windows path to a mounted WSL path.

For example, if you place the folder in Documents, the WSL equivalents will be:

```text
/mnt/c/Users/YourName/Documents/VoiceGen
/mnt/c/Users/YourName/Documents/VoiceGen/app
```

## Root Layout

```text
VoiceGen/
  app/                         application source served by the backend
  app/index.html               main UI entrypoint
  app/_backend/                Python server, VoxCPM adapter, VRAM helpers
  app/_frontend/               frontend JS, CSS, assets, built-in preset data
  docs/                        setup and project documentation
  models/                      user-supplied model weights, ignored by git
  outputs/                     generated WAV files and metadata, ignored by git
  personas/                    user custom persona store, ignored by git except examples
  requirements.txt             Python dependency list
  start_voicegen_voxcpm_wsl_rocm7.ps1
```

## Backend Defaults

The backend derives paths in `app/_backend/server.py`:

```text
APP_ROOT = WAIFUVOICE_APP_ROOT or app/
DATA_ROOT = WAIFUVOICE_DATA_ROOT or repo root
MODEL_PATH = VOXCPM_MODEL_PATH or DATA_ROOT/models/VoxCPM2
OUTPUTS_DIR = WAIFUVOICE_OUTPUTS_DIR or DATA_ROOT/outputs
CUSTOM_PERSONAS_PATH = WAIFUVOICE_CUSTOM_PERSONAS_PATH or DATA_ROOT/personas/presets_custom.json
```

## Launcher Environment

The root launcher converts Windows paths to WSL paths and starts the server from `app/`.

Important overrides:

```text
WAIFUVOICE_WSL_DISTRO          default: Ubuntu-22.04
WAIFUVOICE_WSL_USER            default: root
WAIFUVOICE_WSL_VENV            optional explicit WSL venv path
WAIFUVOICE_DATA_ROOT           optional repo/data root override
WAIFUVOICE_APP_ROOT            optional app source root override
VOXCPM_MODEL_PATH              optional model folder override
```

If `WAIFUVOICE_WSL_VENV` is not set, the launcher automatically checks for a `.venv` or `venv` inside the root of this repository. This allows for fully portable, cloned setups without requiring any environment variables.

If no local virtual environment is found, it falls back to checking these global root-user runtime paths in order:

```text
/root/waifuvoice-rocm72
/root/voxcpm-wsl-rocm72
/root/voxcpm-wsl-rocm
```

For non-root WSL users, the same fallback names are checked under `/home/<user>/`.

## Optional Backend Overrides

These are read by the backend directly:

```text
WAIFUVOICE_OUTPUTS_DIR
WAIFUVOICE_CUSTOM_PERSONAS_PATH
WAIFUVOICE_VRAM_REQUIRED_GIB
HOST
PORT
```

## Key HTTP Routes

```text
/                              app/index.html
/_frontend/...                 frontend static files
/outputs/<filename>            generated audio files
/api/health                    backend status and resolved paths
/api/generate                  synthesis request
/api/generate_stream           streaming synthesis request
/api/outputs                   latest output history
/api/personas/custom           read/write custom personas
/api/vram                      advisory VRAM telemetry
/api/vram/unload               one-shot model unload
/api/llm_feedback              local LLM feedback helper
```

## Git Hygiene

The public repo should track source, docs, examples, and README files only. Model weights, generated audio, runtime metadata, custom local personas, caches, venvs, and logs belong in ignored runtime folders.
