"""Make only the square padding around the Sri Sai seal transparent."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "images" / "Sri-Sai-logo.png"


def main() -> None:
    im = Image.open(SRC).convert("RGBA")
    arr = np.asarray(im).copy()

    rgb = arr[:, :, :3].astype(np.int16)
    alpha = arr[:, :, 3]
    # Content = not pure white padding (logo ink + seal colors + white ring with text).
    # First find bounding circle from non-padding pixels (anything not near-pure-white).
    near_pad = (rgb.min(axis=2) >= 250) & (rgb.max(axis=2) - rgb.min(axis=2) <= 6) & (alpha > 200)
    content = ~near_pad & (alpha > 8)
    ys, xs = np.where(content)
    if len(xs) == 0:
        raise SystemExit("No logo content found")

    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    cropped = arr[top:bottom, left:right].copy()
    ch, cw = cropped.shape[:2]
    side = max(ch, cw) + 4  # tiny transparent pad
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    y0 = (side - ch) // 2
    x0 = (side - cw) // 2
    canvas[y0 : y0 + ch, x0 : x0 + cw] = cropped

    # Transparent outside the circular seal only — keep the white ring inside.
    h, w = canvas.shape[:2]
    cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
    radius = min(cx, cy) - 1.0
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    canvas[dist > radius, 3] = 0

    out = Image.fromarray(canvas, "RGBA")
    out.save(SRC, format="PNG", optimize=True)
    print(f"Wrote {SRC.relative_to(ROOT)} {out.size} (was {im.size})")


if __name__ == "__main__":
    main()
