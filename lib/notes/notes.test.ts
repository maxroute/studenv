import test from "node:test";
import assert from "node:assert/strict";
import { formatRef } from "@/lib/refs/ref-grammar";
import { classifyRef } from "@/lib/refs/ref-types";
import { isLinkKind } from "@/lib/refs/link-kinds";
import { BLOCK_ID_PATTERN, generateBlockId, isBlockId } from "./block-ids";
import { extractNoteRefs } from "./extract-refs";
import {
  NOTE_DOC_FORMAT,
  NOTE_DOC_VERSION,
  createEmptyNoteDoc,
  noteNodeTypes,
  parseNoteDoc,
  serializeNoteDoc,
  walkNoteNodes,
  type NoteNode,
} from "./note-format";
import { noteDocToPlainText } from "./plain-text";

/** Deterministic ids: b_t000000001, b_t000000002, … */
function idCounter() {
  let n = 0;
  return () => `b_t${String(++n).padStart(9, "0")}`;
}

const envelope = (content: unknown[], version = NOTE_DOC_VERSION) =>
  JSON.stringify({ format: NOTE_DOC_FORMAT, version, doc: { type: "doc", content } });

const para = (id: string, text?: string) =>
  text === undefined ? { type: "paragraph", attrs: { id } } : { type: "paragraph", attrs: { id }, content: [{ type: "text", text }] };

const ID_A = "b_8f2kq0x1zt";
const ID_B = "b_q1w9e8r7ty";
const ID_C = "b_zzzzzzzzz1";

// ── block ids ──────────────────────────────────────────────────────────────

test("generated block ids have the documented form and match the note reference anchor", () => {
  for (let i = 0; i < 200; i += 1) {
    const id = generateBlockId();
    assert.match(id, BLOCK_ID_PATTERN);
    const classified = classifyRef({ type: "note", id: "n1", anchor: id });
    assert.deepEqual(classified.known && classified.anchor, { blockId: id }, "refs and notes agree on block ids");
  }
  assert.equal(isBlockId("b_123"), false);
  assert.equal(isBlockId(42), false);
});

// ── load and save ──────────────────────────────────────────────────────────

test("a valid document loads unchanged and saves byte for byte", () => {
  const json = envelope([
    { type: "heading", attrs: { id: ID_A, level: 1 }, content: [{ type: "text", text: "Cell biology" }] },
    {
      type: "paragraph",
      attrs: { id: ID_B },
      content: [
        { type: "text", text: "See ", marks: [{ type: "bold" }] },
        { type: "mention", attrs: { ref: "note:clx9#b_2k8f0q1x7z", label: "Mitosis" } },
      ],
    },
    { type: "citation", attrs: { id: ID_C, ref: "asset:clp1#page4", quote: "Quoted" } },
  ]);
  const parsed = parseNoteDoc(json);
  assert.equal(parsed.repaired, false);
  assert.equal(parsed.canSave, true);
  assert.deepEqual(parsed.warnings, []);
  assert.equal(serializeNoteDoc(parsed.envelope), json);
});

test("unreadable JSON or a wrong envelope loads as an unsupported block holding the raw input", () => {
  for (const input of ["{not json", JSON.stringify({ hello: "world" }), JSON.stringify({ format: NOTE_DOC_FORMAT, version: 0, doc: { type: "doc" } })]) {
    const parsed = parseNoteDoc(input, { generateId: idCounter() });
    assert.equal(parsed.repaired, true);
    const [block] = parsed.envelope.doc.content;
    assert.equal(block.type, "unsupported");
    assert.equal(block.attrs?.raw, input, "nothing is thrown away");
    assert.ok(serializeNoteDoc(parsed.envelope).includes(JSON.stringify(input).slice(1, -1)));
  }
});

test("a document from a newer version loads read-only", () => {
  const parsed = parseNoteDoc(envelope([para(ID_A, "future")], NOTE_DOC_VERSION + 1));
  assert.equal(parsed.canSave, false);
  assert.equal(noteDocToPlainText(parsed.envelope.doc), "future", "it is still shown");
});

