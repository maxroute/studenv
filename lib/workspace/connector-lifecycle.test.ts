import test from "node:test";
import assert from "node:assert/strict";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { createWorkspaceItem, createWorkspaceScene, parseWorkspaceSceneJson, serializeWorkspaceScene, type StudioItem } from "@/types/workspace";

function fixture() {
  const source = createWorkspaceItem("image", { src: "https://example.com/source.png" }, { x: 20, y: 30, zIndex: 1 })!;
  const target = createWorkspaceItem("sticky", { text: "Target" }, { x: 320, y: 30, zIndex: 2 })!;
  const connector = createWorkspaceItem("connector", {
    sourceId: source.id,
    sourceAnchor: "right",
    targetId: target.id,
    targetAnchor: "left",
  }, { x: 0, y: 0, zIndex: 3 })!;
  return { source, target, connector };
}

test("removing either endpoint removes its attached connector", () => {
  const { source, target, connector } = fixture();
  useWorkspaceStore.setState({ items: [source, target, connector], copiedItems: [] });
  useWorkspaceStore.getState().removeItem(source.id);
  const items = useWorkspaceStore.getState().items;
  assert.equal(items.some((item) => item.id === source.id), false);
  assert.equal(items.some((item) => item.id === connector.id), false);
  assert.equal(items.some((item) => item.id === target.id), true);
});

test("duplicate remaps connector endpoints to the duplicated nodes", () => {
  const { source, target, connector } = fixture();
  useWorkspaceStore.setState({ items: [source, target, connector], copiedItems: [] });
  useWorkspaceStore.getState().duplicateItems([source.id, target.id]);
  const items = useWorkspaceStore.getState().items;
  const duplicateSource = items.find((item) => item.type === "image" && item.id !== source.id);
  const duplicateTarget = items.find((item) => item.type === "sticky" && item.id !== target.id);
  const duplicateConnector = items.find((item) => item.type === "connector" && item.id !== connector.id);
  assert.ok(duplicateSource && duplicateTarget);
  assert.ok(duplicateConnector && duplicateConnector.type === "connector");
  assert.deepEqual(duplicateConnector.props.source, { id: duplicateSource.id, position: [1, 0.5] });
  assert.deepEqual(duplicateConnector.props.target, { id: duplicateTarget.id, position: [0, 0.5] });
});

test("copy and paste preserve a connection only between pasted endpoints", () => {
  const { source, target, connector } = fixture();
  useWorkspaceStore.setState({ items: [source, target, connector], copiedItems: [] });
  useWorkspaceStore.getState().copyItems([source.id, target.id]);
  assert.equal(useWorkspaceStore.getState().copiedItems.filter((item) => item.type === "connector").length, 1);
  useWorkspaceStore.getState().pasteItems();
  const items = useWorkspaceStore.getState().items;
  const pastedSource = items.find((item) => item.type === "image" && item.id !== source.id);
  const pastedTarget = items.find((item) => item.type === "sticky" && item.id !== target.id);
  const pastedConnector = items.find((item) => item.type === "connector" && item.id !== connector.id);
  assert.ok(pastedSource && pastedTarget);
  assert.ok(pastedConnector && pastedConnector.type === "connector");
  assert.deepEqual(pastedConnector.props.source, { id: pastedSource.id, position: [1, 0.5] });
  assert.deepEqual(pastedConnector.props.target, { id: pastedTarget.id, position: [0, 0.5] });
});

function v2Fixture() {
  const node = createWorkspaceItem("shape", { kind: "rectangle" }, { x: 0, y: 0, zIndex: 1 })!;
  const other = createWorkspaceItem("sticky", { text: "" }, { x: 400, y: 0, zIndex: 2 })!;
  const halfFree = createWorkspaceItem("connector", {
    source: { id: node.id, position: [1, 0.5] },
    target: { position: [300, 200] },
    mode: "elbow",
  }, { x: 0, y: 0, zIndex: 3 })!;
  const toOther = createWorkspaceItem("connector", {
    source: { id: node.id, position: [0.5, 1] },
    target: { id: other.id, position: [0, 0.5] },
  }, { x: 0, y: 0, zIndex: 4 })!;
  return { node, other, halfFree, toOther };
}

