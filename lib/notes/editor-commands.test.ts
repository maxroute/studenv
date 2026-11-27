import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { JSDOM } from "jsdom";
import { slashCommands } from "@/components/notes/slash-commands";
import { TABLE_ACTIONS, hasHeaderRow, tableSize, type TableActionId } from "@/components/notes/table-actions";
import { createNoteExtensions } from "./editor-extensions";
import { liftLineOutOfList } from "./list-behavior";
import { fromEditorJSON } from "./editor-bridge";
import { parseNoteDoc } from "./note-format";

// A real editor in a DOM shim, to run every "/" command the way a user would.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document, getComputedStyle: dom.window.getComputedStyle });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
for (const key of ["HTMLElement", "HTMLInputElement", "Node", "Element", "MutationObserver", "DOMParser", "Text", "KeyboardEvent"] as const) {
  Object.assign(globalThis, { [key]: dom.window[key] });
}
Object.assign(globalThis, {
  requestAnimationFrame: (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
});

// A toggle made open shows its body one tick later. JSDOM has no layout (every element reports no
// offsetParent, which the toggle reads as "hidden") and its MutationObserver re-renders that open
// toggle without end, so a test that makes a toggle would never finish. The editor only watches the
// DOM for typing, which these tests never do; treat an element as visible unless it is inside [hidden].
class NoMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
// The in-app lists scroll the active row into view on the next frame.
Object.assign(dom.window, { requestAnimationFrame: globalThis.requestAnimationFrame });
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
Object.assign(globalThis, { MutationObserver: NoMutationObserver, Event: dom.window.Event });
Object.assign(dom.window, { MutationObserver: NoMutationObserver });
Object.defineProperty(dom.window.HTMLElement.prototype, "offsetParent", {
  configurable: true,
  get(this: HTMLElement) {
    return this.closest("[hidden]") ? null : this.parentElement ?? dom.window.document.body;
  },
});

/** Types `value` into the open in-app dialog (equations ask for LaTeX) and submits it. */
async function answerDialog(value: string) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  // A list ("Math symbol") is answered by picking its first row.
  const row = dom.window.document.querySelector<HTMLButtonElement>(".note-dialog-option");
  if (row) {
    row.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    return;
  }
  const input = dom.window.document.querySelector<HTMLInputElement>(".note-dialog-input");
  const form = dom.window.document.querySelector("form.note-dialog-form");
  if (!input || !form) return;
  input.value = value;
  form.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function freshEditor() {
  return new Editor({
    extensions: createNoteExtensions({}),
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "/cmd" }] }] },
  });
}

test("each / command removes the typed /query and produces a valid note block", async () => {
  for (const item of slashCommands({ createSubPage: async () => null, makeFlashcard: () => {} })) {
    if (item.id === "subpage" || item.id === "flashcard") continue; // need the server
    const editor = freshEditor();
    item.run(editor, { from: 1, to: 5 });
    await answerDialog("x^2");
    const json = editor.getJSON();
    const text = JSON.stringify(json);
    assert.ok(!text.includes("/cmd"), `${item.id}: the /query is removed`);
    const parsed = parseNoteDoc(fromEditorJSON(json));
    assert.equal(parsed.warnings.filter((w) => w.startsWith("unrecognised")).length, 0, `${item.id}: valid`);
    assert.equal(parsed.envelope.doc.content.some((node) => node.type === "unsupported"), false, `${item.id}: every node is known`);
    editor.destroy();
  }
});

