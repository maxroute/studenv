import assert from "node:assert/strict";
import test from "node:test";
import { NOTE_DOC_FORMAT, NOTE_DOC_VERSION, parseNoteDoc, type NoteNode } from "@/lib/notes/note-format";
import { bottomUp, citationLabel, citationNodes, editInstruction, outline, pageFromDraft, pageInstruction, pageUnchanged, parseEditPlan, type PageBlock, type PageCitation } from "./page";

let counter = 0;
const ids = () => `b_page${String(counter++).padStart(6, "0")}`;
const textOf = (node: NoteNode): string => (node.text ?? "") + (node.content ?? []).map(textOf).join("");

const NOTE_CITATION: PageCitation = { n: 1, ref: "note:n1#b_AAAAAAAAAA", sourceType: "note", title: "CS notes", heading: "Kernel", open: { kind: "note", noteId: "n1", blockId: "b_AAAAAAAAAA" } };
const PDF_CITATION: PageCitation = { n: 2, ref: "asset:a1#page4", sourceType: "pdf", title: "Textbook", heading: "Page 4", open: { kind: "pdf", assetId: "a1", page: 4, itemId: null } };
const WEB_CITATION: PageCitation = { n: 3, ref: "https://en.wikipedia.org/wiki/Kernel", sourceType: "web", title: "Kernel (operating system)", heading: "Wikipedia", open: { kind: "web", url: "https://en.wikipedia.org/wiki/Kernel" } };

test("the page instruction asks for the teaching structure and the Markdown the converter reads", () => {
  const text = pageInstruction("make a note on OS so i can revise", "operating systems");
  for (const part of ["# and a clear page title", "## Revision", "### Test yourself", "Q: … followed by a line A: …", "> [!tip]", "> [!mistake]", "| Term | Meaning |"]) {
    assert.ok(text.includes(part), part);
  }
});

test("the outline lists the section headings without marks", () => {
  assert.deepEqual(outline("# T\n## What an OS does [1]\ntext\n### **Kernel**\n#### deep"), ["What an OS does", "Kernel"]);
});

test("citations become @mentions of the student's material, or Wikipedia links", () => {
  assert.equal(citationLabel(NOTE_CITATION), "CS notes › Kernel");
  assert.equal(citationLabel(PDF_CITATION), "Textbook, p. 4");
  assert.deepEqual(citationNodes(NOTE_CITATION), [{ type: "mention", attrs: { ref: "note:n1#b_AAAAAAAAAA", label: "CS notes › Kernel" } }]);
  assert.deepEqual(citationNodes(WEB_CITATION), [{ type: "text", text: "Wikipedia: Kernel (operating system)", marks: [{ type: "link", attrs: { href: "https://en.wikipedia.org/wiki/Kernel", ref: null } }] }]);
});

test("a draft becomes a saveable page with a source note at the top and cited mentions", () => {
  const page = pageFromDraft(
    { title: "fallback", markdown: "# Operating Systems\n## Kernel\nThe kernel runs in privileged mode [1][3]. See p. 4 [2]. Unknown [9].", citations: [NOTE_CITATION, PDF_CITATION, WEB_CITATION] },
    ids,
  );
  assert.equal(page.title, "Operating Systems");
  assert.equal(page.blocks[0].type, "callout");
  assert.match(textOf(page.blocks[0]), /Linked parts come from your sources/);
  const paragraph = page.blocks[2];
  assert.deepEqual(paragraph.content?.map((node) => (node.type === "mention" ? `@${node.attrs?.label}` : node.text)), [
    "The kernel runs in privileged mode ",
    "@CS notes › Kernel",
    " ",
    "Wikipedia: Kernel (operating system)",
    ". See p. 4 ",
    "@Textbook, p. 4",
    ". Unknown.",
  ]);
  const parsed = parseNoteDoc(JSON.stringify({ format: NOTE_DOC_FORMAT, version: NOTE_DOC_VERSION, doc: { type: "doc", content: page.blocks } }));
  assert.equal(parsed.repaired, false);
  assert.deepEqual(parsed.warnings, []);
});

test("a draft without sources says it is general knowledge; a draft without a title line keeps the given title", () => {
  const page = pageFromDraft({ title: "Operating systems", markdown: "## Kernel\nIt runs things.", citations: [] }, ids);
  assert.equal(page.title, "Operating systems");
  assert.match(textOf(page.blocks[0]), /general knowledge: no sources were found/);
});

const PAGE: PageBlock[] = [
  { type: "heading", text: "Operating systems", locked: false },
  { type: "paragraph", text: "An OS manages hardware.", locked: false },
  { type: "pdfPage", text: "Textbook p. 4", locked: true },
  { type: "paragraph", text: "The kernel is the core.", locked: false },
  { type: "bulletList", text: "processes memory files", locked: false },
];

test("the edit instruction numbers the blocks and marks locked ones", () => {
  const text = editInstruction("simplify the kernel part", "OS", PAGE);
  assert.match(text, /\[3\] \(PDF page, locked\) Textbook p\. 4/);
  assert.match(text, /\[5\] \(bullet list\) processes memory files/);
  assert.match(text, /Never replace a locked block/);
});

test("a safe edit plan is kept; unsafe changes are dropped", () => {
  const reply = JSON.stringify({
    summary: "Simplified the kernel paragraph and added a summary.",
    changes: [
      { replace: [4, 4], markdown: "The **kernel** is the part that controls the computer [1]." },
      { replace: [3, 3], markdown: "overwrite the pdf" },
      { replace: [4, 5], markdown: "overlaps the first change" },
      { insertAfter: 5, markdown: "## Summary\n- Key point" },
      { insertAfter: 5, markdown: "a second insert at the same place" },
      { insertAfter: 3, markdown: "right before a replaced block" },
      { replace: [9, 10], markdown: "past the end" },
      { insertAfter: 0, markdown: "" },
      { insertAfter: "0", markdown: "> [!tip] Start here" },
    ],
  });
  assert.deepEqual(parseEditPlan(reply, PAGE), {
    summary: "Simplified the kernel paragraph and added a summary.",
    changes: [
      { kind: "replace", from: 4, to: 4, markdown: "The **kernel** is the part that controls the computer [1]." },
      { kind: "insert", after: 5, markdown: "## Summary\n- Key point" },
      { kind: "insert", after: 0, markdown: "> [!tip] Start here" },
    ],
  });
  assert.equal(parseEditPlan("no json", PAGE), null);
  assert.equal(parseEditPlan(JSON.stringify({ changes: [{ replace: [3, 3], markdown: "x" }] }), PAGE), null);
});

test("changes apply from the bottom up, and only to a page that hasn't changed underneath", () => {
  const changes = [
    { kind: "insert" as const, after: 0, markdown: "a" },
    { kind: "replace" as const, from: 4, to: 4, markdown: "b" },
    { kind: "insert" as const, after: 5, markdown: "c" },
  ];
  assert.deepEqual(bottomUp(changes).map((change) => change.markdown), ["c", "b", "a"]);
  assert.equal(pageUnchanged(PAGE, PAGE, changes), true);
  const edited = PAGE.map((block, index) => (index === 3 ? { ...block, text: "The kernel is the core of the OS." } : block));
  assert.equal(pageUnchanged(PAGE, edited, changes), false, "the student edited a block the change replaces");
  const extended = [...PAGE, { type: "paragraph", text: "new last line", locked: false }];
  assert.equal(pageUnchanged(PAGE, extended, [{ kind: "replace", from: 2, to: 2, markdown: "x" }]), true, "edits elsewhere don't block it");
});
