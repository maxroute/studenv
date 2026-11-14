import assert from "node:assert/strict";
import test from "node:test";
import { coerceStroke, coerceStrokes, MAX_STROKES_PER_PAGE, strokeHitsPoint } from "./annotations";
import { parseNoteDoc } from "./note-format";
import { extractNoteRefs } from "./extract-refs";
import { formatRef } from "@/lib/refs/ref-grammar";
import { classifyRef } from "@/lib/refs/ref-types";
import { coerceTextStyleAttrs, noteColorValue, noteFontValue } from "./text-styles";
import { summarizeNoteDoc } from "./note-summary";

const ID = "b_aaaaaaaaaa";
const envelope = (content: unknown[]) => ({ format: "studenv-note", version: 1, doc: { type: "doc", content } });

test("text style keeps palette colours, hex colours and note fonts", () => {
  assert.deepEqual(coerceTextStyleAttrs({ color: noteColorValue("red"), fontFamily: noteFontValue("lora") }), {
    color: "var(--note-color-red)",
    fontFamily: "var(--note-font-lora)",
  });
  assert.equal(coerceTextStyleAttrs({ color: "#A1b2C3" }).color, "#A1b2C3");
});

test("text style drops anything that could inject CSS", () => {
  const coerced = coerceTextStyleAttrs({ color: "red; background: url(https://x)", fontFamily: "Arial; position: fixed" });
  assert.deepEqual(coerced, { color: null, fontFamily: null });
});

test("a saved note keeps a safe text style and removes an empty one", () => {
  const parsed = parseNoteDoc(
    envelope([
      {
        type: "paragraph",
        attrs: { id: ID },
        content: [
          { type: "text", text: "kept", marks: [{ type: "textStyle", attrs: { color: noteColorValue("blue") } }] },
          { type: "text", text: "plain", marks: [{ type: "textStyle", attrs: { color: "expression(alert(1))" } }] },
        ],
      },
    ]),
  );
  const [kept, plain] = parsed.envelope.doc.content[0].content ?? [];
  assert.deepEqual(kept.marks, [{ type: "textStyle", attrs: { color: "var(--note-color-blue)" } }]);
  assert.equal(plain.marks, undefined);
  assert.equal(parsed.repaired, true);
});

test("strokes are clamped, rounded and capped", () => {
  const stroke = coerceStroke({ tool: "highlighter", color: "#00ff00", size: 5, points: [0.123456, 2, 0.5, "x", 0.2, 0.3, 0.5] });
  assert.deepEqual(stroke, { tool: "highlighter", color: "#00ff00", size: 0.08, points: [0.1235, 1.05, 0.5] });
  assert.equal(coerceStroke({ points: [] }), null);
  assert.equal(coerceStroke({ points: [0.1, 0.1, 1], color: "url(javascript:1)" })?.color, "#e05a4b");
  const many = Array.from({ length: MAX_STROKES_PER_PAGE + 5 }, () => ({ points: [0.1, 0.1, 0.5] }));
  assert.equal(coerceStrokes(many).length, MAX_STROKES_PER_PAGE);
});

test("a pinned PDF page round-trips with its ink", () => {
  const strokes = [{ tool: "pen", color: "#e05a4b", size: 0.004, points: [0.1, 0.1, 0.5, 0.2, 0.2, 0.5] }];
  const parsed = parseNoteDoc(envelope([{ type: "pdfPage", attrs: { id: ID, assetId: "asset_1", page: 3, title: "Bio", strokes } }]));
  assert.equal(parsed.repaired, false);
  assert.deepEqual(parsed.envelope.doc.content[0].attrs, { id: ID, assetId: "asset_1", page: 3, title: "Bio", strokes });
});

