import test from "node:test";
import assert from "node:assert/strict";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { withoutOrphanConnectors } from "@/lib/workspace/connector-lifecycle";
import {
  CLIENT_OUTDATED_CODE,
  MIN_WORKSPACE_SCENE_CLIENT_BUILD,
  WORKSPACE_SCENE_CLIENT_BUILD,
  isClientBuildAccepted,
} from "@/lib/workspace/scene-compat";
import {
  createWorkspaceItem,
  parseWorkspaceSceneJson,
  serializeWorkspaceScene,
} from "@/types/workspace";

// A node type this build does not know, as a newer build would save it. The
// odd key order and nested values check that it is written back unchanged.
const FUTURE_NODE = {
  zIndex: 2,
  type: "timeline-card",
  id: "future-1",
  x: 400,
  y: 80,
  w: 320,
  h: 200,
  rotation: 0,
  props: { noteId: "n_123", preview: "v < c and E > 0", blocks: [{ id: "b1", kind: "para" }], extra: null },
};

function fixtureSceneJson() {
  const sticky = createWorkspaceItem("sticky", { text: "Known" }, { id: "sticky-1", x: 0, y: 0, zIndex: 1 })!;
  const connector = createWorkspaceItem(
    "connector",
    { source: { id: "sticky-1" }, target: { id: "future-1" } },
    { id: "connector-1", x: 0, y: 0, zIndex: 3 },
  )!;
  return JSON.stringify({
    format: "second-brain-workspace",
    version: 1,
    items: [sticky, FUTURE_NODE, connector],
    workspaceAssetIds: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

test("a node type this build does not know survives a load and save unchanged", () => {
  const scene = parseWorkspaceSceneJson(fixtureSceneJson());
  const saved = JSON.parse(serializeWorkspaceScene(scene));
  const kept = saved.items.find((item: { id: string }) => item.id === "future-1");
  assert.ok(kept, "the unknown node must not be dropped");
  assert.equal(JSON.stringify(kept), JSON.stringify(FUTURE_NODE));
  assert.deepEqual(
    saved.items.map((item: { id: string }) => item.id),
    ["sticky-1", "future-1", "connector-1"],
    "it keeps its place in the item list",
  );
});

test("unknown nodes are kept aside, not handed to the canvas", () => {
  const scene = parseWorkspaceSceneJson(fixtureSceneJson());
  assert.deepEqual(scene.items.map((item) => item.id), ["sticky-1", "connector-1"]);
  assert.deepEqual(scene.preservedItems.map((item) => [item.index, item.id]), [[1, "future-1"]]);
});

test("a connector attached to an unknown node is kept", () => {
  const scene = parseWorkspaceSceneJson(fixtureSceneJson());
  assert.ok(scene.items.some((item) => item.id === "connector-1"));
  const saved = JSON.parse(serializeWorkspaceScene(scene));
  assert.ok(saved.items.some((item: { id: string }) => item.id === "connector-1"));
});

test("connectors attached to an element that does not exist are still dropped", () => {
  const raw = JSON.parse(fixtureSceneJson());
  raw.items = raw.items.filter((item: { id: string }) => item.id !== "future-1");
  raw.items.push({ type: "mystery" }); // no id: malformed, not preserved
  const scene = parseWorkspaceSceneJson(JSON.stringify(raw));
  assert.deepEqual(scene.items.map((item) => item.id), ["sticky-1"]);
  assert.deepEqual(scene.preservedItems, []);
});

test("a known type that cannot be repaired is dropped, not preserved", () => {
  const raw = JSON.parse(fixtureSceneJson());
  raw.items.push({ id: "broken-pdf", type: "pdf-page", props: { pageNumber: 1 } });
  const scene = parseWorkspaceSceneJson(JSON.stringify(raw));
  assert.equal(scene.items.some((item) => item.id === "broken-pdf"), false);
  assert.equal(scene.preservedItems.some((item) => item.id === "broken-pdf"), false);
});

test("scenes with only known nodes serialise exactly as before", () => {
  const raw = JSON.parse(fixtureSceneJson());
  raw.items = raw.items.filter((item: { id: string }) => item.id === "sticky-1");
  const scene = parseWorkspaceSceneJson(JSON.stringify(raw));
  assert.deepEqual(scene.preservedItems, []);
  const { preservedItems: _ignored, ...plain } = scene;
  assert.equal(serializeWorkspaceScene(scene), serializeWorkspaceScene(plain));
});

test("orphan cleanup treats the given ids as existing elements", () => {
  const connector = createWorkspaceItem("connector", { source: { id: "a" }, target: { id: "b" } }, { x: 0, y: 0, zIndex: 1 })!;
  assert.deepEqual(withoutOrphanConnectors([connector]), []);
  assert.deepEqual(withoutOrphanConnectors([connector], ["a", "b"]), [connector]);
});

test("editing the canvas keeps unknown nodes and their connectors", () => {
  const scene = parseWorkspaceSceneJson(fixtureSceneJson());
  useWorkspaceStore.setState({ items: scene.items, preservedItems: scene.preservedItems, copiedItems: [] });
  useWorkspaceStore.getState().removeItem("sticky-1");
  const state = useWorkspaceStore.getState();
  assert.deepEqual(state.items, [], "the connector goes with the deleted sticky");
  assert.deepEqual(state.preservedItems.map((item) => item.id), ["future-1"]);

  useWorkspaceStore.setState({ items: scene.items, preservedItems: scene.preservedItems });
  useWorkspaceStore.getState().updateItem("sticky-1", { x: 50 });
  assert.ok(useWorkspaceStore.getState().items.some((item) => item.id === "connector-1"));
});

test("since note-card, saves from builds before it are refused and this build is accepted", () => {
  assert.equal(WORKSPACE_SCENE_CLIENT_BUILD >= MIN_WORKSPACE_SCENE_CLIENT_BUILD, true, "this build must accept its own saves");
  assert.equal(isClientBuildAccepted(WORKSPACE_SCENE_CLIENT_BUILD), true);
  assert.equal(isClientBuildAccepted(undefined), false, "builds without the check (build 1) must reload first");
  assert.equal(isClientBuildAccepted(1), false, "build 1 does not know note-card");
});

test("saves from builds below the minimum, or with a malformed build, are refused", () => {
  assert.equal(isClientBuildAccepted(1, 2), false);
  assert.equal(isClientBuildAccepted(undefined, 2), false, "builds without the check are build 1");
  assert.equal(isClientBuildAccepted(2, 2), true);
  for (const bad of [null, "2", 1.5, -1, Number.NaN]) {
    assert.equal(isClientBuildAccepted(bad), false, `rejects ${String(bad)}`);
  }
});

test("autosave sends the client build and stops after the server refuses an outdated build", async () => {
  const scene = parseWorkspaceSceneJson(fixtureSceneJson());
  const bodies: Array<{ sceneJson: string; clientBuild: number }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ error: "Refresh to keep editing.", code: CLIENT_OUTDATED_CODE }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    useWorkspaceStore.setState({
      workspaceId: "ws-1",
      items: scene.items,
      preservedItems: scene.preservedItems,
      isSaving: false,
      isDirty: true,
      saveBlocked: false,
    });
    await useWorkspaceStore.getState().syncWithServer();
    assert.equal(bodies.length, 1);
    assert.equal(bodies[0].clientBuild, WORKSPACE_SCENE_CLIENT_BUILD);
    assert.ok(JSON.parse(bodies[0].sceneJson).items.some((item: { id: string }) => item.id === "future-1"));

    const state = useWorkspaceStore.getState();
    assert.equal(state.saveBlocked, true);
    assert.equal(state.isDirty, true, "unsaved edits are not reported as saved");
    assert.equal(state.isSaving, false);

    await useWorkspaceStore.getState().syncWithServer();
    assert.equal(bodies.length, 1, "no further saves once blocked");
  } finally {
    globalThis.fetch = originalFetch;
    useWorkspaceStore.setState({ workspaceId: null, saveBlocked: false, isDirty: false });
  }
});
