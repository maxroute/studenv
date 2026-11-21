import assert from "node:assert/strict";
import test from "node:test";
import { canRestore, conversationTitle, storedTurn } from "./conversation";

test("a chat is titled by its first question, cut at a word", () => {
  assert.equal(conversationTitle("  What is   a heap? "), "What is a heap?");
  assert.equal(conversationTitle(""), "New chat");
  const long = "make a work that i want to solve 5 dsa problems before 12 am in the planner and also tomorrow some graphs";
  const title = conversationTitle(long);
  assert.ok(title.length <= 81);
  assert.ok(title.endsWith("…"));
  assert.ok(long.startsWith(title.slice(0, -1)), "cut at a word, not inside one");
});

test("a turn is saved without its id and role, and errors are never saved", () => {
  assert.deepEqual(storedTurn({ id: "tabc_1", role: "user", content: "Hi" }, 3), { clientId: "tabc_1", position: 3, role: "user", data: { content: "Hi" } });
  assert.equal(storedTurn({ id: "t1", role: "error", content: "busy" }, 0), null);
  assert.equal(storedTurn({ id: "bad id!", role: "user", content: "Hi" }, 0), null);
});

test("a saved turn is shown again only if its card has what it needs", () => {
  assert.equal(canRestore("user", { content: "Hi" }), true);
  assert.equal(canRestore("user", { content: 4 }), false);
  assert.equal(canRestore("assistant", { content: "Yes [1]", citations: [] }), true);
  assert.equal(canRestore("assistant", { content: "Yes" }), false);
  assert.equal(canRestore("page", { draft: { title: "T", markdown: "# T", outline: [], citations: [] }, noteId: null }), true);
  assert.equal(canRestore("page", { draft: { title: "T" }, noteId: null }), false);
  assert.equal(canRestore("task", { tasks: [{ title: "Solve 5 problems", day: "2026-11-21", time: "23:59", priority: "medium", category: "Study" }], saved: null }), true);
  assert.equal(canRestore("task", { tasks: [{ title: "x" }], saved: null }), false);
  assert.equal(canRestore("task", { tasks: [], saved: -1 }), false);
  assert.equal(canRestore("map", { map: { draft: {}, outline: [] }, boardId: "c1" }), true);
  assert.equal(canRestore("board-edit", { edit: { boardRef: "workspace:x", changes: [] }, planned: { elements: [], edges: [] }, applied: false }), true);
  assert.equal(canRestore("edit", { edit: { pageRef: "note:x", changes: [] }, planned: [], applied: true }), true);
  assert.equal(canRestore("plan", { plan: { goal: "g", topics: [], sources: [], settings: {} }, saved: 3 }), true);
  assert.equal(canRestore("explore", { explore: { gaps: [] } }), true);
  assert.equal(canRestore("error", { content: "x" }), false);
  assert.equal(canRestore("user", null), false);
});
