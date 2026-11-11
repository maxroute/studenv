import test from "node:test";
import assert from "node:assert/strict";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { createWorkspaceItem } from "@/types/workspace";

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
  assert.equal(duplicateConnector.props.sourceId, duplicateSource.id);
  assert.equal(duplicateConnector.props.targetId, duplicateTarget.id);
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
  assert.equal(pastedConnector.props.sourceId, pastedSource.id);
  assert.equal(pastedConnector.props.targetId, pastedTarget.id);
});
