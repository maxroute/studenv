import assert from "node:assert/strict";
import test from "node:test";
import { shelfItemsWithoutFile } from "./shelf-files";

test("the vault lists Shelf items that have no file yet, never pages", () => {
  const items = [
    { id: "a", title: "Paging article", type: "article", sourceHost: "en.wikipedia.org" },
    { id: "b", title: "Lecture", type: "video", sourceHost: "youtube.com" },
    { id: "c", title: "My page", type: "note", sourceHost: null },
    { id: "d", title: "  ", type: "pdf", sourceHost: null },
  ];
  assert.deepEqual(shelfItemsWithoutFile(items, new Set(["b"])), [
    { id: "a", title: "Paging article", type: "article", sourceHost: "en.wikipedia.org" },
    { id: "d", title: "Untitled", type: "pdf", sourceHost: null },
  ]);
});
