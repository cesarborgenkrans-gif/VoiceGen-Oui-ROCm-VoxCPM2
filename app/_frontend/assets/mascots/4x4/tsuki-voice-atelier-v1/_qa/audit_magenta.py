from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import binary_dilation


ROOT = Path(__file__).resolve().parents[1]
MATTE_DIR = Path(__file__).resolve().parent / "mattes"
MATTE_DIR.mkdir(exist_ok=True)

SHEETS = [
    (ROOT / "tsuki-voicegen-listen-notice-v1-4x4.png", np.array([245, 4, 240], dtype=np.int16)),
    (ROOT / "tsuki-voicegen-shape-approve-v1-4x4.png", np.array([244, 9, 232], dtype=np.int16)),
]


def composite(rgba: np.ndarray, color: tuple[int, int, int]) -> Image.Image:
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0
    rgb = rgba[:, :, :3].astype(np.float32)
    bg = np.full_like(rgb, color, dtype=np.float32)
    out = np.clip(rgb * alpha + bg * (1.0 - alpha), 0, 255).astype(np.uint8)
    return Image.fromarray(out, "RGB")


def checker(rgba: np.ndarray) -> Image.Image:
    h, w = rgba.shape[:2]
    yy, xx = np.indices((h, w))
    cells = ((xx // 48) + (yy // 48)) % 2
    bg = np.where(cells[:, :, None] == 0, 242, 214).astype(np.uint8)
    bg = np.repeat(bg, 3, axis=2)
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0
    rgb = rgba[:, :, :3].astype(np.float32)
    return Image.fromarray(np.clip(rgb * alpha + bg * (1.0 - alpha), 0, 255).astype(np.uint8), "RGB")


results = []
for path, key in SHEETS:
    rgba = np.asarray(Image.open(path).convert("RGBA"))
    # Use int32 so squaring channel deltas cannot overflow int16 and create
    # false key-colour matches.
    rgb = rgba[:, :, :3].astype(np.int32)
    alpha = rgba[:, :, 3]
    visible = alpha > 8
    opaque = alpha >= 200
    inner_edge = visible & binary_dilation(~visible, iterations=2)
    distance = np.sqrt(np.sum((rgb - key.astype(np.int32)) ** 2, axis=2))
    key_like_visible = visible & (distance < 60)
    key_like_opaque = opaque & (distance < 80)
    saturated_magenta_edge = inner_edge & (rgb[:, :, 0] > 180) & (rgb[:, :, 2] > 170) & (rgb[:, :, 1] < 80)

    for suffix, color in (("white", (255, 255, 255)), ("dark", (8, 8, 10)), ("magenta", (255, 0, 255))):
        composite(rgba, color).save(MATTE_DIR / f"{path.stem}-{suffix}.png")
    checker(rgba).save(MATTE_DIR / f"{path.stem}-checker.png")

    result = {
        "file": str(path),
        "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        "size": list(Image.open(path).size),
        "mode": "RGBA",
        "transparent_pixels": int((alpha == 0).sum()),
        "partial_alpha_pixels": int(((alpha > 0) & (alpha < 255)).sum()),
        "alpha_value_count": int(len(np.unique(alpha))),
        "corner_alpha": [int(alpha[0, 0]), int(alpha[0, -1]), int(alpha[-1, 0]), int(alpha[-1, -1])],
        "key_like_visible_pixels": int(key_like_visible.sum()),
        "key_like_opaque_pixels": int(key_like_opaque.sum()),
        "saturated_magenta_edge_pixels": int(saturated_magenta_edge.sum()),
    }
    result["passes_magenta_gate"] = (
        result["corner_alpha"] == [0, 0, 0, 0]
        and result["key_like_opaque_pixels"] == 0
        and result["saturated_magenta_edge_pixels"] == 0
    )
    results.append(result)

(Path(__file__).resolve().parent / "magenta-audit.json").write_text(
    json.dumps(results, indent=2), encoding="utf-8"
)
print(json.dumps(results, indent=2))
