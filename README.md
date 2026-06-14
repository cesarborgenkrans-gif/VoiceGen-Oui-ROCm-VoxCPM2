# WaifuVoice Forge VoxCPM

Local-first VoxCPM voice synthesis UI for giving waifus, husbandos, mascots, and original personas a voice on your own machine.

The repository root is the **WaifuVoice lobby**: user-owned models, generated audio, and custom personas live beside the app code instead of inside it.

```text
WaifuVoice/
  app/                  source code and UI
  models/               local model snapshots, ignored by git
  outputs/              generated audio, ignored by git
  personas/             custom Persona Lab data, ignored by git except examples
```

The current verified development path runs VoxCPM2 on an AMD Radeon RX 7900 XTX through Windows + WSL2 + Ubuntu 22.04 + ROCm 7.2 + ROCDXG + PyTorch ROCm wheels. Your WSL username, project path, virtual environment path, and model path do not need to match the author's machine.

## Current Status

- VoxCPM2 generation works end-to-end on AMD ROCm through WSL2.
- The ROCm 7 launcher is `start_waifuvoice_vox_wsl_rocm7.ps1`.
- The backend serves the app at `http://localhost:3113`.
- Math SDPA is intentionally used. Flash SDPA was tested on the current `gfx1100` stack and was not promoted because it did not improve generation speed meaningfully.

```text
  __
(o o)  BADGE BIRD
 /V\   shiny lil status board
```

## What Is Not Committed

This repository ships source code, setup instructions, and lightweight placeholder files only.

- Model weights are not committed. Default location: `models/VoxCPM2/`.
- Python virtual environments are not committed.
- Generated WAV files are not committed. Default location: `outputs/`.
- Custom Persona Lab data is not committed. Default file: `personas/presets_custom.json`.
- Local ROCm experiments, snapshots, installers, and machine-specific notes are not committed.

```text
 /\_/\
( . . )  POCKET GUIDE
(  v  )  smol setup helper, big checklist energy
```

## Install

Create a Python environment inside WSL. This path is only an example:

```bash
python3 -m venv ~/waifuvoice-rocm72
source ~/waifuvoice-rocm72/bin/activate
pip install -r requirements.txt
```

Install ROCm 7.2-compatible system packages and ROCDXG inside WSL before running the app. The short version is:

- Use WSL2 with Ubuntu 22.04.
- Use an AMD Windows driver with WSL ROCm support.
- Confirm `/dev/dxg` exists inside WSL.
- Install ROCm 7.2 packages for Ubuntu 22.04.
- Build and install `ROCm/librocdxg`.
- Verify `/opt/rocm/lib/librocdxg.so` and `/opt/rocm/share/rocdxg/dids.conf`.
- Verify `rocminfo` sees your AMD GPU.
- Install PyTorch ROCm 7.2 wheels in the WSL Python environment.

See [docs/ROCM_WSL_SETUP.md](docs/ROCM_WSL_SETUP.md) for the detailed process and validation commands.

## Configure

Download VoxCPM2 model files locally and place them under:

```text
models/VoxCPM2/
```

Or point the app at another model path:

```powershell
$env:VOXCPM_MODEL_PATH = "/mnt/d/path/to/VoxCPM2"
```

The launcher has defaults, but all important local paths are configurable:

```powershell
$env:WAIFUVOICE_WSL_DISTRO = "Ubuntu-22.04"
$env:WAIFUVOICE_WSL_USER = "root"
$env:WAIFUVOICE_WSL_VENV = "/home/you/waifuvoice-rocm72"
$env:WAIFUVOICE_DATA_ROOT = "/mnt/d/path/to/WaifuVoice"
$env:WAIFUVOICE_APP_ROOT = "/mnt/d/path/to/WaifuVoice/app"
```

If `WAIFUVOICE_DATA_ROOT` and `WAIFUVOICE_APP_ROOT` are not set, the launcher converts the cloned Windows folder and its `app/` child to WSL paths automatically.

## Run

From the repo root in Windows PowerShell:

```powershell
.\start_waifuvoice_vox_wsl_rocm7.ps1
```

Then open:

```text
http://localhost:3113
```

The launcher binds the server inside WSL with `HOST=0.0.0.0` so Windows can reach it through `localhost:3113`. The Python server defaults to `HOST=127.0.0.1` when run directly.

Opening `app/index.html` directly with `file:///` can call the local backend at `http://localhost:3113`, but the HTTP route is the preferred path.

## License

The app code in this repository is released under the MIT License. Third-party models, libraries, and assets remain under their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

## Kawaii Companion Notes

```text
 /\_/\
( ^.^ )  thanks for visiting
 > ^ <   may your voices render cleanly
```

Small local tools deserve a little warmth. Have fun, keep consent in the loop, and let the generated voices stay kind.
