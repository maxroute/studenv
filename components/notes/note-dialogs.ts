"use client";

// ---------------------------------------------------------------------------
// In-app dialogs for the notes editor
// ---------------------------------------------------------------------------
//
// `window.prompt` / `window.confirm` are not available everywhere: embedded
// browsers and app shells (Electron-based ones, some installed web apps)
// throw "prompt() is not supported". These are plain DOM so editor commands
// (which run outside React) can await them. Styled in notes.css.

type DialogShell = { root: HTMLDivElement; panel: HTMLDivElement; close: () => void };

function openShell(label: string, onDismiss: () => void): DialogShell {
  const root = document.createElement("div");
  root.className = "note-dialog-backdrop";
  const panel = document.createElement("div");
  panel.className = "note-dialog";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", label);
  root.append(panel);
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  root.addEventListener("pointerdown", (event) => {
    if (event.target === root) {
      event.preventDefault();
      onDismiss();
    }
  });
  document.body.append(root);
  return {
    root,
    panel,
    close: () => {
      root.remove();
      previousFocus?.focus({ preventScroll: true });
    },
  };
}

function button(text: string, variant: "primary" | "secondary" | "danger") {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `note-dialog-btn ${variant}`;
  element.textContent = text;
  return element;
}

export type AskTextOptions = {
  title: string;
  label?: string;
  placeholder?: string;
  initial?: string;
  confirmText?: string;
  multiline?: boolean;
  /** Returns an error message for an invalid value. */
  validate?: (value: string) => string | null;
};

/** Asks for one line (or a paragraph) of text. Resolves to null when cancelled. */
export function askText(options: AskTextOptions): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      shell.close();
      resolve(value);
    };
    const shell = openShell(options.title, () => finish(null));
    const heading = document.createElement("h2");
    heading.textContent = options.title;
    const form = document.createElement("form");
    form.className = "note-dialog-form";
    const field = options.multiline ? document.createElement("textarea") : document.createElement("input");
    field.className = "note-dialog-input";
    if (field instanceof HTMLInputElement) field.type = "text";
    field.value = options.initial ?? "";
    field.placeholder = options.placeholder ?? "";
    field.setAttribute("aria-label", options.label ?? options.title);
    field.autocomplete = "off";
    const error = document.createElement("p");
    error.className = "note-dialog-error";
    error.setAttribute("role", "alert");
    const actions = document.createElement("div");
    actions.className = "note-dialog-actions";
    const cancel = button("Cancel", "secondary");
    const ok = button(options.confirmText ?? "OK", "primary");
    ok.type = "submit";
    actions.append(cancel, ok);
    if (options.label) {
      const label = document.createElement("label");
      label.className = "note-dialog-label";
      label.textContent = options.label;
      form.append(label);
    }
    form.append(field, error, actions);
    shell.panel.append(heading, form);

    cancel.addEventListener("click", () => finish(null));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const value = field.value;
      const problem = options.validate?.(value) ?? null;
      if (problem) {
        error.textContent = problem;
        field.focus();
        return;
      }
      finish(value);
    });
    // On the form (an HTMLElement), so the listener gets a typed KeyboardEvent.
    form.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
      if (options.multiline && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    field.focus();
    if (field instanceof HTMLInputElement) field.select();
  });
}

/** Asks a yes/no question. Resolves to true only on confirm. */
export function askConfirm(options: { title: string; message?: string; confirmText?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      shell.close();
      resolve(value);
    };
    const shell = openShell(options.title, () => finish(false));
    const heading = document.createElement("h2");
    heading.textContent = options.title;
    shell.panel.append(heading);
    if (options.message) {
      const message = document.createElement("p");
      message.className = "note-dialog-message";
      message.textContent = options.message;
      shell.panel.append(message);
    }
    const actions = document.createElement("div");
    actions.className = "note-dialog-actions";
    const cancel = button("Cancel", "secondary");
    const ok = button(options.confirmText ?? "OK", options.danger ? "danger" : "primary");
    actions.append(cancel, ok);
    shell.panel.append(actions);
    cancel.addEventListener("click", () => finish(false));
    ok.addEventListener("click", () => finish(true));
    shell.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish(false);
    });
    ok.focus();
  });
}

export type PickEntry<T> = { value: T; title: string; detail?: string; badge?: string };

/** A searchable list; resolves to the chosen value or null. */
export function pickOne<T>(options: { title: string; placeholder?: string; emptyText?: string; entries: readonly PickEntry<T>[] }): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = false;
    let active = 0;
    let shown: PickEntry<T>[] = [...options.entries];
    const finish = (value: T | null) => {
      if (settled) return;
      settled = true;
      shell.close();
      resolve(value);
    };
    const shell = openShell(options.title, () => finish(null));
    shell.panel.classList.add("note-dialog-picker");
    const heading = document.createElement("h2");
    heading.textContent = options.title;
    const search = document.createElement("input");
    search.className = "note-dialog-input";
    search.type = "search";
    search.placeholder = options.placeholder ?? "Search…";
    search.setAttribute("aria-label", options.placeholder ?? "Search");
    search.autocomplete = "off";
    const list = document.createElement("div");
    list.className = "note-dialog-list";
    list.setAttribute("role", "listbox");
    const cancel = button("Cancel", "secondary");
    const actions = document.createElement("div");
    actions.className = "note-dialog-actions";
    actions.append(cancel);
    shell.panel.append(heading, search, list, actions);

    const draw = () => {
      list.replaceChildren();
      if (shown.length === 0) {
        const empty = document.createElement("p");
        empty.className = "note-dialog-message";
        empty.textContent = options.emptyText ?? "Nothing matches.";
        list.append(empty);
        return;
      }
      shown.forEach((entry, index) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = `note-dialog-option${index === active ? " active" : ""}`;
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", String(index === active));
        if (entry.badge) {
          const badge = document.createElement("span");
          badge.className = "note-popup-badge";
          badge.textContent = entry.badge;
          row.append(badge);
        }
        const text = document.createElement("span");
        text.className = "note-popup-text";
        const title = document.createElement("span");
        title.className = "note-popup-title";
        title.textContent = entry.title;
        text.append(title);
        if (entry.detail) {
          const detail = document.createElement("span");
          detail.className = "note-popup-detail";
          detail.textContent = entry.detail;
          text.append(detail);
        }
        row.append(text);
        row.addEventListener("click", () => finish(entry.value));
        list.append(row);
        if (index === active) window.requestAnimationFrame(() => row.scrollIntoView({ block: "nearest" }));
      });
    };

    search.addEventListener("input", () => {
      const query = search.value.trim().toLowerCase();
      shown = options.entries.filter((entry) => !query || `${entry.title} ${entry.detail ?? ""}`.toLowerCase().includes(query));
      active = 0;
      draw();
    });
    search.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        if (shown.length === 0) return;
        active = (active + (event.key === "ArrowDown" ? 1 : -1) + shown.length) % shown.length;
        draw();
      } else if (event.key === "Enter") {
        event.preventDefault();
        const entry = shown[active];
        if (entry) finish(entry.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      }
    });
    cancel.addEventListener("click", () => finish(null));
    draw();
    search.focus();
  });
}

/** Normalises a typed web address; null when it is not one. */
export function normalizeWebAddress(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withScheme = /^(https?:|mailto:)/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol === "mailto:") return url.href;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".") && url.hostname !== "localhost") return null;
    return url.href;
  } catch {
    return null;
  }
}
