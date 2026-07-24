"""Deterministic OpenCV reader for Sri Sai OMR A–D response bubbles.

Finds the responses grid (pink circular option bubbles with letters inside),
fits a regular columns × rows × 4 lattice, and picks the darkest option per
question using relative darkness so printed A/B/C/D glyphs do not count as fills.
"""

from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

import cv2
import numpy as np

Point = tuple[float, float]
Status = Literal["marked", "blank", "ambiguous"]
OPTIONS = ("A", "B", "C", "D")


@dataclass
class AnswerGridConfig:
    columns: int
    rows: int
    question_count: int
    # Higher sensitivity (UI 40–100) → lower min_darkness / margin.
    min_darkness: float = 0.42
    darkness_margin: float = 0.07
    inner_radius_scale: float = 0.52


@dataclass
class QuestionResult:
    question: int
    answer: str | None
    status: Status
    confidence: float
    top_darkness: float
    second_darkness: float
    flagged: bool


def to_bgr(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    if image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
    return image


def to_gray(image: np.ndarray) -> np.ndarray:
    if image.ndim == 2:
        return image
    if image.shape[2] == 4:
        return cv2.cvtColor(image, cv2.COLOR_BGRA2GRAY)
    return cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)


def pink_mask(image: np.ndarray) -> np.ndarray:
    bgr = to_bgr(image)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    m1 = cv2.inRange(hsv, np.array([145, 30, 60]), np.array([179, 255, 255]))
    m2 = cv2.inRange(hsv, np.array([0, 30, 60]), np.array([14, 255, 255]))
    mask = cv2.bitwise_or(m1, m2)
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask


def find_responses_bbox(image: np.ndarray) -> tuple[int, int, int, int]:
    """Locate the lower response grid (many small pink option circles)."""
    height, width = image.shape[:2]
    mask = pink_mask(image)
    # Ignore header / roll / name band — responses sit in the lower ~72%.
    top_cut = int(height * 0.28)
    mask[:top_cut, :] = 0
    # Also ignore extreme footer.
    mask[int(height * 0.97) :, :] = 0

    ys, xs = np.where(mask > 0)
    if len(xs) < 200:
        # Fallback: lower 70% of the page.
        return 0, int(height * 0.30), width, int(height * 0.96)

    x0 = max(0, int(xs.min()) - 8)
    x1 = min(width, int(xs.max()) + 8)
    y0 = max(top_cut, int(ys.min()) - 8)
    y1 = min(height, int(ys.max()) + 8)

    # Prefer a wide region covering most of the page width.
    if (x1 - x0) < width * 0.55:
        x0, x1 = int(width * 0.02), int(width * 0.98)
    return x0, y0, x1, y1


def detect_option_circles(
    gray_crop: np.ndarray, expected: int
) -> tuple[np.ndarray, float]:
    """Return Nx2 centers and median radius for option bubbles."""
    h, w = gray_crop.shape[:2]
    blur = cv2.GaussianBlur(gray_crop, (5, 5), 0)
    # Adaptive thresholds for phone photos of printed pink circles.
    min_r = max(4, int(min(h, w) / 180))
    max_r = max(min_r + 2, int(min(h, w) / 45))
    circles = cv2.HoughCircles(
        blur,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=max(6, min_r),
        param1=80,
        param2=18,
        minRadius=min_r,
        maxRadius=max_r,
    )
    if circles is None:
        raise ValueError("No option bubbles detected in the responses region.")

    raw = np.round(circles[0]).astype(np.float32)
    centers = raw[:, :2]
    radii = raw[:, 2]
    # Keep the densest vertical band (drop stray header/footer circles).
    y_sorted = np.sort(centers[:, 1])
    if len(y_sorted) > 20:
        lo = float(np.percentile(y_sorted, 3))
        hi = float(np.percentile(y_sorted, 97))
        keep = (centers[:, 1] >= lo) & (centers[:, 1] <= hi)
        centers = centers[keep]
        radii = radii[keep]

    if len(centers) < max(20, expected * 0.25):
        raise ValueError(
            f"Too few option bubbles ({len(centers)}) for a {expected}-bubble grid."
        )

    radius = float(np.median(radii)) if len(radii) else float(min_r)
    return centers, radius


def cluster_1d(values: np.ndarray, k: int) -> np.ndarray:
    """Simple 1D k-means for column / option / row centers."""
    vals = np.asarray(values, dtype=np.float32).reshape(-1)
    if len(vals) == 0:
        return np.array([], dtype=np.float32)
    if k <= 1:
        return np.array([float(np.median(vals))], dtype=np.float32)
    # Initialize evenly across sorted unique-ish range.
    lo, hi = float(vals.min()), float(vals.max())
    if hi <= lo:
        return np.full(k, lo, dtype=np.float32)
    centers = np.linspace(lo, hi, k, dtype=np.float32)
    for _ in range(18):
        dists = np.abs(vals[:, None] - centers[None, :])
        labels = dists.argmin(axis=1)
        new_centers = centers.copy()
        for i in range(k):
            members = vals[labels == i]
            if len(members):
                new_centers[i] = float(np.median(members))
        if np.allclose(new_centers, centers, atol=0.4):
            centers = new_centers
            break
        centers = new_centers
    return np.sort(centers)


