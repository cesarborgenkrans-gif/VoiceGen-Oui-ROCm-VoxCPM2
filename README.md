# VoiceGen (rocm-voxcpm)

**ROCm-powered VoxCPM2 voice generation for AMD GPU users.**

VoiceGen is a utility repo: a local app, launcher, and setup path that puts VoxCPM2 into practice on AMD GPUs through ROCm. It is not the upstream VoxCPM2 baseline, model, or training project. It is the practical layer around that code path so more AMD GPU users can actually try the feature, test hardware, and contribute fixes.

**Reference hardware:** AMD Radeon RX 7900 XTX / `gfx1100`

**Observed performance:** up to approximately **8 it/s** in the reference VoxCPM2 voice-generation setup.

This is a reference measurement from the project development setup, not a universal speed guarantee. Actual performance depends on voice-generation settings, text length, ROCm and PyTorch versions, WSL configuration, and GPU.

![VoiceGen GUI demo: type a voice design, then generate audio](docs/assets/voicegen-rocm-voxcpm-gui-demo.gif)

Hear a short sample generated through the same VoiceGen / VoxCPM2 path:

<audio controls preload="metadata" src="docs/assets/voicegen-reference-rx7900xtx.wav">
  Your browser does not support the audio player. [Download the WAV sample](docs/assets/voicegen-reference-rx7900xtx.wav).
</audio>

[Download the reference WAV sample](docs/assets/voicegen-reference-rx7900xtx.wav)

## Try It, Test It, Improve It

If you have an AMD GPU and want VoxCPM2 off the CPU path, this repo is for you.

- **Try it** if you run Windows + WSL2 and want a ROCm route for VoxCPM2.
- **Test another AMD card** if you have something besides an RX 7900 XTX.
- **Open a report** if setup works, partly works, or fails in a useful way.
- **Send fixes** for ROCm setup notes, launcher portability, docs, or runtime behavior.

The most helpful contribution right now is a hardware test report: GPU model, ROCm version, PyTorch ROCm result, generation result, and measured speed. Use [docs/TEST_REPORT_TEMPLATE.md](docs/TEST_REPORT_TEMPLATE.md), then [open a hardware report on GitHub](https://github.com/cesarborgenkrans-gif/VoiceGen-ROCm-VoxCPM2/issues/new?template=hardware-test.yml).

## What This Is

VoiceGen gives you:

- A utility layer around VoxCPM2: GUI, launcher, and ROCm/WSL notes.
- A browser GUI for writing a spoken script and voice design.
- A Windows PowerShell launcher for the WSL2 + ROCm + VoxCPM2 path.
- Local output/history folders for generated audio.
- Setup notes for ROCm, ROCDXG, and PyTorch ROCm wheels.
- A contribution path for AMD GPU compatibility results.

This is not a polished commercial product, and it is not a replacement for upstream VoxCPM2. It is an open utility project for ROCm users who want to get VoxCPM2 voice generation running locally and make the path easier for the next person.

## Reference Setup

The reference result above was produced on the RX 7900 XTX / `gfx1100` path. Other AMD GPUs are welcome to test, but their results are not represented by this reference benchmark until someone reports them. Share successful runs, partial results, and useful failures through the [hardware report workflow](https://github.com/cesarborgenkrans-gif/VoiceGen-ROCm-VoxCPM2/issues/new?template=hardware-test.yml).

This is not the upstream VoxCPM2 baseline model or training code, a redistribution point for model weights or ROCm packages, or an AMD/OpenBMB project.

## Quick Start

Clone the repo, then create a Python environment inside WSL. This path is only an example:

```bash
python3 -m venv ~/waifuvoice-rocm72
source ~/waifuvoice-rocm72/bin/activate
pip install -r requirements.txt
pip check
```

Install the ROCm/WSL pieces described in the [ROCm WSL setup guide](docs/ROCM_WSL_SETUP.md) before running the app. That guide contains the version-specific commands and validation gates, so the README can remain focused on the stable project path.

## Model Files

Download VoxCPM2 model files locally and place them under:

```text
models/VoxCPM2/
```

Model weights are not committed to this repo. You can also keep the model elsewhere:

```powershell
$env:VOXCPM_MODEL_PATH = "/mnt/d/path/to/VoxCPM2"
```

## Run

From the repo root in Windows PowerShell:

```powershell
.\start_waifuvoice_vox_wsl_rocm7.ps1
```

Then open:

```text
http://localhost:3113
```

The launcher name still contains `waifuvoice` for v1 compatibility. The same is true for `WAIFUVOICE_*` environment variables, localStorage keys, and output filename prefixes. They are internal compatibility names, not the public project name.

Optional path overrides:

```powershell
$env:WAIFUVOICE_WSL_DISTRO = "Ubuntu-22.04"
$env:WAIFUVOICE_WSL_USER = "root"
$env:WAIFUVOICE_WSL_VENV = "/root/voxcpm-wsl-rocm72"
$env:WAIFUVOICE_DATA_ROOT = "/mnt/d/path/to/VoiceGen"
$env:WAIFUVOICE_APP_ROOT = "/mnt/d/path/to/VoiceGen/app"
```

## What Is Not Committed

This repository ships source code, setup instructions, and lightweight placeholder files only.

- Model weights.
- Python virtual environments.
- Generated WAV files.
- Custom Persona Lab data.
- Local ROCm experiments, installers, logs, and machine-specific notes.

## Contributing

Contributions are welcome when they make AMD GPU voice generation easier to reproduce.

Good first contributions:

- A test report for another AMD GPU.
- A clearer ROCm/WSL validation step.
- A launcher fix for a different local path or WSL user.
- A PyTorch ROCm compatibility note.
- A docs correction that saves someone else an hour.

Start with [CONTRIBUTING.md](CONTRIBUTING.md), or open a report using [docs/TEST_REPORT_TEMPLATE.md](docs/TEST_REPORT_TEMPLATE.md).

## License, Assets, And Trademarks

The utility code and documentation text in this repository are released under the Apache License 2.0. This aligns the app layer with the Apache-2.0 licensing used by upstream VoxCPM2/OpenBMB while keeping this project independent.

Mascots, logos, brand images, SparkleSnap marks, screenshots, and README/demo media are not licensed as Apache-2.0 code. They are covered separately by [docs/ASSET_LICENSE.md](docs/ASSET_LICENSE.md), so contributors can use the app while the visual identity stays distinct from the code license.

Third-party models, libraries, and assets remain under their own licenses; see [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) and [NOTICE](NOTICE).

This project is independent and is not affiliated with, sponsored by, or endorsed by AMD or OpenBMB. AMD ROCm(tm) and related marks are trademarks of Advanced Micro Devices, Inc.
