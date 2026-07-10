# Contributing To VoiceGen (rocm-voxcpm)

VoiceGen is a utility repo for helping AMD GPU users run VoxCPM2 voice generation through ROCm. It is not the upstream VoxCPM2 baseline; it is the practical app, launcher, and setup layer that helps more hardware reach and test the feature. The current verified setup is an RX 7900 XTX on Windows + WSL2 + Ubuntu 22.04 + ROCm 7.2. Other AMD cards need community testing.

## Good Contributions

- AMD GPU test reports, including failures.
- ROCm, WSL2, ROCDXG, or PyTorch setup corrections.
- Launcher portability fixes.
- Clear docs improvements that help another AMD GPU user reproduce the setup.
- VoxCPM2 runtime notes that identify real compatibility or performance behavior.

## Hardware Test Reports

Use [docs/TEST_REPORT_TEMPLATE.md](docs/TEST_REPORT_TEMPLATE.md) when opening an issue or pull request with a new GPU result.

Useful reports include:

- Exact GPU model and reported `gfx` target.
- Host OS and WSL/Linux distribution.
- AMD driver version.
- ROCm version.
- PyTorch ROCm version and `torch.cuda.is_available()` result.
- Whether VoxCPM2 generated audio successfully.
- Logs or error output for failed setups.

## Pull Request Expectations

- Keep internal `WAIFUVOICE_*` environment variables, launcher script names, output prefixes, and localStorage keys unless the change includes a migration plan.
- Do not commit model weights, generated audio, virtual environments, caches, local logs, or machine-specific setup files.
- Treat mascots, logos, brand images, SparkleSnap marks, screenshots, and demo media as separate from the Apache-2.0 code license; see [docs/ASSET_LICENSE.md](docs/ASSET_LICENSE.md).
- Keep setup docs specific to commands and validation gates that someone else can repeat.
- Avoid claiming support for a GPU unless a test report shows the validation result.

## Project Independence

This project is independent and is not affiliated with, sponsored by, or endorsed by AMD or OpenBMB. AMD ROCm(tm) and related marks are trademarks of Advanced Micro Devices, Inc.
