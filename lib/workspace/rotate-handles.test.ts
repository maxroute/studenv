import test from "node:test";
import assert from "node:assert/strict";
import { getRotateCursor, getRotateZoneBox, ROTATE_ZONE_PX } from "./rotate-handles";

test("rotate zones sit diagonally outside each corner, touching it", () => {
  assert.deepEqual(getRotateZoneBox("top-left", 200, 100, ROTATE_ZONE_PX, 1), { left: -12, top: -12, width: 12, height: 12 });
  assert.deepEqual(getRotateZoneBox("top-right", 200, 100, ROTATE_ZONE_PX, 1), { left: 200, top: -12, width: 12, height: 12 });
  assert.deepEqual(getRotateZoneBox("bottom-right", 200, 100, ROTATE_ZONE_PX, 1), { left: 200, top: 100, width: 12, height: 12 });
  assert.deepEqual(getRotateZoneBox("bottom-left", 200, 100, ROTATE_ZONE_PX, 1), { left: -12, top: 100, width: 12, height: 12 });
});

test("zone size is constant in screen pixels", () => {
  assert.deepEqual(getRotateZoneBox("top-left", 200, 100, 12, 2), { left: -6, top: -6, width: 6, height: 6 });
  assert.deepEqual(getRotateZoneBox("bottom-right", 200, 100, 12, 0.5), { left: 200, top: 100, width: 24, height: 24 });
});

test("rotate cursor turns with the corner and the item rotation", () => {
  assert.match(decodeURIComponent(getRotateCursor("top-right", 0)), /rotate\(0 12 12\)/);
  assert.match(decodeURIComponent(getRotateCursor("bottom-left", 0)), /rotate\(180 12 12\)/);
  assert.match(decodeURIComponent(getRotateCursor("top-left", 135)), /rotate\(45 12 12\)/);
  assert.match(getRotateCursor("top-left", 0), /, grab$/);
});
