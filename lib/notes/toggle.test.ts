import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { JSDOM } from "jsdom";
import { createNoteExtensions } from "./editor-extensions";

// A real editor in a DOM shim, to press the keys the way a user would.
const dom = new JSDOM("<!doctype html><html><body></body></html>");
Object.assign(globalThis, { window: dom.window, document: dom.window.document, getComputedStyle: dom.window.getComputedStyle });
Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
for (const key of ["HTMLElement", "HTMLInputElement", "Node", "Element", "DOMParser", "Text", "KeyboardEvent", "Event"] as const) {
  Object.assign(globalThis, { [key]: dom.window[key] });
}
Object.assign(globalThis, {
  requestAnimationFrame: (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0),
  cancelAnimationFrame: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
});

// The editor only uses a MutationObserver to notice typing into the DOM, which these tests
// never do. JSDOM's one re-renders the toggle (class and hidden changes) without end.
class NoMutationObserver {
  observe() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
Object.assign(globalThis, { MutationObserver: NoMutationObserver });
Object.assign(dom.window, { MutationObserver: NoMutationObserver });

// JSDOM has no layout, so every element reports no offsetParent. The stock toggle reads that as
// "hidden" and would endlessly pull the cursor out of its body. Treat an element as visible
// unless it sits inside a [hidden] ancestor, which is what the toggle sets while closed.
Object.defineProperty(dom.window.HTMLElement.prototype, "offsetParent", {
  configurable: true,
  get(this: HTMLElement) {
    return this.closest("[hidden]") ? null : this.parentElement ?? dom.window.document.body;
  },
});
/**
 * Presses a key the way the browser does: through the view's key handlers. (The
 * keyboardShortcut command wraps the press in its own transaction, which would
 * overwrite the cursor these handlers move.)
 */
function press(editor: Editor, key: string, modifiers: { mod?: boolean } = {}) {
  // "Mod" is Cmd on a Mac and Ctrl elsewhere; try the one this machine's keymap expects.
  const variants = modifiers.mod ? [{ metaKey: true }, { ctrlKey: true }] : [{}];
  for (const variant of variants) {
    const event = new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...variant });
    if (editor.view.someProp("handleKeyDown", (handler) => handler(editor.view, event))) return true;
  }
  return false;
}
/** The toggle shows its body one tick after it is created open. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const para = (text?: string) => ({ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) });

/** The cursor at the end of the text block that holds `text`. */
function cursorIn(editor: Editor, text: string) {
  let found = -1;
  editor.state.doc.descendants((node, pos) => {
    if (found === -1 && node.isTextblock && node.textContent === text) found = pos + 1 + node.content.size;
  });
  assert.notEqual(found, -1, `a line "${text}"`);
  editor.commands.setTextSelection(found);
}

// --- toggles -----------------------------------------------------------------

type JsonNode = { type?: string; text?: string; content?: JsonNode[] };
const toggleDoc = (summary: string, bodyBlocks: unknown[], open = false) => ({
  type: "details",
  attrs: { open },
  content: [{ type: "detailsSummary", content: summary ? [{ type: "text", text: summary }] : undefined }, { type: "detailsContent", content: bodyBlocks }],
});
const toggleEditor = (content: unknown[]) => new Editor({ extensions: createNoteExtensions({}), content: { type: "doc", content } as never });
const detailsOf = (editor: Editor) => editor.getJSON().content!.find((node) => node.type === "details")!;
const bodyTexts = (node: { content?: { content?: { content?: { text?: string }[] }[] }[] }) =>
  (node.content?.[1]?.content ?? []).map((block) => block.content?.[0]?.text ?? "");

