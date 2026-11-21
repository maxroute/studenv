import assert from "node:assert/strict";
import test from "node:test";
import { boardPassages, elementText, sceneText } from "./board-text";

test("each kind of element reads as the board shows it; elements without words read as nothing", () => {
  assert.equal(elementText({ type: "sticky", props: { text: "Kernel\nThe core" } }), "Kernel\nThe core");
  assert.equal(elementText({ type: "free-text", props: { text: "Title" } }), "Title");
  assert.equal(elementText({ type: "note-card", props: { title: "OS notes", excerpt: "About kernels" } }), "Page card: OS notes — About kernels");
  assert.equal(elementText({ type: "resource-card", props: { title: "Lecture", kind: "video" } }), "Video card: Lecture");
  assert.equal(elementText({ type: "resource-card", props: { title: "Paging", kind: "webpage" } }), "Link card: Paging");
  assert.equal(elementText({ type: "image", props: { alt: "Process states" } }), "Picture: Process states");
  assert.equal(elementText({ type: "shape", props: { kind: "rectangle" } }), "");
  assert.equal(elementText({ type: "drawing", props: {} }), "");
});

test("a scene becomes text nodes with their groups, and labelled edges from connectors", () => {
  const { nodes, edges } = sceneText([
    { id: "a", type: "sticky", props: { text: "Memory", groupId: "g1" } },
    { id: "b", type: "sticky", props: { text: "Paging", groupId: "g1" } },
    { id: "f", type: "shape", props: { groupId: "g1" } },
    { id: "c", type: "connector", props: { source: { id: "a" }, target: { id: "b" }, label: { text: "uses" } } },
    { id: "d", type: "connector", props: { source: { position: [0, 0] }, target: { id: "b" } } },
  ]);
  assert.deepEqual(nodes, [
    { id: "a", type: "sticky", text: "Memory", groupId: "g1" },
    { id: "b", type: "sticky", text: "Paging", groupId: "g1" },
  ]);
  assert.deepEqual(edges, [{ from: "a", to: "b", label: "uses" }], "a connector with a free end joins nothing");
});

test("a group is one passage headed by its first sticky, with its connections as lines", () => {
  const passages = boardPassages(
    [
      { id: "t", type: "free-text", text: "OS map" },
      { id: "c", type: "sticky", text: "Operating System" },
      { id: "m", type: "sticky", text: "Memory\nWhere data lives", groupId: "g1" },
      { id: "p", type: "sticky", text: "Paging\nFixed-size pages", groupId: "g1" },
    ],
    [
      { from: "c", to: "m", label: "manages" },
      { from: "m", to: "p", label: "" },
    ],
  );
  assert.deepEqual(passages, [
    { anchor: "", heading: "Memory", content: "Memory — Where data lives\nPaging — Fixed-size pages\nMemory → Paging" },
    { anchor: "", heading: "", content: "OS map\nOperating System\n → manages → Memory" },
  ]);
});

test("an empty board has no passages", () => {
  assert.deepEqual(boardPassages([], []), []);
});
