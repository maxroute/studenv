"use client";

import type { Editor, Range } from "@tiptap/core";
import toast from "react-hot-toast";
import { fixMath } from "@/lib/notes/fix-math";
import { fromEditorJSON } from "@/lib/notes/editor-bridge";
import { askText, normalizeWebAddress, pickOne } from "./note-dialogs";
import { askEquation } from "./equation-dialog";
import { ALL_SYMBOLS } from "@/lib/notes/math-symbols";

/** Adds, edits or removes the link on the selection, asking for the address in-app. */
export async function editLink(editor: Editor) {
  const current = editor.getAttributes("link").href;
  const { from, to } = editor.state.selection;
  const href = await askText({
    title: current ? "Edit link" : "Add link",
    label: "Web address",
    placeholder: "https://example.com",
    initial: typeof current === "string" ? current : "",
    confirmText: current ? "Save" : "Add link",
    validate: (value) => (!value.trim() && current ? null : normalizeWebAddress(value) ? null : "Enter a web address, like example.com."),
  });
  if (href === null) return;
  // The dialog took focus; put the selection back before changing it.
  const chain = editor.chain().focus().setTextSelection({ from, to }).extendMarkRange("link");
  if (!href.trim()) {
    chain.unsetLink().run();
    return;
  }
  const safe = normalizeWebAddress(href);
  if (!safe) return;
  if (from === to && !current) {
    // Nothing selected: insert the address itself as the link text.
    chain.insertContent({ type: "text", text: safe, marks: [{ type: "link", attrs: { href: safe } }] }).run();
    return;
  }
  chain.setLink({ href: safe }).run();
}

/** Inserts a block or inline equation, replacing `range` (the typed "/command") when given. */
export async function insertEquation(editor: Editor, kind: "block" | "inline", range?: Range) {
  if (range) editor.chain().focus().deleteRange(range).run();
  const at = editor.state.selection.from;
  const latex = await askEquation({ title: kind === "block" ? "Equation" : "Inline equation", kind, confirmText: "Insert" });
  if (!latex) {
    editor.commands.focus();
    return;
  }
  const chain = editor.chain().focus().setTextSelection(at);
  if (kind === "block") chain.insertBlockMath({ latex }).run();
  else chain.insertInlineMath({ latex }).run();
}

/** The "/" menu's "Math symbol": a searchable list; the chosen character is typed into the text. */
export async function insertSymbol(editor: Editor, range: Range) {
  editor.chain().focus().deleteRange(range).run();
  const at = editor.state.selection.from;
  const char = await pickOne({
    title: "Math symbol",
    placeholder: "Search, like theta or less than",
    entries: ALL_SYMBOLS.map((symbol) => ({ value: symbol.char, title: symbol.name, detail: symbol.also?.join(", "), badge: symbol.char })),
  });
  const chain = editor.chain().focus().setTextSelection(at);
  if (char) chain.insertContent({ type: "text", text: char });
  chain.run();
}

/** Edits an existing equation's LaTeX. */
export async function editEquation(editor: Editor, pos: number, latex: string, kind: "block" | "inline") {
  const next = await askEquation({ title: "Edit equation", kind, initial: latex, confirmText: "Save" });
  if (next === null) return;
  if (kind === "block") editor.chain().focus().updateBlockMath({ latex: next, pos }).run();
  else editor.chain().focus().updateInlineMath({ latex: next, pos }).run();
}

/**
 * Turns maths left as raw text ("$$\sin\theta$$", "\(x^2\)") into equations, as
 * one change the student can undo.
 */
export function applyFixedFormulas(editor: Editor): number {
  const { doc, found } = fixMath(fromEditorJSON(editor.getJSON()).doc);
  if (!found) return 0;
  const fixed = editor.schema.nodeFromJSON(doc);
  editor.view.dispatch(editor.state.tr.replaceWith(0, editor.state.doc.content.size, fixed.content));
  return found;
}

/** The page menu's "Fix formulas". */
export function fixFormulas(editor: Editor) {
  const found = applyFixedFormulas(editor);
  if (!found) toast("No unformatted formulas on this page.");
  else toast.success(`Fixed ${found} formula${found === 1 ? "" : "s"}. Undo with ${/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"}+Z.`);
}