test("creating a toggle makes the line its title, opens it and leaves the cursor in the title", async () => {
  const editor = toggleEditor([para("My question")]);
  cursorIn(editor, "My question");
  editor.commands.setToggle();
  await tick();
  const details = detailsOf(editor);
  assert.equal(details.attrs?.open, true, "it starts open");
  assert.equal((details.content as JsonNode[] | undefined)?.[0]?.content?.[0]?.text, "My question", "the line is the title");
  assert.deepEqual(bodyTexts(details as never), [""], "with one empty line inside");
  assert.equal(editor.state.selection.$from.parent.type.name, "detailsSummary", "the cursor is in the title");
  assert.equal(editor.state.selection.$from.parentOffset, "My question".length, "at the end of the title");
});

test("a toggle made from an empty line has an empty title to type into", async () => {
  const editor = toggleEditor([para()]);
  editor.commands.setTextSelection(1);
  editor.commands.setToggle();
  await tick();
  assert.equal(editor.state.selection.$from.parent.type.name, "detailsSummary");
  assert.equal(detailsOf(editor).attrs?.open, true);
});

test("Enter in the title of a new toggle moves into its body without adding a second empty line", async () => {
  const editor = toggleEditor([para()]);
  editor.commands.setTextSelection(1);
  editor.commands.setToggle();
  await tick();
  editor.commands.insertContent("Title");
  press(editor, "Enter");
  assert.equal(editor.state.selection.$from.parent.type.name, "paragraph");
  assert.ok(editor.state.selection.$from.node(-1).type.name === "detailsContent", "the cursor is inside the body");
  assert.deepEqual(bodyTexts(detailsOf(editor) as never), [""], "still one empty line in the body");
});

test("Enter in the title of an open toggle with content adds a line at the top of the body", async () => {
  const editor = toggleEditor([toggleDoc("T", [para("existing")], true)]);
  await tick();
  cursorIn(editor, "T");
  press(editor, "Enter");
  assert.deepEqual(bodyTexts(detailsOf(editor) as never), ["", "existing"]);
  assert.equal(editor.state.selection.$from.node(-1).type.name, "detailsContent");
});

test("Enter in the title of a closed toggle with content adds a line after it, not inside", async () => {
  const editor = toggleEditor([toggleDoc("T", [para("hidden")], false)]);
  cursorIn(editor, "T");
  press(editor, "Enter");
  assert.deepEqual(bodyTexts(detailsOf(editor) as never), ["hidden"], "the hidden content is untouched");
  assert.equal(editor.getJSON().content!.length >= 2, true, "a new block follows the toggle");
});

test("Mod-Enter opens and closes the toggle you are in", async () => {
  const editor = toggleEditor([toggleDoc("T", [para("inside")], true)]);
  await tick();
  cursorIn(editor, "inside");
  press(editor, "Enter", { mod: true });
  assert.equal(detailsOf(editor).attrs?.open, false, "closed");
  assert.equal(editor.state.selection.$from.parent.type.name, "detailsSummary", "the cursor moved up to the title");
  press(editor, "Enter", { mod: true });
  assert.equal(detailsOf(editor).attrs?.open, true, "and open again");
});

test("Backspace at the start of a toggle title turns it back into plain text", async () => {
  const editor = toggleEditor([toggleDoc("T", [para("body")], true)]);
  await tick();
  let start = -1;
  editor.state.doc.descendants((node, pos) => {
    if (start === -1 && node.type.name === "detailsSummary") start = pos + 1;
  });
  editor.commands.setTextSelection(start);
  press(editor, "Backspace");
  assert.ok(!JSON.stringify(editor.getJSON()).includes('"details"'), "no toggle left");
  assert.ok(JSON.stringify(editor.getJSON()).includes("body"), "its content is kept");
});

test("the arrow button is labelled when it is created, not changed afterwards", async () => {
  // Changing the button after it is in the page reads to the editor as an edit inside the toggle
  // and redraws the toggle without end (it froze the page). The label must be there from the start.
  const editor = toggleEditor([toggleDoc("T", [para("body")], false)]);
  const button = editor.view.dom.querySelector(".note-details > button");
  assert.ok(button, "the toggle has an arrow button");
  assert.equal(button.getAttribute("aria-label"), "Open or close toggle");
  editor.destroy();
});
