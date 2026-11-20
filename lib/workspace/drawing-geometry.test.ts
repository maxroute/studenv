import test from "node:test";
import assert from "node:assert/strict";
import {
  createStrokeOutline,
  getStrokeBounds,
  outlineToPath,
  resampleStrokePoints,
  strokeIntersectsPolyline,
  strokeOutlineIntersectsPolyline,
} from "./drawing-geometry";
import { computeFreeTextResize, scaleBoundsFromHandle, scalePathData, scaleStrokeGeometry } from "./primitive-resize";

test("creates a closed, finite outline for a single tap", () => {
  const outline = createStrokeOutline([{ x: 4, y: 7, pressure: 0.6 }], 6);
  assert.ok(outline.length >= 3);
  assert.ok(outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.match(outlineToPath(outline), / Z$/);
});

test("pressure changes the visible stroke width", () => {
  const light = createStrokeOutline([{ x: 0, y: 0, pressure: 0.1 }, { x: 40, y: 0, pressure: 0.1 }], 10);
  const firm = createStrokeOutline([{ x: 0, y: 0, pressure: 1 }, { x: 40, y: 0, pressure: 1 }], 10);
  const lightBounds = getStrokeBounds(light);
  const firmBounds = getStrokeBounds(firm);
  assert.ok(firmBounds.maxY - firmBounds.minY > lightBounds.maxY - lightBounds.minY);
});

test("missing pen-up pressure preserves the last measured pressure", () => {
  const outline = createStrokeOutline([
    { x: 0, y: 0, pressure: 0.12 },
    { x: 20, y: 0, pressure: 0.9 },
    { x: 40, y: 0 },
  ], 10);
  const bounds = getStrokeBounds(outline);
  // The unpressured final sample must not trigger simulated pressure for the
  // complete stroke; the pressure variation remains visible in the outline.
  // perfect-freehand's thinning model can exceed baseWidth at high pressure.
  assert.ok(bounds.maxY - bounds.minY > 3);
  assert.ok(bounds.maxY - bounds.minY < 16);
});

test("eraser removes a stroke when paths cross", () => {
  assert.equal(
    strokeIntersectsPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: -20 }, { x: 50, y: 20 }], 2, 3),
    true,
  );
});

test("eraser does not hit a distant parallel stroke", () => {
  assert.equal(
    strokeIntersectsPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 0, y: 30 }, { x: 100, y: 30 }], 4, 3),
    false,
  );
});

test("eraser accounts for the visible stroke width", () => {
  assert.equal(
    strokeIntersectsPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }], [{ x: 50, y: 5 }], 1, 10),
    true,
  );
});

test("resampling never replaces missing pressure with a synthetic constant", () => {
  const samples = resampleStrokePoints([
    { x: 0, y: 0, pressure: 0.15 },
    { x: 10, y: 0 },
    { x: 20, y: 0, pressure: 0.9 },
  ], 2);
  assert.equal(samples[1].pressure, undefined);
  assert.equal(samples[samples.length - 1].pressure, 0.9);
  assert.equal(samples.some((point) => point.pressure === 0.5), false);
});

test("fully measured pressure remains smoothly interpolated", () => {
  const samples = resampleStrokePoints([
    { x: 0, y: 0, pressure: 0.2 },
    { x: 10, y: 0, pressure: 0.8 },
  ], 2);
  assert.ok(samples.some((point) => point.pressure !== undefined && point.pressure > 0.2 && point.pressure < 0.8));
});

test("pressureless mouse points remain supported", () => {
  const outline = createStrokeOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }], 4);
  assert.ok(outline.length >= 4);
});

test("eraser hits the visible edge of a pressure-thickened stroke", () => {
  const outline = createStrokeOutline([
    { x: 0, y: 0, pressure: 1 },
    { x: 100, y: 0, pressure: 1 },
  ], 20);
  const bounds = getStrokeBounds(outline);
  // Use the actual vertex that defines the upper bound. The outline can taper,
  // so the global minY need not occur at the horizontal midpoint (x = 50).
  const upperEdgeVertex = outline.find((point) => point.y === bounds.minY);
  assert.ok(upperEdgeVertex, "expected a vertex at the upper stroke boundary");
  const visibleEdgePoint = { x: upperEdgeVertex.x, y: upperEdgeVertex.y - 0.5 };
  assert.equal(strokeOutlineIntersectsPolyline(outline, [visibleEdgePoint], 1), true);
});

