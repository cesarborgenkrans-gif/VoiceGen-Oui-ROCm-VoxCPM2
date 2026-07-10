# ROCm + WSL2 Setup Notes

This document summarizes the AMD GPU path used by VoiceGen Oui! (ROCm-VoxCPM2). It is written as a reproducible setup guide!

The verified development target was:

- Windows host with AMD Radeon RX 7900 XTX.
- WSL2.
- Ubuntu 22.04.
- ROCm 7.2 packages.
- ROCDXG from `ROCm/librocdxg`.
- PyTorch ROCm 7.2 wheels.
- VoxCPM2 model files stored locally outside git.

Other AMD ROCm-supported cards may work, but they should be validated with the same gates below.

## 1. Windows And WSL Prerequisites

Install a current AMD Adrenalin driver that supports ROCm on WSL, such as version 26.3.1. Then install or update WSL2 and Ubuntu 22.04.

Inside WSL, verify the Windows GPU bridge is visible:

```bash
ls -l /dev/dxg
ls -l /usr/lib/wsl/lib/libdxcore.so
```

Both should exist before spending time on PyTorch or VoxCPM.

## 2. Build Tools

Install the basic build tools needed for ROCDXG:

```bash
sudo apt update
sudo apt install -y git make gcc g++ cmake pkg-config
```

The local machine that validated this app had:

- `git 2.34.1`
- `GNU Make 4.3`
- `gcc 11.4.0`
- `g++ 11.4.0`
- `cmake 3.22.1`

Exact patch versions do not need to match, but the tools must exist.

## 3. ROCm 7.2 Packages

Configure AMD's ROCm package source for Ubuntu 22.04 and install ROCm runtime packages. Follow AMD's current package instructions for the exact repository line and keyring method.

Before a full install, use a simulated install to make sure WSL is not about to install kernel driver packages:

```bash
apt-cache policy rocm-core
sudo apt-get -s install rocm
```

For WSL, the package plan should include ROCm userspace/runtime packages and should not try to install a Linux kernel GPU driver such as `amdgpu-dkms`.

## 4. ROCDXG

Clone, build, and install `ROCm/librocdxg` inside WSL:

```bash
git clone https://github.com/ROCm/librocdxg.git
cd librocdxg
mkdir -p build
cd build
cmake ..
make -j"$(nproc)"
sudo make install
```

Verify the installed files:

```bash
test -f /opt/rocm/lib/librocdxg.so
test -f /opt/rocm/share/rocdxg/dids.conf
```

Then verify ROCm sees the GPU:

```bash
rocminfo | grep -E "Name:|gfx"
```

For an RX 7900 XTX, expect `gfx1100` somewhere in the output.

## 5. Python Runtime

Create a WSL virtual environment wherever you prefer:

```bash
python3 -m venv ~/voicegen-oui-rocm72
source ~/voicegen-oui-rocm72/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip check
```

The repository requirements use the ROCm 7.2 PyTorch wheel index. The VoiceGen backend itself uses Python's standard-library `ThreadingHTTPServer`, so FastAPI, Uvicorn, Requests, and AioHTTP are not required unless the backend is rewritten later. See [DEPENDENCIES.md](DEPENDENCIES.md) for the dependency boundary.

Validate PyTorch:

```bash
python3 - <<'PY'
import torch
print(torch.__version__)
print(torch.version.hip)
print(torch.cuda.is_available())
print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "no gpu")
x = torch.randn((512, 512), device="cuda")
print((x @ x).mean().item())
PY
```

Expected result:

- `torch.cuda.is_available()` is `True`.
- The device name is your AMD GPU.
- The matmul completes without crashing.

If PyTorch loads a bundled HSA runtime instead of the system ROCm runtime, ROCm detection can fail. The working path uses `/opt/rocm/lib` through `LD_LIBRARY_PATH`.

## 6. Model Files

From Windows PowerShell, run the repository model installer after the WSL environment exists:

```powershell
.\download_voicegen_oui_models.ps1
```

It downloads the upstream `openbmb/VoxCPM2` snapshot into the default user-data location:

```text
%LOCALAPPDATA%\VoiceGenOui\models\VoxCPM2\
```

The script asks the user to review the upstream model card and license before downloading, verifies `config.json`, `model.safetensors`, and `audiovae.pth`, and does not commit model files to git. You can keep the model anywhere and point the app at it:

```bash
export VOXCPM_MODEL_PATH=/path/to/VoxCPM2
```

Do not commit model files to git.

## 7. Runtime Environment

The launcher sets these ROCm runtime variables inside WSL:

```bash
export HSA_ENABLE_DXG_DETECTION=1
export HSA_OVERRIDE_GFX_VERSION=11.0.0
export LD_LIBRARY_PATH=/opt/rocm/lib
export MIOPEN_FIND_MODE=2
```

`MIOPEN_FIND_MODE=2` keeps MIOpen from using unsafe search behavior that can spike memory. The old synchronous flags are not part of the ROCm 7.2 path:

```bash
HIP_LAUNCH_BLOCKING=1
AMD_SERIALIZE_KERNEL=3
```

Those old flags were useful for a previous ROCm path, but they are intentionally not used in the current ROCm 7 launcher.

## 8. Running VoiceGen

From Windows PowerShell:

```powershell
.\start_voicegen_oui_voxcpm_wsl_rocm7.ps1
```

Optional launcher overrides:

```powershell
$env:VOICEGEN_OUI_WSL_DISTRO = "Ubuntu-22.04"
$env:VOICEGEN_OUI_WSL_USER = "root"
$env:VOICEGEN_OUI_WSL_VENV = "/root/voxcpm-wsl-rocm72"
$env:VOICEGEN_OUI_DATA_ROOT = "$env:LOCALAPPDATA\VoiceGenOui"
$env:VOICEGEN_OUI_APP_ROOT = "D:\path\to\VoiceGen-Oui-ROCm-VoxCPM2\app"
$env:VOXCPM_MODEL_PATH = "D:\path\to\models\VoxCPM2"
```

If `VOICEGEN_OUI_WSL_VENV` is not set, the launcher checks `voicegen-oui-rocm72`, `voxcpm-wsl-rocm72`, and `voxcpm-wsl-rocm` under the selected WSL user home.

Open:

```text
http://localhost:3113
```

## 9. Validation Gates

Use these gates before calling a setup working:

```bash
rocminfo | grep -E "Name:|gfx"
pip check
python3 -c "import torch; print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0))"
cd app
python3 _backend/server.py
```

Then generate one short clip in the UI.

Reject the setup if:

- ROCm cannot see the GPU.
- PyTorch cannot allocate a small tensor on `cuda`.
- VoxCPM generation hangs, crashes, or reloads the wrong ROCm runtime.
- VRAM usage grows toward unsafe MIOpen workspace spikes.

## 10. Notes From The Bring-Up

The working ROCm 7.2 path was developed after an older ROCm path needed synchronous flags to avoid instability. The current public launcher keeps the important stable environment variables, leaves out the old sync flags, and keeps project, virtual environment, and model paths configurable.
