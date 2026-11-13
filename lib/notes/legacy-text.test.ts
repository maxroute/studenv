import test from "node:test";
import assert from "node:assert/strict";
import { textToNoteDoc } from "./legacy-text";
import { parseNoteDoc, type NoteNode } from "./note-format";
import { noteDocToPlainText } from "./plain-text";

const counter = () => {
  let n = 0;
  return () => `b_m${String(++n).padStart(9, "0")}`;
};
const shape = (nodes: NoteNode[] | undefined): unknown =>
  (nodes ?? []).map((n) => (n.type === "text" ? n.text : n.content ? [n.type, shape(n.content)] : n.type));

test("paragraphs split on blank lines, single line breaks become hard breaks", () => {
  const doc = textToNoteDoc("First line\nsecond line\n\nNew paragraph", counter());
  assert.deepEqual(shape(doc.doc.content), [
    ["paragraph", ["First line", "hardBreak", "second line"]],
    ["paragraph", ["New paragraph"]],
  ]);
});

test("bullets, numbered lists and headings are recognised, nothing else", () => {
  const doc = textToNoteDoc("# Title\n- one\n* two\n\n3. three\n4. four\n\n**not bold** and _x_", counter());
  assert.deepEqual(shape(doc.doc.content), [
    ["heading", ["Title"]],
    ["bulletList", [["listItem", [["paragraph", ["one"]]]], ["listItem", [["paragraph", ["two"]]]]]],
    ["orderedList", [["listItem", [["paragraph", ["three"]]]], ["listItem", [["paragraph", ["four"]]]]]],
    ["paragraph", ["**not bold** and _x_"]],
  ]);
  assert.equal(doc.doc.content[2].attrs?.start, 3);
  assert.equal(doc.doc.content[0].attrs?.level, 1);
});

test("text is kept verbatim, including text that looks like markup", () => {
  const text = "v < c and E > 0\n<script>not code</script>";
  assert.equal(noteDocToPlainText(textToNoteDoc(text, counter()).doc), "v < c and E > 0\n<script>not code</script>");
});

test("the result is a valid document with unique block ids", () => {
  const doc = textToNoteDoc("a\n\n- b\n- c\n\n# d", counter());
  const parsed = parseNoteDoc(doc);
  assert.equal(parsed.repaired, false);
  assert.equal(parsed.canSave, true);
});

test("empty or missing notes give one empty paragraph; Windows line endings work", () => {
  for (const empty of ["", null, undefined, "\n\n  \n"]) {
    assert.deepEqual(shape(textToNoteDoc(empty, counter()).doc.content), ["paragraph"]);
  }
  assert.deepEqual(shape(textToNoteDoc("a\r\nb\r\n\r\nc", counter()).doc.content), [["paragraph", ["a", "hardBreak", "b"]], ["paragraph", ["c"]]]);
});
