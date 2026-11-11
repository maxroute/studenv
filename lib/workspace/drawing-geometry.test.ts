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

  // Locate the actual upper outline edge around the middle of the stroke.
  // The global minY can occur near a tapered endpoint, so it is not a
  // reliable way to construct a point beside the edge at x=50.
  const edgeSegments = outline.map((point, index) => {
    const next = outline[(index + 1) % outline.length];
    return {
      midpoint: { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 },
    };
  }).filter(({ midpoint }) => midpoint.x >= 30 && midpoint.x <= 70);
  assert.ok(edgeSegments.length > 0, "expected an upper outline edge near the stroke midpoint");
  const edge = edgeSegments.reduce((best, candidate) =>
    candidate.midpoint.y < best.midpoint.y ? candidate : best
  );
  const center = outline.reduce(
    (sum, point) => ({ x: sum.x + point.x / outline.length, y: sum.y + point.y / outline.length }),
    { x: 0, y: 0 },
  );
  const outward = {
    x: edge.midpoint.x - center.x,
    y: edge.midpoint.y - center.y,
  };
  const length = Math.hypot(outward.x, outward.y) || 1;
  const visibleEdgePoint = {
    x: edge.midpoint.x + (outward.x / length) * 0.5,
    y: edge.midpoint.y + (outward.y / length) * 0.5,
  };

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
