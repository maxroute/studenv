import test from "node:test";
import assert from "node:assert/strict";
import { TouchHistoryGesture } from "./touch-history-gesture";

function tap(g: TouchHistoryGesture, fingers: number, { duration = 120, move = 0, type = "touch" } = {}) {
  for (let i = 0; i < fingers; i += 1) g.down(i + 1, type, 100 + i * 50, 100, i * 10);
  for (let i = 0; i < fingers; i += 1) g.move(i + 1, 100 + i * 50 + move, 100);
  let result = null;
  for (let i = 0; i < fingers; i += 1) result = g.up(i + 1, duration + i) ?? result;
  return result;
}

test("a quick two-finger tap undoes and a three-finger tap redoes", () => {
  const g = new TouchHistoryGesture();
  assert.equal(tap(g, 2), "undo");
  assert.equal(tap(g, 3), "redo");
});

test("one finger, four fingers, slow holds and moving fingers do nothing", () => {
  const g = new TouchHistoryGesture();
  assert.equal(tap(g, 1), null);
  assert.equal(tap(g, 4), null);
  assert.equal(tap(g, 2, { duration: 400 }), null, "long press");
  assert.equal(tap(g, 2, { move: 30 }), null, "pan or pinch");
  assert.equal(tap(g, 2, { move: 8 }), "undo", "small jitter is still a tap");
});

test("pen and mouse never trigger, and an OS cancel aborts the tap", () => {
  const g = new TouchHistoryGesture();
  assert.equal(tap(g, 2, { type: "pen" }), null);
  g.down(1, "touch", 0, 0, 0);
  g.down(2, "touch", 50, 0, 5);
  g.cancel(1);
  assert.equal(g.up(2, 60), null);
  assert.equal(tap(g, 2), "undo", "the next tap starts fresh");
});

test("a finger added late (pinch started slowly) cancels", () => {
  const g = new TouchHistoryGesture();
  g.down(1, "touch", 0, 0, 0);
  g.down(2, "touch", 50, 0, 300);
  g.up(1, 320);
  assert.equal(g.up(2, 330), null);
});

test("a second finger landing early cancels the first finger's mark (no dot from a two-finger tap)", async () => {
  const { shouldCancelForMultiTouch } = await import("./touch-history-gesture");
  assert.equal(shouldCancelForMultiTouch({ pointerType: "touch", startTime: 0, travel: 0 }, "touch", 40), true);
  assert.equal(shouldCancelForMultiTouch({ pointerType: "touch", startTime: 0, travel: 30 }, "touch", 200), true, "within the tap window");
  assert.equal(shouldCancelForMultiTouch({ pointerType: "touch", startTime: 0, travel: 4 }, "touch", 900), true, "late but the first finger has not moved");
});

test("a stroke already being drawn, or a pen or mouse gesture, is kept", async () => {
  const { shouldCancelForMultiTouch } = await import("./touch-history-gesture");
  assert.equal(shouldCancelForMultiTouch({ pointerType: "touch", startTime: 0, travel: 120 }, "touch", 900), false);
  assert.equal(shouldCancelForMultiTouch({ pointerType: "pen", startTime: 0, travel: 0 }, "touch", 40), false, "palm touching while writing with a pen");
  assert.equal(shouldCancelForMultiTouch({ pointerType: "mouse", startTime: 0, travel: 0 }, "touch", 40), false);
  assert.equal(shouldCancelForMultiTouch({ pointerType: "touch", startTime: 0, travel: 0 }, "pen", 40), false);
});