def build_lattice(
    centers: np.ndarray,
    columns: int,
    rows: int,
    crop_w: float,
    crop_h: float,
) -> tuple[list[list[list[Point]]], float]:
    """
    Fit centers into [column][row][option] points.
    Options A–D are the four leftmost→rightmost bubbles in each question row.
    """
    options = 4
    # First cluster into response columns (wide X groups).
    x_centers = cluster_1d(centers[:, 0], columns)
    if len(x_centers) < columns:
        # Even spacing fallback across crop width.
        pad = crop_w * 0.04
        x_centers = np.linspace(pad, crop_w - pad, columns, dtype=np.float32)

    # Assign each detected circle to nearest response column.
    col_of = np.abs(centers[:, 0:1] - x_centers[None, :]).argmin(axis=1)

    # Typical option spacing within a column (~4 bubbles + q-number gap).
    all_radii_proxy: list[float] = []
    lattice: list[list[list[Point]]] = []
    median_r = 8.0

    for c in range(columns):
        pts = centers[col_of == c]
        if len(pts) < max(8, rows):
            # Extrapolate empty column from neighboring geometry later.
            lattice.append([[(0.0, 0.0)] * options for _ in range(rows)])
            continue

        # Within a column, X splits into 4 option lanes (ignore far-left q-number ink).
        x_opts = cluster_1d(pts[:, 0], options)
        if len(x_opts) < options:
            lo, hi = float(pts[:, 0].min()), float(pts[:, 0].max())
            x_opts = np.linspace(lo, hi, options, dtype=np.float32)

        y_rows = cluster_1d(pts[:, 1], rows)
        if len(y_rows) < rows:
            lo, hi = float(pts[:, 1].min()), float(pts[:, 1].max())
            y_rows = np.linspace(lo, hi, rows, dtype=np.float32)

        # Snap each lattice slot to nearest detected circle when close.
        col_grid: list[list[Point]] = []
        for r in range(rows):
            row_pts: list[Point] = []
            for o in range(options):
                target = np.array([x_opts[o], y_rows[r]], dtype=np.float32)
                dists = np.linalg.norm(pts - target[None, :], axis=1)
                j = int(dists.argmin())
                if dists[j] < max(12.0, (x_opts[1] - x_opts[0]) * 0.55 if options > 1 else 16.0):
                    snapped = (float(pts[j, 0]), float(pts[j, 1]))
                else:
                    snapped = (float(target[0]), float(target[1]))
                row_pts.append(snapped)
                all_radii_proxy.append(float(dists[j]) if dists[j] < 20 else 8.0)
            col_grid.append(row_pts)
        lattice.append(col_grid)

        # Estimate radius from option spacing.
        if len(x_opts) >= 2:
            median_r = max(4.0, float(np.median(np.diff(x_opts))) * 0.38)

    # Fill empty columns from neighbors / even spacing.
    for c in range(columns):
        if lattice[c][0][0] != (0.0, 0.0):
            continue
        # Use global even grid.
        col_w = crop_w / columns
        x0 = col_w * c + col_w * 0.28
        x1 = col_w * (c + 1) - col_w * 0.08
        x_opts = np.linspace(x0, x1, options, dtype=np.float32)
        y_rows = np.linspace(crop_h * 0.06, crop_h * 0.96, rows, dtype=np.float32)
        lattice[c] = [
            [(float(x_opts[o]), float(y_rows[r])) for o in range(options)]
            for r in range(rows)
        ]

    if all_radii_proxy:
        median_r = max(4.0, float(np.median(all_radii_proxy)) * 0.9)

    return lattice, median_r


