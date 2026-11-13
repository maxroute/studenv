import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceItem, parseWorkspaceSceneJson, serializeWorkspaceScene } from "@/types/workspace";
import { beginStroke, finishStroke, samplePressure, samplesToPoints, type PenSample } from "./pen-session";
import { buildDrawingFromWorldPoints } from "./stroke-builder";
import { coerceStrokePoints } from "./stroke-format";

const sample = (x: number, y: number, timeStamp: number, pressure = 0.5, pointerType = "pen"): PenSample => ({
  x, y, pressure, pointerType, timeStamp,
});

// ── sampling ───────────────────────────────────────────────────────────────

test("only real pen and touch pressure is kept", () => {
  assert.equal(samplePressure("mouse", 0.5), undefined, "mice report a constant pressure");
  assert.equal(samplePressure("pen", 0), undefined, "0 means unknown");
  assert.equal(samplePressure("touch", 0.3), 0.3);
  assert.equal(samplePressure("pen", Number.NaN), undefined);
});

test("each sample gets t in ms since the first sample, never going back", () => {
  const { clock, point } = beginStroke(sample(0, 0, 1000.4), 1_700_000_000_000.6);
  assert.deepEqual(point, { x: 0, y: 0, pressure: 0.5, t: 0 });
  assert.equal(clock.startedAt, 1_700_000_000_001);
  assert.equal(clock.pointerType, "pen");
  // Coalesced events: the last two share a timestamp, one arrives slightly out of order.
  const points = samplesToPoints([sample(1, 1, 1008.2), sample(2, 2, 1016.9), sample(3, 3, 1016.9), sample(4, 4, 1015)], clock, point);
  assert.deepEqual(points.map((p) => p.t), [8, 17, 17, 17]);
});

test("pen-up keeps the last real pressure and adds the up point only after movement", () => {
  const { clock, point } = beginStroke(sample(0, 0, 0, 0.4), 0);
  const moved = [point, ...samplesToPoints([sample(5, 5, 10, 0.7)], clock, point)];
  const finished = finishStroke(moved, sample(9, 9, 20, 0), clock);
  assert.deepEqual(finished[finished.length - 1], { x: 9, y: 9, pressure: 0.7, t: 20 });
  assert.equal(finishStroke(moved, sample(5, 5, 30, 0), clock).length, moved.length, "no duplicate point when the pen did not move");
  assert.deepEqual(finishStroke([], sample(1, 1, 1), clock), []);
});

test("mouse strokes carry no pressure, even at pointer-up", () => {
  const { clock, point } = beginStroke(sample(0, 0, 0, 0.5, "mouse"), 0);
  assert.equal(clock.pointerType, "mouse");
  const finished = finishStroke([point], sample(3, 4, 12, 0.5, "mouse"), clock);
  assert.deepEqual(finished, [{ x: 0, y: 0, t: 0 }, { x: 3, y: 4, t: 12 }]);
});

test("an unknown pointer type is not recorded", () => {
  assert.equal(beginStroke(sample(0, 0, 0, 0.5, "eye-tracker"), 0).clock.pointerType, undefined);
});

// ── stored format ──────────────────────────────────────────────────────────

test("a built drawing keeps t, startedAt and pointerType through save and load", () => {
  const points = [{ x: 10, y: 10, pressure: 0.5, t: 0 }, { x: 40, y: 30, pressure: 0.6, t: 16 }];
  const drawing = buildDrawingFromWorldPoints(points, "#111111", 3, { startedAt: 1_700_000_000_000, pointerType: "pen" });
  assert.deepEqual(drawing.points.map((p) => p.t), [0, 16]);
  assert.equal(drawing.points[0].x, 10 - drawing.x, "points are item-local");

  const item = createWorkspaceItem("drawing", drawing, { id: "d1", x: drawing.x, y: drawing.y, zIndex: 1 });
  assert.ok(item);
  const reloaded = parseWorkspaceSceneJson(serializeWorkspaceScene({ items: [item] })).items[0];
  assert.equal(reloaded.type, "drawing");
  if (reloaded.type !== "drawing") return;
  assert.deepEqual(reloaded.props.points, drawing.points);
  assert.equal(reloaded.props.startedAt, 1_700_000_000_000);
  assert.equal(reloaded.props.pointerType, "pen");
});

test("strokes saved before timestamps existed load unchanged", () => {
  const legacy = {
    format: "second-brain-workspace",
    version: 1,
    items: [{ id: "d1", type: "drawing", x: 0, y: 0, w: 10, h: 10, rotation: 0, zIndex: 1, props: { d: "M 0 0", points: [{ x: 1, y: 2, pressure: 0.5 }, { x: 3, y: 4 }] } }],
    workspaceAssetIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const [drawing] = parseWorkspaceSceneJson(JSON.stringify(legacy)).items;
  assert.equal(drawing.type, "drawing");
  if (drawing.type !== "drawing") return;
  assert.deepEqual(drawing.props.points, [{ x: 1, y: 2, pressure: 0.5 }, { x: 3, y: 4 }]);
  assert.equal(drawing.props.startedAt, undefined);
});

test("repair drops a bad t, never the point", () => {
  assert.deepEqual(
    coerceStrokePoints([
      { x: 0, y: 0, t: 0 },
      { x: 1, y: 1, t: 10 },
      { x: 2, y: 2, t: 5 }, // goes back
      { x: 3, y: 3, t: 12.5 }, // not an integer
      { x: 4, y: 4, t: -1 },
      { x: 5, y: 5, t: 20, pressure: 3 },
      { x: "6", y: 6 }, // no finite x: the point is dropped
    ]),
    [{ x: 0, y: 0, t: 0 }, { x: 1, y: 1, t: 10 }, { x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 5, pressure: 1, t: 20 }],
  );
  assert.equal(coerceStrokePoints("nope"), undefined);
  assert.equal(coerceStrokePoints([]), undefined);
});

test("a scene whose stroke needs repair keeps its timestamps", () => {
  const scene = {
    format: "second-brain-workspace",
    version: 1,
    items: [
      // `rotation: "x"` fails the strict parse and sends the drawing through repair.
      { id: "d1", type: "drawing", x: 0, y: 0, w: 10, h: 10, rotation: "x", zIndex: 1, props: { d: "M 0 0", outline: true, startedAt: 5, pointerType: "touch", points: [{ x: 1, y: 2, t: 0 }, { x: 3, y: 4, t: 9 }] } },
    ],
    workspaceAssetIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
  const [drawing] = parseWorkspaceSceneJson(JSON.stringify(scene)).items;
  assert.equal(drawing.type, "drawing");
  if (drawing.type !== "drawing") return;
  assert.deepEqual(drawing.props.points?.map((p) => p.t), [0, 9]);
  assert.equal(drawing.props.startedAt, 5);
  assert.equal(drawing.props.pointerType, "touch");
});
