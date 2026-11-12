import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WORKSPACE_VIEWPORT,
  createWorkspaceItem,
  parseWorkspaceScene,
  serializeWorkspaceScene,
  type StudioItem,
} from "@/types/workspace";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { snapshotGroupMove } from "./connector-selection";
import {
  elementGroupId,
  groupSelection,
  isElementLocked,
  setElementsLocked,
  unlockedIds,
  withFreshGroupIds,
} from "./element-lock";

const meta = { locked: true, groupId: "g1" };
const everyType: StudioItem[] = [
  createWorkspaceItem("text", { text: "t", ...meta }, { id: "text", x: 0, y: 0, zIndex: 1 })!,
  createWorkspaceItem("free-text", { text: "f", ...meta }, { id: "free-text", x: 0, y: 0, zIndex: 2 })!,
  createWorkspaceItem("sticky", { text: "s", ...meta }, { id: "sticky", x: 0, y: 0, zIndex: 3 })!,
  createWorkspaceItem("pdf-page", { assetId: "a", pageNumber: 1, ...meta }, { id: "pdf-page", x: 0, y: 0, zIndex: 4 })!,
  createWorkspaceItem("pdf-fragment", { assetId: "a", pageNumber: 1, ...meta }, { id: "pdf-fragment", x: 0, y: 0, zIndex: 5 })!,
  createWorkspaceItem("video-anchor", { assetId: "a", startTimeMs: 0, ...meta }, { id: "video-anchor", x: 0, y: 0, zIndex: 6 })!,
  createWorkspaceItem("image", { src: "/x.png", ...meta }, { id: "image", x: 0, y: 0, zIndex: 7 })!,
  createWorkspaceItem("group", { ...meta }, { id: "group", x: 0, y: 0, zIndex: 8 })!,
  createWorkspaceItem("drawing", { d: "M0 0", ...meta }, { id: "drawing", x: 0, y: 0, zIndex: 9 })!,
  createWorkspaceItem("shape", { kind: "rectangle", ...meta }, { id: "shape", x: 0, y: 0, zIndex: 10 })!,
  createWorkspaceItem("connector", { source: { position: [0, 0] }, target: { position: [50, 0] }, ...meta }, { id: "connector", x: 0, y: 0, zIndex: 11 })!,
];

test("every element type keeps lock and group through save and reload", () => {
  assert.equal(everyType.length, 11);
  const reloaded = parseWorkspaceScene(JSON.parse(serializeWorkspaceScene({ items: everyType }))).items;
  assert.deepEqual(reloaded.map((item) => item.id), everyType.map((item) => item.id));
  for (const item of reloaded) {
    assert.equal(isElementLocked(item), true, item.type);
    assert.equal(elementGroupId(item), "g1", item.type);
  }
});

test("the legacy-repair parser keeps lock and group, and older snapshots gain nothing", () => {
  // The malformed node (string zIndex) fails the strict scene parse, so every
  // node goes through the per-type repair path.
  const legacy = {
    items: [
      { id: "s", type: "sticky", x: 0, y: 0, w: 10, h: 10, zIndex: 1, props: { text: "a", locked: true, groupId: "g2" } },
      { id: "d", type: "drawing", x: 0, y: 0, w: 10, h: 10, zIndex: "2", props: { d: "M0 0", locked: "yes", groupId: "" } },
    ],
  };
  const [sticky, drawing] = parseWorkspaceScene(legacy).items;
  assert.equal(isElementLocked(sticky), true);
  assert.equal(elementGroupId(sticky), "g2");
  assert.equal("locked" in drawing.props, false, "invalid lock values are dropped, not coerced");
  assert.equal("groupId" in drawing.props, false);

  const old = createWorkspaceItem("sticky", { text: "old" }, { id: "o", x: 0, y: 0, zIndex: 1 })!;
  assert.deepEqual(Object.keys(old.props).sort(), ["text"], "no new keys on snapshots that never had them");
});

test("locked elements are left out of edits; lock changes are one update", () => {
  const free = createWorkspaceItem("sticky", { text: "x" }, { id: "free", x: 0, y: 0, zIndex: 1 })!;
  const items = [free, everyType[2]];
  assert.deepEqual(unlockedIds(items, ["free", "sticky"]), ["free"]);

  const locked = setElementsLocked(items, ["free", "sticky"], true);
  assert.equal(locked.every(isElementLocked), true);
  assert.equal(locked[1], items[1], "already locked: unchanged object");
  const unlocked = setElementsLocked(locked, ["sticky"], false);
  assert.equal(isElementLocked(unlocked[1]), false);
  assert.equal(unlocked[0], locked[0]);
});

