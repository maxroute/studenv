import test from "node:test";
import assert from "node:assert/strict";
import { findConnectionTarget, ANCHOR_SNAP_SCREEN_PX } from "./connector-target";
import { getConnectorAnchors, type ConnectableItem } from "./connector-anchors";
import { createWorkspaceItem, type StudioItem } from "@/types/workspace";

function shape(id: string, kind: string, x: number, y: number, zIndex: number, rotation = 0, extra: Record<string, unknown> = {}) {
  const item = createWorkspaceItem("shape", { kind, w: 200, h: 100, rotation, ...extra }, { id, x, y, zIndex });
  assert.ok(item && item.type === "shape");
  return item as ConnectableItem;
}

const rect = shape("rect", "rectangle", 0, 0, 1);
const ellipse = shape("ellipse", "ellipse", 400, 0, 2);
const items: StudioItem[] = [rect, ellipse];

test("empty canvas yields a free end at the pointer", () => {
  const target = findConnectionTarget({ x: 1000, y: 1000 }, items, { zoom: 1 });
  assert.equal(target.kind, "free");
  assert.deepEqual(target.end, { position: [1000, 1000] });
  assert.equal(target.targetId, null);
  assert.equal(target.anchors.length, 0);
});

test("within 8 screen px of an anchor snaps to it, threshold scales with zoom", () => {
  const near = findConnectionTarget({ x: 206, y: 50 }, items, { zoom: 1 });
  assert.equal(near.kind, "anchor");
  assert.deepEqual(near.end, { id: "rect", position: [1, 0.5] });
  assert.equal(near.anchors.length, 4);

  // 6 world px away is 30 screen px at zoom 5 → no anchor snap; it is within
  // the outline threshold (8 world) so it attaches to the outline instead.
  const zoomedIn = findConnectionTarget({ x: 206, y: 40 }, items, { zoom: 5 });
  assert.equal(zoomedIn.kind, "outline");

  // At zoom 0.5, 8 world px is 4 screen px → anchor snap.
  const zoomedOut = findConnectionTarget({ x: 200 + ANCHOR_SNAP_SCREEN_PX, y: 50 }, items, { zoom: 0.5 });
  assert.equal(zoomedOut.kind, "anchor");

  // Candidates require the pointer inside the rotated bounds padded by 10
  // world units (AFFiNE `expand(10)`), regardless of zoom.
  const outsidePadding = findConnectionTarget({ x: 212, y: 50 }, items, { zoom: 0.5 });
  assert.equal(outsidePadding.kind, "free");
});

test("near the outline but away from anchors attaches to the exact outline point", () => {
  const target = findConnectionTarget({ x: 50, y: 3 }, items, { zoom: 1 });
  assert.equal(target.kind, "outline");
  assert.equal(target.end.id, "rect");
  assert.deepEqual(target.end.position!.map((v) => +v.toFixed(4)), [0.25, 0]);
  assert.deepEqual({ x: +target.point.x.toFixed(4), y: +target.point.y.toFixed(4) }, { x: 50, y: 0 });
});

test("inside an element away from the outline snaps to its nearest anchor", () => {
  const target = findConnectionTarget({ x: 160, y: 55 }, items, { zoom: 1 });
  assert.equal(target.kind, "anchor");
  assert.deepEqual(target.end, { id: "rect", position: [1, 0.5] });
});

test("the curved outline is used for ellipse targets", () => {
  // The bounding-box corner of the ellipse is far from its curve → anchor, not outline.
  const corner = findConnectionTarget({ x: 404, y: 4 }, items, { zoom: 1 });
  assert.equal(corner.kind, "anchor");
  const onCurve = findConnectionTarget({ x: 500 + 100 * Math.cos(Math.PI / 4), y: 50 - 50 * Math.sin(Math.PI / 4) - 3 }, items, { zoom: 1 });
  assert.equal(onCurve.kind, "outline");
});

test("rotated targets use rotated anchors", () => {
  const rotated = shape("rot", "rectangle", 0, 300, 3, 90);
  const anchors = getConnectorAnchors(rotated);
  const top = anchors.find((a) => a.side === "top")!;
  const target = findConnectionTarget({ x: top.x + 2, y: top.y + 2 }, [rotated], { zoom: 1 });
  assert.equal(target.kind, "anchor");
  assert.deepEqual(target.end, { id: "rot", position: [0.5, 0] });
});

test("excluded ids and non-connectable items are never targets", () => {
  assert.equal(findConnectionTarget({ x: 206, y: 50 }, items, { zoom: 1, excludeIds: ["rect"] }).kind, "free");
  const locked = shape("locked", "rectangle", 0, 0, 5, 0, { locked: true });
  const line = shape("line", "line", 0, 0, 6);
  assert.equal(findConnectionTarget({ x: 100, y: 50 }, [locked, line], { zoom: 1 }).kind, "free");
});

test("the topmost overlapping candidate wins when no anchor is within snap range", () => {
  const lower = shape("lower", "rectangle", 0, 0, 1);
  const upper = shape("upper", "rectangle", 50, 20, 9);
  const target = findConnectionTarget({ x: 140, y: 70 }, [lower, upper], { zoom: 1 });
  assert.equal(target.targetId, "upper");
});
