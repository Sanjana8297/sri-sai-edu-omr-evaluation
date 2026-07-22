"""Deterministic OpenCV reader for OMR roll-number grids.

Works on the uploaded sheet image (no fixed template path). Finds the pink
ROLL NUMBER region, builds a 10-row digit grid, and picks the darkest bubble
per column using relative darkness (pencil/pen vs printed pink outlines).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal, Sequence

import cv2
import numpy as np


Point = tuple[float, float]
Status = Literal["marked", "blank", "ambiguous"]


@dataclass
class RollGridConfig:
    columns: int
    rows: int = 10
    bubble_radius: float = 9.0
    # A bubble is marked only if both conditions pass.
    darkness_margin: float = 0.08
    # Absolute floor so faint print / borders do not count as pencil fills.
    # Real pencil fills are typically >= 0.80; keep headroom for phone photos.
    min_darkness: float = 0.62
    inner_radius_scale: float = 0.58


@dataclass
class BubbleMeasurement:
    row: int
    center: Point
    darkness: float
    fill_ratio: float
    marked: bool = False


@dataclass
class ColumnResult:
    column: int
    digit: int | None
    status: Status
    confidence: float
    top_fill_ratio: float
    second_fill_ratio: float
    candidates: list[int] = field(default_factory=list)
    measurements: list[BubbleMeasurement] = field(default_factory=list)


@dataclass
class RollReadResult:
    roll_number: str | None
    valid: bool
    columns: list[ColumnResult]
    aligned_image: np.ndarray
    debug_image: np.ndarray | None = None
    crop_image: np.ndarray | None = None


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
    """Mask magenta/pink OMR print (Sri Sai sheets)."""
    bgr = to_bgr(image)
    hsv = cv2.cvtColor(bgr, cv2.COLOR_BGR2HSV)
    # Magenta–pink band (OpenCV H: 0–179).
    m1 = cv2.inRange(hsv, np.array([145, 35, 70]), np.array([179, 255, 255]))
    m2 = cv2.inRange(hsv, np.array([0, 35, 70]), np.array([12, 255, 255]))
    mask = cv2.bitwise_or(m1, m2)
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)
    return mask


def _score_roll_rect(
    bw: int,
    bh: int,
    image_w: int,
    image_h: int,
    columns: int,
) -> float:
    """Higher is more likely a roll-number bubble panel."""
    if bw < 40 or bh < 80:
        return -1.0
    area = bw * bh
    page = image_w * image_h
    frac = area / max(page, 1)
    # Wider grids (10–12 cols) occupy more of the page than classic 5-col boxes.
    max_frac = 0.12 + max(0, columns - 5) * 0.025
    if frac < 0.012 or frac > max_frac:
        return -1.0
    aspect = bw / max(bh, 1)
    expected_aspect = 0.55 + max(0, columns - 5) * 0.14
    if aspect < 0.35 or aspect > max(1.2, expected_aspect + 0.55):
        return -1.0
    return (1.0 - abs(aspect - expected_aspect)) + min(frac * 10.0, 1.2)


def find_roll_bbox(
    image: np.ndarray,
    columns: int,
) -> tuple[int, int, int, int] | None:
    """Locate the pink-bordered ROLL NUMBER panel in the upper-left."""
    height, width = image.shape[:2]
    mask = pink_mask(image)
    search = np.zeros_like(mask)
    y0, y1 = int(height * 0.04), int(height * 0.48)
    # Search far enough right to include 10–12 column roll grids.
    x0, x1 = int(width * 0.01), int(width * min(0.72, 0.34 + columns * 0.035))
    search[y0:y1, x0:x1] = mask[y0:y1, x0:x1]

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    closed = cv2.morphologyEx(search, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[int, int, int, int] | None = None
    best_score = -1.0
    for contour in contours:
        x, y, bw, bh = cv2.boundingRect(contour)
        if x > width * 0.40 or y > height * 0.35:
            continue
        score = _score_roll_rect(bw, bh, width, height, columns)
        score += max(0.0, 0.30 - x / max(width, 1)) * 0.8
        if 0.10 < y / max(height, 1) < 0.30:
            score += 0.25
        # Prefer panels wide enough for the configured column count.
        min_width = bh * (0.45 + max(0, columns - 5) * 0.08)
        if bw >= min_width:
            score += 0.35
        if score > best_score:
            best_score = score
            best = (x, y, bw, bh)

    if best is None or best_score < 0:
        return None
    x, y, bw, bh = best
    pad_x = max(6, int(bw * 0.04))
    pad_y = max(4, int(bh * 0.03))
    return (
        max(0, x - pad_x),
        max(0, y - pad_y),
        min(width, x + bw + pad_x),
        min(height, y + bh + pad_y),
    )


def tighten_roll_box(
    image: np.ndarray,
    box: tuple[int, int, int, int],
    columns: int,
) -> tuple[int, int, int, int]:
    """Shrink an oversized crop to the pink bubble panel bounds."""
    height, width = image.shape[:2]
    x1, y1, x2, y2 = box
    crop = image[y1:y2, x1:x2]
    if crop.size == 0:
        return box

    pink = pink_mask(crop)
    ys, xs = np.where(pink > 0)
    if len(xs) < max(40, columns * 4):
        return box

    px1, px2 = int(xs.min()), int(xs.max())
    py1, py2 = int(ys.min()), int(ys.max())
    # Ignore tiny pink specks far from the main mass.
    cx = float(np.median(xs))
    cy = float(np.median(ys))
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    keep = dist <= max(float(np.percentile(dist, 90)) * 1.35, 40.0)
    if int(keep.sum()) >= max(40, columns * 4):
        xs, ys = xs[keep], ys[keep]
        px1, px2 = int(xs.min()), int(xs.max())
        py1, py2 = int(ys.min()), int(ys.max())

    pad_x = max(6, int((px2 - px1) * 0.03))
    pad_y = max(6, int((py2 - py1) * 0.03))
    return (
        max(0, x1 + px1 - pad_x),
        max(0, y1 + py1 - pad_y),
        min(width, x1 + px2 + pad_x),
        min(height, y1 + py2 + pad_y),
    )


def estimate_roll_region(
    image: np.ndarray,
    columns: int,
) -> tuple[np.ndarray, tuple[int, int, int, int]]:
    """Crop the ROLL NUMBER panel wide enough for every configured position."""
    height, width = image.shape[:2]
    box = find_roll_bbox(image, columns)
    if box is None:
        x1 = int(width * 0.02)
        x2 = int(width * min(0.70, 0.20 + columns * 0.045))
        y1 = int(height * 0.08)
        y2 = int(height * 0.40)
        box = (x1, y1, x2, y2)

    box = tighten_roll_box(image, box, columns)
    x1, y1, x2, y2 = box

    # If the panel is still too narrow for N columns, widen right using height.
    min_width = int((y2 - y1) * (0.50 + max(0, columns - 5) * 0.09))
    if (x2 - x1) < min_width:
        x2 = min(width, x1 + min_width)
        box = (x1, y1, x2, y2)

    crop = image[y1:y2, x1:x2].copy()
    return crop, box


def expand_crop_to_fit_columns(
    image: np.ndarray,
    box: tuple[int, int, int, int],
    x_centers: np.ndarray,
    radius: float,
) -> tuple[np.ndarray, tuple[int, int, int, int], np.ndarray]:
    """
    Widen the crop to the right when extrapolated columns fall past the crop edge.
    Recenter x coordinates into the expanded crop.
    """
    height, width = image.shape[:2]
    x1, y1, x2, y2 = box
    rightmost = float(np.max(x_centers)) + radius * 2.5
    if rightmost <= (x2 - x1) - 2:
        return image[y1:y2, x1:x2].copy(), box, x_centers

    new_x2 = min(width, x1 + int(np.ceil(rightmost)) + 8)
    if new_x2 <= x2:
        return image[y1:y2, x1:x2].copy(), box, x_centers

    new_box = (x1, y1, new_x2, y2)
    return image[y1:y2, x1:new_x2].copy(), new_box, x_centers


def cluster_1d(values: np.ndarray, k: int) -> np.ndarray:
    """Simple 1-D k-means centers, sorted ascending."""
    pts = values.astype(np.float32).reshape(-1)
    if len(pts) == 0:
        return np.linspace(0, 1, k).astype(np.float32)
    if len(pts) == 1:
        return np.full(k, float(pts[0]), dtype=np.float32)
    centers = np.quantile(pts, np.linspace(0.05, 0.95, k)).astype(np.float32)
    for _ in range(16):
        assign = np.argmin(np.abs(pts[:, None] - centers[None, :]), axis=1)
        for i in range(k):
            members = pts[assign == i]
            if len(members):
                centers[i] = float(members.mean())
    return np.sort(centers)


def repeated_x_centers(
    values: np.ndarray,
    radius: float,
    minimum_members: int,
) -> np.ndarray:
    """Find repeated bubble-column x coordinates without forcing empty clusters."""
    ordered = np.sort(values.astype(np.float32).reshape(-1))
    if len(ordered) == 0:
        return np.array([], dtype=np.float32)

    # Keep adjacent roll columns separate: gap must stay below typical spacing.
    split_gap = max(radius * 0.95, 3.5)
    groups: list[list[float]] = [[float(ordered[0])]]
    for value in ordered[1:]:
        if float(value) - groups[-1][-1] > split_gap:
            groups.append([float(value)])
        else:
            groups[-1].append(float(value))

    centers = [
        float(np.median(group))
        for group in groups
        if len(group) >= minimum_members
    ]
    return np.asarray(centers, dtype=np.float32)


def hough_circles(gray: np.ndarray, expected: int) -> np.ndarray | None:
    height, width = gray.shape[:2]
    min_dim = min(height, width)
    min_r = max(3, int(min_dim / 55))
    max_r = max(min_r + 2, int(min_dim / 14))
    min_dist = max(min_r * 1.5, 5)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    for param2 in (20, 16, 12, 9):
        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1.15,
            minDist=min_dist,
            param1=110,
            param2=param2,
            minRadius=min_r,
            maxRadius=max_r,
        )
        if circles is not None and len(circles[0]) >= max(expected * 0.45, 12):
            return np.asarray(circles[0], dtype=np.float32)
    return None


def select_regular_row_centers(ys: np.ndarray, rows: int) -> np.ndarray:
    """Pick `rows` contiguous Y centers with the most regular spacing (0 at top)."""
    ordered = np.sort(ys.astype(np.float32).reshape(-1))
    if len(ordered) == 0:
        raise ValueError("No row centers detected")
    if len(ordered) == rows:
        return ordered
    if len(ordered) < rows:
        y0, y1 = float(ordered[0]), float(ordered[-1])
        return np.linspace(y0, y1, rows).astype(np.float32)

    # Drop upper write-in / header clusters when more than 10 row bands exist.
    if len(ordered) > rows + 1:
        y_cut = float(ordered[0] + 0.18 * (ordered[-1] - ordered[0]))
        lower = ordered[ordered >= y_cut]
        if len(lower) >= rows:
            ordered = lower

    best = ordered[:rows]
    best_score = 1e18
    for start in range(len(ordered) - rows + 1):
        chunk = ordered[start : start + rows]
        diffs = np.diff(chunk)
        if len(diffs) == 0:
            continue
        # Regular spacing; slight preference for the lower (bubble) band.
        score = float(np.std(diffs)) / max(float(np.mean(diffs)), 1e-3)
        score += abs(float(np.max(diffs) / max(float(np.min(diffs)), 1e-3)) - 1.0) * 0.15
        score -= 0.002 * float(np.mean(chunk))
        if score < best_score:
            best_score = score
            best = chunk
    return best.astype(np.float32)


def snap_centers_to_circles(
    centers: list[list[Point]],
    circles: np.ndarray,
    radius: float,
) -> list[list[Point]]:
    """Move each lattice point onto the nearest detected bubble ring when close.

    Row index is preserved (0 = top label … 9 = bottom). Do not re-sort after
    snapping — that would scramble printed row labels.
    """
    points = circles[:, :2]
    snap_tol = max(radius * 2.2, 6.0)
    snapped: list[list[Point]] = []
    for column in centers:
        x_ref = float(np.median([p[0] for p in column]))
        near_mask = np.abs(points[:, 0] - x_ref) <= max(radius * 2.4, 6.0)
        near = points[near_mask]
        if len(near) == 0:
            near = points
        col_pts: list[Point] = []
        used: set[int] = set()
        for _x, y_c in column:
            if len(near) == 0:
                col_pts.append((x_ref, float(y_c)))
                continue
            # Nearest in Y within this column band; keep the intended row slot.
            distances = np.sqrt((near[:, 0] - x_ref) ** 2 + (near[:, 1] - y_c) ** 2)
            order = np.argsort(distances)
            chosen = None
            for idx in order:
                i = int(idx)
                if i in used:
                    continue
                if float(distances[i]) <= snap_tol:
                    chosen = i
                    break
            if chosen is None:
                col_pts.append((x_ref, float(y_c)))
            else:
                used.add(chosen)
                col_pts.append((float(near[chosen, 0]), float(near[chosen, 1])))
        snapped.append(col_pts)
    return snapped


def build_grid_from_circles(
    circles: np.ndarray,
    columns: int,
    rows: int,
    *,
    crop_height: int | None = None,
    crop_width: int | None = None,
) -> tuple[list[list[Point]], float, np.ndarray]:
    """Fit a regular columns×rows lattice from detected circle centers.

    Returns (centers, radius, x_centers).
    Row index 0 is the top bubble (= printed label 0); row 9 is bottom (= 9).
    """
    if len(circles) < max(12, columns * rows * 0.35):
        raise ValueError(f"Too few circles for a {columns}x{rows} grid ({len(circles)})")

    points = circles[:, :2]
    radii = circles[:, 2]
    median_r = float(np.median(radii))
    keep = np.abs(radii - median_r) <= median_r * 0.65
    points = points[keep]
    radii = radii[keep]

    # Skip title / write-in boxes above the 0–9 bubble rows.
    if crop_height is not None and crop_height > 0:
        y_min = crop_height * 0.20
        band = points[:, 1] >= y_min
        if int(band.sum()) >= max(10, columns * 3):
            points = points[band]
            radii = radii[band]
    if crop_width is not None and crop_width > 0:
        x_min = crop_width * 0.045
        band = points[:, 0] >= x_min
        if int(band.sum()) >= max(10, columns * 3):
            points = points[band]
            radii = radii[band]

    if len(points) < max(10, columns * 3):
        raise ValueError("Circle filtering removed too many candidates")

    detected_x = repeated_x_centers(
        points[:, 0],
        median_r,
        minimum_members=max(3, rows // 3),
    )
    if len(detected_x) < min(4, columns):
        detected_x = cluster_1d(points[:, 0], min(columns, max(4, len(detected_x) or 4)))

    if len(detected_x) >= columns:
        usable = detected_x
        if crop_width is not None and len(detected_x) > columns:
            edge = crop_width * 0.08
            trimmed = detected_x[detected_x >= edge]
            if len(trimmed) >= columns:
                usable = trimmed
        x_centers = np.asarray(usable[:columns], dtype=np.float32)
        spacing = float(np.median(np.diff(x_centers))) if columns > 1 else median_r * 3
    else:
        anchor_count = min(4, len(detected_x), columns)
        if anchor_count < 2:
            raise ValueError("Need at least two roll columns to estimate spacing")

        anchor_x = detected_x[:anchor_count]
        anchor_positions = np.arange(anchor_count, dtype=np.float32)
        spacing, origin = np.polyfit(anchor_positions, anchor_x, 1)
        if spacing <= median_r * 1.15:
            raise ValueError("Detected roll columns have invalid spacing")

        x_centers = origin + spacing * np.arange(columns, dtype=np.float32)
        snap_tol = max(float(spacing) * 0.35, median_r * 1.5)
        for c in range(columns):
            if len(detected_x) == 0:
                break
            d = np.abs(detected_x - x_centers[c])
            j = int(np.argmin(d))
            if float(d[j]) <= snap_tol:
                x_centers[c] = float(detected_x[j])

    if spacing <= 0:
        spacing = median_r * 3

    # Row labels 0–9: detect actual bubble rows (top→bottom), do not stretch percentiles.
    detected_y = repeated_x_centers(
        points[:, 1],
        median_r,
        minimum_members=max(2, columns // 2),
    )
    if len(detected_y) >= 3:
        try:
            y_centers = select_regular_row_centers(detected_y, rows)
        except ValueError:
            y0, y1 = float(np.percentile(points[:, 1], 8)), float(
                np.percentile(points[:, 1], 96)
            )
            y_centers = np.linspace(y0, y1, rows).astype(np.float32)
    else:
        y0, y1 = float(np.percentile(points[:, 1], 8)), float(
            np.percentile(points[:, 1], 96)
        )
        if y1 - y0 < median_r * rows * 0.8:
            raise ValueError("Bubble cloud too small for lattice fit")
        y_centers = np.linspace(y0, y1, rows).astype(np.float32)

    # If we only found a few rows, extend using the same spacing as the top rows
    # (mirrors the left-column spacing logic used for remaining columns).
    if len(detected_y) >= 2 and len(detected_y) < rows:
        anchor = min(4, len(detected_y))
        row_spacing, row_origin = np.polyfit(
            np.arange(anchor, dtype=np.float32),
            np.sort(detected_y)[:anchor],
            1,
        )
        if row_spacing > median_r * 1.1:
            y_centers = row_origin + row_spacing * np.arange(rows, dtype=np.float32)

    centers: list[list[Point]] = [
        [(float(x_centers[c]), float(y_centers[r])) for r in range(rows)]
        for c in range(columns)
    ]
    filtered_circles = np.column_stack([points, radii]).astype(np.float32)
    centers = snap_centers_to_circles(centers, filtered_circles, median_r)
    return centers, float(np.median(radii)), x_centers


def merge_circle_sets(*sets: np.ndarray | None) -> np.ndarray | None:
    parts = [s for s in sets if s is not None and len(s) > 0]
    if not parts:
        return None
    return np.vstack(parts)


def lattice_from_crop(
    gray: np.ndarray, columns: int, rows: int
) -> tuple[list[list[Point]], float, np.ndarray]:
    """Fallback lattice when Hough fails: regular grid inside the roll panel."""
    height, width = gray.shape[:2]
    # Skip title / write-in boxes at the top of the roll panel.
    top = int(height * 0.28)
    bottom = int(height * 0.98)
    left = int(width * 0.14)
    right = int(width * 0.98)
    usable_h = max(bottom - top, rows * 8)
    usable_w = max(right - left, columns * 8)
    radius = max(3.0, min(usable_w / (columns * 3.0), usable_h / (rows * 3.0)))
    col_spacing = usable_w / max(columns, 1)
    row_spacing = usable_h / max(rows, 1)
    x0 = left + col_spacing / 2
    y0 = top + row_spacing / 2
    x_centers = np.asarray(
        [x0 + c * col_spacing for c in range(columns)], dtype=np.float32
    )
    centers = [
        [(float(x_centers[c]), y0 + r * row_spacing) for r in range(rows)]
        for c in range(columns)
    ]
    return centers, radius, x_centers


def bubble_darkness(gray: np.ndarray, center: Point, radius: float, inner_scale: float) -> float:
    """Higher = darker ink inside the bubble (0..1)."""
    cx, cy = int(round(center[0])), int(round(center[1]))
    r = max(2, int(round(radius * inner_scale)))
    pad = r + 2
    x0, y0 = max(0, cx - pad), max(0, cy - pad)
    x1, y1 = min(gray.shape[1], cx + pad + 1), min(gray.shape[0], cy + pad + 1)
    if x0 >= x1 or y0 >= y1:
        return 0.0
    yy, xx = np.ogrid[y0:y1, x0:x1]
    region = (xx - cx) ** 2 + (yy - cy) ** 2 <= r**2
    if not np.any(region):
        return 0.0
    mean = float(gray[y0:y1, x0:x1][region].mean())
    return float(np.clip(1.0 - mean / 255.0, 0.0, 1.0))


def decode_columns(
    gray: np.ndarray,
    centers: list[list[Point]],
    radius: float,
    config: RollGridConfig,
) -> list[ColumnResult]:
    """Read each column: darkest bubble's ROW INDEX is the printed left label 0–9."""
    results: list[ColumnResult] = []
    for column_index, column_centers in enumerate(centers):
        # Defensive: keep the configured row slots (already top→bottom).
        ordered = list(column_centers[: config.rows])
        while len(ordered) < config.rows:
            if ordered:
                last = ordered[-1]
                gap = (
                    ordered[-1][1] - ordered[-2][1]
                    if len(ordered) > 1
                    else radius * 2.5
                )
                ordered.append((last[0], last[1] + max(gap, radius * 2)))
            else:
                ordered.append((0.0, 0.0))

        measurements = [
            BubbleMeasurement(
                row=row,  # row label printed on the left (0 top … 9 bottom)
                center=center,
                darkness=bubble_darkness(
                    gray, center, radius, config.inner_radius_scale
                ),
                fill_ratio=0.0,
            )
            for row, center in enumerate(ordered[: config.rows])
        ]
        for measurement in measurements:
            measurement.fill_ratio = measurement.darkness

        ranked = sorted(measurements, key=lambda m: m.darkness, reverse=True)
        top = ranked[0]
        second = ranked[1] if len(ranked) > 1 else ranked[0]
        others = [m.darkness for m in ranked[1:]]
        median_others = float(np.median(others)) if others else 0.0
        margin = top.darkness - second.darkness
        peak = top.darkness - median_others

        # Require a clear peak above the rest of the column (classic OMR rule).
        if (
            top.darkness >= config.min_darkness
            and margin >= config.darkness_margin
            and peak >= config.darkness_margin * 0.85
        ):
            status: Status = "marked"
            digit = top.row  # left row label
            confidence = float(np.clip(0.4 + margin * 3.5 + peak * 2.0, 0, 1))
            candidates = [top.row]
        elif top.darkness >= config.min_darkness and margin < config.darkness_margin * 0.7:
            status = "ambiguous"
            digit = None
            confidence = float(np.clip(margin * 5.0, 0, 1))
            candidates = [m.row for m in ranked[:2]]
        else:
            status = "blank"
            digit = None
            confidence = float(np.clip(1.0 - top.darkness, 0, 1))
            candidates = []

        results.append(
            ColumnResult(
                column=column_index,
                digit=digit,
                status=status,
                confidence=confidence,
                top_fill_ratio=top.darkness,
                second_fill_ratio=second.darkness,
                candidates=candidates,
                measurements=measurements,
            )
        )
    return results


