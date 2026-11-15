// Row and column controls for the table under the caret. Shared by the
// desktop table bar and the phone keyboard toolbar, so both offer the same
// actions. Each action is only offered when the editor can run it (deleting
// the last row or column is left to "Delete table").
import type { Editor } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";

export type TableActionId =
  | "row-above" | "row-below" | "col-left" | "col-right"
  | "delete-row" | "delete-col" | "header-row" | "delete-table";

export type TableAction = { id: TableActionId; label: string; run: (editor: Editor) => boolean; can: (editor: Editor) => boolean };

export const TABLE_ACTIONS: TableAction[] = [
  // Not above the header row: the new row would push the header down.
  { id: "row-above", label: "Add row above", run: (e) => e.chain().focus().addRowBefore().run(), can: (e) => e.can().addRowBefore() && !(caretCell(e)?.row === 0 && hasHeaderRow(e)) },
  { id: "row-below", label: "Add row below", run: (e) => e.chain().focus().addRowAfter().run(), can: (e) => e.can().addRowAfter() },
  { id: "col-left", label: "Add column left", run: (e) => e.chain().focus().addColumnBefore().run(), can: (e) => e.can().addColumnBefore() },
  { id: "col-right", label: "Add column right", run: (e) => e.chain().focus().addColumnAfter().run(), can: (e) => e.can().addColumnAfter() },
  { id: "delete-row", label: "Delete row", run: (e) => keepCaretInTable(e, () => e.chain().focus().deleteRow().run()), can: (e) => tableSize(e).rows > 1 && e.can().deleteRow() },
  { id: "delete-col", label: "Delete column", run: (e) => keepCaretInTable(e, () => e.chain().focus().deleteColumn().run()), can: (e) => tableSize(e).cols > 1 && e.can().deleteColumn() },
  { id: "header-row", label: "Header row", run: (e) => e.chain().focus().toggleHeaderRow().run(), can: (e) => e.can().toggleHeaderRow() },
  { id: "delete-table", label: "Delete table", run: (e) => e.chain().focus().deleteTable().run(), can: (e) => e.can().deleteTable() },
];

/** The table around the caret: its position and the caret's row and column. */
function caretCell(editor: Editor): { tablePos: number; row: number; col: number } | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 2; depth -= 1) {
    if ($from.node(depth - 2).type.name !== "table") continue;
    const tablePos = $from.before(depth - 2);
    const map = TableMap.get($from.node(depth - 2));
    const rect = map.findCell($from.before(depth) - tablePos - 1);
    return { tablePos, row: rect.top, col: rect.left };
  }
  return null;
}

/**
 * Deleting a row or column removes the cell holding the caret, and the caret
 * would otherwise land between rows or after the table (closing the table
 * bar). Put it in the nearest remaining cell instead.
 */
function keepCaretInTable(editor: Editor, remove: () => boolean): boolean {
  const before = caretCell(editor);
  const removed = remove();
  if (!removed || !before) return removed;
  const table = editor.state.doc.nodeAt(before.tablePos);
  if (!table || table.type.name !== "table") return true;
  const map = TableMap.get(table);
  const row = Math.min(before.row, map.height - 1);
  const col = Math.min(before.col, map.width - 1);
  const cellPos = before.tablePos + 1 + map.map[row * map.width + col];
  editor.commands.command(({ tr }) => {
    tr.setSelection(TextSelection.near(tr.doc.resolve(cellPos + 1)));
    return true;
  });
  return true;
}

/** Rows and columns of the table around the selection (0 × 0 outside a table). */
export function tableSize(editor: Editor): { rows: number; cols: number } {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "table") {
      const first = node.firstChild;
      return { rows: node.childCount, cols: first ? first.childCount : 0 };
    }
  }
  return { rows: 0, cols: 0 };
}

/** Whether the first row is a header row. */
export function hasHeaderRow(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "table") return node.firstChild?.firstChild?.type.name === "tableHeader";
  }
  return false;
}