test("symbols are typed into the text, by name or from the list, and equations from the picker", async () => {
  const run = async (id: string, answer: () => Promise<void>) => {
    const item = slashCommands({ createSubPage: async () => null, makeFlashcard: () => {} }).find((entry) => entry.id === id);
    assert.ok(item, id);
    const editor = freshEditor();
    item.run(editor, { from: 1, to: 5 });
    await answer();
    const json = editor.getJSON();
    editor.destroy();
    return json;
  };
  assert.match(JSON.stringify(await run("symbol-theta", async () => {})), /"text":"θ"/);
  assert.match(JSON.stringify(await run("symbol", () => answerDialog(""))), /"text":"α"/);
  const made = await run("equation", async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const find = (selector: string) => dom.window.document.querySelector<HTMLElement>(selector);
    find('.note-equation-tab[data-tab="structures"]')?.click();
    find('.note-equation-key[aria-label="Fraction"]')?.click();
    find('.note-equation-tab[data-tab="greek"]')?.click();
    find('.note-equation-key[aria-label="theta"]')?.click();
    find("form.note-dialog-form")?.dispatchEvent(new dom.window.Event("submit", { cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(made.content?.[0]?.type, "blockMath");
  assert.equal(made.content?.[0]?.attrs?.latex, "\\frac{\\theta}{}");
  assert.equal(dom.window.document.querySelector(".note-dialog"), null, "every dialog closed");
});

test("headings, lists, to-dos, toggles and tables become the right nodes", async () => {
  const typeOf = async (id: string) => {
    const item = slashCommands({ createSubPage: async () => null, makeFlashcard: () => {} }).find((entry) => entry.id === id);
    assert.ok(item);
    const editor = freshEditor();
    item.run(editor, { from: 1, to: 5 });
    await answerDialog("x^2");
    const type = editor.getJSON().content?.[0]?.type;
    editor.destroy();
    return type;
  };
  assert.equal(await typeOf("h1"), "heading");
  assert.equal(await typeOf("bullet"), "bulletList");
  assert.equal(await typeOf("todo"), "taskList");
  assert.equal(await typeOf("toggle"), "details");
  assert.equal(await typeOf("table"), "table");
  assert.equal(await typeOf("callout"), "callout");
  assert.equal(await typeOf("equation"), "blockMath");
});

test("table rows and columns can be added and removed from inside the table", () => {
  const editor = freshEditor();
  const table = slashCommands({ createSubPage: async () => null, makeFlashcard: () => {} }).find((entry) => entry.id === "table");
  assert.ok(table);
  table.run(editor, { from: 1, to: 5 });
  const action = (id: TableActionId) => {
    const found = TABLE_ACTIONS.find((entry) => entry.id === id);
    assert.ok(found, id);
    return found;
  };
  assert.deepEqual(tableSize(editor), { rows: 3, cols: 3 }, "the / command makes a 3 × 3 table with the caret inside");
  assert.equal(hasHeaderRow(editor), true);

  assert.equal(action("row-above").can(editor), false, "no row above the header row");
  assert.ok(action("row-below").run(editor));
  for (let cell = 0; cell < 3; cell += 1) editor.commands.goToNextCell();
  assert.ok(action("row-above").run(editor), "a row above a body row");
  assert.ok(action("col-right").run(editor));
  assert.ok(action("col-left").run(editor));
  assert.deepEqual(tableSize(editor), { rows: 5, cols: 5 });
  const renderedColumns = () => editor.view.dom.querySelectorAll("table col").length;
  assert.equal(renderedColumns(), 5, "the drawn columns follow added columns");

  assert.ok(action("header-row").run(editor));
  assert.equal(hasHeaderRow(editor), false, "header row toggles off");
  assert.ok(action("header-row").run(editor));
  assert.equal(hasHeaderRow(editor), true, "and back on");

  for (let index = 0; index < 4; index += 1) {
    assert.ok(action("delete-row").run(editor), "delete row");
    assert.equal(editor.isActive("table"), true, "the caret stays in the table after deleting a row");
  }
  for (let index = 0; index < 4; index += 1) {
    assert.ok(action("delete-col").run(editor), "delete column");
    assert.equal(editor.isActive("table"), true, "the caret stays in the table after deleting a column");
  }
  assert.deepEqual(tableSize(editor), { rows: 1, cols: 1 });
  assert.equal(renderedColumns(), 1, "and deleted ones (no stale column squeezing the cells)");
  assert.equal(action("delete-row").can(editor), false, "the last row is left to Delete table");
  assert.equal(action("delete-col").can(editor), false, "the last column is left to Delete table");

  const parsed = parseNoteDoc(fromEditorJSON(editor.getJSON()));
  assert.equal(parsed.warnings.filter((w) => w.startsWith("unrecognised")).length, 0, "the edited table is still a valid note block");

  assert.ok(action("delete-table").run(editor));
  assert.equal(editor.isActive("table"), false);
  assert.ok(!JSON.stringify(editor.getJSON()).includes('"table"'), "the table is gone");
  assert.deepEqual(tableSize(editor), { rows: 0, cols: 0 });
  editor.destroy();
});

// --- lists: per-line type and Backspace ------------------------------------

const para = (text?: string) => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });
const li = (text?: string) => ({ type: "listItem", content: [para(text)] });
const listEditor = (content: unknown[]) => new Editor({ extensions: createNoteExtensions({}), content: { type: "doc", content } as never });

/** The cursor at the end of the nth text block (0-based) that holds `text` (or the empty one). */
function cursorIn(editor: Editor, text: string) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.isTextblock && node.textContent === text) found = pos + 1 + node.content.size;
  });
  assert.notEqual(found, -1, `a line "${text}"`);
  editor.commands.setTextSelection(found);
}

