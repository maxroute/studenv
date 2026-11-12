import test from "node:test";
import assert from "node:assert/strict";
import {
  fromRelativePosition,
  getConnectorAnchors,
  getLocalOutline,
  getNearestOutlinePoint,
  getRotatedBounds,
  itemContainsPoint,
  resolveConnectorEnd,
  toRelativePosition,
  type ConnectableItem,
  type Vec,
} from "./connector-anchors";
import { getShapePath } from "./shape-paths";
import { createWorkspaceItem, type WorkspaceNodeType } from "@/types/workspace";
import type { ShapeKind } from "./shape-types";

const EPS = 1e-6;

function close(actual: Vec, expected: Vec, label: string, eps = EPS) {
  assert.ok(
    Math.abs(actual.x - expected.x) < eps && Math.abs(actual.y - expected.y) < eps,
    `${label}: expected (${expected.x}, ${expected.y}), got (${actual.x}, ${actual.y})`,
  );
}

function shape(kind: ShapeKind, rotation = 0, w = 200, h = 100): ConnectableItem {
  const item = createWorkspaceItem("shape", { kind, w, h, rotation }, { id: `shape-${kind}`, x: 100, y: 50, zIndex: 1 });
  assert.ok(item && item.type === "shape");
  return item;
}

function node(type: WorkspaceNodeType, props: Record<string, unknown>, rotation = 0): ConnectableItem {
  const item = createWorkspaceItem(type, { ...props, w: 200, h: 100, rotation }, { id: `${type}-1`, x: 100, y: 50, zIndex: 1 });
  assert.ok(item && item.type !== "connector");
  return item as ConnectableItem;
}

const side = (item: ConnectableItem, name: string) => getConnectorAnchors(item).find((a) => a.side === name)!;

test("polygon outlines match the vertices drawn by getShapePath", () => {
  for (const kind of ["rectangle", "triangle", "diamond", "hexagon", "pentagon", "star", "arrow"] as ShapeKind[]) {
    const item = shape(kind);
    const d = getShapePath(kind, item.w, item.h, 0);
    const drawn = [...d.matchAll(/(-?\d+(?:\.\d+)?(?:e-?\d+)?) (-?\d+(?:\.\d+)?(?:e-?\d+)?)/g)].map((m) => ({ x: +m[1], y: +m[2] }));
    const outline = getLocalOutline(item);
    assert.equal(outline.length, drawn.length, `${kind} vertex count`);
    outline.forEach((p, i) => close(p, drawn[i], `${kind} vertex ${i}`, 1e-6));
  }
});

test("rectangle-like items anchor at their side midpoints with outward normals", () => {
  for (const item of [
    shape("rectangle"),
    node("sticky", { text: "" }),
    node("image", { src: "https://example.com/a.png" }),
    node("free-text", { text: "x" }),
    node("pdf-fragment", { assetId: "a", pageNumber: 1 }),
    node("video-anchor", { assetId: "v", startTimeMs: 0 }),
  ]) {
    close(side(item, "top"), { x: 200, y: 50 }, `${item.type} top`);
    close(side(item, "right"), { x: 300, y: 100 }, `${item.type} right`);
    close(side(item, "bottom"), { x: 200, y: 150 }, `${item.type} bottom`);
    close(side(item, "left"), { x: 100, y: 100 }, `${item.type} left`);
    close(side(item, "top").normal, { x: 0, y: -1 }, `${item.type} top normal`);
    close(side(item, "right").normal, { x: 1, y: 0 }, `${item.type} right normal`);
    assert.deepEqual(side(item, "left").position, [0, 0.5]);
  }
});

test("ellipse and circle anchors sit on the curved outline, not the bounding box", () => {
  close(side(shape("ellipse"), "right"), { x: 300, y: 100 }, "ellipse right");
  close(side(shape("ellipse"), "top"), { x: 200, y: 50 }, "ellipse top");
  // A circle in a 200x100 box has radius 50 centred at (200,100).
  close(side(shape("circle"), "right"), { x: 250, y: 100 }, "circle right");
  close(side(shape("circle"), "left"), { x: 150, y: 100 }, "circle left");
  assert.deepEqual(side(shape("circle"), "right").position.map((v) => +v.toFixed(6)), [0.75, 0.5]);
});

