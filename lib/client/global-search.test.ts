import { test } from "node:test";
import assert from "node:assert/strict";
import { searchEverything, type SearchEntry } from "./global-search";

const entries: SearchEntry[] = [
  { key: "1", kind: "page", title: "Graph algorithms", updatedAt: "2026-11-01" },
  { key: "2", kind: "board", title: "BFS and DFS graphs", updatedAt: "2026-11-20" },
  { key: "3", kind: "task", title: "Revise paragraphs", updatedAt: "2026-11-25" },
  { key: "4", kind: "pdf", title: "Lecture 7", keywords: ["graphs", "week-3"] },
  { key: "5", kind: "group", title: "Night owls" },
];
const keys = (list: SearchEntry[]) => list.map((entry) => entry.key);

test("a title that starts with the words comes before one that only contains them", () => {
  assert.deepEqual(keys(searchEverything(entries, "graph")), ["1", "2", "3", "4"]);
});

test("every word typed has to match, in any order and any case", () => {
  assert.deepEqual(keys(searchEverything(entries, "  DFS Graph ")), ["2"]);
  assert.deepEqual(keys(searchEverything(entries, "graph owls")), []);
});

test("nothing typed gives nothing, and the list is capped", () => {
  assert.deepEqual(searchEverything(entries, "   "), []);
  assert.equal(searchEverything(entries, "graph", 2).length, 2);
});

test("newer entries win a tie", () => {
  const tied: SearchEntry[] = [
    { key: "old", kind: "page", title: "Paging", updatedAt: "2026-01-01" },
    { key: "new", kind: "page", title: "Paging", updatedAt: "2026-09-01" },
  ];
  assert.deepEqual(keys(searchEverything(tied, "pag")), ["new", "old"]);
});