test("the eraser finds a stroke near its line", () => {
  const stroke = { tool: "pen" as const, color: "#e05a4b", size: 0.01, points: [0, 0.5, 0.5, 1, 0.5, 0.5] };
  assert.equal(strokeHitsPoint(stroke, 100, 100, 50, 52, 4), true);
  assert.equal(strokeHitsPoint(stroke, 100, 100, 50, 80, 4), false);
});

test("a pinned PDF page counts as the note using that PDF, at that page", () => {
  const parsed = parseNoteDoc(envelope([{ type: "pdfPage", attrs: { id: ID, assetId: "asset_1", page: 3, title: "Bio", strokes: [] } }]));
  const refs = extractNoteRefs(parsed.envelope.doc).map(({ ref, kind, sourceAnchor }) => [formatRef(ref), kind, sourceAnchor]);
  assert.deepEqual(refs, [["asset:asset_1#page3", "embed", ID]]);
  // The anchor is one the asset type understands (so the link index keeps it).
  const parsedRef = extractNoteRefs(parsed.envelope.doc)[0].ref;
  const classified = classifyRef(parsedRef);
  assert.equal(classified.known, true);
  assert.deepEqual(classified.known ? classified.anchor : null, { kind: "page", page: 3 });
});

test("a note summary has its outline, to-dos, opening and resources", () => {
  const para = (id: string, text: string) => ({ type: "paragraph", attrs: { id }, content: [{ type: "text", text }] });
  const parsed = parseNoteDoc(
    envelope([
      { type: "heading", attrs: { id: "b_h000000001", level: 2 }, content: [{ type: "text", text: "Light reactions" }] },
      para("b_p000000001", "Water is split."),
      { type: "taskList", content: [
        { type: "taskItem", attrs: { id: "b_t000000001", checked: true }, content: [para("b_p000000002", "Read")] },
        { type: "taskItem", attrs: { id: "b_t000000002", checked: false }, content: [para("b_p000000003", "Review")] },
      ] },
      { type: "embed", attrs: { id: "b_e000000001", ref: "item:pdf_1" } },
      { type: "embed", attrs: { id: "b_e000000002", ref: "note:other" } },
      { type: "pdfPage", attrs: { id: "b_e000000003", assetId: "asset_9", page: 2, title: "Bio", strokes: [] } },
      { type: "embed", attrs: { id: "b_e000000004", ref: "item:pdf_1" } },
    ]),
  );
  const summary = summarizeNoteDoc(parsed.envelope.doc);
  assert.deepEqual(summary.headings, ["Light reactions"]);
  assert.deepEqual(summary.todos, { done: 1, total: 2 });
  assert.ok(summary.opening.startsWith("Light reactions"));
  assert.deepEqual(summary.resourceRefs, ["item:pdf_1", "asset:asset_9"]);
});

test("the card preview keeps the page's first blocks in order and shape", () => {
  const para = (id: string, text: string) => ({ type: "paragraph", attrs: { id }, content: [{ type: "text", text }] });
  const parsed = parseNoteDoc(
    envelope([
      { type: "heading", attrs: { id: "b_h000000001", level: 1 }, content: [{ type: "text", text: "Photosynthesis" }] },
      { type: "taskList", content: [{ type: "taskItem", attrs: { id: "b_t000000001", checked: true }, content: [para("b_p000000002", "Read")] }] },
      { type: "bulletList", content: [{ type: "listItem", attrs: { id: "b_l000000001" }, content: [para("b_p000000003", "Water is split")] }] },
      { type: "embed", attrs: { id: "b_e000000001", ref: "item:pdf_1" } },
      { type: "paragraph", attrs: { id: "b_p000000004" } },
    ]),
  );
  assert.deepEqual(summarizeNoteDoc(parsed.envelope.doc).preview, [
    { type: "heading", level: 1, text: "Photosynthesis" },
    { type: "todo", text: "Read", checked: true },
    { type: "bullet", text: "Water is split", ordered: false },
    { type: "resource", ref: "item:pdf_1" },
  ]);
});
