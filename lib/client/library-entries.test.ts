import { test } from "node:test";
import assert from "node:assert/strict";
import { filterEntries, libraryEntries } from "./library-entries";

const item = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  title: `Item ${id}`,
  excerpt: null,
  noteId: null,
  status: "unread" as const,
  starred: false,
  createdAt: "2026-11-01T00:00:00.000Z",
  updatedAt: "2026-11-01T00:00:00.000Z",
  tags: [],
  ...extra,
});

const entries = libraryEntries({
  items: [
    item("a", "note", { noteId: "n1", starred: true, tags: [{ name: "kernel" }] }),
    item("b", "pdf", { status: "done", updatedAt: "2026-11-03T00:00:00.000Z" }),
    item("c", "article", { excerpt: "About deadlocks" }),
  ],
  pages: [
    { id: "n1", title: "Already an item", parentId: null, updatedAt: "2026-11-02T00:00:00.000Z" },
    { id: "n2", title: "Loose page", parentId: null, updatedAt: "2026-11-05T00:00:00.000Z" },
    { id: "n3", title: "Child page", parentId: "n2", updatedAt: "2026-11-06T00:00:00.000Z" },
  ],
  boards: [{ id: "w1", title: "", updatedAt: "2026-11-04T00:00:00.000Z" }],
  files: [
    { ref: "item:b", title: "Item b", kind: "pdf", createdAt: "2026-11-01T00:00:00.000Z", usedIn: [] },
    { ref: "asset:x", title: "photo.png", kind: "image", createdAt: "2026-10-01T00:00:00.000Z", usedIn: [{ type: "board", id: "w1" }] },
    { ref: "asset:y", title: "unused.pdf", kind: "pdf", createdAt: "2026-09-01T00:00:00.000Z", usedIn: [] },
  ],
});
const keys = (list: Array<{ key: string }>) => list.map((entry) => entry.key);

test("nothing is listed twice, and child pages stay under their parent", () => {
  assert.deepEqual(keys(entries).sort(), ["asset:x", "asset:y", "board:w1", "item:a", "item:b", "item:c", "page:n2"]);
});

test("uploads open where they are used", () => {
  assert.equal(entries.find((entry) => entry.key === "asset:x")?.href, "/workspaces/w1");
  assert.equal(entries.find((entry) => entry.key === "asset:y")?.href, null);
  assert.equal(entries.find((entry) => entry.key === "board:w1")?.title, "Untitled board");
});

test("each tab shows its own kinds", () => {
  assert.deepEqual(keys(filterEntries(entries, { tab: "pages" })), ["page:n2", "item:a"]);
  assert.deepEqual(keys(filterEntries(entries, { tab: "boards" })), ["board:w1"]);
  assert.deepEqual(keys(filterEntries(entries, { tab: "files" })), ["item:b", "item:c", "asset:x", "asset:y"]);
  assert.deepEqual(keys(filterEntries(entries, { tab: "files", fileKind: "pdf" })), ["item:b", "asset:y"]);
  assert.deepEqual(keys(filterEntries(entries, { tab: "starred" })), ["item:a"]);
});

test("collection, tag, status and search narrow the list", () => {
  assert.deepEqual(keys(filterEntries(entries, { tab: "all", collectionItemIds: ["c", "b"] })), ["item:b", "item:c"]);
  assert.deepEqual(keys(filterEntries(entries, { tab: "all", collectionItemIds: [] })), []);
  assert.deepEqual(keys(filterEntries(entries, { tab: "all", tag: "kernel" })), ["item:a"]);
  assert.deepEqual(keys(filterEntries(entries, { tab: "all", status: "done" })), ["item:b"]);
  assert.deepEqual(keys(filterEntries(entries, { tab: "all", query: " DEADLOCK " })), ["item:c"]);
  assert.deepEqual(keys(filterEntries(entries, { tab: "all", query: "kernel" })), ["item:a"]);
});

test("sorting by title, age and status", () => {
  assert.equal(filterEntries(entries, { tab: "all" })[0]?.key, "page:n2");
  assert.equal(filterEntries(entries, { tab: "all", sort: "oldest" })[0]?.key, "asset:y");
  assert.equal(filterEntries(entries, { tab: "all", sort: "title" })[0]?.key, "item:a");
  const byStatus = keys(filterEntries(entries, { tab: "all", sort: "status" }));
  assert.ok(byStatus.indexOf("item:b") < byStatus.indexOf("page:n2"), "items with a status come before the rest");
});
