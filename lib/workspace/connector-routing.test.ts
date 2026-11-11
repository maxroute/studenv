import test from "node:test";
import assert from "node:assert/strict";
import { computeConnectorRoute, getCurveControls, getElbowPath, mergeOrthogonalPath, __testing } from "./connector-routing";
import { getRotatedBounds, type ConnectableItem, type Vec } from "./connector-anchors";
import { createWorkspaceItem, type StudioItem } from "@/types/workspace";

function rect(id: string, x: number, y: number, w = 160, h = 100, rotation = 0, kind = "rectangle") {
  const item = createWorkspaceItem("shape", { kind, w, h, rotation }, { id, x, y, zIndex: 1 });
  assert.ok(item && item.type === "shape");
  return item as ConnectableItem;
}

const round = (points: Vec[]) => points.map((p) => [+p.x.toFixed(2), +p.y.toFixed(2)]);

function assertOrthogonal(points: Vec[], label: string) {
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    assert.ok(Math.abs(a.x - b.x) < 0.03 || Math.abs(a.y - b.y) < 0.03, `${label}: segment ${i} is not axis-aligned`);
  }
}

function assertAvoids(points: Vec[], items: ConnectableItem[], label: string) {
  for (const item of items) {
    const b = getRotatedBounds(item);
    for (let i = 1; i < points.length; i += 1) {
      assert.equal(__testing.segmentCrossesInterior(points[i - 1], points[i], b, 0.5), false, `${label}: segment ${i} crosses ${item.id}`);
    }
  }
}

test("straight route connects the resolved anchors", () => {
  const a = rect("a", 0, 0);
  const b = rect("b", 400, 0);
  const route = computeConnectorRoute({ mode: "straight", source: { id: "a", position: [1, 0.5] }, target: { id: "b", position: [0, 0.5] } }, [a, b]);
  assert.ok(route && route.mode === "straight");
  assert.deepEqual(round(route.points), [[160, 50], [400, 50]]);
});

test("auto-anchored ends pick the facing anchors", () => {
  const a = rect("a", 0, 0);
  const b = rect("b", 0, 400);
  const route = computeConnectorRoute({ mode: "straight", source: { id: "a" }, target: { id: "b" } }, [a, b]);
  assert.ok(route);
  assert.deepEqual(round(route.points), [[80, 100], [80, 400]]);
});

test("missing endpoint elements produce no route; free ends are allowed", () => {
  const a = rect("a", 0, 0);
  assert.equal(computeConnectorRoute({ mode: "curve", source: { id: "a", position: [1, 0.5] }, target: { id: "gone", position: [0, 0.5] } }, [a]), null);
  const free = computeConnectorRoute({ mode: "straight", source: { position: [5, 5] }, target: { position: [50, 60] } }, []);
  assert.ok(free);
  assert.deepEqual(round(free.points), [[5, 5], [50, 60]]);
});

test("curve handles follow the anchor normals with max(100, projection/3) length (AFFiNE)", () => {
  // Matches the live AFFiNE measurement: horizontal neighbours → out = [113, 0].
  const a = rect("a", -12, -187, 160, 100);
  const b = rect("b", 488, -27, 160, 100);
  const route = computeConnectorRoute({ mode: "curve", source: { id: "a", position: [1, 0.5] }, target: { id: "b", position: [0, 0.5] } }, [a, b]);
  assert.ok(route && route.mode === "curve");
  const [c1, c2] = route.controls;
  assert.deepEqual([+(c1.x - route.start.x).toFixed(3), +(c1.y - route.start.y).toFixed(3)], [113.333, 0]);
  assert.deepEqual([+(c2.x - route.end.x).toFixed(3), +(c2.y - route.end.y).toFixed(3)], [-113.333, 0]);

  const near = rect("near", 200, 0);
  const short = computeConnectorRoute({ mode: "curve", source: { id: "a", position: [1, 0.5] }, target: { id: "near", position: [0, 0.5] } }, [a, near]);
  assert.ok(short && short.mode === "curve");
  assert.equal(+(short.controls[0].x - short.start.x).toFixed(3), 100, "handles never shorter than 100");
});

test("free-to-free curves use 2/3 of the dominant axis", () => {
  assert.deepEqual(
    getCurveControls({ x: 0, y: 0, normal: null }, { x: 300, y: 60, normal: null }, false, false),
    [{ x: 200, y: 0 }, { x: 100, y: 60 }],
  );
  assert.deepEqual(
    getCurveControls({ x: 0, y: 0, normal: null }, { x: 30, y: 300, normal: null }, false, false),
    [{ x: 0, y: 200 }, { x: 30, y: 100 }],
  );
});

