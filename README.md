# WaifuVoice Forge VoxCPM

Local-first VoxCPM voice synthesis UI for giving waifus, husbandos, mascots, and original personas a voice on your own machine.

The app is built for a Windows + WSL2 + AMD ROCm workflow. The current verified development machine runs VoxCPM2 on an AMD Radeon RX 7900 XTX through Ubuntu 22.04, ROCm 7.2, ROCDXG, and PyTorch ROCm wheels. Your WSL username, project path, virtual environment path, and model path do not need to match the author's machine.

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

This repository ships source code and setup instructions only.

- Model weights are not committed.
- Python virtual environments are not committed.
- Generated WAV files are not committed.
- Local ROCm experiments, snapshots, installers, and machine-specific notes are not committed.
- User-authored `presets_custom.json` data is treated as local runtime data.

Download model files locally and place VoxCPM2 at `models/VoxCPM2/`, or set `VOXCPM_MODEL_PATH` to another local VoxCPM2 snapshot.

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

The launcher has defaults, but all important local paths are configurable.

PowerShell environment variables:

```powershell
$env:WAIFUVOICE_WSL_DISTRO = "Ubuntu-22.04"
$env:WAIFUVOICE_WSL_USER = "root"
$env:WAIFUVOICE_WSL_VENV = "/home/you/waifuvoice-rocm72"
$env:WAIFUVOICE_WSL_PROJECT = "/mnt/d/path/to/WaifuVoice"
$env:VOXCPM_MODEL_PATH = "/mnt/d/path/to/models/VoxCPM2"
```

If `WAIFUVOICE_WSL_PROJECT` is not set, the launcher converts the current Windows project folder to a WSL path automatically.

## Run

From Windows PowerShell:

```powershell
.\start_waifuvoice_vox_wsl_rocm7.ps1
```

Then open:

```text
http://localhost:3113
```

The launcher binds the server inside WSL with `HOST=0.0.0.0` so Windows can reach it through `localhost:3113`. The Python server defaults to `HOST=127.0.0.1` when run directly.

Opening `index.html` directly with `file:///` can call the local backend at `http://localhost:3113`, but the HTTP route is the preferred path.

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
