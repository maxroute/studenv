import test from "node:test";
import assert from "node:assert/strict";
import {
  getEndDirections,
  getEndpointShape,
  getNearestPointOnRoute,
  getPointAtOffset,
  getRouteLength,
  routeIncludesPoint,
  routeToSvgPath,
} from "./connector-path";
import type { ConnectorRoute } from "./connector-routing";

const straight: ConnectorRoute = { mode: "straight", start: { x: 0, y: 0, normal: null }, end: { x: 100, y: 0, normal: null }, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
const elbow: ConnectorRoute = { mode: "elbow", start: { x: 0, y: 0, normal: null }, end: { x: 100, y: 100, normal: null }, points: [{ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 100 }] };
const curve: ConnectorRoute = { mode: "curve", start: { x: 0, y: 0, normal: { x: 1, y: 0 } }, end: { x: 300, y: 0, normal: { x: -1, y: 0 } }, points: [{ x: 0, y: 0 }, { x: 300, y: 0 }], controls: [{ x: 100, y: 0 }, { x: 200, y: 0 }] };

test("SVG paths per mode", () => {
  assert.equal(routeToSvgPath(straight), "M 0 0 L 100 0");
  assert.equal(routeToSvgPath(elbow), "M 0 0 L 50 0 L 50 100 L 100 100");
  assert.equal(routeToSvgPath(curve), "M 0 0 C 100 0 200 0 300 0");
});

test("length, point-at-offset and nearest point for every mode", () => {
  assert.equal(getRouteLength(straight), 100);
  assert.equal(getRouteLength(elbow), 200);
  assert.ok(Math.abs(getRouteLength(curve) - 300) < 0.01);
  assert.deepEqual(getPointAtOffset(elbow, 0.5), { x: 50, y: 50 });
  const mid = getPointAtOffset(curve, 0.5);
  assert.ok(Math.abs(mid.x - 150) < 0.5 && Math.abs(mid.y) < 1e-9);
  const nearest = getNearestPointOnRoute(elbow, { x: 60, y: 30 });
  assert.deepEqual(nearest.point, { x: 50, y: 30 });
  assert.equal(nearest.distance, 10);
  assert.ok(Math.abs(nearest.offset - 0.4) < 1e-9);
});

test("hit testing uses 8 world units plus half the stroke", () => {
  assert.equal(routeIncludesPoint(straight, { x: 50, y: 8.9 }, 2), true);
  assert.equal(routeIncludesPoint(straight, { x: 50, y: 9.1 }, 2), false);
  assert.equal(routeIncludesPoint(straight, { x: 50, y: 9.1 }, 4), true);
});

test("end directions point outward towards each tip", () => {
  assert.deepEqual(getEndDirections(elbow), { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } });
  assert.deepEqual(getEndDirections(curve), { start: { x: -1, y: 0 }, end: { x: 1, y: 0 } });
});

test("endpoint shapes follow AFFiNE sizes and orientation", () => {
  assert.equal(getEndpointShape("none", { x: 0, y: 0 }, { x: 1, y: 0 }, 2), null);

  const arrow = getEndpointShape("arrow", { x: 100, y: 0 }, { x: 1, y: 0 }, 2)!;
  assert.equal(arrow.filled, false);
  const arrowPts = [...arrow.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  assert.deepEqual(arrowPts[1], [100, 0], "tip");
  assert.ok(Math.abs(arrowPts[0][0] - (100 - 15 * Math.SQRT1_2)) < 1e-3, "15·w/2 at 45° behind the tip");

  const triangle = getEndpointShape("triangle", { x: 0, y: 0 }, { x: 0, y: 1 }, 4)!;
  assert.equal(triangle.filled, true);
  const triPts = [...triangle.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  assert.ok(Math.abs(triPts[0][1] - -30 * Math.cos(Math.PI / 6)) < 1e-3, "size 15·4/2 = 30 at ±30°");

  const diamond = getEndpointShape("diamond", { x: 0, y: 0 }, { x: 1, y: 0 }, 2)!;
  const diaPts = [...diamond.d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((m) => [+m[1], +m[2]]);
  assert.ok(Math.abs(diaPts[3][0] - -10 * Math.SQRT2) < 1e-3);

  const circle = getEndpointShape("circle", { x: 0, y: 0 }, { x: 1, y: 0 }, 2)!;
  assert.match(circle.d, /^M -10 0 A 5 5/, "radius 5·w/2, centred one radius behind the tip");
});
