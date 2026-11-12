// ---------------------------------------------------------------------------
// Connector routing — straight, curve and elbow (orthogonal) paths
// ---------------------------------------------------------------------------
// Behaviour follows AFFiNE's ConnectorPathGenerator; the elbow router is an
// independent A* over an orthogonal visibility grid built from the two
// endpoint bounds (expanded by an exit offset), with a bend penalty.
// ---------------------------------------------------------------------------

import type { ConnectorEnd, ConnectorMode, StudioItem } from "@/types/workspace";
import {
  getConnectorAnchors,
  getItemCenter,
  getNearestConnectorAnchorTo,
  getRotatedBounds,
  resolveConnectorEnd,
  vec,
  type ConnectableItem,
  type ConnectionPoint,
  type Vec,
} from "./connector-anchors";

export type ConnectorRoute =
  | { mode: "straight"; start: ConnectionPoint; end: ConnectionPoint; points: [Vec, Vec] }
  | { mode: "elbow"; start: ConnectionPoint; end: ConnectionPoint; points: Vec[] }
  | { mode: "curve"; start: ConnectionPoint; end: ConnectionPoint; points: [Vec, Vec]; controls: [Vec, Vec] };

export type RouteInput = {
  source: ConnectorEnd;
  target: ConnectorEnd;
  mode: ConnectorMode;
};

type Bounds = { x: number; y: number; w: number; h: number };

export const ELBOW_EXIT_OFFSET = 20;
const CURVE_MIN_HANDLE = 100;
const ALIGN_EPSILON = 0.02;

function lookup(items: readonly StudioItem[] | Map<string, StudioItem>, id: string | undefined): ConnectableItem | undefined {
  if (!id) return undefined;
  const item = items instanceof Map ? items.get(id) : items.find((candidate) => candidate.id === id);
  return item && item.type !== "connector" ? item : undefined;
}

// ── endpoint resolution ────────────────────────────────────────────────────

/**
 * Resolves both ends. Ends attached without a position pick anchors
 * relative to the other end (AFFiNE: nearest anchor pair / nearest anchor to
 * the other element's centre).
 */
export function resolveRouteEnds(
  input: RouteInput,
  items: readonly StudioItem[] | Map<string, StudioItem>,
): { start: ConnectionPoint; end: ConnectionPoint; startItem?: ConnectableItem; endItem?: ConnectableItem } | null {
  const startItem = lookup(items, input.source.id);
  const endItem = lookup(items, input.target.id);
  if ((input.source.id && !startItem) || (input.target.id && !endItem)) return null;

  const sourceAuto = Boolean(input.source.id && !input.source.position);
  const targetAuto = Boolean(input.target.id && !input.target.position);

  if (sourceAuto && targetAuto && startItem && endItem) {
    if (input.mode === "elbow") {
      let best: { a: ConnectionPoint; b: ConnectionPoint; d: number } | null = null;
      for (const a of getConnectorAnchors(startItem)) {
        for (const b of getConnectorAnchors(endItem)) {
          const d = vec.dist(a, b);
          if (!best || d + 0.1 < best.d) best = { a, b, d };
        }
      }
      return best ? { start: best.a, end: best.b, startItem, endItem } : null;
    }
    const a = getNearestConnectorAnchorTo(startItem, getItemCenter(endItem));
    const b = getNearestConnectorAnchorTo(endItem, getItemCenter(startItem));
    return { start: a, end: b, startItem, endItem };
  }

  // Resolve the fixed end first so an auto end can aim at it.
  if (sourceAuto) {
    const end = resolveConnectorEnd(input.target, endItem);
    if (!end) return null;
    const start = resolveConnectorEnd(input.source, startItem, end);
    return start ? { start, end, startItem, endItem } : null;
  }
  const start = resolveConnectorEnd(input.source, startItem);
  if (!start) return null;
  const end = resolveConnectorEnd(input.target, endItem, start);
  return end ? { start, end, startItem, endItem } : null;
}

// ── public entry point ─────────────────────────────────────────────────────