test("pressing a grouped element selects the whole group; copies form a new group", () => {
  const a = createWorkspaceItem("sticky", { text: "a", groupId: "g" }, { id: "a", x: 0, y: 0, zIndex: 1 })!;
  const b = createWorkspaceItem("connector", { source: { position: [0, 0] }, target: { position: [9, 9] }, groupId: "g" }, { id: "b", x: 0, y: 0, zIndex: 2 })!;
  const c = createWorkspaceItem("image", { src: "/c.png", groupId: "h" }, { id: "c", x: 0, y: 0, zIndex: 3 })!;
  const d = createWorkspaceItem("drawing", { d: "M0 0" }, { id: "d", x: 0, y: 0, zIndex: 4 })!;
  assert.deepEqual(groupSelection("b", [a, b, c, d]), ["b", "a"]);
  assert.deepEqual(groupSelection("d", [a, b, c, d]), ["d"]);
  assert.deepEqual(groupSelection("missing", [a]), []);

  let n = 0;
  const copies = withFreshGroupIds([a, b, c, d], () => `new-${(n += 1)}`);
  assert.deepEqual(copies.map(elementGroupId), ["new-1", "new-1", "new-2", undefined]);
  assert.equal(copies[3], d);
});

const store = () => useWorkspaceStore.getState();
function loadScene(items: StudioItem[]) {
  store().hydrateWorkspace({
    id: "ws-lock-test",
    title: "Test",
    sceneJson: serializeWorkspaceScene({ items, viewport: DEFAULT_WORKSPACE_VIEWPORT, workspaceAssetIds: [] }),
  });
}

test("store: delete and cut never remove locked elements", () => {
  const free = createWorkspaceItem("sticky", { text: "x" }, { id: "free", x: 0, y: 0, zIndex: 1 })!;
  const locked = createWorkspaceItem("image", { src: "/l.png", locked: true }, { id: "locked", x: 0, y: 0, zIndex: 2 })!;
  loadScene([free, locked]);
  store().removeItems(["free", "locked"]);
  assert.deepEqual(store().items.map((i) => i.id), ["locked"]);

  loadScene([free, locked]);
  store().cutItems(["free", "locked"]);
  assert.deepEqual(store().items.map((i) => i.id), ["locked"]);
  assert.deepEqual(store().copiedItems.map((i) => i.id), ["free"], "only what was removed goes to the clipboard");

  loadScene([locked]);
  store().cutItems(["locked"]);
  assert.deepEqual(store().items.map((i) => i.id), ["locked"]);
});

test("store: duplicating and pasting a group creates a separate group", () => {
  const a = createWorkspaceItem("sticky", { text: "a", groupId: "g" }, { id: "a", x: 0, y: 0, zIndex: 1 })!;
  const b = createWorkspaceItem("drawing", { d: "M0 0", groupId: "g" }, { id: "b", x: 50, y: 0, zIndex: 2 })!;
  loadScene([a, b]);
  store().duplicateItems(["a", "b"]);
  const dupGroups = new Set(store().items.slice(2).map(elementGroupId));
  assert.equal(dupGroups.size, 1);
  assert.notEqual([...dupGroups][0], "g");

  store().copyItems(["a", "b"]);
  store().pasteItems();
  const pastedGroups = new Set(store().items.slice(4).map(elementGroupId));
  assert.equal(pastedGroups.size, 1);
  assert.equal(pastedGroups.has("g") || [...pastedGroups].some((g) => dupGroups.has(g)), false);
  assert.deepEqual(store().items.slice(0, 2).map(elementGroupId), ["g", "g"], "originals keep their group");
});

test("a group drag leaves locked elements and locked connectors in place", () => {
  const free = createWorkspaceItem("sticky", { text: "x" }, { id: "free", x: 0, y: 0, zIndex: 1 })!;
  const locked = createWorkspaceItem("sticky", { text: "y", locked: true }, { id: "locked", x: 0, y: 0, zIndex: 2 })!;
  const line = createWorkspaceItem("connector", { source: { position: [0, 0] }, target: { position: [9, 9] }, locked: true }, { id: "line", x: 0, y: 0, zIndex: 3 })!;
  const moving = createWorkspaceItem("connector", { source: { position: [0, 0] }, target: { position: [9, 9] } }, { id: "moving", x: 0, y: 0, zIndex: 4 })!;
  const snapshot = snapshotGroupMove([free, locked, line, moving], ["free", "locked", "line", "moving"]);
  assert.deepEqual([...snapshot.positions.keys()], ["free"]);
  assert.deepEqual([...snapshot.connectors.keys()], ["moving"]);
});
