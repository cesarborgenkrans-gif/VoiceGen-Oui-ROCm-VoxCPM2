# Dependency Notes

VoiceGen keeps `requirements.txt` limited to direct Python runtime dependencies for this app. It intentionally does not list every transitive dependency installed by VoxCPM.

## Backend HTTP Server

The local backend in `app/_backend/server.py` uses Python's standard-library `ThreadingHTTPServer` and `BaseHTTPRequestHandler`.

No ASGI or web framework package is required for the current backend:

```text
fastapi
uvicorn
pydantic
requests
aiohttp
```

Do not add those packages unless the backend is deliberately rewritten to use them. The local LLM feedback helper uses Python's standard-library `urllib`.

## VoxCPM And ML Runtime

`voxcpm==2.0.3` declares its own model/runtime dependencies, including packages such as Transformers, Hugging Face Hub, Pydantic, Safetensors, Librosa, and related ML utilities.

The repository pins the direct app/runtime requirements that matter for this ROCm path:

```text
torch
torchaudio
torchvision
voxcpm
numpy
soundfile
```

Run this after installing requirements to catch broken dependency resolution:

```bash
pip check
```

## Local Model Files

Model weights are not pip dependencies and are not committed to git. Run `download_voicegen_oui_models.ps1` to install the VoxCPM2 snapshot under:

```text
%LOCALAPPDATA%\VoiceGenOui\models\VoxCPM2\
```

or set:

```bash
export VOXCPM_MODEL_PATH=/path/to/VoxCPM2
```

If synthesis reports a missing `config.json`, the Python dependencies may be fine and the local model snapshot is probably missing or pointed at the wrong folder.
