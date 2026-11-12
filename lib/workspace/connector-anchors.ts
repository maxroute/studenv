// ---------------------------------------------------------------------------
// Connector anchors — shape-aware connection geometry
// ---------------------------------------------------------------------------
// Pure functions (no React/DOM). World coordinates throughout; an item's
// rotation is a CSS-style clockwise rotation (degrees, y-down) about its
// centre, matching how the canvas renders items.
// ---------------------------------------------------------------------------

import type { ConnectorEnd, StudioItem } from "@/types/workspace";

export type Vec = { x: number; y: number };

/** A resolved point on (or relative to) an element, with its outward normal. */
export type ConnectionPoint = Vec & {
  /** Unit vector pointing away from the element at this point; null for free ends. */
  normal: Vec | null;
};

export type ConnectorAnchorPoint = ConnectionPoint & {
  normal: Vec;
  /** Relative position [0..1] within the element's unrotated bounds. */
  position: [number, number];
};

export type ConnectableItem = Exclude<StudioItem, { type: "connector" }>;

/** Distance past each side midpoint used to cast anchor rays (matches AFFiNE). */
const ANCHOR_RAY_OVERSHOOT = 10;
const ELLIPSE_SEGMENTS = 128;
const ROUNDED_CORNER_SEGMENTS = 6;
const EPSILON = 1e-9;

// ── vector helpers ──────────────────────────────────────────────────────────

export const vec = {
  add: (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s }),
  dot: (a: Vec, b: Vec) => a.x * b.x + a.y * b.y,
  len: (a: Vec) => Math.hypot(a.x, a.y),
  dist: (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y),
  normalize: (a: Vec): Vec => {
    const length = Math.hypot(a.x, a.y);
    return length < EPSILON ? { x: 0, y: 0 } : { x: a.x / length, y: a.y / length };
  },
};

export function rotatePoint(point: Vec, center: Vec, degrees: number): Vec {
  if (!degrees) return { x: point.x, y: point.y };
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return { x: center.x + dx * cos - dy * sin, y: center.y + dx * sin + dy * cos };
}

function rotateVector(v: Vec, degrees: number): Vec {
  return rotatePoint(v, { x: 0, y: 0 }, degrees);
}

export function getItemCenter(item: Pick<StudioItem, "x" | "y" | "w" | "h">): Vec {
  return { x: item.x + item.w / 2, y: item.y + item.h / 2 };
}

// ── outlines ────────────────────────────────────────────────────────────────

function regularPolygon(w: number, h: number, sides: number): Vec[] {
  const points: Vec[] = [];
  for (let i = 0; i < sides; i += 1) {
    const radians = (((360 / sides) * i - 90) * Math.PI) / 180;
    points.push({ x: w / 2 + (w / 2) * Math.cos(radians), y: h / 2 + (h / 2) * Math.sin(radians) });
  }
  return points;
}

function ellipsePolygon(cx: number, cy: number, rx: number, ry: number): Vec[] {
  const points: Vec[] = [];
  // Start at the top and go clockwise so the four cardinal points are vertices.
  for (let i = 0; i < ELLIPSE_SEGMENTS; i += 1) {
    const radians = (i / ELLIPSE_SEGMENTS) * Math.PI * 2 - Math.PI / 2;
    points.push({ x: cx + rx * Math.cos(radians), y: cy + ry * Math.sin(radians) });
  }
  return points;
}

function roundedRectangle(w: number, h: number, radius: number): Vec[] {
  const r = Math.min(radius, w / 2, h / 2);
  if (r <= 0) return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  // Quadratic corners with the control point at the bounding-box corner,
  // matching `rectanglePath` in shape-paths.ts.
  const corner = (start: Vec, control: Vec, end: Vec) => {
    const points: Vec[] = [];
    for (let i = 0; i <= ROUNDED_CORNER_SEGMENTS; i += 1) {
      const t = i / ROUNDED_CORNER_SEGMENTS;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      points.push({ x: a * start.x + b * control.x + c * end.x, y: a * start.y + b * control.y + c * end.y });
    }
    return points;
  };
  return [
    ...corner({ x: w - r, y: 0 }, { x: w, y: 0 }, { x: w, y: r }),
    ...corner({ x: w, y: h - r }, { x: w, y: h }, { x: w - r, y: h }),
    ...corner({ x: r, y: h }, { x: 0, y: h }, { x: 0, y: h - r }),
    ...corner({ x: 0, y: r }, { x: 0, y: 0 }, { x: r, y: 0 }),
  ];
}

function star(w: number, h: number): Vec[] {
  const outer = Math.min(w, h) / 2;
  const inner = outer * 0.38;
  const points: Vec[] = [];
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const radians = ((36 * i - 90) * Math.PI) / 180;
    points.push({ x: w / 2 + radius * Math.cos(radians), y: h / 2 + radius * Math.sin(radians) });
  }
  return points;
}

