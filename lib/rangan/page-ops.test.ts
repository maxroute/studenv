import assert from "node:assert/strict";
import test from "node:test";
import { describePageOp, looksLikePageEdit, pageToolsInstruction, parsePageOps, plainWords, safeHref, touchedBlocks, type PageToolBlock } from "./page-ops";

const blocks: PageToolBlock[] = [
  { id: "b_h", type: "heading", text: "Stacks", locked: false },
  { id: "b_p", type: "paragraph", text: "A stack is LIFO. Push and pop run in O(1).", marked: "A stack is **LIFO**. Push and pop run in O(1).", locked: false },
  { id: "list:b_t1", type: "taskList", text: "Revise stacks\nRead chapter 2", locked: false },
  { id: "b_pdf", type: "pdfPage", text: "Notes p. 3", locked: true },
];

const parse = (ops: unknown[]) => parsePageOps(JSON.stringify({ summary: "Done.", ops }), blocks);

test("the instruction shows numbered blocks with their formatting, the selection, and every tool", () => {
  const text = pageToolsInstruction("bold this", "DSA", blocks, { block: "b_p", text: "Push and pop" });
  assert.match(text, /\[2\] \(paragraph\) A stack is \*\*LIFO\*\*/);
  assert.match(text, /\[4\] \(PDF page, locked\)/);
  assert.match(text, /selected, in block \[2\]: """Push and pop"""/);
  for (const tool of ["insert", "replace", "delete", "move", "turnInto", "format", "link", "rewrite", "embed", "check", "title"]) {
    assert.match(text, new RegExp(`"op": "${tool}"`), tool);
  }
});

test("word tools need the words to be in the block; marks the model copied are ignored", () => {
  const plan = parse([
    { op: "format", block: 2, text: "**LIFO**", bold: false, highlight: true, color: "Blue" },
    { op: "link", block: 2, text: "stack", href: "en.wikipedia.org/wiki/Stack" },
    { op: "rewrite", block: 1, text: "Stacks", with: "Stacks and queues" },
    { op: "format", block: 2, text: "not on the page", bold: true },
  ]);
  assert.ok(plan);
  assert.deepEqual(plan.ops, [
    { op: "format", block: "b_p", text: "LIFO", set: { bold: false, highlight: true, color: "blue" } },
    { op: "link", block: "b_p", text: "stack", href: "https://en.wikipedia.org/wiki/Stack" },
    { op: "rewrite", block: "b_h", text: "Stacks", with: "Stacks and queues" },
  ]);
});

test("blocks are named by id, structure changes are one per block, and locked blocks only move", () => {
  const plan = parse([
    { op: "insert", after: 0, markdown: "> [!tip] Exam favourite" },
    { op: "turnInto", block: 1, into: "heading3" },
    { op: "replace", block: 1, markdown: "## Again" },
    { op: "delete", block: 4 },
    { op: "format", block: 4, bold: true },
    { op: "move", block: 4, after: 1 },
    { op: "check", block: 3, item: "Revise stacks", done: true },
    { op: "check", block: 2, done: true },
    { op: "embed", after: 2, url: "https://www.youtube.com/watch?v=abc" },
    { op: "embed", after: 2, url: "javascript:alert(1)" },
    { op: "title", title: "Stacks and queues" },
    { op: "dance", block: 1 },
  ]);
  assert.ok(plan);
  assert.deepEqual(plan.ops, [
    { op: "insert", after: null, markdown: "> [!tip] Exam favourite" },
    { op: "turnInto", block: "b_h", into: "heading3" },
    { op: "move", block: "b_pdf", after: "b_h" },
    { op: "check", block: "list:b_t1", item: "Revise stacks", done: true },
    { op: "embed", after: "b_p", url: "https://www.youtube.com/watch?v=abc" },
    { op: "title", title: "Stacks and queues" },
  ]);
  assert.deepEqual(touchedBlocks(plan.ops).sort(), ["b_h", "b_p", "b_pdf", "list:b_t1"]);
});

test("a reply with nothing usable is no plan", () => {
  assert.equal(parsePageOps("Sorry.", blocks), null);
  assert.equal(parse([{ op: "format", block: 9, bold: true }]), null);
  assert.equal(parse([{ op: "format", block: 2, text: "LIFO" }]), null, "a format with no style does nothing");
});

test("only http and https links are kept", () => {
  assert.equal(safeHref("example.com/a"), "https://example.com/a");
  assert.equal(safeHref("http://x.org"), "http://x.org/");
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,hi"), null);
  assert.equal(plainWords("[stack](https://x) is **LIFO** and ==fast=="), "stack is LIFO and fast");
});

test("each step is described in plain words for the preview", () => {
  const plan = parse([
    { op: "format", block: 2, text: "LIFO", bold: true, color: "red" },
    { op: "link", block: 2, text: "stack", href: "https://en.wikipedia.org/wiki/Stack" },
    { op: "check", block: 3, done: true },
  ]);
  assert.ok(plan);
  assert.deepEqual(
    plan.ops.map((op) => describePageOp(op, blocks)),
    ["“LIFO”: bold, red text", "Link “stack” to en.wikipedia.org", "Tick every item in block 3 (“Revise stacks\nRead chapter 2”)"],
  );
});

test("with a page open, editing words or a selection mean the page's tools", () => {
  for (const message of [
    "make LIFO bold",
    "highlight the definition",
    "link the word stack to Wikipedia",
    "embed a video about stacks after the first paragraph",
    "tick off revise stacks, add a to-do to practise 5 problems",
    "turn the last paragraph into a callout",
    "rename this page to Stacks and Queues",
    "fix the typos",
  ]) {
    assert.equal(looksLikePageEdit(message, false), true, message);
  }
  assert.equal(looksLikePageEdit("make this shorter", true), true, "a selection points at the page");
  assert.equal(looksLikePageEdit("make this shorter", false), false);
  for (const message of ["what is a stack?", "remind me to revise stacks at 6", "add a task to my planner", "make a mind map of this", "create a new page on queues"]) {
    assert.equal(looksLikePageEdit(message, true), false, message);
  }
});
