// ---------------------------------------------------------------------------
// List behaviour the way Notion does it
// ---------------------------------------------------------------------------
//
// 1. Choosing the other list type changes only the line(s) you are on. The
//    stock toggle rewrites the whole list, so three bullets turned into a
//    numbered list as soon as the fourth line asked for numbers.
// 2. Backspace at the start of a list line removes the marker and keeps the
//    cursor on that line. The stock keymap merges it into the line above.

import { Extension, type Editor } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode, type NodeType } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

const PLAIN_LISTS = ["bulletList", "orderedList"] as const;
const isPlainList = (node: ProseMirrorNode) => (PLAIN_LISTS as readonly string[]).includes(node.type.name);

/**
 * Turns the selected items of a bullet or numbered list into `target`,
 * splitting the list around them (items before and after keep their type).
 * Returns false when this does not apply (not in a bullet/numbered list, or
 * already the target type), so the stock command handles the rest.
 */
export function switchListItemsTo(state: EditorState, target: NodeType, dispatch?: (tr: Transaction) => void): boolean {
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to, isPlainList);
  if (!range || range.parent.type === target) return false;
  if (!(PLAIN_LISTS as readonly string[]).includes(target.name)) return false;

  const list = range.parent;
  const listStart = range.$from.before(range.depth);
  const items: ProseMirrorNode[] = [];
  list.forEach((child) => items.push(child));
  const before = items.slice(0, range.startIndex);
  const middle = items.slice(range.startIndex, range.endIndex);
  const after = items.slice(range.endIndex);

  const replacement: ProseMirrorNode[] = [];
  if (before.length) replacement.push(list.type.create(list.attrs, before));
  const middleList = target.create(null, middle);
  replacement.push(middleList);
  if (after.length) replacement.push(list.type.create(list.attrs, after));

  if (dispatch) {
    const tr = state.tr;
    let from = listStart;
    let to = listStart + list.nodeSize;
    const parent = range.$from.node(range.depth - 1);
    const index = range.$from.index(range.depth - 1);

    // Join a neighbouring list of the new type, so a run of numbered lines stays one list.
    const previous = index > 0 ? parent.child(index - 1) : null;
    const next = index < parent.childCount - 1 ? parent.child(index + 1) : null;
    let content = Fragment.fromArray(replacement);
    let mergedPrevious: ProseMirrorNode | null = null;
    if (!before.length && previous && previous.type === target) {
      mergedPrevious = previous;
      from -= previous.nodeSize;
      content = Fragment.fromArray([target.create(previous.attrs, previous.content.append(middleList.content)), ...replacement.slice(1)]);
    }
    if (!after.length && next && next.type === target) {
      to += next.nodeSize;
      const last = content.lastChild;
      content = content
        .cut(0, content.size - (last ? last.nodeSize : 0))
        .append(Fragment.from(target.create(next.attrs, (last ?? middleList).content.append(next.content))));
    }

    tr.replaceWith(from, to, content);
    // The selected items moved but their text did not: shift the selection by how far
    // the first selected item's start moved.
    const oldItemStart = listStart + 1 + before.reduce((sum, node) => sum + node.nodeSize, 0);
    const newItemStart = mergedPrevious
      ? from + 1 + mergedPrevious.content.size
      : from + (before.length ? replacement[0].nodeSize : 0) + 1;
    const delta = newItemStart - oldItemStart;
    try {
      tr.setSelection(TextSelection.create(tr.doc, state.selection.anchor + delta, state.selection.head + delta));
    } catch {
      // A selection that no longer lands in text is left to ProseMirror to map.
    }
    dispatch(tr.scrollIntoView());
  }
  return true;
}

/** Backspace at the very start of a list line: the line becomes plain text, in place. */
export function liftLineOutOfList(editor: Editor): boolean {
  const { state } = editor;
  const { selection } = state;
  if (!selection.empty) return false;
  const { $from } = selection;
  if ($from.parentOffset !== 0 || !$from.parent.isTextblock) return false;

  // The line must be the first block of its list item (a later paragraph inside
  // an item keeps the normal merge-up behaviour).
  for (let depth = $from.depth - 1; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    const itemName = node.type.name;
    if (itemName !== "listItem" && itemName !== "taskItem") continue;
    if ($from.index(depth) !== 0) return false;
    return editor.commands.liftListItem(itemName);
  }
  return false;
}

export const ListBehavior = Extension.create({
  name: "noteListBehavior",
  // Above the list keymap, whose Backspace merges the line into the one above.
  priority: 1000,
  addKeyboardShortcuts() {
    const backspace = () => {
      if (this.editor.commands.undoInputRule()) return true;
      return liftLineOutOfList(this.editor);
    };
    return { Backspace: backspace };
  },
});
