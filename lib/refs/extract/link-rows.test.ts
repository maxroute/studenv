import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceItem, type WorkspaceNode } from "@/types/workspace";
import { parseRef } from "@/lib/refs/ref-grammar";
import { extractNoteRefs } from "@/lib/notes/extract-refs";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { linkSetHash } from "./link-hash";
import { extractSceneRefs, toLinkRows } from "./link-rows";

const node = (type: Parameters<typeof createWorkspaceItem>[0], props: Record<string, unknown>, id: string): WorkspaceNode => {
  const created = createWorkspaceItem(type, props, { id, x: 0, y: 0, zIndex: 1 });
  assert.ok(created, `fixture ${type}`);
  return created;
};

test("workspace nodes that point at resources become links anchored at the node", () => {
  const items = [
    node("resource-card", { assetId: "asset1", kind: "pdf", title: "Book" }, "item-1"),
    node("pdf-page", { assetId: "asset1", pageNumber: 4 }, "item-2"),
    node("video-anchor", { assetId: "vid1", startTimeMs: 93500 }, "item-3"),
    node("image", { src: "https://example.com/x.png" }, "item-4"),
    node("sticky", { text: "hi" }, "item-5"),
  ];
  const rows = toLinkRows({ type: "workspace", id: "w1" }, extractSceneRefs(items));
  assert.deepEqual(
    rows.map((row) => [row.sourceAnchor, `${row.targetType}:${row.targetId}${row.targetAnchor ? `#${row.targetAnchor}` : ""}`, row.kind]),
    [
      ["item-1", "asset:asset1", "card"],
      ["item-2", "asset:asset1#page4", "embed"],
      ["item-3", "asset:vid1#t=93500", "citation"],
    ],
    "images and stickies are not links",
  );
  assert.ok(rows.every((row) => row.sourceType === "workspace" && row.sourceId === "w1"));
});

test("a note's references become rows with the block they sit in, unknown types included", () => {
  const parsed = parseNoteDoc({
    format: "studenv-note",
    version: 1,
    doc: { type: "doc", content: [
      { type: "paragraph", attrs: { id: "b_aaaaaaaaaa" }, content: [
        { type: "mention", attrs: { ref: "note:n2", label: "Two" } },
        { type: "mention", attrs: { ref: "lesson:abc#t=1000", label: "Lesson" } },
      ] },
    ] },
  });
  const rows = toLinkRows({ type: "note", id: "n1" }, extractNoteRefs(parsed.envelope.doc));
  assert.deepEqual(rows.map((row) => [row.targetType, row.targetId, row.targetAnchor, row.sourceAnchor, row.kind]), [
    ["lesson", "abc", "t=1000", "b_aaaaaaaaaa", "mention"],
    ["note", "n2", "", "b_aaaaaaaaaa", "mention"],
  ]);
});

test("rows are deduplicated and the set hash ignores order", () => {
  const ref = parseRef("note:n2");
  assert.ok(ref);
  const a = toLinkRows({ type: "note", id: "n1" }, [{ ref, kind: "mention", sourceAnchor: "b_1" }, { ref, kind: "mention", sourceAnchor: "b_1" }]);
  assert.equal(a.length, 1);
  const other = parseRef("asset:x#page2");
  assert.ok(other);
  const one = toLinkRows({ type: "note", id: "n1" }, [{ ref, kind: "mention", sourceAnchor: "" }, { ref: other, kind: "citation", sourceAnchor: "" }]);
  const two = toLinkRows({ type: "note", id: "n1" }, [{ ref: other, kind: "citation", sourceAnchor: "" }, { ref, kind: "mention", sourceAnchor: "" }]);
  assert.equal(linkSetHash(one), linkSetHash(two));
  assert.notEqual(linkSetHash(one), linkSetHash(a));
  assert.equal(linkSetHash([]).length, 64);
});
