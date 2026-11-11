import test from "node:test";
import assert from "node:assert/strict";
import {
  AUTO_COMPLETE_MAIN_GAP,
  AUTO_COMPLETE_SECOND_GAP,
  getAutoCompletePositions,
  getConnectedBounds,
  getDropTargetPlacement,
  getNextAutoCompleteBound,
  getNextConnectorMode,
  readLastConnectorMode,
} from "./connector-autocomplete";
import { createWorkspaceItem, type StudioItem } from "@/types/workspace";

const source = { x: 100, y: 100, w: 120, h: 80 };

test("side positions pair each direction with the opposite side of the target", () => {
  assert.deepEqual(getAutoCompletePositions("right"), { start: [1, 0.5], end: [0, 0.5] });
  assert.deepEqual(getAutoCompletePositions("bottom"), { start: [0.5, 1], end: [0.5, 0] });
  assert.deepEqual(getAutoCompletePositions("left"), { start: [0, 0.5], end: [1, 0.5] });
  assert.deepEqual(getAutoCompletePositions("top"), { start: [0.5, 0], end: [0.5, 1] });
});

test("next object goes MAIN_GAP away in the arrow direction with the same size", () => {
  assert.deepEqual(getNextAutoCompleteBound("right", source, []), { x: 100 + 120 + AUTO_COMPLETE_MAIN_GAP, y: 100, w: 120, h: 80 });
  assert.deepEqual(getNextAutoCompleteBound("bottom", source, []), { x: 100, y: 100 + 80 + AUTO_COMPLETE_MAIN_GAP, w: 120, h: 80 });
  assert.deepEqual(getNextAutoCompleteBound("left", source, []), { x: 100 - 120 - AUTO_COMPLETE_MAIN_GAP, y: 100, w: 120, h: 80 });
  assert.deepEqual(getNextAutoCompleteBound("top", source, []), { x: 100, y: 100 - 80 - AUTO_COMPLETE_MAIN_GAP, w: 120, h: 80 });
});

test("rotation picks the screen direction the arrow actually points to", () => {
  // The right arrow of a shape rotated 90° points down.
  assert.deepEqual(getNextAutoCompleteBound("right", { ...source, rotation: 90 }, []), { x: 100, y: 280, w: 120, h: 80 });
});

test("occupied spots are skipped by stepping sideways, alternating up then down", () => {
  const first = getNextAutoCompleteBound("right", source, []);
  const up = getNextAutoCompleteBound("right", source, [first]);
  assert.deepEqual(up, { ...first, y: first.y - (80 + AUTO_COMPLETE_SECOND_GAP) });
  const down = getNextAutoCompleteBound("right", source, [first, up]);
  assert.deepEqual(down, { ...first, y: first.y + (80 + AUTO_COMPLETE_SECOND_GAP) });
});

test("connected bounds come from connectors in either direction", () => {
  const a = createWorkspaceItem("shape", { kind: "rectangle" }, { id: "a", x: 0, y: 0, zIndex: 1 })!;
  const b = createWorkspaceItem("shape", { kind: "rectangle" }, { id: "b", x: 300, y: 0, zIndex: 2 })!;
  const c = createWorkspaceItem("shape", { kind: "rectangle" }, { id: "c", x: 0, y: 300, zIndex: 3 })!;
  const ab = createWorkspaceItem("connector", { source: { id: "a", position: [1, 0.5] }, target: { id: "b", position: [0, 0.5] } }, { id: "ab", x: 0, y: 0, zIndex: 4 })!;
  const ca = createWorkspaceItem("connector", { source: { id: "c" }, target: { id: "a" } }, { id: "ca", x: 0, y: 0, zIndex: 5 })!;
  const items: StudioItem[] = [a, b, c, ab, ca];
  assert.deepEqual(getConnectedBounds("a", items).map((bound) => bound.x).sort((x, y) => x - y), [0, 300]);
  assert.deepEqual(getConnectedBounds("b", items).map((bound) => bound.x), [0]);
});

test("drop placement attaches the side facing the arriving connector", () => {
  const size = { w: 100, h: 60 };
  assert.deepEqual(getDropTargetPlacement({ x: 0, y: 0 }, { x: 200, y: 0 }, size), { bound: { x: 200, y: -30, w: 100, h: 60 }, position: [0, 0.5] });
  assert.deepEqual(getDropTargetPlacement({ x: 0, y: 0 }, { x: 0, y: 200 }, size), { bound: { x: -50, y: 200, w: 100, h: 60 }, position: [0.5, 0] });
  assert.deepEqual(getDropTargetPlacement({ x: 0, y: 0 }, { x: -200, y: 0 }, size), { bound: { x: -300, y: -30, w: 100, h: 60 }, position: [1, 0.5] });
  assert.deepEqual(getDropTargetPlacement({ x: 0, y: 0 }, { x: 0, y: -200 }, size), { bound: { x: -50, y: -260, w: 100, h: 60 }, position: [0.5, 1] });
});

test("C cycles curve → elbow → straight → curve; memory falls back safely without storage", () => {
  assert.equal(getNextConnectorMode("curve"), "elbow");
  assert.equal(getNextConnectorMode("elbow"), "straight");
  assert.equal(getNextConnectorMode("straight"), "curve");
  assert.equal(readLastConnectorMode("curve"), "curve");
});
