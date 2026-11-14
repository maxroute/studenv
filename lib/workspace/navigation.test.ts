import test from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceItem, type StudioItem } from "@/types/workspace";
import {
  EDGE_SCROLL_MARGIN, MAX_SCALE, PanVelocity, edgeScrollDelta, glideStep, handClickZoom, panCamera, pinchCamera, wheelAction, zoomCameraAt,
} from "./navigation";
import { boxSelection, lassoSelection, pointInPolygon, rectFromPoints } from "./marquee";

const wheel = (deltaX: number, deltaY: number, keys: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }> = {}, deltaMode = 0) => ({
  deltaX, deltaY, deltaMode, ctrlKey: false, metaKey: false, shiftKey: false, ...keys,
});

test("the wheel pans; Shift pans sideways; Ctrl/⌘ (and trackpad pinch) zooms", () => {
  assert.deepEqual(wheelAction(wheel(0, 40)), { type: "pan", dx: 0, dy: 40 });
  assert.deepEqual(wheelAction(wheel(12, -30)), { type: "pan", dx: 12, dy: -30 });
  assert.deepEqual(wheelAction(wheel(0, 40, { shiftKey: true })), { type: "pan", dx: 40, dy: 0 });
  assert.deepEqual(wheelAction(wheel(0, 3, {}, 1)), { type: "pan", dx: 0, dy: 48 }, "line mode is scaled to pixels");
  const zoomIn = wheelAction(wheel(0, -100, { ctrlKey: true }));
  assert.equal(zoomIn.type, "zoom");
  assert.ok(zoomIn.type === "zoom" && zoomIn.factor > 1.2 && zoomIn.factor < 1.3, "one mouse notch zooms about 26%");
  const pinch = wheelAction(wheel(0, -4, { metaKey: true }));
  assert.ok(pinch.type === "zoom" && pinch.factor > 1 && pinch.factor < 1.02, "a trackpad pinch step is small");
  const huge = wheelAction(wheel(0, -1000, { ctrlKey: true }));
  assert.ok(huge.type === "zoom" && huge.factor < 1.3, "a burst is capped");
  assert.deepEqual(wheelAction(wheel(0, 0)), { type: "none" });
});

test("zooming keeps the point under the pointer still", () => {
  const camera = { x: 100, y: 50, scale: 1 };
  const anchor = { x: 300, y: 200 };
  const next = zoomCameraAt(camera, anchor, 2);
  const worldBefore = { x: (anchor.x - camera.x) / camera.scale, y: (anchor.y - camera.y) / camera.scale };
  const worldAfter = { x: (anchor.x - next.x) / next.scale, y: (anchor.y - next.y) / next.scale };
  assert.deepEqual(worldAfter, worldBefore);
  assert.equal(zoomCameraAt(camera, anchor, 99).scale, MAX_SCALE);
  assert.deepEqual(panCamera(camera, 10, -5), { x: 90, y: 55, scale: 1 });
});

test("two fingers pan with their midpoint and zoom with their spread", () => {
  const start = { camera: { x: 0, y: 0, scale: 1 }, a: { x: 100, y: 100 }, b: { x: 200, y: 100 } };
  assert.deepEqual(pinchCamera(start, { x: 130, y: 150 }, { x: 230, y: 150 }), { x: 30, y: 50, scale: 1 }, "same spread: pure pan");
  const zoomed = pinchCamera(start, { x: 50, y: 100 }, { x: 250, y: 100 });
  assert.equal(zoomed.scale, 2);
  // The world point that was under the midpoint (150, 100) stays under it.
  assert.deepEqual({ x: (150 - zoomed.x) / zoomed.scale, y: (100 - zoomed.y) / zoomed.scale }, { x: 150, y: 100 });
});

test("a fast pan glides and slows down; a stopped pointer does not glide", () => {
  const velocity = new PanVelocity();
  velocity.add(0, 0, 0);
  velocity.add(50, 50, 0);
  const v = velocity.velocity(50);
  assert.equal(v.x, 1);
  const step = glideStep(v, 16);
  assert.ok(step && step.dx === 16 && step.velocity.x < 1);
  assert.deepEqual(velocity.velocity(500), { x: 0, y: 0 }, "released long after the last move");
  let current: { x: number; y: number } | null = v;
  let frames = 0;
  while (current && frames < 500) {
    const next = glideStep(current, 16);
    current = next ? next.velocity : null;
    frames += 1;
  }
  assert.ok(frames < 100, "the glide ends");
});

test("edge scrolling starts near the edge and is fastest at it", () => {
  const rect = { width: 800, height: 600 };
  assert.deepEqual(edgeScrollDelta({ x: 400, y: 300 }, rect), { x: 0, y: 0 });
  const left = edgeScrollDelta({ x: 0, y: 300 }, rect);
  const nearLeft = edgeScrollDelta({ x: EDGE_SCROLL_MARGIN / 2, y: 300 }, rect);
  assert.ok(left.x < nearLeft.x && nearLeft.x < 0);
  assert.ok(edgeScrollDelta({ x: 400, y: 599 }, rect).y > 0);
});

test("hand tool clicks: double zooms in, triple zooms out, four resets", () => {
  assert.deepEqual(handClickZoom(2, 1), { type: "zoom", scale: 2 });
  assert.deepEqual(handClickZoom(3, 1), { type: "zoom", scale: 0.5 });
  assert.deepEqual(handClickZoom(4, 1), { type: "reset" });
  assert.equal(handClickZoom(1, 1), null);
});

const box = (id: string, x: number, y: number, w = 100, h = 100): StudioItem => {
  const item = createWorkspaceItem("sticky", { text: "", w, h }, { id, x, y, zIndex: 1 });
  assert.ok(item);
  return { ...item, w, h };
};

test("box selection: touching by default, fully inside with Ctrl/⌘, Shift adds", () => {
  const items = [box("a", 0, 0), box("b", 200, 0), box("c", 400, 0)];
  const drag = rectFromPoints({ x: 50, y: -10 }, { x: 320, y: 120 });
  assert.deepEqual(boxSelection(items, drag, "touch"), ["a", "b"]);
  assert.deepEqual(boxSelection(items, drag, "contain"), ["b"]);
  assert.deepEqual(boxSelection(items, drag, "contain", ["c"]), ["c", "b"]);
});

test("lasso selects what the path crosses or encloses", () => {
  const items = [box("a", 0, 0), box("b", 300, 0), box("c", 600, 600)];
  const loop = [{ x: -20, y: -20 }, { x: 150, y: -20 }, { x: 150, y: 150 }, { x: -20, y: 150 }];
  assert.ok(pointInPolygon({ x: 50, y: 50 }, loop));
  assert.deepEqual(lassoSelection(items, loop), ["a"], "enclosed");
  const stroke = [{ x: 250, y: 50 }, { x: 450, y: 50 }];
  assert.deepEqual(lassoSelection(items, stroke), ["b"], "crossed");
  assert.deepEqual(lassoSelection(items, stroke, ["c"]), ["c", "b"]);
});
