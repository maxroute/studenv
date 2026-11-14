import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getSchema } from "@tiptap/core";
import { EditorState } from "@tiptap/pm/state";
import { createNoteExtensions } from "./editor-extensions";
import { blockUnits, deleteUnit, dropGaps, duplicateUnit, moveUnit, shiftUnit } from "./block-moves";

const schema = getSchema(createNoteExtensions());
const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });
const item = (text: string) => ({ type: "listItem", content: [p(text)] });

function stateOf(content: unknown[]) {
  return EditorState.create({ schema, doc: schema.nodeFromJSON({ type: "doc", content }) });
}

/** Top-level text, with list items joined by "|". */
const outline = (state: EditorState) => {
  const parts: string[] = [];
  state.doc.forEach((node) => {
    if (node.type.name === "bulletList") {
      const items: string[] = [];
      node.forEach((child) => items.push(child.textContent));
      parts.push(`[${items.join("|")}]`);
    } else parts.push(node.textContent);
  });
  return parts.join(" ");
};

const posOf = (state: EditorState, text: string, inList = false) => {
  const unit = blockUnits(state.doc).find((candidate) => candidate.node.textContent === text && (candidate.listPos !== null) === inList);
  assert.ok(unit, `unit ${text}`);
  return unit.pos;
};

describe("block moves", () => {
  it("lists top-level blocks and the items of top-level lists", () => {
    const state = stateOf([p("A"), { type: "bulletList", content: [item("x"), item("y")] }, p("B")]);
    const units = blockUnits(state.doc);
    assert.deepEqual(units.map((unit) => [unit.node.type.name, unit.listPos === null]), [
      ["paragraph", true],
      ["bulletList", true],
      ["listItem", false],
      ["listItem", false],
      ["paragraph", true],
    ]);
  });

  it("moves a block down and up", () => {
    const state = stateOf([p("A"), p("B"), p("C")]);
    const gaps = dropGaps(state.doc, blockUnits(state.doc)[0]);
    const down = moveUnit(state, posOf(state, "A"), gaps[3]);
    assert.ok(down);
    assert.equal(outline(state.apply(down)), "B C A");
    const up = moveUnit(state, posOf(state, "C"), gaps[0]);
    assert.ok(up);
    assert.equal(outline(state.apply(up)), "C A B");
  });

  it("does nothing when a block is dropped where it already is", () => {
    const state = stateOf([p("A"), p("B")]);
    const gaps = dropGaps(state.doc, blockUnits(state.doc)[0]);
    assert.equal(moveUnit(state, posOf(state, "A"), gaps[0]), null);
    assert.equal(moveUnit(state, posOf(state, "A"), gaps[1]), null);
  });

  it("moves list items only within their own list", () => {
    const state = stateOf([p("A"), { type: "bulletList", content: [item("x"), item("y"), item("z")] }]);
    const x = posOf(state, "x", true);
    const unit = blockUnits(state.doc).find((candidate) => candidate.pos === x);
    assert.ok(unit);
    const gaps = dropGaps(state.doc, unit);
    assert.equal(gaps.length, 4);
    const moved = moveUnit(state, x, gaps[3]);
    assert.ok(moved);
    assert.equal(outline(state.apply(moved)), "A [y|z|x]");
    // A top-level gap is not a valid target for a list item.
    assert.equal(moveUnit(state, x, 0), null);
  });

  it("shifts with move up / move down and stops at the ends", () => {
    const state = stateOf([p("A"), p("B"), p("C")]);
    const down = shiftUnit(state, posOf(state, "B"), 1);
    assert.ok(down);
    assert.equal(outline(state.apply(down)), "A C B");
    const up = shiftUnit(state, posOf(state, "B"), -1);
    assert.ok(up);
    assert.equal(outline(state.apply(up)), "B A C");
    assert.equal(shiftUnit(state, posOf(state, "A"), -1), null);
    assert.equal(shiftUnit(state, posOf(state, "C"), 1), null);
  });

  it("duplicates and deletes, never leaving an empty list or document", () => {
    const state = stateOf([{ type: "bulletList", content: [item("only")] }]);
    const dup = duplicateUnit(state, posOf(state, "only", true));
    assert.ok(dup);
    assert.equal(outline(state.apply(dup)), "[only|only]");
    const removed = deleteUnit(state, posOf(state, "only", true));
    assert.ok(removed);
    const after = state.apply(removed);
    assert.equal(after.doc.childCount, 1);
    assert.equal(after.doc.firstChild?.type.name, "paragraph");
  });
});
