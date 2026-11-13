// ---------------------------------------------------------------------------
// Stroke builder: finished world-space points to a stored drawing
// ---------------------------------------------------------------------------

import { createStrokeOutline, getStrokeBounds, outlineToPath } from "@/lib/workspace/drawing-geometry";
import type { DrawingPoint, StrokePointerType } from "./stroke-format";

export type StrokeMeta = { startedAt?: number; pointerType?: StrokePointerType };

const PADDING = 2;

/**
 * The drawing's frame, outline path and item-local points. Keeps the exact
 * sample sequence of the live preview: re-sampling here would change the
 * pressure curve at pen-up and the saved stroke would look different from
 * what was just drawn.
 */
export function buildDrawingFromWorldPoints(
  points: readonly DrawingPoint[],
  color: string,
  strokeWidth: number,
  meta: StrokeMeta = {},
) {
  const outline = createStrokeOutline([...points], strokeWidth);
  const bounds = getStrokeBounds(outline);
  const x = bounds.minX - PADDING;
  const y = bounds.minY - PADDING;
  const localPoints: DrawingPoint[] = points.map((point) => ({
    x: point.x - x,
    y: point.y - y,
    ...(point.pressure === undefined ? {} : { pressure: point.pressure }),
    ...(point.t === undefined ? {} : { t: point.t }),
  }));
  const localOutline = outline.map((point) => ({ x: point.x - x, y: point.y - y }));
  return {
    x,
    y,
    w: Math.max(bounds.maxX - bounds.minX + PADDING * 2, 1),
    h: Math.max(bounds.maxY - bounds.minY + PADDING * 2, 1),
    d: outlineToPath(localOutline),
    points: localPoints,
    color,
    strokeWidth,
    outline: true,
    ...(meta.startedAt === undefined ? {} : { startedAt: meta.startedAt }),
    ...(meta.pointerType === undefined ? {} : { pointerType: meta.pointerType }),
  };
}
