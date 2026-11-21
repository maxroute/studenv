import assert from "node:assert/strict";
import test from "node:test";
import type { StudioItem } from "@/types/workspace";
import { contentBounds, fitCamera, stepScale, zoomAroundCentre } from "./fit-view";
import { ignoreTouchNearPen, PEN_PALM_WINDOW_MS } from "./palm-rejection";

const sticky = (id: string, x: number, y: number, w = 200, h = 100, rotation = 0): StudioItem =>
  ({ id, type: "sticky", x, y, w, h, rotation, zIndex: 1, props: { text: id, color: "#fff" } }) as StudioItem;
const connector = (id: string): StudioItem =>
  ({ id, type: "connector", x: 0, y: 0, w: 1, h: 1, rotation: 0, zIndex: 0, props: { source: { id: "a" }, target: { id: "b" }, mode: "curve", color: "#888", strokeWidth: 2, strokeStyle: "solid", frontEndpointStyle: "none", rearEndpointStyle: "none" } }) as StudioItem;

test("connectors don't count: a board far from the origin fits its content, not the origin too", () => {
  const items = [sticky("a", 5000, 5000), sticky("b", 5400, 5000), connector("c")];
  assert.deepEqual(contentBounds(items), { left: 5000, top: 5000, right: 5600, bottom: 5100 });
  const view = { width: 800, height: 500 };
  const camera = fitCamera(contentBounds(items)!, view);
  // 600 x 100 of content in 800 x 500: it fits at real size, centred.
  assert.equal(camera.scale, 1);
  assert.equal(5000 * camera.scale + camera.x, 100, "content starts 100px in from the left");
  assert.equal(5000 * camera.scale + camera.y, 200, "and is centred vertically");
  // Counting the connector's placeholder at the origin would have zoomed out to ~0.15.
  const withOrigin = contentBounds([...items, { ...sticky("o", 0, 0, 1, 1) }])!;
  assert.ok(fitCamera(withOrigin, view).scale < 0.2);
});

test("a board of only connectors, or an empty board, has no bounds", () => {
  assert.equal(contentBounds([]), null);
  assert.equal(contentBounds([connector("c")]), null);
});

test("rotated elements are measured by the box that holds them", () => {
  const bounds = contentBounds([sticky("a", 0, 0, 200, 100, 90)])!;
  // Turned a quarter, 200 x 100 becomes 100 x 200 around the same centre (100, 50).
  assert.deepEqual({ w: Math.round(bounds.right - bounds.left), h: Math.round(bounds.bottom - bounds.top) }, { w: 100, h: 200 });
  assert.equal(Math.round((bounds.left + bounds.right) / 2), 100);
  assert.equal(Math.round((bounds.top + bounds.bottom) / 2), 50);
});

test("fitting zooms out to hold big content and never zooms in past real size", () => {
  const view = { width: 1000, height: 600 };
  const big = fitCamera({ left: 0, top: 0, right: 4000, bottom: 2000 }, view, { padding: 0 });
  assert.equal(big.scale, 0.25);
  const small = fitCamera({ left: 0, top: 0, right: 100, bottom: 50 }, view);
  assert.equal(small.scale, 1);
  const zoomed = fitCamera({ left: 0, top: 0, right: 100, bottom: 50 }, view, { maxScale: 2, padding: 0 });
  assert.equal(zoomed.scale, 2, "zoom to selection may zoom in");
});

test("space taken by controls is kept free", () => {
  const view = { width: 400, height: 800 };
  const bounds = { left: 0, top: 0, right: 400, bottom: 800 };
  const plain = fitCamera(bounds, view, { padding: 20 });
  const withBar = fitCamera(bounds, view, { padding: 20, insets: { bottom: 80, top: 20 } });
  assert.ok(withBar.scale < plain.scale);
  const bottomEdge = 800 * withBar.scale + withBar.y;
  assert.ok(bottomEdge <= 800 - 80 - 20 + 1e-6, "content ends above the controls");
});

test("minus and plus move to the next ten percent and stay between 10% and 500%", () => {
  assert.equal(stepScale(1, 1), 1.1);
  assert.equal(stepScale(1, -1), 0.9);
  assert.equal(stepScale(0.87, 1), 0.9);
  assert.equal(stepScale(0.87, -1), 0.8);
  assert.equal(stepScale(0.9, 1), 1);
  assert.equal(stepScale(0.1, -1), 0.1);
  assert.equal(stepScale(5, 1), 5);
});

test("zooming with the buttons keeps the middle of the view where it is", () => {
  const view = { width: 800, height: 600 };
  const camera = { x: -300, y: -100, scale: 1 };
  const next = zoomAroundCentre(camera, view, 2);
  // The world point under the middle before and after is the same.
  const before = { x: (400 - camera.x) / camera.scale, y: (300 - camera.y) / camera.scale };
  const after = { x: (400 - next.x) / next.scale, y: (300 - next.y) / next.scale };
  assert.deepEqual(after, before);
  assert.equal(next.scale, 2);
});

test("touches near the pen are palm, other touches and the pen itself are not", () => {
  assert.equal(ignoreTouchNearPen("touch", 1000, 1000 + PEN_PALM_WINDOW_MS - 1), true);
  assert.equal(ignoreTouchNearPen("touch", 1000, 1000 + PEN_PALM_WINDOW_MS), false, "after the window");
  assert.equal(ignoreTouchNearPen("touch", null, 5000), false, "no pen seen");
  assert.equal(ignoreTouchNearPen("pen", 1000, 1100), false, "the pen can press a button");
  assert.equal(ignoreTouchNearPen("mouse", 1000, 1100), false);
});
