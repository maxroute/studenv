"use client";

// The equation box: type LaTeX or tap symbols, and see the formula as it is
// written. Plain DOM like the other note dialogs, so editor commands can await
// it. Styled in note-dialogs.css.

import katex from "katex";
import { STRUCTURES, SYMBOL_GROUPS, insertSnippet } from "@/lib/notes/math-symbols";
import { button, openShell } from "./note-dialogs";

export type AskEquationOptions = {
  title: string;
  kind: "block" | "inline";
  initial?: string;
  confirmText: string;
};

const STRUCTURE_TAB = "structures";

/** Resolves to the equation's LaTeX, or null when cancelled. */
export function askEquation(options: AskEquationOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      shell.close();
      resolve(value);
    };
    const shell = openShell(options.title, () => finish(null));
    shell.root.classList.add("note-equation-backdrop");
    shell.panel.classList.add("note-equation");

    const heading = document.createElement("h2");
    heading.textContent = options.title;

    const preview = document.createElement("div");
    preview.className = "note-equation-preview";
    preview.setAttribute("aria-live", "polite");

    const form = document.createElement("form");
    form.className = "note-dialog-form";
    const field = document.createElement("textarea");
    field.className = "note-dialog-input note-equation-input";
    field.rows = 2;
    field.value = options.initial ?? "";
    field.placeholder = "Tap symbols below, or type LaTeX, like E = mc^2";
    field.setAttribute("aria-label", "Equation in LaTeX");
    field.spellcheck = false;
    field.autocapitalize = "off";
    field.setAttribute("autocorrect", "off");
    field.autocomplete = "off";
    // The phone keyboard covers the buttons, so its return key says it finishes.
    field.setAttribute("enterkeyhint", "done");

    const draw = () => {
      const latex = field.value.trim();
      preview.classList.remove("is-empty", "is-unfinished");
      if (!latex) {
        preview.textContent = "Your formula appears here";
        preview.classList.add("is-empty");
        return;
      }
      try {
        katex.render(latex, preview, { throwOnError: true, strict: "ignore", displayMode: options.kind === "block" });
      } catch {
        preview.textContent = "Not complete yet: check for an empty slot or a missing bracket.";
        preview.classList.add("is-unfinished");
      }
    };

    const tabs = document.createElement("div");
    tabs.className = "note-equation-tabs";
    tabs.setAttribute("role", "tablist");
    const keys = document.createElement("div");
    keys.className = "note-equation-keys";

    /** Keeps the caret (and the phone keyboard) where it is while a button is pressed. */
    const keepFocus = (element: HTMLElement) => element.addEventListener("mousedown", (event) => event.preventDefault());

    const add = (snippet: string) => {
      const next = insertSnippet(field.value, field.selectionStart, field.selectionEnd, snippet);
      field.value = next.value;
      // A structure leaves an empty spot to type in. Focusing now keeps the caret in it
      // (on a phone, tapping the box later would move it) and opens the keyboard.
      if (snippet.includes("□")) field.focus({ preventScroll: true });
      field.setSelectionRange(next.caret, next.caret);
      error.textContent = "";
      draw();
    };

    const show = (id: string) => {
      for (const tab of Array.from(tabs.children)) tab.setAttribute("aria-selected", String((tab as HTMLElement).dataset.tab === id));
      keys.replaceChildren();
      keys.scrollTop = 0;
      const entries =
        id === STRUCTURE_TAB
          ? STRUCTURES.map((entry) => ({ label: entry.label, name: entry.name, latex: entry.latex }))
          : (SYMBOL_GROUPS.find((group) => group.id === id)?.symbols ?? []).map((symbol) => ({ label: symbol.char, name: symbol.name, latex: symbol.latex }));
      for (const entry of entries) {
        const key = document.createElement("button");
        key.type = "button";
        key.className = "note-equation-key";
        key.textContent = entry.label;
        key.title = entry.name;
        key.setAttribute("aria-label", entry.name);
        keepFocus(key);
        key.addEventListener("click", () => add(entry.latex));
        keys.append(key);
      }
    };

    for (const group of [...SYMBOL_GROUPS, { id: STRUCTURE_TAB, title: "Fractions & roots" }]) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "note-equation-tab";
      tab.setAttribute("role", "tab");
      tab.dataset.tab = group.id;
      tab.textContent = group.title;
      keepFocus(tab);
      tab.addEventListener("click", () => show(group.id));
      tabs.append(tab);
    }

    const error = document.createElement("p");
    error.className = "note-dialog-error";
    error.setAttribute("role", "alert");
    const actions = document.createElement("div");
    actions.className = "note-dialog-actions";
    const cancel = button("Cancel", "secondary");
    const ok = button(options.confirmText, "primary");
    ok.type = "submit";
    actions.append(cancel, ok);

    form.append(preview, field, tabs, keys, error, actions);
    shell.panel.append(heading, form);

    cancel.addEventListener("click", () => finish(null));
    field.addEventListener("input", () => {
      error.textContent = "";
      draw();
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = field.value.trim();
      if (!value) {
        error.textContent = "Add an equation first.";
        return;
      }
      finish(value);
    });
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
      // Enter finishes; Shift+Enter is a new line.
      if (event.key === "Enter" && event.target === field && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        form.requestSubmit();
      }
    });

    show(SYMBOL_GROUPS[0].id);
    draw();
    const end = field.value.length;
    field.setSelectionRange(end, end);
    // On touch screens the keyboard would cover the symbols; it opens when the box is tapped.
    if (!window.matchMedia?.("(pointer: coarse)").matches) field.focus();
    else {
      // Focus leaves the page, which closes the keyboard that was open for it.
      shell.panel.tabIndex = -1;
      shell.panel.focus({ preventScroll: true });
    }
  });
}