def bubble_darkness(
    gray: np.ndarray, center: Point, radius: float, inner_scale: float
) -> float:
    cx, cy = center
    r = max(2.0, radius * inner_scale)
    h, w = gray.shape[:2]
    x0 = max(0, int(cx - r))
    x1 = min(w, int(cx + r) + 1)
    y0 = max(0, int(cy - r))
    y1 = min(h, int(cy + r) + 1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    yy, xx = np.ogrid[y0:y1, x0:x1]
    region = (xx - cx) ** 2 + (yy - cy) ** 2 <= r**2
    if not np.any(region):
        return 0.0
    mean = float(gray[y0:y1, x0:x1][region].mean())
    return float(np.clip(1.0 - mean / 255.0, 0.0, 1.0))


def decode_answers(
    gray: np.ndarray,
    lattice: list[list[list[Point]]],
    radius: float,
    config: AnswerGridConfig,
) -> list[QuestionResult]:
    results: list[QuestionResult] = []
    # Collect baseline darkness of "likely empty" options for letter-glyph compensation.
    all_dark: list[float] = []

    measurements: list[tuple[int, list[float]]] = []
    for c in range(config.columns):
        for r in range(config.rows):
            q = c * config.rows + r + 1
            if q > config.question_count:
                continue
            darks = [
                bubble_darkness(
                    gray, lattice[c][r][o], radius, config.inner_radius_scale
                )
                for o in range(4)
            ]
            measurements.append((q, darks))
            all_dark.extend(darks)

    # Printed letters raise empty-bubble darkness; subtract a soft baseline.
    baseline = float(np.percentile(all_dark, 35)) if all_dark else 0.2

    for q, darks in measurements:
        adjusted = [max(0.0, d - baseline * 0.85) for d in darks]
        ranked = sorted(range(4), key=lambda i: adjusted[i], reverse=True)
        top_i, second_i = ranked[0], ranked[1]
        top = adjusted[top_i]
        second = adjusted[second_i]
        margin = top - second
        raw_top = darks[top_i]

        if (
            raw_top >= config.min_darkness
            and top >= config.min_darkness * 0.55
            and margin >= config.darkness_margin
        ):
            status: Status = "marked"
            answer = OPTIONS[top_i]
            confidence = float(np.clip(0.45 + margin * 4.0 + top * 0.35, 0, 1))
            flagged = confidence < 0.55 or margin < config.darkness_margin * 1.15
        elif raw_top >= config.min_darkness and margin < config.darkness_margin:
            status = "ambiguous"
            answer = None
            confidence = float(np.clip(margin * 6.0, 0, 1))
            flagged = True
        else:
            status = "blank"
            answer = None
            confidence = float(np.clip(1.0 - raw_top, 0, 1))
            flagged = True

        results.append(
            QuestionResult(
                question=q,
                answer=answer,
                status=status,
                confidence=confidence,
                top_darkness=raw_top,
                second_darkness=darks[second_i],
                flagged=flagged,
            )
        )
    return results


def sensitivity_to_thresholds(sensitivity: int) -> tuple[float, float]:
    """Map UI sensitivity 40–100 → (min_darkness, margin)."""
    s = float(np.clip(sensitivity, 40, 100))
    t = (s - 40.0) / 60.0  # 0 at 40, 1 at 100
    # Higher sensitivity accepts lighter pencil fills.
    min_darkness = 0.58 - 0.22 * t  # 0.58 → 0.36
    margin = 0.10 - 0.045 * t  # 0.10 → 0.055
    return float(min_darkness), float(margin)


def read_answers(
    image: np.ndarray, config: AnswerGridConfig
) -> tuple[list[QuestionResult], np.ndarray]:
    x0, y0, x1, y1 = find_responses_bbox(image)
    crop = image[y0:y1, x0:x1]
    gray = to_gray(crop)
    expected = config.columns * config.rows * 4
    centers, radius = detect_option_circles(gray, expected)
    lattice, fit_r = build_lattice(
        centers, config.columns, config.rows, float(gray.shape[1]), float(gray.shape[0])
    )
    radius = max(radius * 0.9, fit_r)
    results = decode_answers(gray, lattice, radius, config)
    return results, crop


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="OpenCV OMR A–D answer reader")
    parser.add_argument("image", type=Path)
    parser.add_argument("--columns", type=int, required=True)
    parser.add_argument("--rows", type=int, required=True)
    parser.add_argument("--questions", type=int, required=True)
    parser.add_argument("--sensitivity", type=int, default=80)
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--crop-out", type=Path, default=None)
    args = parser.parse_args(list(argv) if argv is not None else None)

    image = cv2.imread(str(args.image), cv2.IMREAD_COLOR)
    if image is None:
        payload = {"ok": False, "error": f"Could not read image: {args.image}"}
        print(json.dumps(payload))
        return 1

    min_d, margin = sensitivity_to_thresholds(args.sensitivity)
    config = AnswerGridConfig(
        columns=max(1, args.columns),
        rows=max(1, args.rows),
        question_count=max(1, args.questions),
        min_darkness=min_d,
        darkness_margin=margin,
    )

    try:
        results, crop = read_answers(image, config)
    except Exception as exc:  # noqa: BLE001 — surface to Node as JSON
        print(json.dumps({"ok": False, "error": str(exc)}))
        return 1

    if args.crop_out:
        cv2.imwrite(str(args.crop_out), crop, [int(cv2.IMWRITE_JPEG_QUALITY), 92])

    marked = sum(1 for r in results if r.status == "marked")
    ambiguous = sum(1 for r in results if r.status == "ambiguous")
    blank = sum(1 for r in results if r.status == "blank")
    issues = [
        f"OpenCV answers: {marked} marked, {ambiguous} ambiguous, {blank} blank "
        f"(min_darkness={config.min_darkness:.2f}, margin={config.darkness_margin:.2f})."
    ]

    payload = {
        "ok": True,
        "answers": [
            {
                "question": r.question,
                "answer": r.answer,
                "status": r.status,
                "confidence": round(r.confidence, 4),
                "flagged": r.flagged,
                "topDarkness": round(r.top_darkness, 4),
                "secondDarkness": round(r.second_darkness, 4),
            }
            for r in results
        ],
        "issues": issues,
        "source": "opencv",
    }
    print(json.dumps(payload))
    return 0


if __name__ == "__main__":
    sys.exit(main())
