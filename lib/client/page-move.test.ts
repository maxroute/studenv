import { test } from "node:test";
import assert from "node:assert/strict";
import { moveChoices } from "./page-move";

const page = (id: string, parentId: string | null, title = id) => ({ id, parentId, title, sortKey: id, updatedAt: "2026-11-01T00:00:00.000Z" });
const pages = [page("a", null, "Biology"), page("b", "a", "Cells"), page("c", "b", "Nucleus"), page("d", null, "Chemistry")];

test("a page can't be moved into itself or into a page inside it", () => {
  assert.deepEqual(moveChoices(pages, "b").map((choice) => choice.value), ["", "a", "d"]);
  assert.deepEqual(moveChoices(pages, "a").map((choice) => choice.value), ["", "d"]);
});

test("the top level comes first, and nested pages say where they are", () => {
  const choices = moveChoices(pages, "d");
  assert.equal(choices[0].title, "Top level");
  assert.equal(choices.find((choice) => choice.value === "c")?.detail, "in Biology / Cells");
});
