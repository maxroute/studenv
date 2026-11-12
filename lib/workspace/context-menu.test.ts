import test from "node:test";
import assert from "node:assert/strict";
import {
  LongPressTracker,
  clampMenuPosition,
  isContextMenuKey,
  pasteOffsetForPoint,
  selectionCenter,
  selectionForContextMenu,
  supportsLockAndGroup,
} from "./context-menu";
import { createWorkspaceItem, type StudioItem } from "@/types/workspace";

const a = createWorkspaceItem("shape", { kind: "rectangle", w: 100, h: 100, groupId: "g1" }, { id: "a", x: 0, y: 0, zIndex: 1 })!;
const b = createWorkspaceItem("shape", { kind: "rectangle", w: 100, h: 100, groupId: "g1" }, { id: "b", x: 200, y: 0, zIndex: 2 })!;
const c = createWorkspaceItem("sticky", { text: "hi" }, { id: "c", x: 500, y: 300, zIndex: 3 })!;
const free = createWorkspaceItem("connector", { source: { position: [600, 600] }, target: { position: [700, 650] }, mode: "straight" }, { id: "free", x: 0, y: 0, zIndex: 4 })!;
const items: StudioItem[] = [a, b, c, free];

test("a still 1 s finger or pen press is a long-press; mouse never is", () => {
  const press = new LongPressTracker();
  assert.equal(press.down(1, "mouse", 10, 10), false);
  assert.equal(press.pending, false);

  assert.equal(press.down(2, "touch", 10, 10), true);
  press.move(2, 15, 14); // 6.4 px of jitter stays a press
  assert.deepEqual(press.fire(), { pointerId: 2, x: 15, y: 14 });
  assert.equal(press.pending, false, "fires once");

  assert.equal(press.down(3, "pen", 0, 0), true);
  assert.deepEqual(press.fire(), { pointerId: 3, x: 0, y: 0 });
});

test("moving more than 8 px, lifting, an OS cancel or a second pointer cancels", () => {
  const press = new LongPressTracker();
  press.down(1, "touch", 0, 0);
  press.move(1, 9, 0);
  assert.equal(press.fire(), null, "moved");

  press.down(1, "touch", 0, 0);
  press.end(1);
  assert.equal(press.fire(), null, "lifted early");

  press.down(1, "touch", 0, 0);
  assert.equal(press.down(2, "touch", 60, 0), false, "second finger does not start its own press");
  assert.equal(press.fire(), null, "second finger");

  press.down(1, "pen", 0, 0);
  press.move(7, 100, 100); // another pointer's movement is ignored
  press.end(7);
  assert.equal(press.pending, true);
  press.cancel();
  assert.equal(press.fire(), null, "cancelled");
});

test("Shift+F10 and the Menu key open the menu; other chords do not", () => {
  const key = (k: string, mods: Partial<{ shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) =>
    isContextMenuKey({ key: k, shiftKey: false, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  assert.equal(key("ContextMenu"), true);
  assert.equal(key("F10", { shiftKey: true }), true);
  assert.equal(key("F10"), false);
  assert.equal(key("F10", { shiftKey: true, ctrlKey: true }), false);
  assert.equal(key("ContextMenu", { metaKey: true }), false);
});

test("opening on a selected element keeps the selection; another element selects it with its group", () => {
  assert.deepEqual(selectionForContextMenu("c", ["c", "free"], items), ["c", "free"]);
  assert.deepEqual(selectionForContextMenu("c", ["a", "b"], items), ["c"]);
  assert.deepEqual(selectionForContextMenu("a", ["c"], items), ["a", "b"]);
  assert.deepEqual(selectionForContextMenu("free", [], items), ["free"]);
  assert.deepEqual(selectionForContextMenu("missing", ["c"], items), []);
});

test("lock and group are offered only for elements whose schema keeps them", () => {
  assert.equal(supportsLockAndGroup(a), true);
  assert.equal(supportsLockAndGroup(c), false);
  assert.equal(supportsLockAndGroup(free), false);
});

test("the menu flips and clamps to stay on screen", () => {
  const viewport = { w: 400, h: 300 };
  const menu = { w: 200, h: 150 };
  assert.deepEqual(clampMenuPosition({ x: 50, y: 50 }, menu, viewport), { x: 50, y: 50 });
  assert.deepEqual(clampMenuPosition({ x: 350, y: 250 }, menu, viewport), { x: 150, y: 100 }, "flips left and up");
  assert.deepEqual(clampMenuPosition({ x: 100, y: 100 }, { w: 390, h: 290 }, viewport), { x: 8, y: 8 }, "too big: pinned to the margin");
});

test("paste here moves the copied elements' top-left corner to the point", () => {
  assert.deepEqual(pasteOffsetForPoint([a, b], { x: 50, y: 70 }), { x: 50, y: 70 });
  assert.deepEqual(pasteOffsetForPoint([c, free], { x: 1000, y: 1000 }), { x: 500, y: 700 });
  assert.equal(pasteOffsetForPoint([], { x: 0, y: 0 }), undefined);
});

test("the keyboard menu anchors at the centre of the selection, connectors by their path", () => {
  assert.deepEqual(selectionCenter(["a", "b"], items), { x: 150, y: 50 });
  assert.deepEqual(selectionCenter(["free"], items), { x: 650, y: 625 });
  assert.equal(selectionCenter([], items), null);
});