test("eraser does not hit a stroke outside its visible outline", () => {
  const outline = createStrokeOutline([
    { x: 0, y: 0, pressure: 0.5 },
    { x: 100, y: 0, pressure: 0.5 },
  ], 8);
  const bounds = getStrokeBounds(outline);
  assert.equal(
    strokeOutlineIntersectsPolyline(outline, [{ x: 50, y: bounds.minY - 20 }], 2),
    false,
  );
});

test("scales a stroke's path and points from their start geometry", () => {
  const outline = createStrokeOutline([{ x: 2, y: 2 }, { x: 40, y: 10 }], 4);
  const start = { d: outlineToPath(outline), points: [{ x: 2, y: 2, pressure: 0.5, t: 0 }, { x: 40, y: 10, t: 16 }] };
  const scaled = scaleStrokeGeometry(start, 2, 3);
  assert.ok(scaled);
  assert.deepEqual(scaled.points, [{ x: 4, y: 6, pressure: 0.5, t: 0 }, { x: 80, y: 30, t: 16 }]);
  assert.match(scaled.d, /^M .* Z$/);
  // Scaling back by the inverse returns the original geometry.
  const back = scaleStrokeGeometry(scaled, 0.5, 1 / 3);
  assert.ok(back);
  const a = start.d.match(/-?\d*\.?\d+/g)!.map(Number);
  const b = back.d.match(/-?\d*\.?\d+/g)!.map(Number);
  assert.equal(a.length, b.length);
  a.forEach((value, index) => assert.ok(Math.abs(value - b[index]) < 1e-9));
});

test("stroke scaling refuses paths it cannot scale safely", () => {
  assert.equal(scalePathData("M 0 0 l 5 5", 2, 2), null);
  assert.equal(scalePathData("M 0 0 H 5", 2, 2), null);
  assert.equal(scaleStrokeGeometry({ d: "M 0 0 L 5 5" }, 0, 1), null);
  assert.equal(scalePathData("M 0 0 L 5 -5", 2, 3), "M 0 0 L 10 -15");
});

test("free text scales its font and keeps the opposite corner fixed", () => {
  const start = { x: 100, y: 100, w: 80, h: 40 };
  const grown = computeFreeTextResize("se", start, 28, 80, 0);
  assert.ok(grown);
  assert.equal(grown.fontSize, 56);
  assert.deepEqual(grown.bounds, { x: 100, y: 100, w: 160, h: 80 });

  const fromNw = computeFreeTextResize("nw", start, 28, -80, 0);
  assert.ok(fromNw);
  assert.equal(fromNw.fontSize, 56);
  assert.deepEqual(fromNw.bounds, { x: 20, y: 60, w: 160, h: 80 });
});

test("free text resize is corner-only and clamps the font size", () => {
  const start = { x: 0, y: 0, w: 80, h: 40 };
  assert.equal(computeFreeTextResize("e", start, 28, 40, 0), null);
  const tiny = computeFreeTextResize("se", start, 28, -1000, -1000);
  assert.ok(tiny);
  assert.equal(tiny.fontSize, 8);
  const huge = computeFreeTextResize("se", start, 28, 100000, 0);
  assert.ok(huge);
  assert.equal(huge.fontSize, 400);
});

test("scaling about a corner of a rotated box keeps that corner fixed in world space", () => {
  const start = { x: 0, y: 0, w: 100, h: 50 };
  const rotation = 90;
  const corner = (b: { x: number; y: number; w: number; h: number }, lx: number, ly: number) => {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const rad = (rotation * Math.PI) / 180;
    return { x: cx + lx * Math.cos(rad) - ly * Math.sin(rad), y: cy + lx * Math.sin(rad) + ly * Math.cos(rad) };
  };
  const next = scaleBoundsFromHandle("se", start, 2, rotation);
  const before = corner(start, -start.w / 2, -start.h / 2);
  const after = corner(next, -next.w / 2, -next.h / 2);
  assert.ok(Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9);
});