def draw_debug_visualization(
    image: np.ndarray,
    columns: Sequence[ColumnResult],
    radius: float,
) -> np.ndarray:
    canvas = to_bgr(image).copy()
    for column in columns:
        for measurement in column.measurements:
            if column.status == "marked" and measurement.row == column.digit:
                color = (0, 200, 0)
            elif column.status == "ambiguous" and measurement.row in column.candidates:
                color = (0, 220, 255)
            else:
                color = (0, 0, 220)
            center = (int(round(measurement.center[0])), int(round(measurement.center[1])))
            cv2.circle(canvas, center, int(round(radius)), color, 2)
            cv2.putText(
                canvas,
                f"{measurement.row}:{measurement.darkness:.2f}",
                (center[0] + 4, center[1] - 4),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.3,
                color,
                1,
                cv2.LINE_AA,
            )
    return canvas


def assemble_roll(columns: Sequence[ColumnResult]) -> tuple[str | None, bool]:
    active = list(columns)
    while active and active[-1].status == "blank":
        active.pop()
    if not active:
        return None, False

    # Same row marked across every column with only moderate darkness is almost
    # always a horizontal print artifact, not a real roll number.
    marked = [c for c in active if c.status == "marked" and c.digit is not None]
    if len(marked) >= max(3, len(active) - 1):
        digits = {c.digit for c in marked}
        avg_dark = float(np.mean([c.top_fill_ratio for c in marked]))
        if len(digits) == 1 and avg_dark < 0.82:
            return None, False

    valid = all(c.status == "marked" for c in active)
    roll = "".join(str(c.digit) for c in active) if valid else None
    return roll, valid


def decode_roll_grid(
    image: np.ndarray,
    config: RollGridConfig,
    *,
    debug: bool = False,
    auto_crop_roll_region: bool = True,
) -> RollReadResult:
    if auto_crop_roll_region:
        work, box = estimate_roll_region(image, config.columns)
    else:
        work = image.copy()
        box = (0, 0, image.shape[1], image.shape[0])
    if work.size == 0:
        raise ValueError("Empty roll crop")

    def fit_on(crop: np.ndarray) -> tuple[list[list[Point]], float, np.ndarray]:
        gray_local = to_gray(crop)
        gray_local = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray_local)
        expected = config.columns * config.rows
        pink = pink_mask(crop)
        pink_circles = hough_circles(pink, expected)
        gray_circles = hough_circles(gray_local, expected)
        circles = pink_circles
        if circles is None or len(circles) < config.columns * config.rows * 0.4:
            circles = merge_circle_sets(pink_circles, gray_circles)
        if circles is not None:
            try:
                return build_grid_from_circles(
                    circles,
                    config.columns,
                    config.rows,
                    crop_height=crop.shape[0],
                    crop_width=crop.shape[1],
                )
            except ValueError:
                return lattice_from_crop(gray_local, config.columns, config.rows)
        return lattice_from_crop(gray_local, config.columns, config.rows)

    centers, radius, x_centers = fit_on(work)

    # Widen once if remaining columns fall past the crop edge, then rebuild
    # the lattice on that wider crop with the SAME left-column geometry.
    if auto_crop_roll_region:
        work2, box2, _ = expand_crop_to_fit_columns(image, box, x_centers, radius)
        if work2.shape[1] > work.shape[1] + 2:
            work, box = work2, box2
            centers, radius, x_centers = fit_on(work)
            # If still short, force width from first-four spacing and shift x only.
            if float(np.max(x_centers)) + radius * 2.5 > work.shape[1]:
                spacing = (
                    float(x_centers[1] - x_centers[0])
                    if len(x_centers) > 1
                    else radius * 3
                )
                x1, y1, _, y2 = box
                need = int(float(x_centers[0]) + spacing * (config.columns - 1) + radius * 3)
                new_x2 = min(image.shape[1], x1 + max(need, work.shape[1]) + 4)
                box = (x1, y1, new_x2, y2)
                work = image[y1:y2, x1:new_x2].copy()
                # Keep the already-correct left geometry; only place remaining xs.
                x_centers = np.asarray(
                    [float(x_centers[0]) + spacing * c for c in range(config.columns)],
                    dtype=np.float32,
                )
                y_centers = np.asarray(
                    [centers[0][r][1] for r in range(config.rows)], dtype=np.float32
                )
                centers = [
                    [(float(x_centers[c]), float(y_centers[r])) for r in range(config.rows)]
                    for c in range(config.columns)
                ]

    gray = to_gray(work)
    gray = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(gray)

    config.bubble_radius = radius
    column_results = decode_columns(gray, centers, radius, config)
    roll_number, valid = assemble_roll(column_results)
    debug_image = draw_debug_visualization(work, column_results, radius) if debug else None
    return RollReadResult(
        roll_number=roll_number,
        valid=valid,
        columns=column_results,
        aligned_image=work,
        debug_image=debug_image,
        crop_image=work,
    )


def read_roll_image(
    image_path: str | Path,
    config: RollGridConfig,
    *,
    debug_path: str | Path | None = None,
    crop_path: str | Path | None = None,
    auto_crop_roll_region: bool = True,
) -> RollReadResult:
    image = cv2.imread(str(image_path), cv2.IMREAD_COLOR)
    if image is None:
        raise FileNotFoundError(f"Could not read image: {image_path}")
    result = decode_roll_grid(
        image,
        config,
        debug=debug_path is not None,
        auto_crop_roll_region=auto_crop_roll_region,
    )
    if debug_path is not None and result.debug_image is not None:
        cv2.imwrite(str(debug_path), result.debug_image)
    if crop_path is not None and result.crop_image is not None:
        cv2.imwrite(str(crop_path), result.crop_image)
    return result


def result_to_json_dict(result: RollReadResult) -> dict:
    return {
        "ok": True,
        "valid": result.valid,
        "rollNumber": result.roll_number,
        "digits": [
            {
                # The printed column header identifies the roll-number position.
                "position": column.column + 1,
                "columnLabel": column.column + 1,
                # Rows are ordered by their printed labels: 0 at top through 9.
                "digit": column.digit,
                "rowLabel": column.digit,
                "status": column.status,
                "confidence": round(column.confidence, 4),
                "topFillRatio": round(column.top_fill_ratio, 4),
                "secondFillRatio": round(column.second_fill_ratio, 4),
                "flagged": column.status != "marked",
                "candidates": column.candidates,
            }
            for column in result.columns
        ],
        "issues": [
            f"Column {c.column + 1}: {c.status}"
            for c in result.columns
            if c.status != "marked"
        ],
    }


