"""Crop Sri Sai logo to fill favicon square edge-to-edge with transparent corners."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
APP = ROOT / "src" / "app"


def load_source() -> Image.Image:
    for path in [
        PUBLIC / "_favicon-source-512.png",
        PUBLIC / "web-app-manifest-512x512.png",
        PUBLIC / "favicon.ico",
        PUBLIC / "apple-touch-icon.png",
    ]:
        if path.exists():
            im = Image.open(path).convert("RGBA")
            print(f"Source: {path.name} {im.size}")
            return im
    raise FileNotFoundError("No favicon source")


def content_mask(arr: np.ndarray, brightness_thresh: int = 20) -> np.ndarray:
    rgb = arr[:, :, :3].astype(np.int16)
    alpha = arr[:, :, 3]
    brightness = rgb.max(axis=2)
    return (brightness > brightness_thresh) & (alpha > 8)


def tight_square_crop(im: Image.Image) -> Image.Image:
    arr = np.asarray(im)
    mask = content_mask(arr)
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise ValueError("No logo content")

    left, right = int(xs.min()), int(xs.max()) + 1
    top, bottom = int(ys.min()), int(ys.max()) + 1
    w, h = right - left, bottom - top
    side = max(w, h)
    cx = (left + right) / 2.0
    cy = (top + bottom) / 2.0
    half = side / 2.0 * 0.998

    crop_l = int(round(cx - half))
    crop_t = int(round(cy - half))
    crop_r = int(round(cx + half))
    crop_b = int(round(cy + half))
    out_side = crop_r - crop_l

    canvas = Image.new("RGBA", (out_side, out_side), (0, 0, 0, 0))
    src_l, src_t = max(crop_l, 0), max(crop_t, 0)
    src_r, src_b = min(crop_r, im.width), min(crop_b, im.height)
    canvas.paste(
        im.crop((src_l, src_t, src_r, src_b)),
        (src_l - crop_l, src_t - crop_t),
    )
    return canvas


def punch_transparent_outside_circle(im: Image.Image) -> Image.Image:
    arr = np.asarray(im).copy()
    h, w = arr.shape[:2]
    cy, cx = (h - 1) / 2.0, (w - 1) / 2.0
    radius = min(cx, cy)
    yy, xx = np.ogrid[:h, :w]
    dist = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
    arr[dist > radius + 0.35, 3] = 0
    brightness = arr[:, :, :3].astype(np.int16).max(axis=2)
    arr[brightness <= 10, 3] = 0
    return Image.fromarray(arr, "RGBA")


def resize(im: Image.Image, size: int) -> Image.Image:
    return im.resize((size, size), Image.Resampling.LANCZOS)


def save_png(im: Image.Image, path: Path, size: int) -> None:
    out = punch_transparent_outside_circle(resize(im, size))
    path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, format="PNG", optimize=True)
    print(f"Wrote {path.relative_to(ROOT)} {size}x{size}")


def save_ico(im: Image.Image, path: Path) -> None:
    sizes = [16, 32, 48, 64, 96, 256]
    frames = [punch_transparent_outside_circle(resize(im, s)) for s in sizes]
    path.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        path,
        format="ICO",
        sizes=[(s, s) for s in sizes],
        append_images=frames[1:],
    )
    print(f"Wrote {path.relative_to(ROOT)} ICO")


def main() -> None:
    source = load_source()
    filled = punch_transparent_outside_circle(tight_square_crop(source))
    print(f"Filled canvas: {filled.size[0]}x{filled.size[1]}")

    save_png(filled, PUBLIC / "favicon-96x96.png", 96)
    save_png(filled, PUBLIC / "apple-touch-icon.png", 180)
    save_png(filled, PUBLIC / "web-app-manifest-192x192.png", 192)
    save_png(filled, PUBLIC / "web-app-manifest-512x512.png", 512)
    save_ico(filled, PUBLIC / "favicon.ico")

    uploads = PUBLIC / "uploads"
    save_png(filled, uploads / "apple-touch-icon.png", 180)
    save_ico(filled, uploads / "favicon.ico")

    save_ico(filled, APP / "favicon.ico")
    save_png(filled, APP / "icon.png", 512)
    save_png(filled, APP / "apple-icon.png", 180)

    for weird in (PUBLIC / "favicon (1).ico",):
        if weird.exists():
            weird.unlink()
            print(f"Removed {weird.name}")


if __name__ == "__main__":
    main()
