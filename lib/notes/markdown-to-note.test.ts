import assert from "node:assert/strict";
import test from "node:test";
import { inlineNodes, markdownToNote } from "./markdown-to-note";
import { NOTE_DOC_FORMAT, NOTE_DOC_VERSION, parseNoteDoc, type NoteNode } from "./note-format";

let counter = 0;
const ids = () => `b_test${String(counter++).padStart(6, "0")}`;
const convert = (markdown: string, citation?: (n: number) => NoteNode[] | null) => markdownToNote(markdown, { generateId: ids, citation });
const textOf = (node: NoteNode): string => (node.text ?? "") + (node.content ?? []).map(textOf).join("");

const PAGE = `# Operating Systems

## What an OS does
An operating system manages hardware and software resources [1]. It runs
programs for you.

> [!tip] Exam tip: draw the layers from hardware up.

| Part | Job |
| --- | --- |
| Kernel | Runs in privileged mode |
| Shell | Takes your commands |

- Process management
  - Scheduling
- Memory management

1. Boot
2. Start the kernel

> [!warning] Common mistake: the OS is not the same as the user interface.

## Test yourself
Q: What does the kernel do?
A: It manages the CPU, memory and devices [2].
Q: Name one OS service.
A: File management.

\`\`\`c
fork();
\`\`\`
---
See [Wikipedia](https://en.wikipedia.org/wiki/Operating_system) and **bold** *italic* \`code\`.`;

test("a whole teaching page converts to ordinary blocks the page loader accepts as is", () => {
  const citation = (n: number): NoteNode[] | null =>
    n === 1 ? [{ type: "mention", attrs: { ref: "note:n1#b_AAAAAAAAAA", label: "CS notes" } }] : n === 2 ? [{ type: "text", text: "Wikipedia", marks: [{ type: "link", attrs: { href: "https://en.wikipedia.org/wiki/Kernel", ref: null } }] }] : null;
  const { title, blocks } = markdownToNote(PAGE, { citation });
  assert.equal(title, "Operating Systems");
  assert.deepEqual(blocks.map((block) => block.type), [
    "heading", "paragraph", "callout", "table", "bulletList", "orderedList", "callout", "heading", "details", "details", "codeBlock", "horizontalRule", "paragraph",
  ]);
  const parsed = parseNoteDoc(JSON.stringify({ format: NOTE_DOC_FORMAT, version: NOTE_DOC_VERSION, doc: { type: "doc", content: blocks } }));
  assert.equal(parsed.canSave, true);
  assert.equal(parsed.repaired, false, "every block has a unique id and valid attributes");
  assert.deepEqual(parsed.warnings, []);
  assert.equal(JSON.stringify(parsed.envelope.doc).includes("unsupported"), false);
});

test("headings sit under the page title; paragraphs join their lines", () => {
  const { blocks } = convert("# T\n## A\n### B\n#### C\nline one\nline two\n\nnext");
  assert.deepEqual(blocks.map((block) => [block.type, block.attrs?.level ?? null, textOf(block)]), [
    ["heading", 2, "A"],
    ["heading", 3, "B"],
    ["heading", 3, "C"],
    ["paragraph", null, "line one line two"],
    ["paragraph", null, "next"],
  ]);
});

test("lists nest by indent and keep their numbering", () => {
  const { blocks } = convert("3. three\n4. four\n   - sub a\n   - sub b\n5. five");
  const listNode = blocks[0];
  assert.equal(listNode.type, "orderedList");
  assert.deepEqual(listNode.attrs, { start: 3 });
  const items = listNode.content ?? [];
  assert.deepEqual(items.map((item) => textOf(item.content?.[0] ?? { type: "x" })), ["three", "four", "five"]);
  assert.equal(items[1].content?.[1]?.type, "bulletList");
  assert.equal(items[1].content?.[1]?.content?.length, 2);
});

test("tables get a header row and even rows", () => {
  const { blocks } = convert("| A | B |\n|---|:-:|\n| 1 |\n| 2 | 3 |");
  const rows = blocks[0].content ?? [];
  assert.deepEqual(rows.map((row) => row.content?.map((cell) => cell.type)), [["tableHeader", "tableHeader"], ["tableCell", "tableCell"], ["tableCell", "tableCell"]]);
  assert.equal(textOf(rows[1].content?.[1] ?? { type: "x" }), "", "a short row is padded");
});

test("tip and mistake callouts get their variants; plain quotes stay quotes", () => {
  const { blocks } = convert("> [!tip] Remember X\n\n> [!mistake] Don't confuse Y\n> with Z\n\n> Just a quote");
  assert.deepEqual(blocks.map((block) => [block.type, block.attrs?.variant ?? null, textOf(block)]), [
    ["callout", "info", "Remember X"],
    ["callout", "warning", "Don't confuse Y with Z"],
    ["blockquote", null, "Just a quote"],
  ]);
});

test("Q and A lines become closed toggles with the answer inside", () => {
  const { blocks } = convert("**Q1:** Why?\n**A:** Because.\n- Q: How?\n  A: Like this.");
  assert.deepEqual(blocks.map((block) => [block.type, block.attrs?.open, textOf(block.content?.[0] ?? { type: "x" }), textOf(block.content?.[1] ?? { type: "x" })]), [
    ["details", false, "Why?", "Because."],
    ["details", false, "How?", "Like this."],
  ]);
});

test("inline marks, links and citations", () => {
  const nodes = inlineNodes("A **b** *c* _d_ `e` [f](https://example.org) g [1] [7].", (n) => (n === 1 ? [{ type: "mention", attrs: { ref: "note:x", label: "X" } }] : null));
  assert.deepEqual(
    nodes.map((node) => (node.type === "mention" ? "@X" : `${node.text}${node.marks ? `<${node.marks.map((mark) => mark.type).join(",")}>` : ""}`)),
    ["A ", "b<bold>", " ", "c<italic>", " ", "d<italic>", " ", "e<code>", " ", "f<link>", " g ", "@X", "."],
  );
  assert.deepEqual(inlineNodes("snake_case_name stays"), [{ type: "text", text: "snake_case_name stays" }]);
  assert.deepEqual(inlineNodes("Only http links: [x](javascript:alert(1))"), [{ type: "text", text: "Only http links: [x](javascript:alert(1))" }]);
});

test("without a title line, the title is null and nothing is lost", () => {
  const { title, blocks } = convert("Just text.");
  assert.equal(title, null);
  assert.equal(textOf(blocks[0]), "Just text.");
  assert.deepEqual(convert("").blocks, []);
});
