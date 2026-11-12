import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_WORKSPACE_VIEWPORT, createWorkspaceItem, serializeWorkspaceScene, type StudioItem } from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { WorkspaceHistory, sameItems } from "./workspace-history";

const rect = (x: number) => createWorkspaceItem("shape", { kind: "rectangle", w: 100, h: 100 }, { id: "r", x, y: 0, zIndex: 1 }) as StudioItem;
const s0 = [rect(0)];
const s1 = [rect(10)];
const s2 = [rect(20)];

test("changes inside one capture group undo as a single step", () => {
  const h = new WorkspaceHistory();
  h.record(s0); // drag start
  h.record(s1); // later moves of the same drag are ignored
  assert.equal(h.undo(s2), s0);
  assert.equal(h.canUndo, false);
  assert.equal(h.redo(s0), s2);
});

test("a capture break starts a new step and a new change clears redo", () => {
  const h = new WorkspaceHistory();
  h.record(s0);
  h.breakCapture(s1);
  h.record(s1);
  assert.equal(h.undo(s2), s1);
  h.record(s1);
  assert.equal(h.canRedo, false);
});

test("a step that ends where it started (cancelled gesture) is dropped", () => {
  const h = new WorkspaceHistory();
  h.record(s0);
  h.breakCapture([rect(0)]);
  assert.equal(h.canUndo, false);
  assert.equal(sameItems(s0, [rect(0)]), true);
  assert.equal(sameItems(s0, s1), false);
});

test("history is bounded and resettable", () => {
  const h = new WorkspaceHistory(2);
  for (const s of [s0, s1, s2]) {
    h.record(s);
    h.breakCapture([rect(99)]);
  }
  assert.equal(h.undo([rect(99)]), s2);
  assert.equal(h.undo(s2), s1);
  assert.equal(h.undo(s1), null);
  h.reset();
  assert.equal(h.canRedo, false);
});

// ── Store integration ─────────────────────────────────────────────────────

const store = () => useWorkspaceStore.getState();
const xOf = () => store().items[0]?.x;

function loadScene(items: StudioItem[]) {
  store().hydrateWorkspace({
    id: "ws-test",
    title: "Test",
    sceneJson: serializeWorkspaceScene({ items, viewport: DEFAULT_WORKSPACE_VIEWPORT, workspaceAssetIds: [] }),
  });
}

test("store: a whole drag is one undo step and redo restores it", () => {
  loadScene([rect(0)]);
  store().breakHistoryCapture(); // pointerdown
  store().updateItem("r", { x: 5 });
  store().updateItem("r", { x: 10 });
  assert.equal(store().canUndo, true);
  store().breakHistoryCapture(); // next pointerdown
  assert.equal(store().undo(), true);
  assert.equal(xOf(), 0);
  assert.equal(store().canUndo, false);
  assert.equal(store().canRedo, true);
  assert.equal(store().redo(), true);
  assert.equal(xOf(), 10);
});

test("store: add, delete and keyboard steps undo in order", () => {
  loadScene([rect(0)]);
  store().breakHistoryCapture();
  const id = store().addItem("shape", { kind: "ellipse", w: 50, h: 50 }, { x: 200, y: 0 });
  assert.ok(id);
  store().breakHistoryCapture();
  store().removeItems(["r"]);
  store().undo();
  assert.deepEqual(store().items.map((i) => i.id).sort(), [id, "r"].sort());
  store().undo();
  assert.deepEqual(store().items.map((i) => i.id), ["r"]);
});

test("store: derived layout updates neither add a step nor clear redo", () => {
  loadScene([rect(0)]);
  store().breakHistoryCapture();
  store().updateItem("r", { x: 10 });
  store().undo();
  store().updateItem("r", { w: 120 }, { recordHistory: false });
  assert.equal(store().canRedo, true);
  store().undo();
  assert.equal(store().items[0]?.w, 120);
});

test("store: a no-op update or a cancelled gesture does not create a step", () => {
  loadScene([rect(0)]);
  store().breakHistoryCapture();
  store().updateItem("r", { x: 10 });
  store().undo();
  store().updateItem("r", { x: 0 }); // same value
  assert.equal(store().canRedo, true);
  store().breakHistoryCapture();
  store().updateItem("r", { x: 40 }); // drag …
  store().updateItem("r", { x: 0 }); // … cancelled back to the start
  store().breakHistoryCapture();
  assert.equal(store().canUndo, false);
});

test("store: loading a workspace resets history", () => {
  loadScene([rect(0)]);
  store().breakHistoryCapture();
  store().updateItem("r", { x: 10 });
  loadScene([rect(0)]);
  assert.equal(store().canUndo, false);
  assert.equal(store().undo(), false);
});
