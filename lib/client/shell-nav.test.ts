import { test } from "node:test";
import assert from "node:assert/strict";
import { clockTime, hidesPhoneBars, shellPlace } from "./shell-nav";

test("every library screen lights up Library", () => {
  for (const path of ["/shelf", "/shelf/abc", "/notes", "/notes/abc", "/library/boards", "/flashcards"]) {
    assert.equal(shellPlace(path), "library", path);
  }
});

test("Home is only the dashboard itself; Focus is its own place under Planner", () => {
  assert.equal(shellPlace("/dashboard"), "home");
  assert.equal(shellPlace("/dashboard/planner"), "planner");
  assert.equal(shellPlace("/dashboard/focus"), "focus");
  assert.equal(shellPlace("/dashboard/groups/abc/room"), "groups");
});

test("account pages and unknown paths light up nothing", () => {
  for (const path of ["/profile", "/shelf/profile", "/settings", "/dashboard/achievements", "/notesy", null]) {
    assert.equal(shellPlace(path), null, String(path));
  }
});

test("only a study room hides the phone bars", () => {
  assert.equal(hidesPhoneBars("/dashboard/groups/abc/room"), true);
  assert.equal(hidesPhoneBars("/dashboard/groups/abc"), false);
  assert.equal(hidesPhoneBars("/notes/room"), false);
});

test("clock time pads and never goes negative", () => {
  assert.equal(clockTime(1122), "18:42");
  assert.equal(clockTime(5), "00:05");
  assert.equal(clockTime(-3), "00:00");
  assert.equal(clockTime(Number.NaN), "00:00");
  assert.equal(clockTime(3600), "60:00");
});
