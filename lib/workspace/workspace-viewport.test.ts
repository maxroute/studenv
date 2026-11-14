import test from "node:test";
import assert from "node:assert/strict";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";

test("reporting the same viewport (the canvas does this on mount) does not mark the workspace unsaved", () => {
  useWorkspaceStore.setState({ viewport: { x: 10, y: 20, zoom: 1.5 }, isDirty: false });
  useWorkspaceStore.getState().updateViewport({ x: 10, y: 20, zoom: 1.5 });
  assert.equal(useWorkspaceStore.getState().isDirty, false);
});

test("a real pan or zoom still marks the workspace unsaved", () => {
  useWorkspaceStore.setState({ viewport: { x: 10, y: 20, zoom: 1.5 }, isDirty: false });
  useWorkspaceStore.getState().updateViewport({ x: 11, y: 20, zoom: 1.5 });
  assert.equal(useWorkspaceStore.getState().isDirty, true);
  useWorkspaceStore.setState({ isDirty: false });
  useWorkspaceStore.getState().updateViewport({ x: 11, y: 20, zoom: 2 });
  assert.equal(useWorkspaceStore.getState().isDirty, true);
});

test("syncing with nothing unsaved sends no request (the canvas schedules one after load)", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;
  try {
    useWorkspaceStore.setState({ workspaceId: "ws-1", isDirty: false, isSaving: false, saveBlocked: false });
    await useWorkspaceStore.getState().syncWithServer();
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    useWorkspaceStore.setState({ workspaceId: null });
  }
});
