import { test } from "node:test";
import assert from "node:assert/strict";
import { progressLabel } from "./progress";

const nowhere = { pageOpen: false, boardOpen: false };

test("a selection is read first, then explained", () => {
  const request = { kind: "ask" as const, question: "Explain this", focus: { text: "x" } };
  assert.deepEqual([0, 4, 9].map((s) => progressLabel(request, nowhere, s)), ["Reading your selection…", "Looking at the page around it…", "Writing the explanation…"]);
});

test("each kind of request shows its own steps", () => {
  assert.equal(progressLabel({ kind: "ask", question: "Create the board" }, nowhere, 9), "Planning the board…");
  assert.equal(progressLabel({ kind: "ask", question: "make a note on JWT" }, nowhere, 9), "Writing your page…");
  assert.equal(progressLabel({ kind: "ask", question: "remind me to revise at 6" }, nowhere, 4), "Drafting your tasks…");
  assert.equal(progressLabel({ kind: "ask", question: "highlight the key terms" }, { pageOpen: true, boardOpen: false }, 4), "Planning the changes…");
  assert.equal(progressLabel({ kind: "ask", question: "what is paging?" }, nowhere, 0), "Thinking…");
  assert.equal(progressLabel({ kind: "summarize" }, nowhere, 30), "Writing the summary…");
});

test("a short list stays on its last step", () => {
  assert.equal(progressLabel({ kind: "ask", question: "add a task for Friday" }, nowhere, 60), "Drafting your tasks…");
});
