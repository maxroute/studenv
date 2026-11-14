// ---------------------------------------------------------------------------
// Block moves: which pieces of a note can be dragged, and where they can land
// ---------------------------------------------------------------------------
//
// A movable unit is a top-level block, or one item of a top-level list
// (bullet, numbered or to-do). Top-level blocks land between top-level
// blocks; a list item lands between the items of its own list, so a move can
// never leave a list empty or put an item where the schema does not allow it.
// Pure ProseMirror, no DOM: tested in block-moves.test.ts.

import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

const LIST_TYPES = new Set(["bulletList", "orderedList", "taskList"]);

export type BlockUnit = {
  /** Position before the node. */
  pos: number;
  node: ProseMirrorNode;
  /** Position before the parent list, or null for a top-level block. */
  listPos: number | null;
};

/** Every movable unit, in document order (a list comes before its items). */
export function blockUnits(doc: ProseMirrorNode): BlockUnit[] {
  const units: BlockUnit[] = [];
  doc.forEach((node, offset) => {
    units.push({ pos: offset, node, listPos: null });
    if (LIST_TYPES.has(node.type.name)) {
      node.forEach((child, childOffset) => {
        units.push({ pos: offset + 1 + childOffset, node: child, listPos: offset });
      });
    }
  });
  return units;
}

/** The positions `unit` may be dropped at: the gaps between its siblings. */
export function dropGaps(doc: ProseMirrorNode, unit: BlockUnit): number[] {
  const gaps: number[] = [];
  if (unit.listPos === null) {
    doc.forEach((_node, offset) => gaps.push(offset));
    gaps.push(doc.content.size);
    return gaps;
  }
  const list = doc.nodeAt(unit.listPos);
  if (!list) return gaps;
  const start = unit.listPos + 1;
  list.forEach((_node, offset) => gaps.push(start + offset));
  gaps.push(start + list.content.size);
  return gaps;
}

/**
 * Moves the unit at `from` to the gap `gap`. Returns null when the move would
 * do nothing (dropping a block where it already is) or is not allowed.
 */
export function moveUnit(state: EditorState, from: number, gap: number): Transaction | null {
  const unit = blockUnits(state.doc).find((candidate) => candidate.pos === from);
  if (!unit) return null;
  if (!dropGaps(state.doc, unit).includes(gap)) return null;
  const end = from + unit.node.nodeSize;
  if (gap >= from && gap <= end) return null;
  const tr = state.tr.delete(from, end);
  const insertAt = tr.mapping.map(gap, gap > end ? -1 : 1);
  tr.insert(insertAt, unit.node);
  const inside = Math.min(insertAt + 1, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(inside)));
  return tr;
}

/** Moves the unit at `from` one sibling up (-1) or down (+1). */
export function shiftUnit(state: EditorState, from: number, direction: -1 | 1): Transaction | null {
  const unit = blockUnits(state.doc).find((candidate) => candidate.pos === from);
  if (!unit) return null;
  const gaps = dropGaps(state.doc, unit);
  const index = gaps.indexOf(from);
  if (index === -1) return null;
  // Down: past the next sibling, so the gap after it (two gaps on).
  const target = direction === -1 ? gaps[index - 1] : gaps[index + 2];
  return target === undefined ? null : moveUnit(state, from, target);
}

/** Inserts a copy of the unit at `from` right after it (block ids are renewed by UniqueID). */
export function duplicateUnit(state: EditorState, from: number): Transaction | null {
  const unit = blockUnits(state.doc).find((candidate) => candidate.pos === from);
  if (!unit) return null;
  return state.tr.insert(from + unit.node.nodeSize, unit.node.copy(unit.node.content));
}

/** Deletes the unit at `from`; a list's last item takes the list with it. */
export function deleteUnit(state: EditorState, from: number): Transaction | null {
  const unit = blockUnits(state.doc).find((candidate) => candidate.pos === from);
  if (!unit) return null;
  if (unit.listPos !== null) {
    const list = state.doc.nodeAt(unit.listPos);
    if (list && list.childCount === 1) return deleteUnit(state, unit.listPos);
  }
  const tr = state.tr.delete(from, from + unit.node.nodeSize);
  if (tr.doc.childCount === 0) tr.insert(0, state.schema.nodes.paragraph.create());
  return tr;
}
