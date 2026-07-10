# VoiceGen Oui! (ROCm-VoxCPM2)

**ROCm-powered VoxCPM2 voice generation for Windows users who want to use their AMD GPU instead of falling back to CPU.**

![VoiceGen Oui! GUI demo: type a voice design, then generate audio](docs/assets/voicegen-oui-rocm-voxcpm2-gui-demo.gif)

## Listen

| Sales pitch | Helpful narrator |
| --- | --- |
| [▶ Play WAV](https://github.com/cesarborgenkrans-gif/attach/raw/main/audio/voicegen-sample-01.wav) | [▶ Play WAV](https://github.com/cesarborgenkrans-gif/attach/raw/main/audio/voicegen-sample-02.wav) |

VoiceGen Oui! is the practical ROCm layer around VoxCPM2: a local GUI and Windows-to-WSL bridge for AMD GPU users. It makes the ROCm path approachable on Windows, where the usable route is WSL2 rather than the direct Linux setup many AMD users already have.

**Reference hardware:** AMD Radeon RX 7900 XTX / `gfx1100`

**Quality / speed setting:** `8` timesteps is the project setting for the fastest generation that still meets VoiceGen Oui!'s target quality. Recorded RX 7900 XTX reference sessions have reached **8.24-8.64 it/s** with this setting.

Built by **Cesar Borgenkrans** / [SparkleSnap](https://sparklesnap.dev/). The two samples above are intentional public demo media; ordinary generated audio remains local and gitignored.

## What It Unlocks

This is not the upstream VoxCPM2 model or training project. It is the utility layer that makes the ROCm path practical on Windows: write a voice design, generate locally, compare results, and help improve AMD GPU compatibility for the next person.

Need the environment first? Follow the [ROCm WSL setup guide](docs/ROCM_WSL_SETUP.md). Model weights are installed locally under `models/VoxCPM2/` or pointed to with `VOXCPM_MODEL_PATH`; they are never committed here.

## Run

From the repository root in Windows PowerShell:

```powershell
.\start_voicegen_oui_voxcpm_wsl_rocm7.ps1
```

The launcher waits for VoiceGen Oui! to become healthy, then opens the app in your default browser. Use `-NoBrowser` when you only want to start the backend.

## Try It, Test It, Improve It

If you use Windows with an AMD GPU and want to help make VoxCPM2 more usable through ROCm and WSL2, this repo is for you.

- Test your AMD card and share what happened.
- Send launcher, setup, or documentation fixes.
- Report successful runs, partial runs, and useful failures.

The most useful contribution is a hardware test report with your GPU, ROCm version, PyTorch ROCm result, VoxCPM2 result, and observed speed. Start with [CONTRIBUTING.md](CONTRIBUTING.md) or [open a hardware report](https://github.com/cesarborgenkrans-gif/VoiceGen-Oui-ROCm-VoxCPM2/issues/new?template=hardware-test.yml).

## Local-Only Files

The repository contains source code, docs, lightweight placeholders, and the curated README demo media above. Runtime outputs, custom personas, logs, and optional user-managed models live in `%LOCALAPPDATA%\VoiceGenOui`; model weights, Python environments, and `.env` files are not committed. See [.gitignore](.gitignore) and [the path guide](docs/dev_paths.md) for the exact rules.

## License And Notices

The utility code and documentation are [Apache-2.0](LICENSE). Mascots, logos, SparkleSnap marks, screenshots, and README/demo media are separate reserved assets under [docs/ASSET_LICENSE.md](docs/ASSET_LICENSE.md).

Third-party models, libraries, and assets keep their own licenses; see [docs/THIRD_PARTY_NOTICES.md](docs/THIRD_PARTY_NOTICES.md) and [NOTICE](NOTICE). VoiceGen Oui! is independent and is not affiliated with, sponsored by, or endorsed by AMD or OpenBMB. AMD ROCm and related marks are trademarks of Advanced Micro Devices, Inc.
