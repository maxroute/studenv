import { test } from "node:test";
import assert from "node:assert/strict";
import { fitWithin } from "./shrink-image";

test("large photos shrink to the longer side and small ones stay as they are", () => {
  assert.deepEqual(fitWithin(4032, 3024), { width: 640, height: 480 });
  assert.deepEqual(fitWithin(3024, 4032), { width: 480, height: 640 });
  assert.deepEqual(fitWithin(300, 200), { width: 300, height: 200 });
  assert.deepEqual(fitWithin(10000, 1), { width: 640, height: 1 });
});