export function computeConnectorRoute(
  input: RouteInput,
  items: readonly StudioItem[] | Map<string, StudioItem>,
): ConnectorRoute | null {
  const ends = resolveRouteEnds(input, items);
  if (!ends) return null;
  const { start, end, startItem, endItem } = ends;

  switch (input.mode) {
    case "straight":
      return { mode: "straight", start, end, points: [point(start), point(end)] };
    case "curve":
      return { mode: "curve", start, end, points: [point(start), point(end)], controls: getCurveControls(start, end, Boolean(startItem), Boolean(endItem)) };
    case "elbow":
      return {
        mode: "elbow",
        start,
        end,
        points: getElbowPath(start, end, startItem ? getRotatedBounds(startItem) : null, endItem ? getRotatedBounds(endItem) : null),
      };
    default:
      return null;
  }
}

function point(p: Vec): Vec {
  return { x: p.x, y: p.y };
}

// ── curve ──────────────────────────────────────────────────────────────────

/** Cubic Bézier control points (absolute) for a curve connector. */
export function getCurveControls(start: ConnectionPoint, end: ConnectionPoint, startAttached: boolean, endAttached: boolean): [Vec, Vec] {
  if (!startAttached && !endAttached) {
    const delta = vec.sub(end, start);
    if (Math.abs(delta.x) > Math.abs(delta.y)) {
      return [{ x: start.x + (delta.x * 2) / 3, y: start.y }, { x: end.x - (delta.x * 2) / 3, y: end.y }];
    }
    return [{ x: start.x, y: start.y + (delta.y * 2) / 3 }, { x: end.x, y: end.y - (delta.y * 2) / 3 }];
  }

  const handle = (from: ConnectionPoint, to: Vec, attached: boolean): Vec => {
    if (!attached) return point(from);
    const normal = from.normal;
    if (!normal || vec.len(normal) < 1e-9) {
      const away = vec.normalize(vec.sub(from, to));
      return vec.add(from, vec.mul({ x: -away.y, y: away.x }, 20));
    }
    const projection = Math.abs(vec.dot(vec.sub(to, from), normal));
    return vec.add(from, vec.mul(normal, Math.max(CURVE_MIN_HANDLE, projection / 3)));
  };

  return [handle(start, end, startAttached), handle(end, start, endAttached)];
}

// ── elbow ──────────────────────────────────────────────────────────────────

type Side = "left" | "top" | "right" | "bottom";
const SIDES: Side[] = ["left", "top", "right", "bottom"];
const SIDE_DIRECTION: Record<Side, Vec> = {
  left: { x: -1, y: 0 },
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
};

function almost(a: number, b: number, eps = ALIGN_EPSILON) {
  return Math.abs(a - b) <= eps;
}

function expand(bounds: Bounds, offsets: Record<Side, number>): Bounds {
  return {
    x: bounds.x - offsets.left,
    y: bounds.y - offsets.top,
    w: bounds.w + offsets.left + offsets.right,
    h: bounds.h + offsets.top + offsets.bottom,
  };
}

function strictlyInside(bounds: Bounds, p: Vec, eps = 0.01) {
  return p.x > bounds.x + eps && p.x < bounds.x + bounds.w - eps && p.y > bounds.y + eps && p.y < bounds.y + bounds.h - eps;
}

function insideOrOn(bounds: Bounds, p: Vec, eps = 0.01) {
  return p.x >= bounds.x - eps && p.x <= bounds.x + bounds.w + eps && p.y >= bounds.y - eps && p.y <= bounds.y + bounds.h + eps;
}

/** Whether an axis-aligned segment passes through the open interior of bounds. */
function segmentCrossesInterior(a: Vec, b: Vec, bounds: Bounds, eps = 0.01) {
  const left = bounds.x + eps;
  const right = bounds.x + bounds.w - eps;
  const top = bounds.y + eps;
  const bottom = bounds.y + bounds.h - eps;
  if (almost(a.y, b.y, 1e-6)) {
    if (a.y <= top || a.y >= bottom) return false;
    return Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  }
  if (a.x <= left || a.x >= right) return false;
  return Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom;
}