test("elbow route matches AFFiNE's H-V-H path with a mid-gap bend", () => {
  // Live AFFiNE: [148,-137] → [318,-137] → [318,23] → [488,23]
  const a = rect("a", -12, -187, 160, 100);
  const b = rect("b", 488, -27, 160, 100);
  const route = computeConnectorRoute({ mode: "elbow", source: { id: "a", position: [1, 0.5] }, target: { id: "b", position: [0, 0.5] } }, [a, b]);
  assert.ok(route && route.mode === "elbow");
  assert.deepEqual(round(route.points), [[148, -137], [318, -137], [318, 23], [488, 23]]);
});

test("aligned facing anchors give a straight elbow", () => {
  const a = rect("a", 0, 0);
  const b = rect("b", 400, 0);
  const route = computeConnectorRoute({ mode: "elbow", source: { id: "a", position: [1, 0.5] }, target: { id: "b", position: [0, 0.5] } }, [a, b]);
  assert.ok(route);
  assert.deepEqual(round(route.points), [[160, 50], [400, 50]]);
});

const SIDE_POSITIONS: Record<string, [number, number]> = { top: [0.5, 0], right: [1, 0.5], bottom: [0.5, 1], left: [0, 0.5] };

for (const [startSide, startPos] of Object.entries(SIDE_POSITIONS)) {
  for (const [endSide, endPos] of Object.entries(SIDE_POSITIONS)) {
    test(`elbow ${startSide} → ${endSide} is orthogonal, exits/enters perpendicular and avoids both objects`, () => {
      const a = rect("a", 0, 0);
      const b = rect("b", 420, 260);
      const items: StudioItem[] = [a, b];
      const route = computeConnectorRoute({ mode: "elbow", source: { id: "a", position: startPos }, target: { id: "b", position: endPos } }, items);
      assert.ok(route && route.mode === "elbow");
      const pts = route.points;
      assertOrthogonal(pts, `${startSide}->${endSide}`);
      assertAvoids(pts, [a, b], `${startSide}->${endSide}`);
      // First leg leaves along the start side's outward direction.
      const out = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] }[startSide]!;
      const first = { x: pts[1].x - pts[0].x, y: pts[1].y - pts[0].y };
      assert.ok(first.x * out[0] + first.y * out[1] > 0, `${startSide}->${endSide}: exits outward`);
      // Last leg arrives travelling into the end side.
      const into = { top: [0, 1], right: [-1, 0], bottom: [0, -1], left: [1, 0] }[endSide]!;
      const last = { x: pts[pts.length - 1].x - pts[pts.length - 2].x, y: pts[pts.length - 1].y - pts[pts.length - 2].y };
      assert.ok(last.x * into[0] + last.y * into[1] > 0, `${startSide}->${endSide}: enters inward`);
    });
  }
}

test("elbow routes handle rotated endpoint elements", () => {
  const a = rect("a", 0, 0, 160, 100, 30);
  const b = rect("b", 500, 300, 160, 100, 120);
  const route = computeConnectorRoute({ mode: "elbow", source: { id: "a", position: [1, 0.5] }, target: { id: "b", position: [0.5, 0] } }, [a, b]);
  assert.ok(route);
  assertOrthogonal(route.points.slice(1, -1), "rotated interior");
  assertAvoids(route.points.slice(1, -1), [a, b], "rotated");
});

test("overlapping elements connect directly", () => {
  const a = rect("a", 0, 0);
  const b = rect("b", 60, 40);
  const route = computeConnectorRoute({ mode: "elbow", source: { id: "a", position: [1, 0.5] }, target: { id: "b", position: [0, 0.5] } }, [a, b]);
  assert.ok(route);
  assert.ok(route.points.length <= 3);
  assertOrthogonal(route.points, "direct");
});

test("free-ended elbows stay orthogonal", () => {
  const a = rect("a", 0, 0);
  const route = computeConnectorRoute({ mode: "elbow", source: { id: "a", position: [0.5, 1] }, target: { position: [400, 300] } }, [a]);
  assert.ok(route);
  assertOrthogonal(route.points, "free end");
  assertAvoids(route.points, [a], "free end");
  const out = route.points[1];
  assert.ok(out.y > route.points[0].y, "exits downward from the bottom anchor");
});

test("exit offsets shrink to half the gap for close facing objects", () => {
  const [startOffset] = __testing.computeOffsets({ x: 0, y: 0, w: 100, h: 100 }, { x: 120, y: 0, w: 100, h: 100 });
  assert.equal(startOffset.right, 10);
  assert.equal(startOffset.left, 20);
});

test("mergeOrthogonalPath drops duplicates and collinear points", () => {
  assert.deepEqual(
    mergeOrthogonalPath([{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }]),
    [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }],
  );
});

test("getElbowPath without bounds degenerates to an L", () => {
  assert.deepEqual(round(getElbowPath({ x: 0, y: 0, normal: null }, { x: 100, y: 50, normal: null }, null, null)).length <= 3, true);
});
