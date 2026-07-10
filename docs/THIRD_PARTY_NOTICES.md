# Third-Party Notices

This repository is intended to contain the VoiceGen (rocm-voxcpm) utility app code: GUI, launcher scripts, setup notes, and integration glue for running VoxCPM2 through ROCm. It does not bundle model weights, ROCm packages, or Python dependencies.

This project is independent and is not affiliated with, sponsored by, or endorsed by AMD or OpenBMB.

## VoiceGen Utility Code

The VoiceGen utility code in this repository is released under the Apache License 2.0. Third-party projects, models, packages, drivers, and assets remain under their own license terms.

VoiceGen mascots, logos, brand images, SparkleSnap marks, screenshots, and README/demo media are not licensed under Apache-2.0. See [ASSET_LICENSE.md](ASSET_LICENSE.md) for the separate asset and brand-use terms.

## VoxCPM

The app integrates VoxCPM through the `voxcpm` Python package and expects local VoxCPM2 model files under `models/VoxCPM2/`.

VoxCPM2/OpenBMB is the upstream model/code project. VoiceGen is not the upstream VoxCPM2 baseline and does not replace the upstream project; it is a practical utility layer for testing that path on ROCm-enabled AMD GPU setups.

Users should review the upstream VoxCPM package, model card, and license terms before redistribution or production use.

## PyTorch ROCm

The AMD GPU runtime uses PyTorch ROCm wheels. Install them through `requirements.txt` in the WSL environment rather than committing them to the repository.

## AMD ROCm And ROCDXG

ROCm, HIP, and ROCDXG are AMD components installed on the host WSL environment. They are external system dependencies and are not redistributed by this repository.

AMD ROCm(tm) and related marks are trademarks of Advanced Micro Devices, Inc.

## Voice Cloning Safety

Voice cloning and continuation modes can imitate voices from supplied audio. Users are responsible for obtaining consent and complying with applicable laws, platform rules, and model license terms.
