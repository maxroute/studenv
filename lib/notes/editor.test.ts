import test from "node:test";
import assert from "node:assert/strict";
import { getSchema } from "@tiptap/core";
import { NOTE_NODE_TYPES } from "./block-registry";
import { fromEditorJSON, toEditorContent } from "./editor-bridge";
import { createNoteExtensions, ID_NODE_TYPES } from "./editor-extensions";
import { NOTE_DOC_FORMAT, parseNoteDoc, serializeNoteDoc } from "./note-format";

const schema = getSchema(createNoteExtensions());

test("every stored node type exists in the editor with the same kind", () => {
  for (const [type, def] of Object.entries(NOTE_NODE_TYPES)) {
    const nodeType = schema.nodes[type];
    assert.ok(nodeType, `editor has ${type}`);
    assert.equal(nodeType.isInline, def.kind === "inline", `${type} is ${def.kind}`);
  }
});

test("every node type that carries a block id has the id attribute in the editor", () => {
  for (const type of ID_NODE_TYPES) {
    assert.ok(Object.hasOwn(schema.nodes[type].spec.attrs ?? {}, "id"), `${type} has id`);
  }
});

test("the marks the format knows exist in the editor, and links can hold a reference", () => {
  for (const mark of ["bold", "italic", "underline", "strike", "code", "highlight", "link"]) {
    assert.ok(schema.marks[mark], `editor has ${mark}`);
  }
  assert.ok(Object.hasOwn(schema.marks.link.spec.attrs ?? {}, "ref"));
});

const stored = {
  format: NOTE_DOC_FORMAT,
  version: 1,
  doc: {
    type: "doc",
    content: [
      { type: "heading", attrs: { id: "b_aaaaaaaaaa", level: 2 }, content: [{ type: "text", text: "Cells" }] },
      {
        type: "paragraph",
        attrs: { id: "b_bbbbbbbbbb" },
        content: [
          { type: "text", text: "see ", marks: [{ type: "bold" }] },
          { type: "mention", attrs: { ref: "note:n1", label: "Mitosis" } },
          { type: "text", text: " v < c", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        ],
      },
      { type: "taskList", content: [{ type: "taskItem", attrs: { id: "b_cccccccccc", checked: true }, content: [{ type: "paragraph", attrs: { id: "b_dddddddddd" } }] }] },
      { type: "kanban", attrs: { id: "b_eeeeeeeeee" } },
    ],
  },
};

test("a stored document loads into the editor and comes back unchanged", () => {
  const parsed = parseNoteDoc(stored);
  const { content, lossless } = toEditorContent(parsed.envelope.doc, schema);
  assert.equal(lossless, true);
  const roundTrip = (doc: typeof parsed.envelope.doc) => {
    const editorDoc = schema.nodeFromJSON(toEditorContent(doc, schema).content);
    return parseNoteDoc(fromEditorJSON(editorDoc.toJSON()));
  };
  const once = roundTrip(parsed.envelope.doc);
  assert.equal(once.repaired, false, "nothing to repair after an editor round trip");
  assert.deepEqual(once.envelope.doc.content.map((node) => node.attrs?.id), ["b_aaaaaaaaaa", "b_bbbbbbbbbb", undefined, "b_eeeeeeeeee"]);
  assert.equal(JSON.stringify(once.envelope.doc.content[3].attrs?.raw), JSON.stringify(stored.doc.content[3]), "the newer block is kept");
  // The editor fills in default attributes (a link's rel, …) once; after that it is stable.
  const twice = roundTrip(once.envelope.doc);
  assert.equal(serializeNoteDoc(twice.envelope), serializeNoteDoc(once.envelope));
  assert.equal(content.type, "doc");
});

test("unknown marks or attributes from a newer build make the document read-only, not lossy", () => {
  const withUnknownMark = parseNoteDoc({
    ...stored,
    doc: { type: "doc", content: [{ type: "paragraph", attrs: { id: "b_aaaaaaaaaa" }, content: [{ type: "text", text: "x", marks: [{ type: "sparkle" }] }] }] },
  });
  assert.equal(toEditorContent(withUnknownMark.envelope.doc, schema).lossless, false);

  const withUnknownAttr = parseNoteDoc({
    ...stored,
    doc: { type: "doc", content: [{ type: "paragraph", attrs: { id: "b_aaaaaaaaaa", align: "center" } }] },
  });
  const result = toEditorContent(withUnknownAttr.envelope.doc, schema);
  assert.equal(result.lossless, false);
  assert.doesNotThrow(() => schema.nodeFromJSON(result.content), "it still displays");
});
