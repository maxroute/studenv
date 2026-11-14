// ---------------------------------------------------------------------------
// Box and lasso selection: which items a drag on empty canvas selects
// ---------------------------------------------------------------------------
// - Box: items the box touches (tldraw default); with Ctrl/⌘ held, only
//   items fully inside it (tldraw "wrap", Excalidraw's default).
// - Lasso (Alt + drag): items the drawn path crosses or encloses.
// - Shift keeps what was selected before the drag and adds to it.
// Touching one member of a group selects the whole group. Connectors use
// their route, not their placeholder bounds. Pure: tested in marquee.test.ts.
// ---------------------------------------------------------------------------

import type { StudioItem } from "@/types/workspace";
import { connectorIntersectsRect, getItemSelectionBounds } from "./connector-selection";
import { resolveGroupSelection } from "./group-engine";
import { isIntersecting } from "./selection-engine";
import type { Point } from "./navigation";

type Rect = { x: number; y: number; w: number; h: number };

export type BoxSelectMode = "touch" | "contain";

export const rectFromPoints = (a: Point, b: Point): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(a.x - b.x),
  h: Math.abs(a.y - b.y),
});

const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

/** Items a selection box picks. `base` (Shift) is kept and added to. */
export function boxSelection(items: StudioItem[], box: Rect, mode: BoxSelectMode, base: readonly string[] = []): string[] {
  const hit = items
    .filter((item) => {
      if (item.type === "connector") {
        if (mode === "touch") return connectorIntersectsRect(item, items, box);
        const bounds = getItemSelectionBounds(item, items);
        return bounds ? contains(box, bounds) : false;
      }
      const bounds = { x: item.x, y: item.y, w: item.w, h: item.h };
      return mode === "touch" ? isIntersecting(bounds, box) : contains(box, bounds);
    })
    .map((item) => item.id);
  return resolveGroupSelection(items, [...new Set([...base, ...hit])]);
}

// ── lasso ──────────────────────────────────────────────────────────────────

/** Ray casting: is the point inside the closed polygon? */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function pathTouchesRect(path: readonly Point[], rect: Rect): boolean {
  const corners = [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.w, y: rect.y },
    { x: rect.x + rect.w, y: rect.y + rect.h },
    { x: rect.x, y: rect.y + rect.h },
  ];
  const edges = corners.map((corner, index) => [corner, corners[(index + 1) % 4]] as const);
  for (let i = 0; i < path.length; i += 1) {
    const p = path[i];
    if (p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h) return true;
    const next = path[i + 1];
    if (next && edges.some(([a, b]) => segmentsIntersect(p, next, a, b))) return true;
  }
  return false;
}

/** Items a lasso path picks: crossed by the path, or enclosed by it (the path is closed back to its start). */
export function lassoSelection(items: StudioItem[], path: readonly Point[], base: readonly string[] = []): string[] {
  if (path.length < 2) return resolveGroupSelection(items, [...base]);
  const closed = [...path, path[0]];
  const hit = items
    .filter((item) => {
      const bounds = getItemSelectionBounds(item, items);
      if (!bounds) return false;
      if (pathTouchesRect(closed, bounds)) return true;
      // Enclosed: every corner inside the loop.
      return [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y },
        { x: bounds.x + bounds.w, y: bounds.y + bounds.h },
        { x: bounds.x, y: bounds.y + bounds.h },
      ].every((corner) => pointInPolygon(corner, path));
    })
    .map((item) => item.id);
  return resolveGroupSelection(items, [...new Set([...base, ...hit])]);
}
