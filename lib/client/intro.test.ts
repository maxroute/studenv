import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { INTRO_END_FRAME, INTRO_STILL_FRAME, INTRO_WORDS, introFrame, logoDisc } from "./intro";

const target = logoDisc({ left: 20, top: 10, width: 20, height: 20 });
const at = (f: number) => introFrame(f, 1440, 900, target);

test("the app's logo is measured to the middle of its disc", () => {
  assert.deepEqual(target, { x: 30, y: 20, size: 19.4 });
});

test("it opens larger than the screen and covers it", () => {
  const first = at(0);
  assert.ok(first.logo.size > Math.hypot(1440, 900));
  assert.equal(first.progress, 0);
});

test("the logo has shrunk into place by the last word", () => {
  const still = at(INTRO_STILL_FRAME);
  assert.deepEqual(still.logo, { x: 720, y: 360, size: 320 });
  assert.equal(still.progress, 1);
  assert.equal(still.wordShift, INTRO_WORDS.length - 1);
  assert.equal(still.textOpacity, 1);
});

test("each word is held before the next rolls in", () => {
  assert.deepEqual([90, 115, 145, 170].map((f) => at(f).wordShift), [0, 1, 2, 3]);
});

test("it ends exactly on the app's logo, in under four seconds", () => {
  const last = at(INTRO_END_FRAME);
  assert.deepEqual(last.logo, target);
  assert.equal(last.fieldRadius, target.size / 2);
  assert.equal(last.textOpacity, 0);
  assert.equal(last.finished, true);
  assert.equal(at(INTRO_END_FRAME - 1).finished, false);
  assert.ok(INTRO_END_FRAME / 60 < 4);
});

test("with no logo on screen it closes to nothing", () => {
  const last = introFrame(INTRO_END_FRAME, 390, 844, null);
  assert.equal(last.logo.size, 0);
  assert.equal(last.fieldRadius, 0);
});

// Data loaded early is only useful if a screen reads it under the same name.
test("everything the intro loads early is read by a main screen", () => {
  const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const screens = [
    "components/home/home-screen.tsx",
    "components/library/library-screen.tsx",
    "hooks/useItems.ts",
    "hooks/useCollections.ts",
    "hooks/useStudyGroups.ts",
  ].map(source).join("\n");
  const keys = Array.from(source("components/intro/use-intro-preload.ts").matchAll(/useSWR(?:<[^(]*>)?\("([^"]+)"/g), (match) => match[1]);
  assert.equal(keys.length, 8);
  for (const key of keys) assert.ok(screens.includes(`"${key}"`), `no screen reads ${key}`);
});
