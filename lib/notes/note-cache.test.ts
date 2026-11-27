import { test } from "node:test";
import assert from "node:assert/strict";
import { createNoteCache } from "./note-cache";

const note = (id: string, version = 1) => ({ id, version, title: id });

test("a page opened before comes back at once", () => {
  const cache = createNoteCache();
  assert.equal(cache.get("a"), null);
  cache.put(note("a"));
  assert.deepEqual(cache.get("a"), note("a"));
});

test("an older copy never replaces a newer one", () => {
  const cache = createNoteCache();
  cache.put(note("a", 5));
  cache.put(note("a", 4));
  assert.equal(cache.get("a")?.version, 5);
  cache.put(note("a", 6));
  assert.equal(cache.get("a")?.version, 6);
});

test("the least recently opened page is dropped first", () => {
  const cache = createNoteCache(2);
  cache.put(note("a"));
  cache.put(note("b"));
  cache.get("a");
  cache.put(note("c"));
  assert.equal(cache.size, 2);
  assert.equal(cache.get("b"), null);
  assert.ok(cache.get("a") && cache.get("c"));
});

test("a deleted or missing page can be forgotten", () => {
  const cache = createNoteCache();
  cache.put(note("a"));
  cache.forget("a");
  assert.equal(cache.get("a"), null);
});