function arrowShape(w: number, h: number): Vec[] {
  const headW = Math.min(w * 0.35, h * 0.6);
  const shaftH = h * 0.3;
  const shaftTop = (h - shaftH) / 2;
  return [
    { x: 0, y: shaftTop },
    { x: w - headW, y: shaftTop },
    { x: w - headW, y: 0 },
    { x: w, y: h / 2 },
    { x: w - headW, y: h },
    { x: w - headW, y: shaftTop + shaftH },
    { x: 0, y: shaftTop + shaftH },
  ];
}

/**
 * Outline polygon in the item's local, unrotated coordinates (origin at the
 * item's top-left). Mirrors the geometry drawn by `getShapePath`.
 */
export function getLocalOutline(item: ConnectableItem): Vec[] {
  const { w, h } = item;
  if (item.type !== "shape") {
    return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  }
  switch (item.props.kind) {
    case "rounded-rectangle":
      return roundedRectangle(w, h, item.props.cornerRadius > 0 ? item.props.cornerRadius : 12);
    case "circle":
      return ellipsePolygon(w / 2, h / 2, Math.min(w, h) / 2, Math.min(w, h) / 2);
    case "ellipse":
      return ellipsePolygon(w / 2, h / 2, w / 2, h / 2);
    case "triangle":
      return [{ x: w / 2, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
    case "diamond":
      return [{ x: w / 2, y: 0 }, { x: w, y: h / 2 }, { x: w / 2, y: h }, { x: 0, y: h / 2 }];
    case "hexagon":
      return regularPolygon(w, h, 6);
    case "pentagon":
      return regularPolygon(w, h, 5);
    case "star":
      return star(w, h);
    case "arrow":
      return arrowShape(w, h);
    case "rectangle":
    case "line":
    default:
      return [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }];
  }
}

/** Outline polygon in world coordinates, clockwise (y-down). */
export function getWorldOutline(item: ConnectableItem): Vec[] {
  const center = getItemCenter(item);
  const rotation = item.rotation ?? 0;
  return getLocalOutline(item).map((p) => rotatePoint({ x: item.x + p.x, y: item.y + p.y }, center, rotation));
}

/** Axis-aligned bounds of the rotated item (AFFiNE's `getBoundWithRotation`). */
export function getRotatedBounds(item: ConnectableItem) {
  const center = getItemCenter(item);
  const corners = [
    { x: item.x, y: item.y },
    { x: item.x + item.w, y: item.y },
    { x: item.x + item.w, y: item.y + item.h },
    { x: item.x, y: item.y + item.h },
  ].map((p) => rotatePoint(p, center, item.rotation ?? 0));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
}

// ── polygon queries ─────────────────────────────────────────────────────────

/** Outward normal of the clockwise edge a→b (y-down screen coordinates). */
function edgeOutwardNormal(a: Vec, b: Vec): Vec {
  return vec.normalize({ x: b.y - a.y, y: -(b.x - a.x) });
}

function segmentIntersection(p1: Vec, p2: Vec, p3: Vec, p4: Vec): { point: Vec; t: number } | null {
  const d1 = vec.sub(p2, p1);
  const d2 = vec.sub(p4, p3);
  const denominator = d1.x * d2.y - d1.y * d2.x;
  if (Math.abs(denominator) < EPSILON) return null;
  const diff = vec.sub(p3, p1);
  const t = (diff.x * d2.y - diff.y * d2.x) / denominator;
  const u = (diff.x * d1.y - diff.y * d1.x) / denominator;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON) return null;
  return { point: vec.add(p1, vec.mul(d1, t)), t };
}

export function nearestPointOnSegment(point: Vec, a: Vec, b: Vec): Vec {
  const ab = vec.sub(b, a);
  const lengthSquared = vec.dot(ab, ab);
  if (lengthSquared < EPSILON) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, vec.dot(vec.sub(point, a), ab) / lengthSquared));
  return vec.add(a, vec.mul(ab, t));
}

/** Point-in-polygon (even-odd), world coordinates. */
export function polygonContainsPoint(polygon: Vec[], point: Vec): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function itemContainsPoint(item: ConnectableItem, point: Vec): boolean {
  return polygonContainsPoint(getWorldOutline(item), point);
}

/** Nearest point on the item's outline, with the outward normal there. */
export function getNearestOutlinePoint(item: ConnectableItem, point: Vec): ConnectionPoint & { distance: number } {
  const outline = getWorldOutline(item);
  let best: (ConnectionPoint & { distance: number }) | null = null;
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    const candidate = nearestPointOnSegment(point, a, b);
    const distance = vec.dist(candidate, point);
    if (!best || distance < best.distance) {
      best = { ...candidate, normal: edgeOutwardNormal(a, b), distance };
    }
  }
  return best!;
}

// ── relative positions ─────────────────────────────────────────────────────

/** World point → relative [0..1] position in the item's unrotated bounds. */
export function toRelativePosition(item: ConnectableItem, point: Vec): [number, number] {
  const local = rotatePoint(point, getItemCenter(item), -(item.rotation ?? 0));
  return [
    item.w > 0 ? (local.x - item.x) / item.w : 0.5,
    item.h > 0 ? (local.y - item.y) / item.h : 0.5,
  ];
}

