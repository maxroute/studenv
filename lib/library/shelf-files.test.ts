import assert from "node:assert/strict";
import test from "node:test";
import { createShelfFilesService, type ShelfFilesDeps } from "@/lib/services/shelf-files.service";
import { shelfItemsWithoutFile, shelfTypeForFile, toShelfFile, visibleShelfFiles, type ShelfFile } from "./shelf-files";

const at = new Date("2026-11-21T10:00:00Z");

test("PDFs, videos and links can go on the Shelf; pictures, audio and board snapshots can't", () => {
  assert.equal(shelfTypeForFile("pdf"), "pdf");
  assert.equal(shelfTypeForFile("video"), "video");
  assert.equal(shelfTypeForFile("webpage"), "article");
  assert.equal(shelfTypeForFile("image"), null);
  assert.equal(shelfTypeForFile("audio"), null);
  assert.equal(toShelfFile({ id: "s", title: "Board export", kind: "snapshot", sourceHost: null, sourceUrl: null, createdAt: at }), null, "snapshots aren't listed");
  assert.deepEqual(toShelfFile({ id: "i", title: "  ", kind: "image", sourceHost: null, sourceUrl: null, createdAt: at }), {
    id: "i",
    title: "Untitled",
    kind: "image",
    sourceHost: null,
    sourceUrl: null,
    createdAt: at.toISOString(),
    shelvable: false,
  });
});

test("the vault lists Shelf items that have no file yet, never pages", () => {
  const items = [
    { id: "a", title: "Paging article", type: "article", sourceHost: "en.wikipedia.org" },
    { id: "b", title: "Lecture", type: "video", sourceHost: "youtube.com" },
    { id: "c", title: "My page", type: "note", sourceHost: null },
    { id: "d", title: "Textbook", type: "pdf", sourceHost: null },
  ];
  assert.deepEqual(
    shelfItemsWithoutFile(items, new Set(["b"])).map((item) => item.id),
    ["a", "d"],
    "the video has a file already; the page is listed from Notes",
  );
});

const FILES: ShelfFile[] = [
  { id: "1", title: "Deadlock (computer science)", kind: "webpage", sourceHost: "en.wikipedia.org", sourceUrl: "https://en.wikipedia.org/wiki/Deadlock", createdAt: at.toISOString(), shelvable: true },
  { id: "2", title: "Chapter 3.pdf", kind: "pdf", sourceHost: null, sourceUrl: null, createdAt: at.toISOString(), shelvable: true },
  { id: "3", title: "Paging lecture", kind: "video", sourceHost: "www.youtube.com", sourceUrl: "https://www.youtube.com/watch?v=x", createdAt: at.toISOString(), shelvable: true },
  { id: "4", title: "Diagram.png", kind: "image", sourceHost: null, sourceUrl: null, createdAt: at.toISOString(), shelvable: false },
];

test("files follow the Shelf's type filters and search; status, tag and other views show none", () => {
  const ids = (files: ShelfFile[]) => files.map((file) => file.id);
  assert.deepEqual(ids(visibleShelfFiles(FILES, {})), ["1", "2", "3", "4"]);
  assert.deepEqual(ids(visibleShelfFiles(FILES, { nav: "type:pdf" })), ["2"]);
  assert.deepEqual(ids(visibleShelfFiles(FILES, { nav: "type:article" })), ["1"], "links are the Shelf's articles");
  assert.deepEqual(ids(visibleShelfFiles(FILES, { nav: "type:note" })), []);
  assert.deepEqual(ids(visibleShelfFiles(FILES, { nav: "starred" })), [], "files have no star yet");
  assert.deepEqual(ids(visibleShelfFiles(FILES, { nav: "collection:c1" })), []);
  assert.deepEqual(ids(visibleShelfFiles(FILES, { status: "unread" })), []);
  assert.deepEqual(ids(visibleShelfFiles(FILES, { tag: "os" })), []);
  assert.deepEqual(ids(visibleShelfFiles(FILES, { query: "wikipedia" })), ["1"], "the source's host is searched too");
  assert.deepEqual(ids(visibleShelfFiles(FILES, { query: "PAGING" })), ["3"]);
});

function fakes(start: Partial<Record<string, { id: string; title: string; kind: string; sourceUrl: string | null; itemId: string | null }>> = {}) {
  const files = new Map(Object.entries(start));
  const created: Array<{ ownerId: string; input: unknown }> = [];
  const deleted: string[] = [];
  let raceWith: string | null = null;
  const deps: ShelfFilesDeps = {
    listFilesWithoutItem: async () => [],
    findOwnedFile: async (ownerId, id) => (ownerId === "u1" ? (files.get(id) ?? null) : null),
    createItem: async (ownerId, _plan, input) => {
      created.push({ ownerId, input });
      return { id: `item${created.length}` };
    },
    linkFileToItem: async (_ownerId, assetId, itemId) => {
      const file = files.get(assetId);
      if (!file) return false;
      if (raceWith) {
        file.itemId = raceWith;
        return false;
      }
      if (file.itemId) return false;
      file.itemId = itemId;
      return true;
    },
    deleteItem: async (_ownerId, itemId) => {
      deleted.push(itemId);
    },
  };
  return { deps, files, created, deleted, race: (itemId: string) => (raceWith = itemId) };
}

test("opening a file from the Shelf gives it a Shelf item once, with its title and address", async () => {
  const f = fakes({ w1: { id: "w1", title: "Deadlock", kind: "webpage", sourceUrl: "https://en.wikipedia.org/wiki/Deadlock", itemId: null }, p1: { id: "p1", title: "Notes.pdf", kind: "pdf", sourceUrl: null, itemId: null } });
  const service = createShelfFilesService(f.deps);
  assert.deepEqual(await service.shelve("u1", "free", "w1"), { itemId: "item1" });
  assert.deepEqual(f.created[0], { ownerId: "u1", input: { type: "article", title: "Deadlock", url: "https://en.wikipedia.org/wiki/Deadlock" } });
  assert.deepEqual(await service.shelve("u1", "free", "w1"), { itemId: "item1" }, "the second time, the same item");
  assert.equal(f.created.length, 1);
  await service.shelve("u1", "free", "p1");
  assert.deepEqual(f.created[1].input, { type: "pdf", title: "Notes.pdf" }, "an upload has no address");
});

test("someone else's file is not found, and pictures can't go on the Shelf", async () => {
  const f = fakes({ i1: { id: "i1", title: "Diagram", kind: "image", sourceUrl: null, itemId: null } });
  const service = createShelfFilesService(f.deps);
  await assert.rejects(service.shelve("u2", "free", "i1"), { status: 404 });
  await assert.rejects(service.shelve("u1", "free", "i1"), { status: 400 });
  assert.equal(f.created.length, 0);
});

test("when two taps race, the first item is kept and the extra one is removed", async () => {
  const f = fakes({ v1: { id: "v1", title: "Lecture", kind: "video", sourceUrl: "https://www.youtube.com/watch?v=x", itemId: null } });
  f.race("itemFromOtherTap");
  const service = createShelfFilesService(f.deps);
  assert.deepEqual(await service.shelve("u1", "pro", "v1"), { itemId: "itemFromOtherTap" });
  assert.deepEqual(f.deleted, ["item1"]);
});
