// ---------------------------------------------------------------------------
// Shape Tool – SVG path generation for each shape kind
// ---------------------------------------------------------------------------
// Every function receives the bounding-box width/height and an optional corner
// radius, and returns a valid SVG `d` attribute string.  These are pure
// functions with zero React dependency – easy to test and extend.
// ---------------------------------------------------------------------------

import type { ShapeKind } from "./shape-types";

// ── helpers ──────────────────────────────────────────────────────────────────

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function regularPolygonPath(
  w: number,
  h: number,
  sides: number,
  startAngle = 0,
): string {
  const cx = w / 2;
  const cy = h / 2;
  const rx = w / 2;
  const ry = h / 2;

  const points: string[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = startAngle + (360 / sides) * i;
    const rad = ((angle - 90) * Math.PI) / 180;
    const x = cx + rx * Math.cos(rad);
    const y = cy + ry * Math.sin(rad);
    points.push(`${x} ${y}`);
  }

  return `M ${points.join(" L ")} Z`;
}

// ── individual shape paths ───────────────────────────────────────────────────

function rectanglePath(w: number, h: number, cr: number): string {
  if (cr <= 0) {
    return `M 0 0 L ${w} 0 L ${w} ${h} L 0 ${h} Z`;
  }
  const r = Math.min(cr, w / 2, h / 2);
  return [
    `M ${r} 0`,
    `L ${w - r} 0 Q ${w} 0 ${w} ${r}`,
    `L ${w} ${h - r} Q ${w} ${h} ${w - r} ${h}`,
    `L ${r} ${h} Q 0 ${h} 0 ${h - r}`,
    `L 0 ${r} Q 0 0 ${r} 0`,
    "Z",
  ].join(" ");
}

function circlePath(w: number, h: number): string {
  // Use the smaller dimension so it's a perfect circle centred in the bbox
  const r = Math.min(w, h) / 2;
  const cx = w / 2;
  const cy = h / 2;
  return [
    `M ${cx - r} ${cy}`,
    `A ${r} ${r} 0 1 1 ${cx + r} ${cy}`,
    `A ${r} ${r} 0 1 1 ${cx - r} ${cy}`,
    "Z",
  ].join(" ");
}

function ellipsePath(w: number, h: number): string {
  const rx = w / 2;
  const ry = h / 2;
  const cx = w / 2;
  const cy = h / 2;
  return [
    `M ${cx - rx} ${cy}`,
    `A ${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`,
    `A ${rx} ${ry} 0 1 1 ${cx - rx} ${cy}`,
    "Z",
  ].join(" ");
}

function trianglePath(w: number, h: number): string {
  return `M ${w / 2} 0 L ${w} ${h} L 0 ${h} Z`;
}

function diamondPath(w: number, h: number): string {
  return `M ${w / 2} 0 L ${w} ${h / 2} L ${w / 2} ${h} L 0 ${h / 2} Z`;
}

function hexagonPath(w: number, h: number): string {
  return regularPolygonPath(w, h, 6, 0);
}

function pentagonPath(w: number, h: number): string {
  return regularPolygonPath(w, h, 5, 0);
}

function starPath(w: number, h: number): string {
  const cx = w / 2;
  const cy = h / 2;
  const outerR = Math.min(w, h) / 2;
  const innerR = outerR * 0.38;
  const points: string[] = [];

  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (360 / 10) * i;
    const { x, y } = polarToCart(cx, cy, r, angle);
    points.push(`${x} ${y}`);
  }

  return `M ${points.join(" L ")} Z`;
}

function arrowPath(w: number, h: number): string {
  const headW = Math.min(w * 0.35, h * 0.6);
  const shaftH = h * 0.3;
  const shaftTop = (h - shaftH) / 2;

  return [
    `M 0 ${shaftTop}`,
    `L ${w - headW} ${shaftTop}`,
    `L ${w - headW} 0`,
    `L ${w} ${h / 2}`,
    `L ${w - headW} ${h}`,
    `L ${w - headW} ${shaftTop + shaftH}`,
    `L 0 ${shaftTop + shaftH}`,
    "Z",
  ].join(" ");
}

function linePath(w: number, h: number): string {
  return `M 0 ${h / 2} L ${w} ${h / 2}`;
}

// ── public API ───────────────────────────────────────────────────────────────

/**
 * Returns a valid SVG `d` path string for the given shape kind and bounding box.
 *
 * All coordinates are relative to (0, 0) in a viewBox of `0 0 w h`.
 */
export function getShapePath(
  kind: ShapeKind,
  w: number,
  h: number,
  cornerRadius = 0,
): string {
  switch (kind) {
    case "rectangle":
      return rectanglePath(w, h, 0);
    case "rounded-rectangle":
      return rectanglePath(w, h, cornerRadius > 0 ? cornerRadius : 12);
    case "circle":
      return circlePath(w, h);
    case "ellipse":
      return ellipsePath(w, h);
    case "triangle":
      return trianglePath(w, h);
    case "diamond":
      return diamondPath(w, h);
    case "hexagon":
      return hexagonPath(w, h);
    case "pentagon":
      return pentagonPath(w, h);
    case "star":
      return starPath(w, h);
    case "arrow":
      return arrowPath(w, h);
    case "line":
      return linePath(w, h);
    default: {
      // Fallback: draw a rectangle
      const _exhaustive: never = kind;
      return rectanglePath(w, h, 0);
    }
  }
}

/**
 * Returns the stroke-dasharray value for a given stroke style.
 */
export function getStrokeDashArray(
  style: "solid" | "dashed" | "dotted",
  strokeWidth: number,
): string | undefined {
  switch (style) {
    case "solid":
      return undefined;
    case "dashed":
      return `${strokeWidth * 3} ${strokeWidth * 2}`;
    case "dotted":
      return `${strokeWidth} ${strokeWidth * 1.5}`;
    default:
      return undefined;
  }
}
