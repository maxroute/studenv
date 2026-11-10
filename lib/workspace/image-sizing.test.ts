import test from "node:test";
import assert from "node:assert/strict";
import { fitImageToBounds } from "./image-sizing";

test("fits landscape images while preserving their aspect ratio", () => {
  assert.deepEqual(fitImageToBounds(1920, 1080), { w: 360, h: 203 });
});

test("fits portrait images within the same footprint without cropping", () => {
  assert.deepEqual(fitImageToBounds(1080, 1920), { w: 135, h: 240 });
});

test("fits square images without introducing a rectangular frame", () => {
  assert.deepEqual(fitImageToBounds(1000, 1000), { w: 240, h: 240 });
});

test("scales small images up to the available footprint", () => {
  assert.deepEqual(fitImageToBounds(100, 50), { w: 360, h: 180 });
});

test("returns a safe fallback for invalid intrinsic dimensions", () => {
  assert.deepEqual(fitImageToBounds(0, 100), { w: 360, h: 240 });
});