test("a connector with a free end travels with its single attached node and its free end shifts", () => {
  const { node, other, halfFree, toOther } = v2Fixture();
  useWorkspaceStore.setState({ items: [node, other, halfFree, toOther], copiedItems: [] });
  useWorkspaceStore.getState().duplicateItems([node.id]);
  const items = useWorkspaceStore.getState().items;
  const dupNode = items.find((item) => item.type === "shape" && item.id !== node.id)!;
  const dupConnectors = items.filter((item) => item.type === "connector" && item.id !== halfFree.id && item.id !== toOther.id);
  assert.equal(dupConnectors.length, 1, "only the connector whose attached ends are all duplicated travels");
  const dup = dupConnectors[0];
  assert.ok(dup.type === "connector");
  assert.deepEqual(dup.props.source, { id: dupNode.id, position: [1, 0.5] });
  assert.deepEqual(dup.props.target, { position: [330, 230] }, "free end shifted by the duplicate offset");
  assert.equal(dup.props.mode, "elbow");
});

test("paste shifts free ends by the paste offset", () => {
  const { node, other, halfFree, toOther } = v2Fixture();
  useWorkspaceStore.setState({ items: [node, other, halfFree, toOther], copiedItems: [] });
  useWorkspaceStore.getState().copyItems([node.id]);
  useWorkspaceStore.getState().pasteItems({ x: 100, y: 50 });
  const pasted = useWorkspaceStore.getState().items.filter((item) => item.type === "connector" && item.id !== halfFree.id && item.id !== toOther.id);
  assert.equal(pasted.length, 1);
  assert.ok(pasted[0].type === "connector");
  assert.deepEqual(pasted[0].props.target, { position: [400, 250] });
});

test("deleting a node removes every connector attached to it, including half-free ones", () => {
  const { node, other, halfFree, toOther } = v2Fixture();
  useWorkspaceStore.setState({ items: [node, other, halfFree, toOther], copiedItems: [] });
  useWorkspaceStore.getState().removeItems([node.id]);
  const ids = useWorkspaceStore.getState().items.map((item) => item.id);
  assert.deepEqual(ids, [other.id]);
});

test("v2 connectors round-trip through scene serialization with styles and label", () => {
  const { node, other } = v2Fixture();
  const connector = createWorkspaceItem("connector", {
    source: { id: node.id, position: [0.25, 0] },
    target: { id: other.id },
    mode: "curve",
    color: "#ff0000",
    strokeWidth: 6,
    strokeStyle: "dash",
    frontEndpointStyle: "diamond",
    rearEndpointStyle: "circle",
    label: { text: "depends on", offset: 0.3 },
  }, { x: 0, y: 0, zIndex: 5 })!;
  const restored = parseWorkspaceSceneJson(serializeWorkspaceScene(createWorkspaceScene({ items: [node, other, connector] })));
  const back = restored.items.find((item) => item.id === connector.id);
  assert.ok(back && back.type === "connector");
  assert.deepEqual(back.props, connector.type === "connector" ? connector.props : null);
  assert.equal(back.props.mode, "curve");
  assert.deepEqual(back.props.target, { id: other.id });
});

test("an unusable connector is dropped without discarding the rest of the scene", () => {
  const { node } = v2Fixture();
  const scene = createWorkspaceScene({ items: [node] });
  const raw = JSON.parse(serializeWorkspaceScene(scene));
  raw.items.push({ id: "broken", type: "connector", x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 9, props: { source: {}, target: { position: [1, 2] } } });
  const restored = parseWorkspaceSceneJson(JSON.stringify(raw));
  assert.deepEqual(restored.items.map((item) => item.id), [node.id]);
});

