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
  const text = pageInstruction("make a note on OS so i can revise", "operating systems", { kind: "revision" });
  // Self-test questions are asked for as Q: and A: line pairs, the shape the converter turns into toggles.
  for (const part of ["# and a clear, inviting page title", "## Test yourself: 5 self-test questions", "> [!key]", "> [!mistake]", "summary table", "==highlight==", 'one starting \"Q: \" with the question, the next starting \"A: \"', "Q: and A: line pairs", "- [ ] to-dos"]) {
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

// --- New pages: kinds, video, links -------------------------------------------------

import { draftEmbeds, draftLinks, embedsToShelf, finishDraft, guessPageKind, pageInstruction as instructionFor, unlinkMissing } from "./page";

test("the kind of page comes from the request's words, or is left to Rangan", () => {
  assert.equal(guessPageKind("make me a cheat sheet for SQL joins"), "cheatsheet");
  assert.equal(guessPageKind("notes to prepare for my DBMS exam"), "exam");
  assert.equal(guessPageKind("quick revision notes on stacks"), "revision");
  assert.equal(guessPageKind("make notes from this lecture"), "lecture");
  assert.equal(guessPageKind("explain how photosynthesis works"), "explainer");
  assert.equal(guessPageKind("create some notes on graphs"), null, "a vague request lets Rangan choose");
});

test("a vague request gets every recipe and is asked to name its kind; a clear one gets its own", () => {
  const vague = instructionFor("create some notes on graphs", "graphs");
  assert.match(vague, /<!-- kind: explainer -->/);
  for (const recipe of ["Explainer", "Revision sheet", "Exam prep", "Cheat sheet", "Lecture notes"]) assert.match(vague, new RegExp(recipe));
  const clear = instructionFor("cheat sheet for SQL", "SQL", { kind: "cheatsheet", video: { title: "SQL in 10 minutes" } });
  assert.match(clear, /Cheat sheet \(everything at a glance\)/);
  assert.doesNotMatch(clear, /Explainer \(to understand/);
  assert.match(clear, /\[\[video\]\] once/);
  assert.match(instructionFor("x", "x"), /Do not mention videos/);
});

test("a draft loses its kind line, gets the video once, and keeps the kind", () => {
  const draft = "<!-- kind: revision -->\n# Stacks\n\n[[video]]\n\nText\n\n[[video]]";
  assert.deepEqual(finishDraft(draft, { kind: null, videoUrl: "https://www.youtube.com/watch?v=abc12345678" }), {
    markdown: "# Stacks\n\n[[embed:https://www.youtube.com/watch?v=abc12345678]]\n\nText",
    kind: "revision",
  });
  assert.deepEqual(finishDraft("# T\n\n[[video]]\n\nBody", { kind: "exam", videoUrl: null }), { markdown: "# T\n\nBody", kind: "exam" });
  assert.equal(finishDraft("<!-- kind: poem -->\n# T", { kind: null, videoUrl: null }).kind, "explainer", "an unknown kind falls back");
});

test("made-up links become plain words; videos to embed are found and swapped for Shelf items", () => {
  const markdown = "See [Stacks](https://en.wikipedia.org/wiki/Stack) and [fake](https://en.wikipedia.org/wiki/Nope).\n\n[[embed:https://www.youtube.com/watch?v=abc12345678]]\n\n[[embed:https://example.com/gone]]";
  assert.deepEqual(draftLinks(markdown), ["https://en.wikipedia.org/wiki/Stack", "https://en.wikipedia.org/wiki/Nope"]);
  assert.match(unlinkMissing(markdown, new Set(["https://en.wikipedia.org/wiki/Nope"])), /\[Stacks\]\(https:\/\/en\.wikipedia\.org\/wiki\/Stack\) and fake\./);
  assert.deepEqual(draftEmbeds(markdown), ["https://www.youtube.com/watch?v=abc12345678", "https://example.com/gone"]);
  const saved = embedsToShelf(markdown, new Map([["https://www.youtube.com/watch?v=abc12345678", "item9"]]));
  assert.match(saved, /^\[\[embed:item:item9\]\]$/m);
  assert.doesNotMatch(saved, /example\.com\/gone/, "a card that couldn't be saved is left out");
});

import { newPageTopic } from "./page";

test("any wording that asks for notes on a topic is a request for a new page", () => {
  assert.equal(newPageTopic("notes on sql joins"), "sql joins");
  assert.equal(newPageTopic("create some notes on graphs"), "graphs");
  assert.equal(newPageTopic("make me quick revision notes about photosynthesis."), "photosynthesis");
  assert.equal(newPageTopic("cheat sheet for git commands"), "git commands");
  assert.equal(newPageTopic("I need a study guide for thermodynamics"), "thermodynamics");
  for (const message of ["what do my notes on graphs say?", "summarize my notes on sql", "what is a graph", "search notes on trees", "hello"]) {
    assert.equal(newPageTopic(message), null, message);
  }
});

test("a stray \"Q:/A:\" line is taken off a draft; real Q: and A: lines stay", () => {
  const { markdown } = finishDraft("# Photosynthesis\n## Test yourself\n\nQ:/A:\n\nQ: What pigment captures light?\nA: Chlorophyll.\n**Q:/A:**", { kind: "revision", videoUrl: null });
  assert.doesNotMatch(markdown, /Q:\/A:/);
  assert.match(markdown, /Q: What pigment captures light\?\nA: Chlorophyll\./);
});

test("the instruction asks for worked, correct answers in the request's language, with no sign-offs", () => {
  const text = pageInstruction("exam prep on identities", "trigonometry", { kind: "exam" });
  for (const part of ["each answer fully worked", "Work out every answer and example carefully", "write them in the language of the request", "No sign-off lines", "where their notes cover a point, use what they say and cite them"]) {
    assert.ok(text.includes(part), part);
  }
  assert.ok(!text.includes("Q:/A:"), "the instruction never shows the literal Q:/A:");
});

test("a request in Bengali or Hindi script asks for every heading in that language; English asks nothing extra", () => {
  assert.match(pageInstruction("কোষ বিভাজন নিয়ে একটা নোট লেখো", "কোষ বিভাজন"), /This request is in Bengali: write every heading in Bengali, including .*Check yourself/);
  assert.match(pageInstruction("प्रकाश संश्लेषण पर नोट्स लिखो", "प्रकाश संश्लेषण"), /This request is in Hindi/);
  assert.doesNotMatch(pageInstruction("notes on photosynthesis", "photosynthesis"), /This request is in/);
});

test("in another language the recipe's English headings are described, not given", () => {
  const bengali = pageInstruction("কোষ বিভাজন নিয়ে একটা নোট লেখো", "কোষ বিভাজন", { kind: "explainer" });
  assert.match(bengali, /a ## heading meaning "Check yourself" written in Bengali/);
  assert.match(bengali, /a ## heading meaning "Next steps" written in Bengali/);
  assert.match(bengali, /a ### heading meaning "Why it matters" written in Bengali/);
  assert.doesNotMatch(bengali, /## Check yourself|## Next steps/);
  // "One ## section per idea" isn't a heading's name and stays as it is.
  assert.match(bengali, /One ## section per idea/);
  assert.match(pageInstruction("notes on cells", "cells", { kind: "explainer" }), /## Check yourself/);
});
