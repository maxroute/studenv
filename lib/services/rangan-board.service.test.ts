import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceSceneJson } from "@/types/workspace";
import { createMapBoardSchema, createRanganBoardService } from "./rangan-board.service";

const DRAFT = {
  title: "OS map",
  centre: "Operating System",
  branches: [
    { title: "Kernel", note: "The core", relation: "has", source: 1, children: [{ title: "Scheduler", note: "" }] },
    { title: "Files", note: "", relation: "organizes", source: 2, children: [] },
    { title: "Memory", note: "", relation: "manages", source: 3, children: [{ title: "Paging", note: "" }] },
  ],
  links: [],
  tips: ["Draw the layers"],
};

function setup() {
  const created: Array<{ ownerId: string; title: string; sceneJson: string }> = [];
  let counter = 0;
  const service = createRanganBoardService({
    findNoteCard: async (ownerId, noteId) => (ownerId === "u1" && (noteId === "n1" || noteId === "page1") ? { title: noteId === "n1" ? "CS notes" : "OS page", excerpt: "Text." } : null),
    findAssetCard: async (ownerId, assetId) => (ownerId === "u1" && assetId === "a1" ? { title: "Textbook", kind: "pdf" } : null),
    createBoard: async (ownerId, title, sceneJson) => {
      created.push({ ownerId, title, sceneJson });
      return "board1";
    },
    newId: () => `id${counter++}`,
  });
  return { service, created };
}

test("a map board is created with cards for the user's own sources and the page written with it", async () => {
  const { service, created } = setup();
  const result = await service.createMapBoard("u1", {
    draft: DRAFT,
    sources: [
      { n: 1, ref: "note:n1#b_AAAAAAAAAA" },
      { n: 2, ref: "asset:a1#page4" },
      { n: 3, ref: "asset:someone-elses" },
    ],
    pageNoteId: "page1",
  });
  assert.deepEqual(result, { workspaceId: "board1" });
  assert.equal(created[0].title, "OS map");
  const scene = parseWorkspaceSceneJson(created[0].sceneJson);
  assert.equal(scene.preservedItems.length, 0);
  const cards = scene.items.filter((item) => item.type === "note-card" || item.type === "resource-card");
  assert.deepEqual(
    cards.map((item) => (item.type === "note-card" ? ["note", item.props.noteId, item.props.blockId ?? null] : ["asset", item.type === "resource-card" ? item.props.assetId : "", null])),
    [
      ["note", "n1", "b_AAAAAAAAAA"],
      ["asset", "a1", null],
      ["note", "page1", null],
    ],
  );
  const solid = scene.items.filter((item) => item.type !== "connector");
  assert.equal(Math.min(...solid.map((item) => item.x)), 0, "the map starts at the board's top-left");
  assert.equal(Math.min(...solid.map((item) => item.y)), 0);
  assert.deepEqual(scene.viewport, { x: 40, y: 40, zoom: 0.5 });
});

test("the draft is checked again when it comes back from the browser", () => {
  assert.equal(createMapBoardSchema.safeParse({ draft: DRAFT, sources: [] }).success, true);
  assert.equal(createMapBoardSchema.safeParse({ draft: { ...DRAFT, branches: DRAFT.branches.slice(0, 1) }, sources: [] }).success, false, "fewer than 2 branches");
  assert.equal(createMapBoardSchema.safeParse({ draft: { ...DRAFT, extra: true }, sources: [] }).success, false);
  assert.equal(createMapBoardSchema.safeParse({ draft: { ...DRAFT, centre: "x".repeat(61) }, sources: [] }).success, false);
  const many = Array.from({ length: 9 }, (_, index) => ({ ...DRAFT.branches[1], title: `B${index}` }));
  assert.equal(createMapBoardSchema.safeParse({ draft: { ...DRAFT, branches: many }, sources: [] }).success, false, "more than 8 branches");
});