test("unknown block and inline types round-trip unchanged", () => {
  const futureBlock = { type: "kanban", attrs: { id: ID_B, columns: 3 }, content: [{ type: "lane", text: "x" }] };
  const futureInline = { type: "emojiPicker", attrs: { name: "tada" } };
  const json = envelope([para(ID_A, "before"), futureBlock, { type: "paragraph", attrs: { id: ID_C }, content: [futureInline] }]);
  const parsed = parseNoteDoc(json);
  assert.equal(parsed.repaired, false, "wrapping alone is not a repair");
  const [, wrapped, withInline] = parsed.envelope.doc.content;
  assert.equal(wrapped.type, "unsupported");
  assert.equal(wrapped.attrs?.id, ID_B, "the original id is kept, so references to it still work");
  assert.equal(withInline.content?.[0].type, "unsupportedInline");
  assert.equal(serializeNoteDoc(parsed.envelope), json);
});

test("missing and duplicate block ids are assigned, keeping the first occurrence", () => {
  const parsed = parseNoteDoc(envelope([para(ID_A, "one"), para(ID_A, "two"), { type: "paragraph", content: [{ type: "text", text: "three" }] }]), {
    generateId: idCounter(),
  });
  assert.equal(parsed.repaired, true);
  assert.deepEqual(
    parsed.envelope.doc.content.map((node) => node.attrs?.id),
    [ID_A, "b_t000000001", "b_t000000002"],
  );
  const again = parseNoteDoc(serializeNoteDoc(parsed.envelope));
  assert.equal(again.repaired, false, "once saved, the fix is stable");
});

test("bad attributes are coerced, unknown attribute keys are kept", () => {
  const parsed = parseNoteDoc(
    envelope([
      { type: "heading", attrs: { id: ID_A, level: 9, color: "teal" }, content: [{ type: "text", text: "H" }] },
      { type: "citation", attrs: { id: ID_B, ref: "not a ref", quote: 5 } },
    ]),
  );
  assert.equal(parsed.repaired, true);
  const [heading, citation] = parsed.envelope.doc.content;
  assert.deepEqual(heading.attrs, { id: ID_A, level: 1, color: "teal" });
  assert.deepEqual(citation.attrs, { id: ID_B, ref: null, quote: "" });
});

test("references in attributes and link marks are stored canonically, unknown types included", () => {
  const parsed = parseNoteDoc(
    envelope([
      {
        type: "paragraph",
        attrs: { id: ID_A },
        content: [
          { type: "text", text: "link", marks: [{ type: "link", attrs: { ref: "item:ab%2fc" } }] },
          { type: "mention", attrs: { ref: "lesson:abc#t=93500", label: "Lesson" } },
        ],
      },
    ]),
  );
  const [paragraph] = parsed.envelope.doc.content;
  assert.deepEqual(paragraph.content?.[0].marks?.[0], { type: "link", attrs: { ref: "item:ab%2Fc" } });
  assert.equal(paragraph.content?.[1].attrs?.ref, "lesson:abc#t=93500");
  assert.equal(parsed.repaired, true, "the non-canonical spelling is saved canonically");
});

test("a link mark with only a URL saves unchanged", () => {
  const json = envelope([
    {
      type: "paragraph",
      attrs: { id: ID_A },
      content: [{ type: "text", text: "web", marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }] }],
    },
  ]);
  const parsed = parseNoteDoc(json);
  assert.equal(parsed.repaired, false);
  assert.equal(serializeNoteDoc(parsed.envelope), json);
});

test("structure is repaired so an editor can always load it", () => {
  const parsed = parseNoteDoc(
    envelope([
      { type: "text", text: "loose" },
      { type: "bulletList", content: [para(ID_A, "not in an item")] },
      { type: "bulletList" },
      { type: "codeBlock", attrs: { id: ID_B }, content: [{ type: "text", text: "x = 1", marks: [{ type: "bold" }] }] },
      { type: "horizontalRule", content: [para(ID_C)] },
      "junk",
    ]),
    { generateId: idCounter() },
  );
  assert.equal(parsed.repaired, true);
  const types = (nodes: NoteNode[] | undefined): unknown =>
    (nodes ?? []).map((node) => (node.content ? [node.type, types(node.content)] : node.type));
  assert.deepEqual(types(parsed.envelope.doc.content), [
    ["paragraph", ["text"]],
    ["bulletList", [["listItem", [["paragraph", ["text"]]]]]],
    ["bulletList", [["listItem", ["paragraph"]]]],
    ["codeBlock", ["text"]],
    "horizontalRule",
  ]);
  assert.equal(parsed.envelope.doc.content[3].content?.[0].marks, undefined, "code holds plain text");
});

