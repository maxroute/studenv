import assert from "node:assert/strict";
import test from "node:test";
import { loadState, retryDelay, shouldRetry } from "./load-state";

test("a list is empty only when the server said so", () => {
  assert.equal(loadState({ hasData: false, count: 0, isLoading: true, error: undefined }), "loading");
  assert.equal(loadState({ hasData: false, count: 0, isLoading: false, error: new Error("x") }), "failed");
  assert.equal(loadState({ hasData: true, count: 0, isLoading: false, error: undefined }), "empty");
  assert.equal(loadState({ hasData: true, count: 2, isLoading: false, error: undefined }), "ready");
});

test("data already shown stays shown when a later refresh fails", () => {
  assert.equal(loadState({ hasData: true, count: 2, isLoading: false, error: new Error("x") }), "ready");
});

test("retries start at one second and double", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 9].map(retryDelay), [1000, 2000, 4000, 8000, 8000, 8000]);
});

test("only network and server failures are retried", () => {
  assert.equal(shouldRetry(new TypeError("Failed to fetch"), 0), true);
  assert.equal(shouldRetry(Object.assign(new Error("x"), { status: 503 }), 1), true);
  assert.equal(shouldRetry(Object.assign(new Error("x"), { status: 401 }), 0), false);
  assert.equal(shouldRetry(Object.assign(new Error("x"), { status: 404 }), 0), false);
  assert.equal(shouldRetry(new TypeError("Failed to fetch"), 6), false);
});
