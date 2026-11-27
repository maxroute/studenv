import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { TOP_ARM, alongPath, easeInOutCss, leadKeyframes } from "./arrow-lead";

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

test("the arm is followed from its start to its end", () => {
  const start = alongPath(TOP_ARM, 0);
  const end = alongPath(TOP_ARM, 1);
  assert.deepEqual([start.x, start.y], [111.5, 142.5]);
  assert.ok(Math.abs(end.x - 151) < 0.01 && Math.abs(end.y - 54) < 0.01);
  // It sets off away from the dot, to the left, and arrives heading right.
  assert.ok(Math.abs(start.angle) > 150);
  assert.ok(Math.abs(end.angle - 6) < 1);
});

test("the heads keep pace with the line", () => {
  assert.ok(easeInOutCss(0) < 0.001);
  assert.ok(Math.abs(easeInOutCss(0.5) - 0.5) < 0.001);
  assert.ok(easeInOutCss(1) > 0.999);
});

test("a head comes to rest exactly where it is drawn", () => {
  for (const [name, turned, end] of [["leadTop", false, [151, 54]], ["leadBottom", true, [131, 228]]] as const) {
    const last = leadKeyframes(name, turned).split("\n").at(-2) ?? "";
    assert.ok(last.includes(`translate(${end[0]}px, ${end[1]}px) rotate(0deg) translate(${-end[0]}px, ${-end[1]}px)`), last);
  }
});

test("the loader's styles carry the heads along this same arm", () => {
  const styles = source("components/ui/page-loader.module.css");
  assert.ok(styles.includes(leadKeyframes("leadTop", false)));
  assert.ok(styles.includes(leadKeyframes("leadBottom", true)));
  assert.ok(source("components/ui/page-loader.tsx").includes(`"${TOP_ARM}"`));
});