test("a directly selected free connector can be duplicated and copied on its own", () => {
  const free = createWorkspaceItem("connector", { source: { position: [0, 0] }, target: { position: [100, 50] } }, { id: "free-only", x: 0, y: 0, zIndex: 1 })!;
  useWorkspaceStore.setState({ items: [free], copiedItems: [] });
  useWorkspaceStore.getState().duplicateItems([free.id]);
  const dup = useWorkspaceStore.getState().items.find((item) => item.id !== free.id);
  assert.ok(dup && dup.type === "connector");
  assert.deepEqual(dup.props.source, { position: [30, 30] });
  assert.deepEqual(dup.props.target, { position: [130, 80] });

  useWorkspaceStore.setState({ items: [free], copiedItems: [] });
  useWorkspaceStore.getState().copyItems([free.id]);
  assert.equal(useWorkspaceStore.getState().copiedItems.length, 1);
});

test("a selected connector whose attached element is not selected is not copied alone", () => {
  const { node, other, toOther } = v2Fixture();
  useWorkspaceStore.setState({ items: [node, other, toOther], copiedItems: [] });
  useWorkspaceStore.getState().copyItems([toOther.id, node.id]);
  assert.equal(useWorkspaceStore.getState().copiedItems.filter((item) => item.type === "connector").length, 0);
  useWorkspaceStore.getState().copyItems([toOther.id, node.id, other.id]);
  assert.equal(useWorkspaceStore.getState().copiedItems.filter((item) => item.type === "connector").length, 1);
});

// ── Stage 6: history, orphan cleanup and reload integrity ─────────────────

function hydrate(items: ReturnType<typeof createWorkspaceItem>[]) {
  useWorkspaceStore.getState().hydrateWorkspace({
    id: "ws-lifecycle",
    title: "Lifecycle",
    sceneJson: serializeWorkspaceScene({ items: items.filter((item): item is StudioItem => item !== null) }),
  });
}
const itemIds = () => useWorkspaceStore.getState().items.map((item) => item.id).sort();

test("a deletion that bypasses removeItems (eraser, asset removal) still drops attached connectors", () => {
  const { node, other, halfFree, toOther } = v2Fixture();
  const free = createWorkspaceItem("connector", { source: { position: [0, 0] }, target: { position: [9, 9] } }, { id: "free", x: 0, y: 0, zIndex: 9 })!;
  hydrate([node, other, halfFree, toOther, free]);
  const store = useWorkspaceStore.getState();
  store.breakHistoryCapture();
  store.updateItems(store.items.filter((item) => item.id !== node.id));
  assert.deepEqual(itemIds(), [other.id, "free"].sort());
});

test("undoing a cascade delete restores the element and its connectors in one step", () => {
  const { node, other, halfFree, toOther } = v2Fixture();
  hydrate([node, other, halfFree, toOther]);
  const before = itemIds();
  useWorkspaceStore.getState().breakHistoryCapture();
  useWorkspaceStore.getState().removeItems([node.id]);
  assert.equal(useWorkspaceStore.getState().undo(), true);
  assert.deepEqual(itemIds(), before);
  assert.equal(useWorkspaceStore.getState().canUndo, false);
});

test("duplicate, paste and cut with connectors are each one undo step; the clipboard survives undoing a cut", () => {
  const { node, other, toOther } = v2Fixture();
  hydrate([node, other, toOther]);
  const original = itemIds();
  const s = () => useWorkspaceStore.getState();

  s().breakHistoryCapture();
  s().duplicateItems([node.id, other.id]);
  assert.equal(s().items.length, 6);
  s().breakHistoryCapture();
  s().undo();
  assert.deepEqual(itemIds(), original);

  s().breakHistoryCapture();
  s().cutItems([node.id, other.id]);
  assert.equal(s().items.length, 0);
  s().breakHistoryCapture();
  s().undo();
  assert.deepEqual(itemIds(), original);
  assert.equal(s().copiedItems.filter((item) => item.type === "connector").length, 1);

  s().breakHistoryCapture();
  s().pasteItems();
  assert.equal(s().items.length, 6);
  s().breakHistoryCapture();
  s().undo();
  assert.deepEqual(itemIds(), original);
  s().redo();
  assert.equal(s().items.length, 6);
});

