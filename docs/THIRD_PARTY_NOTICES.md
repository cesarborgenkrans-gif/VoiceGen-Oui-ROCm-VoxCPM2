# Third-Party Notices

This repository is intended to contain the VoiceGen (rocm-voxcpm) app code, not bundled model weights or Python dependencies.

This project is independent and is not affiliated with, sponsored by, or endorsed by AMD or OpenBMB.

## VoxCPM

The app integrates VoxCPM through the `voxcpm` Python package and expects local VoxCPM2 model files under `models/VoxCPM2/`.

Users should review the upstream VoxCPM package, model card, and license terms before redistribution or production use.

## PyTorch ROCm

The AMD GPU runtime uses PyTorch ROCm wheels. Install them through `requirements.txt` in the WSL environment rather than committing them to the repository.

## AMD ROCm And ROCDXG

ROCm, HIP, and ROCDXG are AMD components installed on the host WSL environment. They are external system dependencies and are not redistributed by this repository.

AMD ROCm(tm) and related marks are trademarks of Advanced Micro Devices, Inc.

## Voice Cloning Safety

Voice cloning and continuation modes can imitate voices from supplied audio. Users are responsible for obtaining consent and complying with applicable laws, platform rules, and model license terms.
