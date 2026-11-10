import test from "node:test";
import assert from "node:assert/strict";
import {
  computeResize,
  shouldLockAspectRatioOnResize,
  type ResizeHandle,
} from "./transform-engine";

const imageProps = {};
const imageBounds = { x: 100, y: 80, w: 160, h: 320 };
const handles: ResizeHandle[] = ["n", "s", "e", "w", "nw", "ne", "sw", "se"];

test("images always lock their aspect ratio for every resize handle", () => {
  for (const handle of handles) {
    assert.equal(
      shouldLockAspectRatioOnResize("image", imageProps, false),
      true,
      `expected image aspect lock for ${handle}`,
    );
    const resized = computeResize(handle, imageBounds, 45, 30, true);
    assert.ok(
      Math.abs(resized.w / resized.h - imageBounds.w / imageBounds.h) < 1e-9,
      `${handle} changed image ratio from ${imageBounds.w / imageBounds.h} to ${resized.w / resized.h}`,
    );
  }
});

test("image ratio lock is independent of Shift", () => {
  assert.equal(shouldLockAspectRatioOnResize("image", imageProps, false), true);
  assert.equal(shouldLockAspectRatioOnResize("image", imageProps, true), true);
});

test("existing shape aspect-lock behavior remains unchanged", () => {
  assert.equal(shouldLockAspectRatioOnResize("shape", { kind: "circle" }, false), true);
  assert.equal(shouldLockAspectRatioOnResize("shape", { kind: "star" }, false), true);
  assert.equal(shouldLockAspectRatioOnResize("shape", { kind: "pentagon" }, false), true);
  assert.equal(shouldLockAspectRatioOnResize("shape", { kind: "rectangle" }, false), false);
  assert.equal(shouldLockAspectRatioOnResize("shape", { kind: "rectangle" }, true), true);
  assert.equal(shouldLockAspectRatioOnResize("sticky", {}, true), false);
});
