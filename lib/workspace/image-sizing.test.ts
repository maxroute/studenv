import test from "node:test";
import assert from "node:assert/strict";
import { fitImageToBounds, getImageDisplaySizeFromUrl } from "./image-sizing";

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

test("fits Vault landscape and portrait assets to their intrinsic dimensions", () => {
  assert.deepEqual(fitImageToBounds(1600, 900), { w: 360, h: 203 });
  assert.deepEqual(fitImageToBounds(900, 1600), { w: 135, h: 240 });
});

test("resolves Vault image dimensions before creating canvas bounds", async () => {
  const originalImage = (globalThis as any).Image;

  class MockImage {
    naturalWidth = 1920;
    naturalHeight = 1080;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;

    set src(_value: string) {
      queueMicrotask(() => this.onload?.());
    }
  }

  Object.defineProperty(globalThis, "Image", {
    configurable: true,
    writable: true,
    value: MockImage,
  });

  try {
    assert.deepEqual(
      await getImageDisplaySizeFromUrl("/api/assets/example/content"),
      { w: 360, h: 203 },
    );
  } finally {
    if (originalImage === undefined) {
      delete (globalThis as any).Image;
    } else {
      Object.defineProperty(globalThis, "Image", {
        configurable: true,
        writable: true,
        value: originalImage,
      });
    }
  }
});
