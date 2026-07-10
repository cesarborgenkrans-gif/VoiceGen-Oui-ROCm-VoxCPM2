# AMD GPU Test Report

Use this template when reporting a successful or failed VoiceGen Oui! (ROCm-VoxCPM2) setup.

## Result

- Status: success / partial / failed
- Summary:

## Hardware

- GPU model:
- Reported `gfx` target from `rocminfo`:
- VRAM:
- CPU:
- System RAM:

## Host And WSL/Linux

- Host OS:
- AMD driver version:
- WSL version, if applicable:
- Linux distribution:
- Kernel version:

## ROCm And ROCDXG

- ROCm version:
- ROCDXG source/commit, if built manually:
- `/dev/dxg` present: yes / no / not applicable
- `/opt/rocm/lib/librocdxg.so` present: yes / no / not applicable

## Python And PyTorch

- Python version:
- Virtual environment path:
- PyTorch version:
- `torch.version.hip`:
- `torch.cuda.is_available()`:
- `torch.cuda.get_device_name(0)`:

Paste validation output:

```text

```

## VoxCPM2 Generation

- VoxCPM2 model source/path:
- Generation mode tested: text / clone / continuation / streaming
- Voice language:
- Generation completed: yes / no
- Approximate generation speed: ___ it/s
- Generation settings and text length:
- Approximate generation time:
- VRAM behavior:

Paste relevant app or terminal output:

```text

```

## Notes

- What worked:
- What failed:
- Any workaround used:
- Anything that should be added to the docs:
