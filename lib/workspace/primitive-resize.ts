// ---------------------------------------------------------------------------
// Resizing strokes and free text
// ---------------------------------------------------------------------------
//
// Pure geometry, no React. A stroke's path and points live in its own local
// coordinates and the SVG viewBox follows the item's size, so changing w/h
// alone would not scale the ink: the stored path must be scaled with it. Free
// text resizes by font size, like Excalidraw: corner handles only, aspect locked.

import type { Bounds, ResizeHandle } from "./transform-engine";

export const MIN_FREE_TEXT_FONT_SIZE = 8;
export const MAX_FREE_TEXT_FONT_SIZE = 400;

export function isScaleResizableType(type: string): boolean {
  return type === "drawing" || type === "free-text";
}

export function isCornerHandle(handle: ResizeHandle): boolean {
  return handle === "nw" || handle === "ne" || handle === "se" || handle === "sw";
}

type PathPoint = { x: number; y: number; pressure?: number; t?: number };

export type StrokeScaleInput = {
  d: string;
  points?: PathPoint[];
};

/**
 * Scales an absolute-coordinate SVG path (M, L, Q, T, C, S and Z, which is
 * all the stroke builder and legacy strokes produce) from the origin. Returns
 * null for paths with relative, arc or axis-only commands so the caller leaves
 * the stroke untouched rather than distorting it.
 */
export function scalePathData(d: string, sx: number, sy: number): string | null {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) return null;
  const out: string[] = [];
  let isX = true;
  for (const token of tokens) {
    if (/[a-zA-Z]/.test(token)) {
      if (!/^[MLQTCSZ]$/.test(token)) return null;
      out.push(token);
      isX = true;
      continue;
    }
    const value = Number(token);
    if (!Number.isFinite(value)) return null;
    out.push(String(isX ? value * sx : value * sy));
    isX = !isX;
  }
  return out.join(" ");
}

/**
 * The stroke's path and points scaled by (sx, sy) from its start geometry.
 * Always pass the geometry from when the gesture began, never the live one,
 * so a long drag does not accumulate rounding error. Pressure and timing are
 * kept. Returns null when the path cannot be scaled safely.
 */
export function scaleStrokeGeometry(
  start: StrokeScaleInput,
  sx: number,
  sy: number,
): StrokeScaleInput | null {
  if (!Number.isFinite(sx) || !Number.isFinite(sy) || sx <= 0 || sy <= 0) return null;
  const d = scalePathData(start.d, sx, sy);
  if (d === null) return null;
  const result: StrokeScaleInput = { d };
  if (start.points) {
    result.points = start.points.map((point) => ({ ...point, x: point.x * sx, y: point.y * sy }));
  }
  return result;
}

/**
 * Bounds after scaling `start` uniformly by `scale` about the corner opposite
 * `handle` (rotation-aware: the anchor stays put in world space).
 */
export function scaleBoundsFromHandle(
  handle: ResizeHandle,
  start: Bounds,
  scale: number,
  rotation = 0,
): Bounds {
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const anchorSignX = handle.includes("w") ? 1 : handle.includes("e") ? -1 : 0;
  const anchorSignY = handle.includes("n") ? 1 : handle.includes("s") ? -1 : 0;

  const centerX = start.x + start.w / 2;
  const centerY = start.y + start.h / 2;
  const anchorLocalX = (anchorSignX * start.w) / 2;
  const anchorLocalY = (anchorSignY * start.h) / 2;
  const worldAnchorX = centerX + (anchorLocalX * cos - anchorLocalY * sin);
  const worldAnchorY = centerY + (anchorLocalX * sin + anchorLocalY * cos);

  const w = start.w * scale;
  const h = start.h * scale;
  const newLocalX = (anchorSignX * w) / 2;
  const newLocalY = (anchorSignY * h) / 2;
  const newCenterX = worldAnchorX - (newLocalX * cos - newLocalY * sin);
  const newCenterY = worldAnchorY - (newLocalX * sin + newLocalY * cos);
  return { x: newCenterX - w / 2, y: newCenterY - h / 2, w, h };
}

/**
 * Dragging a corner of free text: the pointer sets a scale (the larger of the
 * two axis changes, in the box's own rotated axes), the font size follows it
 * within sane limits and the box keeps its opposite corner in place.
 */
export function computeFreeTextResize(
  handle: ResizeHandle,
  start: Bounds,
  startFontSize: number,
  deltaX: number,
  deltaY: number,
  rotation = 0,
): { bounds: Bounds; fontSize: number } | null {
  if (!isCornerHandle(handle) || start.w <= 0 || start.h <= 0 || startFontSize <= 0) return null;
  const rad = (rotation * Math.PI) / 180;
  const localDx = deltaX * Math.cos(rad) + deltaY * Math.sin(rad);
  const localDy = -deltaX * Math.sin(rad) + deltaY * Math.cos(rad);
  // Outward drag grows the box; the handle's sign says which way is outward.
  const outX = handle.includes("e") ? localDx : -localDx;
  const outY = handle.includes("s") ? localDy : -localDy;
  const scaleX = (start.w + outX) / start.w;
  const scaleY = (start.h + outY) / start.h;
  const raw = Math.abs(scaleX - 1) > Math.abs(scaleY - 1) ? scaleX : scaleY;

  const minScale = MIN_FREE_TEXT_FONT_SIZE / startFontSize;
  const maxScale = MAX_FREE_TEXT_FONT_SIZE / startFontSize;
  const scale = Math.min(maxScale, Math.max(minScale, Number.isFinite(raw) ? raw : 1));
  return {
    bounds: scaleBoundsFromHandle(handle, start, scale, rotation),
    fontSize: Math.round(startFontSize * scale * 100) / 100,
  };
}