/** Save and reload as the app does it: client serialize → snapshot route → workspace GET → client parse. */
function saveAndReload(items: ReturnType<typeof createWorkspaceItem>[]) {
  const clientJson = serializeWorkspaceScene({ items: items.filter((item): item is StudioItem => item !== null) });
  const storedJson = serializeWorkspaceScene(parseWorkspaceSceneJson(clientJson));
  const loadedJson = serializeWorkspaceScene(parseWorkspaceSceneJson(storedJson));
  return { clientJson, loadedJson, scene: parseWorkspaceSceneJson(loadedJson) };
}

test("reload keeps every connector mode, style, label and free end exactly, and is stable", () => {
  const { node, other } = v2Fixture();
  const connectors = (["straight", "elbow", "curve"] as const).map((mode, index) =>
    createWorkspaceItem("connector", {
      source: { id: node.id, position: [1, 0.5] },
      target: index === 2 ? { position: [500, -40] } : { id: other.id },
      mode,
      color: "#123456",
      strokeWidth: 5,
      strokeStyle: "dash",
      frontEndpointStyle: "circle",
      rearEndpointStyle: "triangle",
      label: { text: `label ${mode}`, offset: index / 2 },
    }, { id: `c-${mode}`, x: 0, y: 0, zIndex: 10 + index }),
  );
  const { clientJson, loadedJson } = saveAndReload([node, other, ...connectors]);
  assert.equal(loadedJson, clientJson);
  assert.equal(saveAndReload(parseWorkspaceSceneJson(loadedJson).items).loadedJson, loadedJson);
});

test("reload migrates a v1 connector once and keeps it stable afterwards", () => {
  const { node, other } = v2Fixture();
  const raw = JSON.parse(serializeWorkspaceScene({ items: [node, other] }));
  raw.items.push({
    id: "legacy", type: "connector", x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 9,
    props: { sourceId: node.id, sourceAnchor: "right", targetId: other.id, targetAnchor: "left" },
  });
  const first = serializeWorkspaceScene(parseWorkspaceSceneJson(JSON.stringify(raw)));
  const legacy = parseWorkspaceSceneJson(first).items.find((item) => item.id === "legacy");
  assert.ok(legacy && legacy.type === "connector");
  assert.deepEqual(legacy.props.source, { id: node.id, position: [1, 0.5] });
  assert.deepEqual(legacy.props.target, { id: other.id, position: [0, 0.5] });
  assert.equal(legacy.props.mode, "straight");
  assert.equal(serializeWorkspaceScene(parseWorkspaceSceneJson(first)), first);
});

test("loading a saved scene drops connectors attached to a missing element", () => {
  const { node, other, halfFree, toOther } = v2Fixture();
  // Saved before the cascade fix: `node` was erased but its connectors stayed.
  const valid = JSON.parse(serializeWorkspaceScene({ items: [node, other, halfFree, toOther] }));
  valid.items = valid.items.filter((item: { id: string }) => item.id !== node.id);
  assert.deepEqual(parseWorkspaceSceneJson(JSON.stringify(valid)).items.map((item) => item.id), [other.id]);

  // Same through the lenient path (a legacy item forces per-node parsing).
  valid.items.push({ id: "v1", type: "connector", x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 9, props: { sourceId: other.id, targetId: "gone" } });
  assert.deepEqual(parseWorkspaceSceneJson(JSON.stringify(valid)).items.map((item) => item.id), [other.id]);
});