if __name__ == "__main__":
    import argparse
    import json
    import sys

    parser = argparse.ArgumentParser(
        description="Decode an OMR roll-number grid from a scanned/photographed sheet."
    )
    parser.add_argument("image", nargs="?", help="Path to OMR sheet image (jpg/png/webp).")
    parser.add_argument("--debug", default=None, help="Optional debug image path.")
    parser.add_argument("--crop-out", default=None, help="Write the detected roll crop image.")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON.")
    parser.add_argument("--auto", action="store_true", help="Auto-crop roll region (default for uploads).")
    parser.add_argument("--columns", type=int, default=10, help="Roll digit columns (default: 10).")
    parser.add_argument("--min-darkness", type=float, default=0.62)
    parser.add_argument("--darkness-margin", type=float, default=0.08)
    args = parser.parse_args()

    if not args.image:
        message = (
            "Usage:\n"
            "  python -u scripts/omr_roll_reader.py path\\to\\omr-sheet.jpg --auto --json\n\n"
            "In the website, upload an OMR image in AI bubble detection — no manual path is needed."
        )
        if args.json:
            print(json.dumps({"ok": False, "error": "Missing image path", "usage": message}), flush=True)
        else:
            print(message, file=sys.stderr)
        sys.exit(2)

    image_path = Path(args.image)
    if not image_path.is_file():
        err = f"Image not found: {image_path.resolve()}"
        if args.json:
            print(json.dumps({"ok": False, "error": err}), flush=True)
        else:
            print(err, file=sys.stderr)
        sys.exit(1)

    config = RollGridConfig(
        columns=max(1, args.columns),
        rows=10,
        min_darkness=args.min_darkness,
        darkness_margin=args.darkness_margin,
    )

    debug_path = args.debug
    if debug_path is None and not args.json:
        debug_path = str(image_path.with_name(f"{image_path.stem}_roll_debug.jpg"))

    try:
        result = read_roll_image(
            image_path,
            config,
            debug_path=debug_path,
            crop_path=args.crop_out,
            auto_crop_roll_region=True if args.auto or args.json else True,
        )
    except Exception as exc:  # noqa: BLE001
        if args.json:
            print(json.dumps({"ok": False, "error": str(exc)}), flush=True)
            sys.exit(1)
        raise

    if args.json:
        print(json.dumps(result_to_json_dict(result)), flush=True)
        sys.exit(0)

    print("valid:", result.valid)
    print("roll number:", result.roll_number)
    if debug_path:
        print("debug image:", debug_path)
    for column in result.columns:
        print(
            f"position={column.column + 1} status={column.status} "
            f"digit={column.digit} confidence={column.confidence:.2f} "
            f"top={column.top_fill_ratio:.3f} second={column.second_fill_ratio:.3f} "
            f"candidates={column.candidates}"
        )
