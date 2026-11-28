import assert from "node:assert/strict";
import test from "node:test";
import { applyPageCorrections, pageCheckInstruction, parsePageCorrections } from "./page-check";

// A real mistake from Rangan's trigonometry exam page: 7π/6 and 11π/6 don't solve cos 2x = sin x.
const PAGE = [
  "## Practice",
  "Q: Find all $x$ in $0 \\le x < 2\\pi$ with $\\cos 2x = \\sin x$.",
  "A: $x = \\frac{\\pi}{6}, \\frac{5\\pi}{6}, \\frac{7\\pi}{6}, \\frac{11\\pi}{6}$",
  "",
  "The double-angle formula comes from the sum-to-product formula [2].",
  "sin 30° = 1/2 [1]. sin 30° = 1/2 again.",
].join("\n");

test("the checker is asked to solve every question itself and to copy wrong text exactly", () => {
  const text = pageCheckInstruction("exam page on identities", PAGE);
  assert.match(text, /Solve every practice question/);
  assert.match(text, /copied exactly/);
  assert.match(text, /agrees with itself/);
  assert.ok(text.includes(PAGE));
});

test("corrections are read from the checker's reply, and broken ones dropped", () => {
  const reply = `Checked.\n{"corrections": [
    {"find": "\\\\frac{7\\\\pi}{6}, \\\\frac{11\\\\pi}{6}", "replace": "\\\\frac{3\\\\pi}{2}", "why": "sin x = -1 gives 3π/2"},
    {"find": "x", "replace": "y"},
    {"find": "same", "replace": "same"},
    {"replace": "no find"}
  ]}`;
  const corrections = parsePageCorrections(reply);
  assert.ok(corrections);
  assert.equal(corrections.length, 1);
  assert.equal(corrections[0].replace, "\\frac{3\\pi}{2}");
  assert.equal(parsePageCorrections("not json"), null);
});

test("a wrong answer is corrected where it can be placed exactly", () => {
  const { markdown, applied } = applyPageCorrections(PAGE, [{ find: "\\frac{7\\pi}{6}, \\frac{11\\pi}{6}", replace: "\\frac{3\\pi}{2}", why: "" }]);
  assert.equal(applied.length, 1);
  assert.match(markdown, /\\frac\{5\\pi\}\{6\}, \\frac\{3\\pi\}\{2\}\$/);
  assert.doesNotMatch(markdown, /7\\pi/);
});

test("doubtful corrections are left out: text not there, there twice, citations changed, or a rewrite", () => {
  const { markdown, applied } = applyPageCorrections(PAGE, [
    { find: "not on the page", replace: "x", why: "" },
    // "sin 30° = 1/2" appears twice: which one is meant can't be known.
    { find: "sin 30° = 1/2", replace: "sin 30° = 0.5", why: "" },
    // Dropping [2] would credit the student's notes with nothing, or the wrong thing.
    { find: "sum-to-product formula [2]", replace: "compound-angle (sum) formula", why: "" },
    { find: "Practice", replace: "x".repeat(1_000), why: "" },
  ]);
  assert.equal(applied.length, 0);
  assert.equal(markdown, PAGE);
  // Keeping the citation, the same fix is applied.
  const kept = applyPageCorrections(PAGE, [{ find: "sum-to-product formula [2]", replace: "compound-angle (sum) formula [2]", why: "" }]);
  assert.equal(kept.applied.length, 1);
  assert.match(kept.markdown, /compound-angle \(sum\) formula \[2\]/);
});

test("a replacement containing $ signs is inserted as written", () => {
  const { markdown } = applyPageCorrections("Area is $r^2$.", [{ find: "$r^2$", replace: "$\\pi r^2$ ($& is literal)", why: "" }]);
  assert.equal(markdown, "Area is $\\pi r^2$ ($& is literal).");
});
