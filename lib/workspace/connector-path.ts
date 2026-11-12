// ---------------------------------------------------------------------------
// Connector path utilities — SVG output, sampling, hit testing, end shapes
// ---------------------------------------------------------------------------

import type { ConnectorEndpointStyle } from "@/types/workspace";
import { nearestPointOnSegment, vec, type Vec } from "./connector-anchors";
import type { ConnectorRoute } from "./connector-routing";

const CURVE_SAMPLES = 64;

function cubicPoint(p0: Vec, c1: Vec, c2: Vec, p3: Vec, t: number): Vec {
  const mt = 1 - t;
  const a = mt * mt * mt;
  const b = 3 * mt * mt * t;
  const c = 3 * mt * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y };
}

export function routeToSvgPath(route: ConnectorRoute): string {
  const f = (n: number) => +n.toFixed(3);
  if (route.mode === "curve") {
    const [p0, p3] = route.points;
    const [c1, c2] = route.controls;
    return `M ${f(p0.x)} ${f(p0.y)} C ${f(c1.x)} ${f(c1.y)} ${f(c2.x)} ${f(c2.y)} ${f(p3.x)} ${f(p3.y)}`;
  }
  return route.points.map((p, i) => `${i === 0 ? "M" : "L"} ${f(p.x)} ${f(p.y)}`).join(" ");
}

/** Polyline approximation used for length, label placement and hit tests. */
export function sampleRoute(route: ConnectorRoute): Vec[] {
  if (route.mode !== "curve") return route.points.map((p) => ({ x: p.x, y: p.y }));
  const [p0, p3] = route.points;
  const [c1, c2] = route.controls;
  const samples: Vec[] = [];
  for (let i = 0; i <= CURVE_SAMPLES; i += 1) samples.push(cubicPoint(p0, c1, c2, p3, i / CURVE_SAMPLES));
  return samples;
}

function polylineLength(points: Vec[]) {
  let length = 0;
  for (let i = 1; i < points.length; i += 1) length += vec.dist(points[i - 1], points[i]);
  return length;
}

export function getRouteLength(route: ConnectorRoute) {
  return polylineLength(sampleRoute(route));
}

/** Point at fraction `offset` (0..1) of the path length. */
export function getPointAtOffset(route: ConnectorRoute, offset: number): Vec {
  const points = sampleRoute(route);
  const total = polylineLength(points);
  if (total === 0) return { ...points[0] };
  let remaining = Math.min(1, Math.max(0, offset)) * total;
  for (let i = 1; i < points.length; i += 1) {
    const segment = vec.dist(points[i - 1], points[i]);
    if (remaining <= segment) {
      const t = segment === 0 ? 0 : remaining / segment;
      return vec.add(points[i - 1], vec.mul(vec.sub(points[i], points[i - 1]), t));
    }
    remaining -= segment;
  }
  return { ...points[points.length - 1] };
}

/** Nearest point on the path, its distance, and its fraction along the path. */
export function getNearestPointOnRoute(route: ConnectorRoute, point: Vec): { point: Vec; distance: number; offset: number } {
  const points = sampleRoute(route);
  const total = polylineLength(points);
  let best = { point: { ...points[0] }, distance: vec.dist(points[0], point), offset: 0 };
  let travelled = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const candidate = nearestPointOnSegment(point, a, b);
    const distance = vec.dist(candidate, point);
    if (distance < best.distance) {
      best = { point: candidate, distance, offset: total === 0 ? 0 : (travelled + vec.dist(a, candidate)) / total };
    }
    travelled += vec.dist(a, b);
  }
  return best;
}

/** AFFiNE hit test: within 8 world units (plus half the stroke when requested). */
export function routeIncludesPoint(route: ConnectorRoute, point: Vec, strokeWidth: number, includeStroke = true) {
  return getNearestPointOnRoute(route, point).distance < (includeStroke ? strokeWidth / 2 : 0) + 8;
}

/**
 * Unit vectors pointing outward along the path at each end (from the path
 * towards the tip), used to orient endpoint shapes.
 */
export function getEndDirections(route: ConnectorRoute): { start: Vec; end: Vec } {
  const [p0, p3] = [route.points[0], route.points[route.points.length - 1]];
  if (route.mode === "curve") {
    const [c1, c2] = route.controls;
    const startInto = vec.dist(c1, p0) > 1e-6 ? c1 : vec.dist(c2, p0) > 1e-6 ? c2 : p3;
    const endFrom = vec.dist(c2, p3) > 1e-6 ? c2 : vec.dist(c1, p3) > 1e-6 ? c1 : p0;
    return { start: vec.normalize(vec.sub(p0, startInto)), end: vec.normalize(vec.sub(p3, endFrom)) };
  }
  const second = route.points[1];
  const penultimate = route.points[route.points.length - 2];
  return { start: vec.normalize(vec.sub(p0, second)), end: vec.normalize(vec.sub(p3, penultimate)) };
}

// ── endpoint shapes (sizes follow AFFiNE's renderer) ──────────────────────

export const ENDPOINT_ARROW_SIZE = 15;

export type EndpointShape = { d: string; filled: boolean };

function rotate(v: Vec, radians: number): Vec {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
}

function polyline(points: Vec[], close: boolean) {
  const f = (n: number) => +n.toFixed(3);
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"} ${f(p.x)} ${f(p.y)}`).join(" ")}${close ? " Z" : ""}`;
}

/**
 * SVG geometry for an endpoint marker at `tip`. `outward` points from the
 * path towards the tip. Arrow = open chevron (±45°, 15·w/2); Triangle =
 * filled (±30°, 15·w/2); Circle = filled (r 5·w/2, centred behind the tip);
 * Diamond = filled (10·w/2).
 */
export function getEndpointShape(style: ConnectorEndpointStyle, tip: Vec, outward: Vec, strokeWidth: number): EndpointShape | null {
  const back = vec.mul(vec.normalize(outward), -1);
  const scale = strokeWidth / 2;
  switch (style) {
    case "none":
      return null;
    case "arrow": {
      const size = ENDPOINT_ARROW_SIZE * scale;
      return {
        d: polyline([vec.add(tip, vec.mul(rotate(back, Math.PI / 4), size)), tip, vec.add(tip, vec.mul(rotate(back, -Math.PI / 4), size))], false),
        filled: false,
      };
    }
    case "triangle": {
      const size = ENDPOINT_ARROW_SIZE * scale;
      return {
        d: polyline([vec.add(tip, vec.mul(rotate(back, Math.PI / 6), size)), tip, vec.add(tip, vec.mul(rotate(back, -Math.PI / 6), size))], true),
        filled: true,
      };
    }
    case "diamond": {
      const size = 10 * scale;
      return {
        d: polyline([
          vec.add(tip, vec.mul(rotate(back, Math.PI / 4), size)),
          tip,
          vec.add(tip, vec.mul(rotate(back, -Math.PI / 4), size)),
          vec.add(tip, vec.mul(back, size * Math.SQRT2)),
        ], true),
        filled: true,
      };
    }
    case "circle": {
      const r = 5 * scale;
      const c = vec.add(tip, vec.mul(back, r));
      const f = (n: number) => +n.toFixed(3);
      return {
        d: `M ${f(c.x - r)} ${f(c.y)} A ${f(r)} ${f(r)} 0 1 0 ${f(c.x + r)} ${f(c.y)} A ${f(r)} ${f(r)} 0 1 0 ${f(c.x - r)} ${f(c.y)} Z`,
        filled: true,
      };
    }
    default:
      return null;
  }
}
