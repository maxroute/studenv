import assert from "node:assert/strict";
import test from "node:test";
import { openTarget } from "./citations";
import { openBoardPassages, openPagePassages, pickOpenPassages, pointsAtOpen } from "./open-source";
import { passageRef } from "./ranking";

const PAGE = {
  ref: "note:n1",
  title: "Operating systems",
  blocks: [
    { type: "paragraph", text: "An OS runs programs." },
    { type: "heading", text: "Deadlocks" },
    { type: "paragraph", text: "A deadlock is when processes wait forever." },
    { type: "bulletList", text: "Mutual exclusion\nHold and wait" },
    { type: "heading", text: "Empty section" },
    { type: "heading", text: "Paging" },
    { type: "paragraph", text: "Paging splits memory into pages." },
  ],
};

test("the open page is read in sections, each opening the page", () => {
  const passages = openPagePassages(PAGE);
  assert.deepEqual(passages.map((p) => [p.heading, p.content]), [
    ["", "An OS runs programs."],
    ["Deadlocks", "A deadlock is when processes wait forever.\nMutual exclusion Hold and wait"],
    ["Paging", "Paging splits memory into pages."],
  ]);
  assert.ok(passages.every((p) => p.ref === "note:n1" && p.sourceType === "note" && p.title === "Operating systems"));
  assert.deepEqual(passages[0].open, { kind: "note", noteId: "n1", blockId: null });
  assert.deepEqual(openPagePassages({ ...PAGE, ref: "workspace:w1" }), [], "only a page reference");
});

test("the open board is read from its elements and connector labels, and opens the board", () => {
  const passages = openBoardPassages({
    ref: "workspace:w1",
    title: "OS map",
    elements: [
      { key: "e1", type: "sticky", text: "Operating System" },
      { key: "e2", type: "sticky", text: "Memory" },
      { key: "e3", type: "shape", text: "Shape: rounded-rectangle" },
      { key: "e4", type: "image", text: "Image: " },
    ],
    edges: [{ from: "e1", to: "e2", label: "manages" }],
  });
  assert.deepEqual(passages, [
    { ref: "workspace:w1", sourceType: "board", title: "OS map", heading: "", content: "Operating System\n → manages → Memory\nMemory", open: { kind: "board", boardId: "w1" } },
  ]);
  assert.deepEqual(openBoardPassages({ ref: "note:n1", title: "", elements: [], edges: [] }), []);
});

test("only parts of the open source that match the question are used; a subject name counts, one everyday word doesn't", () => {
  const passages = openPagePassages(PAGE);
  assert.deepEqual(pickOpenPassages(passages, "how do deadlocks happen when processes wait?", null).map((p) => p.heading), ["Deadlocks"]);
  assert.deepEqual(pickOpenPassages(passages, "explain virtual memory paging", null).map((p) => p.heading), ["Paging"], "two shared words");
  assert.deepEqual(pickOpenPassages(passages, "how do plants use water and light?", null), [], "nothing on the page matches");
  assert.deepEqual(pickOpenPassages(passages, "how does a fruit fly wait for food?", null), [], "one everyday word isn't enough");
  assert.deepEqual(pickOpenPassages(passages, "tell me more", { names: ["deadlock"], terms: [] }).map((p) => p.heading), ["Deadlocks"], "the subject's name is enough");
  assert.equal(pickOpenPassages(passages, "summarize this page", null).length, 3, "pointing at the page uses its first parts");
  assert.deepEqual(
    pickOpenPassages(passages, "what does this page say about paging memory?", null).map((p) => p.heading),
    ["Paging", "", "Deadlocks"],
    "pointing at the page with a topic: the matching part first, then the first parts",
  );
  assert.ok(pointsAtOpen("what does this board say?") && pointsAtOpen("quiz me on the page") && !pointsAtOpen("what is paging?") && !pointsAtOpen("what do my notes say about paging?"));
});

test("boards in the index cite and open as boards", () => {
  assert.equal(passageRef("board", "w1", ""), "workspace:w1");
  assert.deepEqual(openTarget("board", "w1", "", new Map()), { kind: "board", boardId: "w1" });
});
