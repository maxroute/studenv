import test from "node:test";
import assert from "node:assert/strict";
import {
  connectorIncludesPoint,
  connectorIntersectsRect,
  connectorMovesWithSelection,
  findConnectorAtPoint,
  getConnectorBounds,
  getItemSelectionBounds,
  translateFreeEnds,
} from "./connector-selection";
import { createWorkspaceItem, type ConnectorNode, type StudioItem } from "@/types/workspace";

const a = createWorkspaceItem("shape", { kind: "rectangle", w: 100, h: 100 }, { id: "a", x: 0, y: 0, zIndex: 1 })!;
const b = createWorkspaceItem("shape", { kind: "rectangle", w: 100, h: 100 }, { id: "b", x: 400, y: 0, zIndex: 2 })!;
const ab = createWorkspaceItem("connector", { source: { id: "a", position: [1, 0.5] }, target: { id: "b", position: [0, 0.5] }, mode: "straight" }, { id: "ab", x: 0, y: 0, zIndex: 3 }) as ConnectorNode;
const free = createWorkspaceItem("connector", { source: { position: [1000, 1000] }, target: { position: [1200, 1100] }, mode: "straight" }, { id: "free", x: 0, y: 0, zIndex: 4 }) as ConnectorNode;
const half = createWorkspaceItem("connector", { source: { id: "a", position: [0.5, 1] }, target: { position: [50, 400] }, mode: "straight" }, { id: "half", x: 0, y: 0, zIndex: 5 }) as ConnectorNode;
const items: StudioItem[] = [a, b, ab, free, half];

test("connector bounds come from the path, not the stored placeholder box", () => {
  assert.deepEqual(getConnectorBounds(ab, items), { x: 100, y: 50, w: 300, h: 0 });
  assert.deepEqual(getItemSelectionBounds(free, items), { x: 1000, y: 1000, w: 200, h: 100 });
  assert.deepEqual(getItemSelectionBounds(a, items), { x: 0, y: 0, w: 100, h: 100 });
});

test("a marquee over the origin no longer selects every connector", () => {
  const nearOrigin = { x: -10, y: -10, w: 20, h: 20 };
  assert.equal(connectorIntersectsRect(free, items, nearOrigin), false);
  assert.equal(connectorIntersectsRect(ab, items, nearOrigin), false);
  assert.equal(connectorIntersectsRect(ab, items, { x: 150, y: 0, w: 10, h: 100 }), false, "segments between sample points do not count (AFFiNE samples path points)");
  assert.equal(connectorIntersectsRect(ab, items, { x: 90, y: 40, w: 20, h: 20 }), true);
  assert.equal(connectorIntersectsRect(free, items, { x: 1150, y: 1050, w: 100, h: 100 }), true);
});

test("hit testing uses 8 world units plus half the stroke", () => {
  assert.equal(connectorIncludesPoint(ab, items, { x: 250, y: 58 }), true);
  assert.equal(connectorIncludesPoint(ab, items, { x: 250, y: 60 }), false);
});

test("the topmost connector under the point wins", () => {
  const over = createWorkspaceItem("connector", { source: { position: [100, 50] }, target: { position: [400, 50] }, mode: "straight" }, { id: "over", x: 0, y: 0, zIndex: 9 }) as ConnectorNode;
  assert.equal(findConnectorAtPoint([...items, over], { x: 250, y: 50 })?.id, "over");
  assert.equal(findConnectorAtPoint(items, { x: 250, y: 300 }), null);
});

test("connectors move with a drag only when all their attached elements are dragged too", () => {
  assert.equal(connectorMovesWithSelection(free, new Set(["free"])), true);
  assert.equal(connectorMovesWithSelection(half, new Set(["half"])), false);
  assert.equal(connectorMovesWithSelection(half, new Set(["half", "a"])), true);
  assert.equal(connectorMovesWithSelection(ab, new Set(["ab", "a"])), false);
});

test("translating a connector shifts only its free ends", () => {
  assert.deepEqual(translateFreeEnds(half.props, 10, -5), { source: { id: "a", position: [0.5, 1] }, target: { position: [60, 395] } });
  assert.deepEqual(translateFreeEnds(free.props, 1, 2), { source: { position: [1001, 1002] }, target: { position: [1201, 1102] } });
});

test("group moves translate items by position and free connector ends, never connector placeholders", async () => {
  const { snapshotGroupMove, groupMoveUpdates } = await import("./connector-selection");
  const snapshot = snapshotGroupMove(items, ["a", "free", "half", "ab"]);
  assert.deepEqual([...snapshot.positions.keys()], ["a"]);
  assert.deepEqual([...snapshot.connectors.keys()].sort(), ["free", "half"], "ab stays: b is not selected");
  const updates = groupMoveUpdates(snapshot, 10, 20);
  assert.deepEqual(updates.find((u) => u.id === "a"), { id: "a", changes: { x: 10, y: 20 } });
  const halfUpdate = updates.find((u) => u.id === "half");
  assert.ok(halfUpdate && "props" in halfUpdate);
  assert.deepEqual(halfUpdate.props, { source: { id: "a", position: [0.5, 1] }, target: { position: [60, 420] } });
});
