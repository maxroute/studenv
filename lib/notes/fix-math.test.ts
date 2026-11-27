import { test } from "node:test";
import assert from "node:assert/strict";
import { fixMath } from "./fix-math";
import { markdownToNote } from "./markdown-to-note";
import type { NoteDoc, NoteNode } from "./note-format";

const p = (...content: NoteNode[]): NoteNode => ({ type: "paragraph", attrs: { id: "b_0000000001" }, content });
const t = (text: string, marks?: NoteNode["marks"]): NoteNode => ({ type: "text", text, ...(marks ? { marks } : {}) });
const doc = (...content: NoteNode[]): NoteDoc => ({ type: "doc", content });
const latexOf = (nodes: NoteNode[] = []) => nodes.filter((node) => node.type === "inlineMath").map((node) => node.attrs?.latex);

test("all the ways maths is written inside a sentence", () => {
  const { doc: fixed, found } = fixMath(doc(p(t("Use $$\\tan\\theta$$ and \\(x^2\\) or \\[a+b\\] and $v = d/t$ here."))));
  assert.equal(found, 4);
  assert.deepEqual(latexOf(fixed.content[0].content), ["\\tan\\theta", "x^2", "a+b", "v = d/t"]);
  assert.equal(fixed.content[0].content?.at(-1)?.text, " here.");
});

test("money and code are left alone", () => {
  const code: NoteNode = { type: "codeBlock", content: [t("$$x$$")] };
  const original = doc(p(t("It costs $5 or $10.")), p(t("$$y$$", [{ type: "code" }])), code);
  const { doc: fixed, found } = fixMath(original);
  assert.equal(found, 0);
  assert.equal(fixed, original);
});

test("a paragraph of one equation becomes a block, keeping its id", () => {
  const { doc: fixed } = fixMath(doc(p(t("$$\\sin^2\\theta+\\cos^2\\theta=1$$"))));
  assert.deepEqual(fixed.content[0], { type: "blockMath", attrs: { id: "b_0000000001", latex: "\\sin^2\\theta+\\cos^2\\theta=1" } });
});

test("maths in table cells and lists is found, and marks on the words stay", () => {
  const cell: NoteNode = { type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", content: [p(t("The "), t("ratio", [{ type: "bold" }]), t(" $$\\sin\\theta$$"))] }] }] };
  const { doc: fixed, found } = fixMath(doc(cell));
  assert.equal(found, 1);
  const inner = fixed.content[0].content?.[0].content?.[0].content?.[0].content ?? [];
  assert.deepEqual(inner.find((node) => node.text === "ratio")?.marks, [{ type: "bold" }]);
  assert.deepEqual(latexOf(inner), ["\\sin\\theta"]);
});

test("Rangan's Markdown keeps maths in tables, lists and sentences", () => {
  let n = 0;
  const { blocks } = markdownToNote(
    [
      "| Function | Definition |",
      "|---|---|",
      "| $$\\sin\\theta$$ | opposite / hypotenuse |",
      "",
      "1. Use $$\\tan\\theta = \\frac{o}{a}$$ $$\\tan30^\\circ = \\frac{h}{12}$$",
      "",
      "$$a$$ $$b$$",
      "",
      "\\[E = mc^2\\]",
      "",
      "The sine repeats every \\(2\\pi\\) radians.",
    ].join("\n"),
    { generateId: () => `b_${String(++n).padStart(10, "0")}` },
  );
  const all = JSON.stringify(blocks);
  assert.ok(!all.includes("$$") && !all.includes("\\\\("), all);
  assert.equal(blocks[2].type, "paragraph", "two equations on one line stay in a paragraph");
  assert.equal(blocks[3].type, "blockMath");
  assert.equal(blocks[3].attrs?.latex, "E = mc^2");
});
