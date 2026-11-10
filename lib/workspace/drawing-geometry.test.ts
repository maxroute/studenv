import test from "node:test";
import assert from "node:assert/strict";
import {
  createStrokeOutline,
  getStrokeBounds,
  outlineToPath,
  strokeIntersectsPolyline,
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
  assert.ok(bounds.maxY - bounds.minY > 3);
  assert.ok(bounds.maxY - bounds.minY < 10);
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

test("pressureless mouse points remain supported", () => {
  const outline = createStrokeOutline([{ x: 0, y: 0 }, { x: 10, y: 10 }], 4);
  assert.ok(outline.length >= 4);
});
