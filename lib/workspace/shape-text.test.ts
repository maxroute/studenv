import { test } from "node:test";
import assert from "node:assert/strict";
import { parseWorkspaceScene } from "@/types/workspace";
import { shapeHoldsText, shapeTextBox, shapeTextColor } from "./shape-text";

test("lines and arrows never hold text; closed shapes do", () => {
  assert.equal(shapeHoldsText("arrow"), false);
  assert.equal(shapeHoldsText("line"), false);
  assert.equal(shapeHoldsText("diamond"), true);
});

test("text stays inside the outline, with more room kept at a diamond's points", () => {
  assert.deepEqual(shapeTextBox("rectangle", 200, 100), { left: 12, top: 8, width: 176, height: 84 });
  const diamond = shapeTextBox("diamond", 200, 100);
  assert.deepEqual(diamond, { left: 50, top: 25, width: 100, height: 50 });
  const tiny = shapeTextBox("star", 2, 2);
  assert.ok(tiny.width >= 1 && tiny.height >= 1);
});

test("the text reads on its fill unless a colour was chosen", () => {
  assert.equal(shapeTextColor({ type: "solid", color: "#F8E7A1" }), "#1e1e1e");
  assert.equal(shapeTextColor({ type: "solid", color: "#1f2937" }), "#ffffff");
  assert.equal(shapeTextColor({ type: "transparent", color: "#000" }), "#1e1e1e");
  assert.equal(shapeTextColor({ type: "solid", color: "#1f2937" }, "#d64545"), "#d64545");
});

test("shapes saved before text existed still load, and their text is kept once added", () => {
  const shape = (props: Record<string, unknown>) => ({ id: "s1", type: "shape", x: 0, y: 0, w: 100, h: 60, rotation: 0, zIndex: 1, props: { kind: "diamond", fill: { type: "solid", color: "#fff" }, stroke: { width: 2, color: "#000", style: "solid" }, ...props } });
  const old = parseWorkspaceScene({ format: "second-brain-workspace", version: 1, items: [shape({})] });
  assert.equal(old.items[0]?.type === "shape" && old.items[0].props.text, "");
  const withText = parseWorkspaceScene({ format: "second-brain-workspace", version: 1, items: [shape({ text: "Valid?" })] });
  assert.equal(withText.items[0]?.type === "shape" && withText.items[0].props.text, "Valid?");
  // An odd older shape (a bad kind) goes through the forgiving path and still keeps no-text.
  const odd = parseWorkspaceScene({ format: "second-brain-workspace", version: 1, items: [shape({ text: 5, opacity: "x" })] });
  assert.equal(odd.items[0]?.type === "shape" && odd.items[0].props.text, "");
});
