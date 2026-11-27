import test from "node:test";
import assert from "node:assert/strict";
import { Editor } from "@tiptap/core";
import { JSDOM } from "jsdom";
import { createNoteExtensions } from "@/lib/notes/editor-extensions";
import { fromEditorJSON } from "@/lib/notes/editor-bridge";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { pageBlocks } from "@/hooks/use-open-page";
import { parsePageOps } from "./page-ops";
import { runPageOps } from "./page-ops-run";

// A real editor in a DOM shim, to run Rangan's page tools the way the panel does.
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
Object.assign(globalThis, { MutationObserver: NoMutationObserver, Event: dom.window.Event });
Object.assign(dom.window, { MutationObserver: NoMutationObserver });
Object.defineProperty(dom.window.HTMLElement.prototype, "offsetParent", {
  configurable: true,
  get(this: HTMLElement) {
    return this.closest("[hidden]") ? null : this.parentElement ?? dom.window.document.body;
  },
});


const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { id: "b_head000001", level: 2 }, content: [{ type: "text", text: "Stacks" }] },
    { type: "paragraph", attrs: { id: "b_para000001" }, content: [{ type: "text", text: "A stack is LIFO. Push and pop run in constant time." }] },
    { type: "paragraph", attrs: { id: "b_para000002" }, content: [{ type: "text", text: "Queues come next." }] },
    {
      type: "taskList",
      content: [
        { type: "taskItem", attrs: { id: "b_task000001", checked: false }, content: [{ type: "paragraph", attrs: { id: "b_tpar000001" }, content: [{ type: "text", text: "Revise stacks" }] }] },
        { type: "taskItem", attrs: { id: "b_task000002", checked: false }, content: [{ type: "paragraph", attrs: { id: "b_tpar000002" }, content: [{ type: "text", text: "Read chapter 2" }] }] },
      ],
    },
  ],
};

/** Runs a model reply's steps on a fresh editor and returns the editor, as Apply would leave it. */
function apply(ops: unknown[], embeds: Record<string, string> = {}) {
  const editor = new Editor({ extensions: createNoteExtensions({}), content: doc });
  const planned = pageBlocks(editor);
  const plan = parsePageOps(JSON.stringify({ summary: "x", ops }), planned);
  assert.ok(plan, "the steps are kept");
  const result = runPageOps(editor, plan.ops, { citations: [], embeds: new Map(Object.entries(embeds)) });
  editor.view.dispatch(result.tr);
  return { editor, result, planned };
}

const marksOn = (editor: Editor, words: string) => {
  let found: string[] = [];
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text === words) found = node.marks.map((mark) => (mark.type.name === "link" ? `link:${mark.attrs.href}` : mark.type.name === "textStyle" ? `color:${mark.attrs.color}` : mark.type.name));
  });
  return found.sort();
};

test("the page is read with ids, lists named by their first item, and formatting marked", () => {
  const editor = new Editor({ extensions: createNoteExtensions({}), content: doc });
  const blocks = pageBlocks(editor);
  assert.deepEqual(blocks.map((block) => block.id), ["b_head000001", "b_para000001", "b_para000002", "list:b_task000001"]);
  editor.destroy();
});

test("formatting and links land on exactly the words, in one transaction", () => {
  const { editor, result } = apply([
    { op: "format", block: 2, text: "LIFO", bold: true, highlight: true, color: "red" },
    { op: "link", block: 2, text: "stack", href: "https://en.wikipedia.org/wiki/Stack_(abstract_data_type)" },
  ]);
  assert.deepEqual(marksOn(editor, "LIFO"), ["bold", "color:var(--note-color-red)", "highlight"]);
  assert.deepEqual(marksOn(editor, "stack"), ["link:https://en.wikipedia.org/wiki/Stack_(abstract_data_type)"]);
  assert.equal(result.skipped, 0);
  assert.equal(result.tr.steps.length > 0, true);
  editor.destroy();
});

test("words are changed in place, blocks move, turn into other kinds and get new blocks after them", () => {
  const { editor } = apply([
    { op: "rewrite", block: 2, text: "constant time", with: "O(1) time" },
    { op: "turnInto", block: 3, into: "callout" },
    { op: "move", block: 1, after: 3 },
    { op: "insert", after: 1, markdown: "- [ ] Practise 5 problems\n\n> [!tip] ==LIFO== is the key idea" },
    { op: "check", block: 4, item: "Revise stacks", done: true },
  ]);
  const json = editor.getJSON();
  const types = (json.content ?? []).map((node) => node.type);
  // The heading moved after the block that became a callout (found by its kept id); the editor keeps an empty last line.
  assert.deepEqual(types, ["paragraph", "callout", "heading", "taskList", "callout", "taskList", "paragraph"]);
  assert.match(JSON.stringify(json), /O\(1\) time/);
  const parsed = parseNoteDoc(fromEditorJSON(json));
  const lists = parsed.envelope.doc.content.filter((node) => node.type === "taskList");
  assert.deepEqual(lists[1].content?.map((item) => item.attrs?.checked), [true, false]);
  assert.equal(parsed.envelope.doc.content.some((node) => node.type === "unsupported"), false, "every block is a valid note block");
  editor.destroy();
});

test("an embed becomes a Shelf card, delete removes a block, and a rename is returned for the title", () => {
  const { editor, result } = apply(
    [
      { op: "embed", after: 2, url: "https://www.youtube.com/watch?v=abc123" },
      { op: "delete", block: 3 },
      { op: "title", title: "Stacks and queues" },
    ],
    { "https://www.youtube.com/watch?v=abc123": "item42" },
  );
  const json = editor.getJSON();
  assert.deepEqual((json.content ?? []).map((node) => node.type), ["heading", "paragraph", "embed", "paragraph", "taskList", "paragraph"]);
  assert.equal(json.content?.[2].attrs?.ref, "item:item42");
  assert.equal(result.rename, "Stacks and queues");
  editor.destroy();
});

test("fixing formulas turns raw maths into equations, and later steps still find their blocks", () => {
  const editor = new Editor({
    extensions: createNoteExtensions({}),
    content: {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { id: "b_math000001" }, content: [{ type: "text", text: "$$\\sin^2\\theta+\\cos^2\\theta=1$$" }] },
        { type: "paragraph", attrs: { id: "b_math000002" }, content: [{ type: "text", text: "Use $$\\tan\\theta$$ for slopes." }] },
      ],
    },
  });
  const plan = parsePageOps(JSON.stringify({ summary: "x", ops: [{ op: "fixMath" }, { op: "fixMath" }, { op: "format", block: 2, text: "slopes", bold: true }] }), pageBlocks(editor));
  assert.ok(plan);
  assert.deepEqual(plan.ops.map((op) => op.op), ["fixMath", "format"], "asked twice, done once");
  const result = runPageOps(editor, plan.ops, { citations: [], embeds: new Map() });
  editor.view.dispatch(result.tr);
  const json = editor.getJSON();
  assert.equal(json.content?.[0].type, "blockMath");
  assert.equal(json.content?.[0].attrs?.latex, "\\sin^2\\theta+\\cos^2\\theta=1");
  assert.match(JSON.stringify(json.content?.[1]), /"type":"inlineMath","attrs":\{"latex":"\\\\tan\\\\theta"\}/);
  assert.deepEqual(marksOn(editor, "slopes"), ["bold"]);
  assert.equal(result.skipped, 0);
  editor.destroy();
});
