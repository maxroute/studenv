import { test } from "node:test";
import assert from "node:assert/strict";
import { sessionTitle } from "./tab-title";

test("the time leads, and a paused session says so", () => {
  assert.equal(sessionTitle("Focus", "24:39", false), "24:39 · Focus");
  assert.equal(sessionTitle("Short break", "04:05", true), "Paused 04:05 · Short break");
});