test("triangle side anchors land on the slanted edges at 0.25 / 0.75 (AFFiNE triangle locations)", () => {
  const triangle = shape("triangle");
  close(side(triangle, "top"), { x: 200, y: 50 }, "apex");
  close(side(triangle, "right"), { x: 250, y: 100 }, "right slant");
  close(side(triangle, "left"), { x: 150, y: 100 }, "left slant");
  close(side(triangle, "bottom"), { x: 200, y: 150 }, "base");
  const rightNormal = side(triangle, "right").normal;
  assert.ok(rightNormal.x > 0 && rightNormal.y < 0, "right slant normal points up-right");
});

test("diamond and star anchors use the outermost outline crossing", () => {
  close(side(shape("diamond"), "right"), { x: 300, y: 100 }, "diamond right tip");
  close(side(shape("diamond"), "right").normal, { x: 1, y: 0 }, "diamond tip normal");
  const starTop = side(shape("star", 0, 200, 200), "top");
  close(starTop, { x: 200, y: 50 }, "star top point");
});

for (const rotation of [0, 45, 90, 180]) {
  test(`anchors rotate with the item at ${rotation}°`, () => {
    for (const kind of ["rectangle", "ellipse", "triangle", "diamond", "hexagon"] as ShapeKind[]) {
      const base = shape(kind, 0);
      const rotated = shape(kind, rotation);
      const center = { x: 200, y: 100 };
      const r = (rotation * Math.PI) / 180;
      for (const name of ["top", "right", "bottom", "left"]) {
        const a = side(base, name);
        const expected = {
          x: center.x + (a.x - center.x) * Math.cos(r) - (a.y - center.y) * Math.sin(r),
          y: center.y + (a.x - center.x) * Math.sin(r) + (a.y - center.y) * Math.cos(r),
        };
        close(side(rotated, name), expected, `${kind} ${name}`);
        assert.deepEqual(
          side(rotated, name).position.map((v) => +v.toFixed(6)),
          a.position.map((v) => +v.toFixed(6)),
          `${kind} ${name} relative position is rotation-independent`,
        );
      }
    }
  });
}

test("relative positions round-trip through rotation", () => {
  const item = shape("rectangle", 37);
  for (const position of [[0, 0], [1, 0.5], [0.3, 0.9]] as [number, number][]) {
    const back = toRelativePosition(item, fromRelativePosition(item, position));
    assert.ok(Math.abs(back[0] - position[0]) < EPS && Math.abs(back[1] - position[1]) < EPS);
  }
});

test("nearest outline point, containment and rotated bounds", () => {
  const ellipse = shape("ellipse");
  const near = getNearestOutlinePoint(ellipse, { x: 320, y: 100 });
  assert.ok(Math.abs(near.x - 300) < 0.5 && Math.abs(near.distance - 20) < 0.5);
  assert.equal(itemContainsPoint(ellipse, { x: 200, y: 100 }), true);
  assert.equal(itemContainsPoint(ellipse, { x: 105, y: 55 }), false, "bounding-box corner is outside an ellipse");
  const bounds = getRotatedBounds(shape("rectangle", 90));
  assert.ok(Math.abs(bounds.w - 100) < EPS && Math.abs(bounds.h - 200) < EPS);
});

test("resolveConnectorEnd handles free, positioned and auto-anchored ends", () => {
  const item = shape("rectangle", 90);
  assert.deepEqual(resolveConnectorEnd({ position: [5, 6] }, undefined), { x: 5, y: 6, normal: null });
  assert.equal(resolveConnectorEnd({ id: "missing", position: [1, 0.5] }, undefined), null);
  const right = resolveConnectorEnd({ id: item.id, position: [1, 0.5] }, item)!;
  close(right, side(item, "right"), "positioned end resolves to the rotated anchor");
  close(right.normal!, side(item, "right").normal, "anchor normal");
  const auto = resolveConnectorEnd({ id: item.id }, item, { x: 200, y: -500 })!;
  close(auto, getConnectorAnchors(item).reduce((best, a) => (Math.hypot(a.x - 200, a.y + 500) < Math.hypot(best.x - 200, best.y + 500) ? a : best)), "auto end picks the anchor nearest the other end");
});
