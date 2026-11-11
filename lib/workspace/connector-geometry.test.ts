import test from "node:test";
import assert from "node:assert/strict";
import {
  getConnectorAnchorPoint,
  getConnectorArrowHead,
  getConnectorPath,
  getNearestConnectorAnchor,
  isConnectableWorkspaceItem,
} from "./connector-geometry";
import type { StudioItem } from "@/types/workspace";

const image: Extract<StudioItem, { type: "image" }> = {
  id: "image-1", type: "image", x: 10, y: 20, w: 100, h: 60, rotation: 0, zIndex: 1,
  props: { src: "https://example.com/image.png" },
};

test("returns the four edge-center anchors in world coordinates", () => {
  assert.deepEqual(getConnectorAnchorPoint(image, "top"), { x: 60, y: 20 });
  assert.deepEqual(getConnectorAnchorPoint(image as Exclude<StudioItem, { type: "connector" }>, "right"), { x: 110, y: 50 });
  assert.deepEqual(getConnectorAnchorPoint(image as Exclude<StudioItem, { type: "connector" }>, "bottom"), { x: 60, y: 80 });
  assert.deepEqual(getConnectorAnchorPoint(image as Exclude<StudioItem, { type: "connector" }>, "left"), { x: 10, y: 50 });
});

test("rotates anchors around the object's center", () => {
  const rotated = { ...image, rotation: 90 };
  const point = getConnectorAnchorPoint(rotated, "top");
  assert.ok(Math.abs(point.x - 90) < 0.000001);
  assert.ok(Math.abs(point.y - 70) < 0.000001);
});

test("chooses the nearest rotated anchor", () => {
  const candidate = getNearestConnectorAnchor(image as Exclude<StudioItem, { type: "connector" }>, { x: 108, y: 52 });
  assert.equal(candidate.anchor, "right");
  assert.ok(candidate.distance < 3);
});

test("connector paths and arrowheads use the supplied endpoints", () => {
  assert.equal(getConnectorPath({ x: 1, y: 2 }, { x: 30, y: 40 }), "M 1 2 L 30 40");
  assert.match(getConnectorArrowHead({ x: 1, y: 2 }, { x: 30, y: 40 }), /^M 30 40 L /);
});

test("only supported unlocked content nodes are connectable", () => {
  assert.equal(isConnectableWorkspaceItem(image), true);
  assert.equal(isConnectableWorkspaceItem({ ...image, type: "group", props: {} } as unknown as StudioItem), false);
  assert.equal(isConnectableWorkspaceItem({ ...image, type: "drawing", props: { d: "" } } as unknown as StudioItem), false);
  assert.equal(isConnectableWorkspaceItem({ ...image, type: "shape", props: { kind: "line" } } as unknown as StudioItem), false);
});
