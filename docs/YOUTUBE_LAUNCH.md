# YouTube Launch Copy

Use this release copy for the VoiceGen Oui! teaser, tutorial, and Shorts.

## Core Positioning

VoiceGen Oui! is a practical Windows-to-WSL2 bridge for running VoxCPM2 through ROCm on AMD GPUs. It is not the upstream VoxCPM2 model or training project.

Use the RX 7900 XTX / `gfx1100` as the reference configuration. The project’s preferred eight-timestep setting has reached 8.24 to 8.64 it/s in recorded reference sessions. State that results vary by settings, text, ROCm, PyTorch, WSL2, and GPU configuration.

Do not describe TTS as NVIDIA-only. Say that many desktop TTS guides and setups are CUDA/NVIDIA-centric.

## Description Template

```text
VoiceGen Oui! is a practical Windows-to-WSL2 bridge for running VoxCPM2 through ROCm on AMD GPUs.

Reference hardware: AMD Radeon RX 7900 XTX / gfx1100. The project’s preferred eight-timestep setting has reached 8.24 to 8.64 it/s in recorded reference sessions. Your result will vary with settings, text, ROCm, PyTorch, WSL2, and GPU configuration.

This is an independent utility project, not the upstream VoxCPM2 model or training project. It is not affiliated with, sponsored by, or endorsed by AMD or OpenBMB.

Test your AMD GPU and share your result or useful failure:
https://github.com/cesarborgenkrans-gif/VoiceGen-Oui-ROCm-VoxCPM2

Upstream VoxCPM: https://github.com/OpenBMB/VoxCPM
```

## Pinned Comment

```text
What AMD GPU are you testing? Share your GPU, ROCm version, WSL2 setup, PyTorch ROCm result, VoxCPM2 result, and observed speed in the GitHub hardware report. Successful runs, partial runs, and useful failures all help.
```

## Release Boundary

Publish these assets through YouTube and GitHub only. Do not make direct OpenBMB outreach, open a promotional issue, or change repository visibility through CLI in this release phase.
