"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { CellSelection } from "@tiptap/pm/tables";
import {
  BetweenHorizontalEnd, BetweenHorizontalStart, BetweenVerticalEnd, BetweenVerticalStart, Columns3, PanelTop, Rows3, Trash2,
} from "lucide-react";
import type { ReactNode } from "react";
import { TABLE_ACTIONS, hasHeaderRow, type TableActionId } from "./table-actions";

export const TABLE_ACTION_ICONS: Record<TableActionId, ReactNode> = {
  "row-above": <BetweenHorizontalStart size={15} />,
  "row-below": <BetweenHorizontalEnd size={15} />,
  "col-left": <BetweenVerticalStart size={15} />,
  "col-right": <BetweenVerticalEnd size={15} />,
  "delete-row": <Rows3 size={15} />,
  "delete-col": <Columns3 size={15} />,
  "header-row": <PanelTop size={15} />,
  "delete-table": <Trash2 size={15} />,
};

const DANGER = new Set<TableActionId>(["delete-row", "delete-col", "delete-table"]);

/** The table element around the caret, to place the bar above the whole table. */
function tableElement(editor: Editor): HTMLElement | null {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== "table") continue;
    const dom = editor.view.nodeDOM($from.before(depth));
    return dom instanceof HTMLElement ? dom : null;
  }
  return null;
}

/**
 * Row and column controls above a table while the caret is in it (mouse and
 * pen). The text bubble takes over once text is selected inside a cell.
 */
export function TableBubbleMenu({ editor }: { editor: Editor }) {
  // Re-render as the caret moves: what can run depends on the cell it is in.
  const { enabled, header } = useEditorState({
    editor,
    selector: ({ editor: current }) => ({
      enabled: TABLE_ACTIONS.map((action) => current.isActive("table") && action.can(current)),
      header: hasHeaderRow(current),
    }),
  });
  return (
    <BubbleMenu
      editor={editor}
      pluginKey="noteTableMenu"
      shouldShow={({ editor: current, state }) => {
        if (!current.isEditable || !current.isActive("table")) return false;
        const { selection } = state;
        // A cell selection (dragging across cells) or a caret; not a text selection.
        return selection.empty || selection instanceof CellSelection;
      }}
      getReferencedVirtualElement={() => {
        const table = tableElement(editor);
        return table ? { getBoundingClientRect: () => table.getBoundingClientRect() } : null;
      }}
      options={{ placement: "top-start", offset: 6 }}
    >
      <div className="note-bubble note-table-bubble" role="toolbar" aria-label="Table">
        {TABLE_ACTIONS.map((action, index) => {
          const active = action.id === "header-row" && header;
          return (
            <span key={action.id} className="note-table-bubble-item">
              {index === 4 || index === 6 ? <span className="note-bubble-divider" aria-hidden="true" /> : null}
              <button
                type="button"
                title={action.label}
                aria-label={action.label}
                aria-pressed={action.id === "header-row" ? active : undefined}
                disabled={!enabled[index]}
                className={[active ? "active" : "", DANGER.has(action.id) ? "danger" : ""].filter(Boolean).join(" ") || undefined}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => action.run(editor)}
              >
                {TABLE_ACTION_ICONS[action.id]}
              </button>
            </span>
          );
        })}
      </div>
    </BubbleMenu>
  );
}