/**
 * Per-side exit offsets (AFFiNE `computeOffset`): 20 by default, reduced to
 * half the gap on the sides where the two bounds face each other closely.
 */
function computeOffsets(startBound: Bounds | null, endBound: Bounds | null): [Record<Side, number>, Record<Side, number>] {
  const base = () => ({ left: ELBOW_EXIT_OFFSET, top: ELBOW_EXIT_OFFSET, right: ELBOW_EXIT_OFFSET, bottom: ELBOW_EXIT_OFFSET });
  const startOffset = base();
  const endOffset = base();
  if (!startBound || !endBound) return [startOffset, endOffset];

  const overlapX = Math.min(startBound.x + startBound.w, endBound.x + endBound.w) > Math.max(startBound.x, endBound.x);
  const overlapY = Math.min(startBound.y + startBound.h, endBound.y + endBound.h) > Math.max(startBound.y, endBound.y);
  const facing = (gap: number) => (gap > 0 ? Math.min(ELBOW_EXIT_OFFSET, gap / 2) : ELBOW_EXIT_OFFSET);

  if (overlapX) {
    const gapBelow = endBound.y - (startBound.y + startBound.h);
    const gapAbove = startBound.y - (endBound.y + endBound.h);
    if (gapBelow > 0) startOffset.bottom = endOffset.top = facing(gapBelow);
    if (gapAbove > 0) startOffset.top = endOffset.bottom = facing(gapAbove);
  }
  if (overlapY) {
    const gapRight = endBound.x - (startBound.x + startBound.w);
    const gapLeft = startBound.x - (endBound.x + endBound.w);
    if (gapRight > 0) startOffset.right = endOffset.left = facing(gapRight);
    if (gapLeft > 0) startOffset.left = endOffset.right = facing(gapLeft);
  }
  return [startOffset, endOffset];
}

/** Which side of the bounds a point exits through, from its normal or position. */
function exitSide(bounds: Bounds, p: ConnectionPoint): Side {
  if (almost(p.x, bounds.x)) return "left";
  if (almost(p.y, bounds.y)) return "top";
  if (almost(p.x, bounds.x + bounds.w)) return "right";
  if (almost(p.y, bounds.y + bounds.h)) return "bottom";
  const n = p.normal ?? vec.normalize(vec.sub(p, { x: bounds.x + bounds.w / 2, y: bounds.y + bounds.h / 2 }));
  if (Math.abs(n.x) >= Math.abs(n.y)) return n.x >= 0 ? "right" : "left";
  return n.y >= 0 ? "bottom" : "top";
}

function exitPoint(bounds: Bounds, p: Vec, side: Side, offset: number): Vec {
  switch (side) {
    case "left": return { x: bounds.x - offset, y: p.y };
    case "right": return { x: bounds.x + bounds.w + offset, y: p.y };
    case "top": return { x: p.x, y: bounds.y - offset };
    case "bottom": return { x: p.x, y: bounds.y + bounds.h + offset };
  }
}

function directPath(start: Vec, end: Vec): Vec[] {
  if (almost(start.x, end.x) || almost(start.y, end.y)) return [start, end];
  return [start, { x: start.x, y: end.y }, end];
}

/** Removes duplicate and collinear interior points. */
export function mergeOrthogonalPath(points: Vec[]): Vec[] {
  const deduped: Vec[] = [];
  for (const p of points) {
    const last = deduped[deduped.length - 1];
    if (!last || !almost(last.x, p.x) || !almost(last.y, p.y)) deduped.push({ x: p.x, y: p.y });
  }
  if (deduped.length <= 2) return deduped;
  const merged: Vec[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i += 1) {
    const prev = merged[merged.length - 1];
    const cur = deduped[i];
    const next = deduped[i + 1];
    const collinear = (almost(prev.x, cur.x) && almost(cur.x, next.x)) || (almost(prev.y, cur.y) && almost(cur.y, next.y));
    if (!collinear) merged.push(cur);
  }
  merged.push(deduped[deduped.length - 1]);
  return merged;
}

