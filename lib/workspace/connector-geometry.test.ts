import test from "node:test";
import assert from "node:assert/strict";
import {
  getConnectorAnchorPoint,
  getNearestConnectorAnchor,
  getConnectorPath,
} from "./connector-geometry";

const node = {
  id: "node-a", type: "sticky" as const, x: 10, y: 20, w: 100, h: 80,
  rotation: 0, zIndex: 1, props: { text: "" },
};

test("computes the four unrotated edge anchors", () => {
  assert.deepEqual(getConnectorAnchorPoint(node, "top"), { x: 60, y: 20 });
  assert.deepEqual(getConnectorAnchorPoint(node, "right"), { x: 110, y: 60 });
  assert.deepEqual(getConnectorAnchorPoint(node, "bottom"), { x: 60, y: 100 });
  assert.deepEqual(getConnectorAnchorPoint(node, "left"), { x: 10, y: 60 });
});

test("rotates anchors around the node center", () => {
  const rotated = { ...node, rotation: 90 };
  const point = getConnectorAnchorPoint(rotated, "top");
  assert.ok(Math.abs(point.x - 100) < 1e-9);
  assert.ok(Math.abs(point.y - 60) < 1e-9);
});

test("chooses the nearest anchor and creates a straight path", () => {
  const nearest = getNearestConnectorAnchor(node, { x: 108, y: 59 });
  assert.equal(nearest.anchor, "right");
  assert.equal(getConnectorPath({ x: 1, y: 2 }, { x: 3, y: 4 }), "M 1 2 L 3 4");
});