/** Relative [0..1] position → world point (rotation applied). */
export function fromRelativePosition(item: ConnectableItem, position: [number, number]): Vec {
  return rotatePoint(
    { x: item.x + position[0] * item.w, y: item.y + position[1] * item.h },
    getItemCenter(item),
    item.rotation ?? 0,
  );
}

// ── anchors ────────────────────────────────────────────────────────────────

const ANCHOR_DIRECTIONS = [
  { name: "top", local: (w: number) => ({ x: w / 2, y: -ANCHOR_RAY_OVERSHOOT }) },
  { name: "right", local: (w: number, h: number) => ({ x: w + ANCHOR_RAY_OVERSHOOT, y: h / 2 }) },
  { name: "bottom", local: (w: number, h: number) => ({ x: w / 2, y: h + ANCHOR_RAY_OVERSHOOT }) },
  { name: "left", local: (_w: number, h: number) => ({ x: -ANCHOR_RAY_OVERSHOOT, y: h / 2 }) },
] as const;

export type ConnectorSide = (typeof ANCHOR_DIRECTIONS)[number]["name"];

/**
 * The four connection anchors (top, right, bottom, left): where a ray from
 * the centre through each side midpoint meets the real outline. For concave
 * outlines the outermost crossing is used.
 */
export function getConnectorAnchors(item: ConnectableItem): Array<ConnectorAnchorPoint & { side: ConnectorSide }> {
  const center = getItemCenter(item);
  const rotation = item.rotation ?? 0;
  const outline = getWorldOutline(item);
  const anchors: Array<ConnectorAnchorPoint & { side: ConnectorSide }> = [];

  for (const direction of ANCHOR_DIRECTIONS) {
    const local = direction.local(item.w, item.h);
    const rayEnd = rotatePoint({ x: item.x + local.x, y: item.y + local.y }, center, rotation);
    let hit: { point: Vec; t: number; normal: Vec } | null = null;
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i];
      const b = outline[(i + 1) % outline.length];
      const intersection = segmentIntersection(center, rayEnd, a, b);
      if (intersection && (!hit || intersection.t > hit.t)) {
        hit = { ...intersection, normal: edgeOutwardNormal(a, b) };
      }
    }
    // Degenerate outlines fall back to the bounding-box midpoint.
    const point = hit?.point ?? rotatePoint(
      { x: item.x + Math.min(Math.max(local.x, 0), item.w), y: item.y + Math.min(Math.max(local.y, 0), item.h) },
      center,
      rotation,
    );
    // At polygon vertices (diamond tips, triangle apex, star points) the edge
    // normal is ambiguous; use the ray direction there, which is the side's
    // outward direction.
    const rayDirection = vec.normalize(vec.sub(rayEnd, center));
    const normal = hit && !isNearVertex(hit.point, outline) ? hit.normal : rayDirection;
    anchors.push({ ...point, normal, position: toRelativePosition(item, point), side: direction.name });
  }

  return anchors;
}

function isNearVertex(point: Vec, outline: Vec[]) {
  return outline.some((vertex) => vec.dist(vertex, point) < 1e-6);
}

export function getNearestConnectorAnchorTo(item: ConnectableItem, point: Vec) {
  let best: (ConnectorAnchorPoint & { side: ConnectorSide; distance: number }) | null = null;
  for (const anchor of getConnectorAnchors(item)) {
    const distance = vec.dist(anchor, point);
    if (!best || distance < best.distance) best = { ...anchor, distance };
  }
  return best!;
}

// ── resolving connector ends ───────────────────────────────────────────────

/**
 * Resolve a stored connector end to a world point.
 * - Free end (no id): its absolute position, no normal.
 * - Attached with position: that relative point; the normal comes from the
 *   matching anchor when it sits on one, otherwise from the outline there.
 * - Attached without position: the anchor nearest to `towards`.
 * Returns null when the attached element is missing or the end is unusable.
 */
export function resolveConnectorEnd(
  end: ConnectorEnd,
  item: ConnectableItem | undefined,
  towards?: Vec,
): ConnectionPoint | null {
  if (!end.id) {
    return end.position ? { x: end.position[0], y: end.position[1], normal: null } : null;
  }
  if (!item) return null;

  if (end.position) {
    const point = fromRelativePosition(item, end.position);
    const anchor = getConnectorAnchors(item).find((candidate) => vec.dist(candidate, point) < 1e-6);
    if (anchor) return { x: anchor.x, y: anchor.y, normal: anchor.normal };
    const onOutline = getNearestOutlinePoint(item, point);
    const normal = onOutline.distance < 1
      ? onOutline.normal
      : vec.normalize(vec.sub(point, getItemCenter(item)));
    return { ...point, normal };
  }

  const anchor = getNearestConnectorAnchorTo(item, towards ?? getItemCenter(item));
  return { x: anchor.x, y: anchor.y, normal: anchor.normal };
}