const BEND_PENALTY = 30;

type Direction = 0 | 1 | 2 | 3 | -1; // index into SIDES order of travel direction, -1 = none

function directionOf(a: Vec, b: Vec): Direction {
  if (almost(a.y, b.y, 1e-6)) return b.x < a.x ? 0 : 2;
  return b.y < a.y ? 1 : 3;
}

/**
 * A* over the orthogonal grid formed by the candidate x/y lines. Segments may
 * not cross the interior of the endpoint bounds or their expanded bounds.
 */
function routeGrid(
  from: Vec,
  to: Vec,
  fromDirection: Direction,
  toDirection: Direction,
  xs: number[],
  ys: number[],
  obstacles: Bounds[],
): Vec[] | null {
  const uniq = (values: number[]) => [...new Set(values.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  const gx = uniq(xs);
  const gy = uniq(ys);
  const key = (ix: number, iy: number) => ix * gy.length + iy;
  const at = (ix: number, iy: number): Vec => ({ x: gx[ix], y: gy[iy] });
  const blockedNode = (p: Vec) => obstacles.some((b) => strictlyInside(b, p));
  const findIndex = (values: number[], v: number) => values.findIndex((candidate) => almost(candidate, v, 1e-3));

  const startIx = findIndex(gx, from.x);
  const startIy = findIndex(gy, from.y);
  const goalIx = findIndex(gx, to.x);
  const goalIy = findIndex(gy, to.y);
  if (startIx < 0 || startIy < 0 || goalIx < 0 || goalIy < 0) return null;

  type NodeState = { ix: number; iy: number; dir: Direction; g: number; f: number; parent: NodeState | null };
  const stateKey = (ix: number, iy: number, dir: Direction) => key(ix, iy) * 5 + (dir + 1);
  const open: NodeState[] = [];
  const best = new Map<number, number>();
  const h = (ix: number, iy: number) => Math.abs(gx[ix] - to.x) + Math.abs(gy[iy] - to.y);
  const push = (state: NodeState) => {
    const k = stateKey(state.ix, state.iy, state.dir);
    if ((best.get(k) ?? Infinity) <= state.g) return;
    best.set(k, state.g);
    open.push(state);
  };

  push({ ix: startIx, iy: startIy, dir: fromDirection, g: 0, f: h(startIx, startIy), parent: null });

  const steps: Array<[number, number, Direction]> = [[-1, 0, 0], [0, -1, 1], [1, 0, 2], [0, 1, 3]];
  let guard = 0;
  while (open.length > 0 && guard < 20000) {
    guard += 1;
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) if (open[i].f < open[bestIndex].f) bestIndex = i;
    const current = open.splice(bestIndex, 1)[0];
    if (current.ix === goalIx && current.iy === goalIy) {
      const path: Vec[] = [];
      for (let s: NodeState | null = current; s; s = s.parent) path.unshift(at(s.ix, s.iy));
      return path;
    }
    for (const [dx, dy, dir] of steps) {
      if (current.dir !== -1 && (current.dir + 2) % 4 === dir) continue; // no reversing
      const nx = current.ix + dx;
      const ny = current.iy + dy;
      if (nx < 0 || ny < 0 || nx >= gx.length || ny >= gy.length) continue;
      const a = at(current.ix, current.iy);
      const b = at(nx, ny);
      const isGoal = nx === goalIx && ny === goalIy;
      if (!isGoal && blockedNode(b)) continue;
      if (obstacles.some((o) => segmentCrossesInterior(a, b, o))) continue;
      // A bend costs BEND_PENALTY; bending right at the exit point gets a small
      // extra cost so equal-length routes prefer bending at the gap midline
      // (AFFiNE gives gap midpoints priority).
      const bend = current.dir !== -1 && current.dir !== dir ? BEND_PENALTY + (current.parent === null ? 1 : 0) : 0;
      // Turning at the end's exit point is a bend too (same tie-break as above).
      const entryPenalty = isGoal && toDirection !== -1 && dir !== toDirection ? BEND_PENALTY + 1 : 0;
      const g = current.g + Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + bend + entryPenalty;
      push({ ix: nx, iy: ny, dir, g, f: g + h(nx, ny), parent: current });
    }
  }
  return null;
}

/**
 * Orthogonal path between two ends. `startBound`/`endBound` are the rotated
 * AABBs of the attached elements (null for free ends).
 */
export function getElbowPath(start: ConnectionPoint, end: ConnectionPoint, startBound: Bounds | null, endBound: Bounds | null): Vec[] {
  const [startOffset, endOffset] = computeOffsets(startBound, endBound);
  const startSide = startBound ? exitSide(startBound, start) : null;
  const endSide = endBound ? exitSide(endBound, end) : null;
  const expandedStart = startBound ? expand(startBound, startOffset) : null;
  const expandedEnd = endBound ? expand(endBound, endOffset) : null;

  // Overlapping or nested ends: connect directly (AFFiNE `getDirectPath`).
  if (
    (startBound && endBound && insideOrOn(startBound, end) && insideOrOn(endBound, start)) ||
    (expandedStart && insideOrOn(expandedStart, end)) ||
    (expandedEnd && insideOrOn(expandedEnd, start))
  ) {
    return mergeOrthogonalPath(directPath(point(start), point(end)));
  }

  const nextStart = startBound && startSide ? exitPoint(startBound, start, startSide, startOffset[startSide]) : point(start);
  const lastEnd = endBound && endSide ? exitPoint(endBound, end, endSide, endOffset[endSide]) : point(end);

  const xs = [nextStart.x, lastEnd.x, (nextStart.x + lastEnd.x) / 2];
  const ys = [nextStart.y, lastEnd.y, (nextStart.y + lastEnd.y) / 2];
  for (const b of [expandedStart, expandedEnd]) {
    if (!b) continue;
    xs.push(b.x, b.x + b.w, b.x + b.w / 2);
    ys.push(b.y, b.y + b.h, b.y + b.h / 2);
  }
  if (expandedStart && expandedEnd) {
    // Gap midlines between the two bounds, and an outer frame around both.
    const gapX = expandedStart.x + expandedStart.w < expandedEnd.x
      ? (expandedStart.x + expandedStart.w + expandedEnd.x) / 2
      : expandedEnd.x + expandedEnd.w < expandedStart.x
        ? (expandedEnd.x + expandedEnd.w + expandedStart.x) / 2
        : null;
    const gapY = expandedStart.y + expandedStart.h < expandedEnd.y
      ? (expandedStart.y + expandedStart.h + expandedEnd.y) / 2
      : expandedEnd.y + expandedEnd.h < expandedStart.y
        ? (expandedEnd.y + expandedEnd.h + expandedStart.y) / 2
        : null;
    if (gapX !== null) xs.push(gapX);
    if (gapY !== null) ys.push(gapY);
  }

  // The elements themselves are always obstacles; their expanded (clearance)
  // bounds are too, unless an exit point lies inside one (very close objects).
  const obstacles: Bounds[] = [startBound, endBound].filter((b): b is Bounds => Boolean(b));
  for (const b of [expandedStart, expandedEnd]) {
    if (b && !strictlyInside(b, nextStart) && !strictlyInside(b, lastEnd)) obstacles.push(b);
  }
  const fromDirection: Direction = startSide ? (SIDES.indexOf(startSide) as Direction) : -1;
  // Entering the end element travels opposite to its exit side.
  const toDirection: Direction = endSide ? (((SIDES.indexOf(endSide) + 2) % 4) as Direction) : -1;

  const routed = routeGrid(nextStart, lastEnd, fromDirection, toDirection, xs, ys, obstacles);
  const middle = routed ?? directPath(nextStart, lastEnd);
  return mergeOrthogonalPath([point(start), ...middle, point(end)]);
}

export const __testing = { computeOffsets, exitSide, segmentCrossesInterior, directionOf };
