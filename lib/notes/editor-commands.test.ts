import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { JSDOM } from "jsdom";
import { slashCommands } from "@/components/notes/slash-commands";
import { TABLE_ACTIONS, hasHeaderRow, tableSize, type TableActionId } from "@/components/notes/table-actions";
import { createNoteExtensions } from "./editor-extensions";
import { fromEditorJSON } from "./editor-bridge";
import { parseNoteDoc } from "./note-format";

// A real editor in a DOM shim, to run every "/" command the way a user would.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document, getComputedStyle: dom.window.getComputedStyle });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
for (const key of ["HTMLElement", "HTMLInputElement", "Node", "Element", "MutationObserver", "DOMParser", "Text"] as const) {
  Object.assign(globalThis, { [key]: dom.window[key] });
}
Object.assign(globalThis, {
  requestAnimationFrame: (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
});

/** Types `value` into the open in-app dialog (equations ask for LaTeX) and submits it. */
async function answerDialog(value: string) {
  await new Promise((resolve) => setTimeout(resolve, 0));
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
