import test from "node:test";
import assert from "node:assert/strict";
import { filterMentions } from "./mention-suggestion";
import { filterSlashCommands, slashCommands } from "./slash-commands";

const items = slashCommands({ createSubPage: async () => null, makeFlashcard: () => {} });

test("every block the format supports can be inserted from the / menu", () => {
  const ids = items.map((item) => item.id);
  for (const id of ["text", "h1", "h2", "h3", "bullet", "numbered", "todo", "toggle", "quote", "callout", "divider", "code", "table", "equation", "link", "subpage", "flashcard"]) {
    assert.ok(ids.includes(id), `/${id}`);
  }
  assert.equal(new Set(ids).size, ids.length, "ids are unique");
});

test("/ filtering ranks title prefixes first and matches keywords", () => {
  assert.equal(filterSlashCommands(items, "")[0].id, "text", "empty query lists everything in order");
  assert.equal(filterSlashCommands(items, "head")[0].id, "h1");
  assert.ok(filterSlashCommands(items, "check").some((item) => item.id === "todo"), "keywords match");
  assert.ok(filterSlashCommands(items, "math").some((item) => item.id === "equation"));
  assert.deepEqual(filterSlashCommands(items, "zzzz"), []);
  for (const query of ["todo", "to-do", "To do", "check"]) {
    assert.equal(filterSlashCommands(items, query)[0]?.id, "todo", `"${query}" finds the to-do list`);
  }
});

test("@ lists pages, resources and workspaces in groups, best matches first", () => {
  const targets = [
    { ref: "workspace:w1", label: "Biology board", kind: "workspace" as const },
    { ref: "item:i1", label: "Campbell Biology PDF", kind: "resource" as const },
    { ref: "note:n2", label: "Cell biology", kind: "note" as const },
    { ref: "note:n1", label: "Biology exam plan", kind: "note" as const },
    { ref: "note:n3", label: "Chemistry", kind: "note" as const },
  ];
  assert.deepEqual(
    filterMentions(targets, "bio").map((target) => target.ref),
    ["note:n1", "note:n2", "item:i1", "workspace:w1"],
    "pages first; within a group, title prefix before contains",
  );
  assert.equal(filterMentions(targets, "").length, 5);
  assert.equal(filterMentions(Array.from({ length: 20 }, (_, i) => ({ ref: `note:x${i}`, label: `Page ${i}`, kind: "note" as const })), "").length, 6, "capped per group");
});
