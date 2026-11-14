import test from "node:test";
import assert from "node:assert/strict";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { createWorkspaceItem, parseWorkspaceSceneJson, serializeWorkspaceScene, type StudioItem } from "@/types/workspace";
import { extractSceneRefs, toLinkRows } from "@/lib/refs/extract/link-rows";
import { NOTE_CARD_SIZE, findNoteCard, noteCardExcerpt, noteCardIsStale, noteCardProps, replaceStickyWithNoteCard, stickyNoteText } from "./note-card";

const make = (type: Parameters<typeof createWorkspaceItem>[0], props: Record<string, unknown>, id: string, x = 0): StudioItem => {
  const item = createWorkspaceItem(type, props, { id, x, y: 0, zIndex: 1 });
  assert.ok(item, type);
  return item;
};

test("a note card saves and loads, and old snapshots without one are unaffected", () => {
  const card = make("note-card", noteCardProps({ id: "n1", title: "Cells", excerpt: "Mitochondria" }, "b_aaaaaaaaaa"), "card-1");
  const scene = parseWorkspaceSceneJson(serializeWorkspaceScene({ items: [card] }));
  assert.equal(scene.preservedItems.length, 0, "known now, not kept aside");
  assert.deepEqual(scene.items[0], card);
  assert.equal(card.w, NOTE_CARD_SIZE.w);
});

test("a damaged note card is repaired; one without a note id is dropped", () => {
  const raw = (props: Record<string, unknown>) => JSON.stringify({ format: "second-brain-workspace", version: 1, viewport: { x: 0, y: 0, zoom: 1 }, workspaceAssetIds: [], items: [{ id: "c", type: "note-card", x: "bad", y: 0, w: 280, h: 160, rotation: 0, zIndex: 1, props }] });
  const repaired = parseWorkspaceSceneJson(raw({ noteId: "n1", title: 5, excerpt: "x".repeat(400) })).items[0];
  assert.equal(repaired.type, "note-card");
  assert.equal(repaired.type === "note-card" && repaired.props.excerpt.length, 280);
  assert.equal(parseWorkspaceSceneJson(raw({ title: "no id" })).items.length, 0);
});

test("a note card is a link to its note (and section)", () => {
  const card = make("note-card", noteCardProps({ id: "n1", title: "Cells" }, "b_aaaaaaaaaa"), "card-1");
  const rows = toLinkRows({ type: "workspace", id: "w1" }, extractSceneRefs([card]));
  assert.deepEqual(rows.map((r) => [r.targetType, r.targetId, r.targetAnchor, r.sourceAnchor, r.kind]), [["note", "n1", "b_aaaaaaaaaa", "card-1", "card"]]);
});

test("turning a sticky into a note keeps its id, place and connectors, in one undoable step", () => {
  const sticky = make("sticky", { text: "Krebs cycle\nhappens in mitochondria", locked: false }, "sticky-1", 120);
  const other = make("sticky", { text: "other" }, "sticky-2", 600);
  const connector = make("connector", { source: { id: "sticky-1" }, target: { id: "sticky-2" } }, "conn-1");
  useWorkspaceStore.setState({ items: [sticky, other, connector], preservedItems: [] });
  useWorkspaceStore.getState().breakHistoryCapture();

  const next = replaceStickyWithNoteCard(useWorkspaceStore.getState().items, "sticky-1", { id: "n9", title: "Krebs cycle", excerpt: "happens in mitochondria" });
  assert.ok(next);
  useWorkspaceStore.getState().updateItems(next);
  const items = useWorkspaceStore.getState().items;
  const card = items.find((item) => item.id === "sticky-1");
  assert.equal(card?.type, "note-card");
  assert.equal(card?.x, 120);
  assert.ok(items.some((item) => item.id === "conn-1"), "the connector is still attached");
  assert.equal(findNoteCard(items, "n9")?.id, "sticky-1");

  useWorkspaceStore.getState().undo();
  const restored = useWorkspaceStore.getState().items.find((item) => item.id === "sticky-1");
  assert.equal(restored?.type, "sticky", "undo brings the sticky back");
  assert.ok(useWorkspaceStore.getState().items.some((item) => item.id === "conn-1"));
});

test("only stickies can be turned into notes", () => {
  const card = make("note-card", noteCardProps({ id: "n1", title: "x" }), "c1");
  assert.equal(replaceStickyWithNoteCard([card], "c1", { id: "n2", title: "y" }), null);
  assert.equal(replaceStickyWithNoteCard([], "missing", { id: "n2", title: "y" }), null);
});

test("sticky text splits into a title and body; cache freshness is detected", () => {
  assert.deepEqual(stickyNoteText("\n  Title line \nbody 1\nbody 2"), { title: "Title line", body: "body 1\nbody 2" });
  assert.deepEqual(stickyNoteText("   "), { title: "Untitled", body: "" });
  assert.equal(noteCardExcerpt("a\n\nb"), "a b");
  const card = make("note-card", noteCardProps({ id: "n1", title: "Cells", excerpt: "x" }), "c1");
  assert.equal(card.type === "note-card" && noteCardIsStale(card, { title: "Cells", excerpt: "x" }), false);
  assert.equal(card.type === "note-card" && noteCardIsStale(card, { title: "Cells v2", excerpt: "x" }), true);
});
