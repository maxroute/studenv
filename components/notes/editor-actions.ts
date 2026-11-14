"use client";

import type { Editor, Range } from "@tiptap/core";
import { askText, normalizeWebAddress } from "./note-dialogs";

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
  const latex = await askText({
    title: kind === "block" ? "Equation" : "Inline equation",
    label: "LaTeX",
    initial: kind === "block" ? "E = mc^2" : "x^2",
    confirmText: "Insert",
    validate: (value) => (value.trim() ? null : "Type an equation."),
  });
  if (!latex) {
    editor.commands.focus();
    return;
  }
  const chain = editor.chain().focus().setTextSelection(at);
  if (kind === "block") chain.insertBlockMath({ latex }).run();
  else chain.insertInlineMath({ latex }).run();
}

/** Edits an existing equation's LaTeX. */
export async function editEquation(editor: Editor, pos: number, latex: string, kind: "block" | "inline") {
  const next = await askText({ title: "Edit equation", label: "LaTeX", initial: latex, confirmText: "Save" });
  if (next === null) return;
  if (kind === "block") editor.chain().focus().updateBlockMath({ latex: next, pos }).run();
  else editor.chain().focus().updateInlineMath({ latex: next, pos }).run();
}