test("an empty document gets one paragraph", () => {
  const parsed = parseNoteDoc(envelope([]), { generateId: idCounter() });
  assert.deepEqual(parsed.envelope.doc.content, [{ type: "paragraph", attrs: { id: "b_t000000001" } }]);
  assert.deepEqual(createEmptyNoteDoc(idCounter()).doc.content, [{ type: "paragraph", attrs: { id: "b_t000000001" } }]);
});

test("nesting deeper than the limit is kept verbatim instead of loaded", () => {
  let deep: unknown = para(ID_A, "bottom");
  for (let i = 0; i < 80; i += 1) deep = { type: "blockquote", attrs: { id: `b_q${String(i).padStart(9, "0")}` }, content: [deep] };
  const json = envelope([deep]);
  const parsed = parseNoteDoc(json);
  const kinds = [...walkNoteNodes(parsed.envelope.doc.content)].map(({ node }) => node.type);
  assert.ok(kinds.includes("unsupported"));
  assert.equal(serializeNoteDoc(parsed.envelope), json);
});

test("the registered node types are fixed", () => {
  assert.deepEqual(noteNodeTypes(), [
    "blockMath", "blockquote", "bulletList", "callout", "citation", "codeBlock", "details", "detailsContent",
    "detailsSummary", "embed", "hardBreak", "heading", "horizontalRule", "inlineMath", "listItem", "mention",
    "orderedList", "paragraph", "pdfPage", "table", "tableCell", "tableHeader", "tableRow", "taskItem", "taskList",
    "unsupported", "unsupportedInline",
  ]);
});

// ── plain text and references ──────────────────────────────────────────────

test("plain text has one line per block, including text kept from newer builds", () => {
  const parsed = parseNoteDoc(
    envelope([
      { type: "heading", attrs: { id: ID_A, level: 2 }, content: [{ type: "text", text: "Title" }] },
      {
        type: "paragraph",
        attrs: { id: ID_B },
        content: [
          { type: "text", text: "a" },
          { type: "hardBreak" },
          { type: "text", text: "b v < c and E > 0 " },
          { type: "mention", attrs: { ref: "note:x", label: "Mitosis" } },
        ],
      },
      { type: "bulletList", content: [{ type: "listItem", attrs: { id: ID_C }, content: [para("b_aaaaaaaaaa", "item")] }] },
      { type: "citation", attrs: { id: "b_bbbbbbbbbb", ref: "asset:a#page4", quote: "quoted" } },
      { type: "kanban", attrs: { id: "b_cccccccccc" }, content: [{ type: "lane", text: "future text" }] },
      para("b_dddddddddd"),
    ]),
  );
  assert.equal(noteDocToPlainText(parsed.envelope.doc), "Title\na\nb v < c and E > 0 Mitosis\nitem\nquoted\nfuture text");
});

test("references are extracted with their block, kind, and duplicates removed", () => {
  const parsed = parseNoteDoc(
    envelope([
      {
        type: "paragraph",
        attrs: { id: ID_A },
        content: [
          { type: "mention", attrs: { ref: "note:n1", label: "One" } },
          { type: "mention", attrs: { ref: "note:n1", label: "Again" } },
          { type: "text", text: "go", marks: [{ type: "link", attrs: { ref: "workspace:w1#item-9" } }] },
          { type: "text", text: "web", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
        ],
      },
      { type: "bulletList", content: [{ type: "listItem", attrs: { id: ID_B }, content: [{ type: "embed", attrs: { id: ID_C, ref: "lesson:abc#t=93500" } }] }] },
      { type: "citation", attrs: { id: "b_bbbbbbbbbb", ref: "asset:a#page4" } },
      { type: "citation", attrs: { id: "b_cccccccccc", ref: "bad ref" } },
    ]),
  );
  const refs = extractNoteRefs(parsed.envelope.doc).map(({ ref, kind, sourceAnchor }) => [formatRef(ref), kind, sourceAnchor]);
  assert.deepEqual(refs, [
    ["note:n1", "mention", ID_A],
    ["workspace:w1#item-9", "link", ID_A],
    ["lesson:abc#t=93500", "embed", ID_C],
    ["asset:a#page4", "citation", "b_bbbbbbbbbb"],
  ]);
  assert.ok(refs.every(([, kind]) => isLinkKind(kind)));
});
