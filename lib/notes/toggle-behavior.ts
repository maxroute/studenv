// ---------------------------------------------------------------------------
// Toggle blocks the way Notion does them
// ---------------------------------------------------------------------------
//
// - Creating a toggle turns the current line into its title, opens it, and
//   leaves the cursor in the title. (The stock command made the line the
//   hidden content and left the toggle closed, so there was nothing to see.)
// - Enter in an open or empty toggle's title moves into its body (opening it
//   first); in a closed toggle that has content it adds a line after the toggle.
// - Cmd/Ctrl+Enter opens or closes the toggle you are in.
// - The arrow button gets a label so it can be found without sight of the icon
//   (set when the button is created: changing it afterwards looks like an edit
//   inside the toggle to ProseMirror, which then redraws it without end).

import { Extension } from "@tiptap/core";
import { Details } from "@tiptap/extension-details";
import { TextSelection } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState } from "@tiptap/pm/state";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    noteToggle: {
      /** Turns the current paragraph into an open toggle whose title is that paragraph. */
      setToggle: () => ReturnType;
    };
  }
}

type FoundDetails = { node: ProseMirrorNode; pos: number; depth: number };

/** The toggle the selection is in (title or body), innermost first. */
export function findToggle(state: EditorState): FoundDetails | null {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === "details") return { node, pos: $from.before(depth), depth };
  }
  return null;
}

const isEmptyTextblock = (node: ProseMirrorNode | null | undefined) => !!node && node.isTextblock && node.content.size === 0;

export const NoteToggle = Extension.create({
  name: "noteToggle",
  // Above the stock Details keymap, whose Enter always adds a line after a closed toggle.
  priority: 1000,

  addCommands() {
    return {
      setToggle:
        () =>
        ({ state, tr, dispatch, commands }) => {
          const { schema, selection } = state;
          const { $from } = selection;
          const block = $from.parent;
          const details = schema.nodes.details;
          const summary = schema.nodes.detailsSummary;
          const body = schema.nodes.detailsContent;
          const parent = $from.node(-1);
          const canWrap = block.type.name === "paragraph" && !!details && !!summary && !!body && parent.canReplaceWith($from.index(-1), $from.indexAfter(-1), details);
          if (!canWrap) return commands.setDetails();
          if (dispatch) {
            const toggle = details.create({ open: true }, [summary.create(null, block.content), body.create(null, schema.nodes.paragraph.create())]);
            const start = $from.before();
            tr.replaceWith(start, $from.after(), toggle);
            // Details open (1) + summary open (1), then to the end of the title.
            tr.setSelection(TextSelection.create(tr.doc, start + 2 + block.content.size));
            tr.scrollIntoView();
          }
          return true;
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      Enter: ({ editor }) => {
        const { state, view } = editor;
        const { selection } = state;
        if (!selection.empty || selection.$from.parent.type.name !== "detailsSummary") return false;
        const found = findToggle(state);
        if (!found) return false;
        const { node, pos } = found;
        const body = node.child(1);
        const open = node.attrs.open === true;
        const first = body.firstChild;
        const hasOnlyEmptyLine = body.childCount === 1 && isEmptyTextblock(first);
        // A closed toggle with content hides it: Enter adds a line after the toggle (stock behaviour).
        if (!open && !hasOnlyEmptyLine) return false;

        // Open first and let the view show the body: the cursor cannot sit in hidden content.
        if (!open) view.dispatch(state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, open: true }));

        const next = view.state;
        const toggle = next.doc.nodeAt(pos);
        if (!toggle) return true;
        const bodyStart = pos + 1 + toggle.child(0).nodeSize + 1;
        const tr = next.tr;
        if (!isEmptyTextblock(toggle.child(1).firstChild)) tr.insert(bodyStart, next.schema.nodes.paragraph.create());
        tr.setSelection(TextSelection.create(tr.doc, bodyStart + 1));
        view.dispatch(tr.scrollIntoView());
        return true;
      },

      "Mod-Enter": ({ editor }) => {
        const { state, view } = editor;
        const found = findToggle(state);
        if (!found) return false;
        const { node, pos } = found;
        const open = node.attrs.open === true;
        const tr = state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, open: !open });
        // Closing hides the body, so bring a cursor from inside it up to the title.
        if (open && state.selection.$from.parent.type.name !== "detailsSummary") {
          tr.setSelection(TextSelection.create(tr.doc, pos + 1 + 1 + node.child(0).content.size));
        }
        view.dispatch(tr.scrollIntoView());
        return true;
      },
    };
  },
});

/** The stock toggle with a labelled arrow button. */
export const NoteDetails = Details.extend({
  addNodeView() {
    const stock = this.parent?.();
    if (!stock) return null;
    return (props) => {
      const view = stock(props);
      const button = (view.dom as HTMLElement).querySelector(":scope > button");
      button?.setAttribute("aria-label", "Open or close toggle");
      button?.setAttribute("title", "Open or close toggle (Ctrl/Cmd+Enter)");
      return view;
    };
  },
});