/** A compact shape of the document: "bullet[a,b] ordered[c] p[d]". */
type JsonNode = { type?: string; text?: string; content?: JsonNode[] };
function shape(editor: Editor) {
  const blocks: JsonNode[] = [...(editor.getJSON().content as JsonNode[])];
  // The editor keeps an empty paragraph after a final list or block; it is not part of what is tested.
  const last = blocks[blocks.length - 1];
  if (blocks.length > 1 && last.type === "paragraph" && !last.content?.length) blocks.pop();
  return blocks.map((node) => {
      const name = node.type === "bulletList" ? "bullet" : node.type === "orderedList" ? "ordered" : node.type === "paragraph" ? "p" : String(node.type);
      const texts = node.type === "paragraph"
        ? [node.content?.[0]?.text ?? ""]
        : (node.content ?? []).map((item) => item.content?.[0]?.content?.[0]?.text ?? "");
      return `${name}[${texts.join(",")}]`;
    })
    .join(" ");
}

test("choosing numbers on a new line leaves the bullets above as bullets", () => {
  const editor = listEditor([{ type: "bulletList", content: [li("a"), li("b"), li("c"), li()] }]);
  cursorIn(editor, "");
  editor.commands.toggleOrderedList();
  assert.equal(shape(editor), "bullet[a,b,c] ordered[]");
  assert.ok(editor.isActive("orderedList"), "the cursor stays in the new line");
});

test("switching the other way leaves numbers above as numbers", () => {
  const editor = listEditor([{ type: "orderedList", content: [li("a"), li("b"), li()] }]);
  cursorIn(editor, "");
  editor.commands.toggleBulletList();
  assert.equal(shape(editor), "ordered[a,b] bullet[]");
});

test("switching a middle line splits the list around it", () => {
  const editor = listEditor([{ type: "bulletList", content: [li("a"), li("b"), li("c")] }]);
  cursorIn(editor, "b");
  editor.commands.toggleOrderedList();
  assert.equal(shape(editor), "bullet[a] ordered[b] bullet[c]");
  assert.equal(editor.state.selection.$from.parent.textContent, "b");
});

test("a line switched next to a list of its new type joins it", () => {
  const editor = listEditor([
    { type: "orderedList", content: [li("one"), li("two")] },
    { type: "bulletList", content: [li("three")] },
  ]);
  cursorIn(editor, "three");
  editor.commands.toggleOrderedList();
  assert.equal(shape(editor), "ordered[one,two,three]");
});

test("the same list type still toggles the line off, and plain text becomes a list", () => {
  const editor = listEditor([{ type: "bulletList", content: [li("a"), li("b")] }, para("plain")]);
  cursorIn(editor, "plain");
  editor.commands.toggleOrderedList();
  assert.equal(shape(editor), "bullet[a,b] ordered[plain]");
  cursorIn(editor, "b");
  editor.commands.toggleBulletList();
  assert.equal(shape(editor), "bullet[a] p[b] ordered[plain]");
});

test("Backspace on an empty list line removes the marker and stays on that line", () => {
  const editor = listEditor([{ type: "bulletList", content: [li("a"), li("b"), li()] }]);
  cursorIn(editor, "");
  editor.commands.keyboardShortcut("Backspace");
  assert.equal(shape(editor), "bullet[a,b] p[]");
  assert.equal(editor.state.selection.$from.parent.type.name, "paragraph");
  assert.equal(editor.state.selection.$from.parent.textContent, "", "the cursor is on the emptied line, not on b");
});

test("Backspace at the start of a numbered line with text turns it into plain text", () => {
  const editor = listEditor([{ type: "orderedList", content: [li("a"), li("b")] }]);
  const doc = editor.state.doc;
  let start = -1;
  doc.descendants((node, pos) => {
    if (start === -1 && node.isTextblock && node.textContent === "b") start = pos + 1;
  });
  editor.commands.setTextSelection(start);
  editor.commands.keyboardShortcut("Backspace");
  assert.equal(shape(editor), "ordered[a] p[b]");
  assert.equal(editor.state.selection.$from.parent.textContent, "b");
});

test("Backspace inside list text is left to the browser, which deletes a character", () => {
  const editor = listEditor([{ type: "bulletList", content: [li("ab")] }]);
  cursorIn(editor, "ab");
  assert.equal(liftLineOutOfList(editor), false, "not handled by the list");
  assert.equal(shape(editor), "bullet[ab]");
});
