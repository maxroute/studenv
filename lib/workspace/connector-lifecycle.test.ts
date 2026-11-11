import test from "node:test";
import assert from "node:assert/strict";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { createWorkspaceItem, createWorkspaceScene, parseWorkspaceSceneJson, serializeWorkspaceScene } from "@/types/workspace";

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
