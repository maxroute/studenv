import { test } from "node:test";
import assert from "node:assert/strict";
import katex from "katex";
import { ALL_SYMBOLS, STRUCTURES, insertSnippet } from "./math-symbols";

const render = (latex: string) => katex.renderToString(latex, { throwOnError: true, strict: "ignore" });

test("every symbol and structure in the picker is maths that can be drawn", () => {
  for (const symbol of ALL_SYMBOLS) assert.doesNotThrow(() => render(symbol.latex.startsWith("^") ? `x${symbol.latex}` : symbol.latex), symbol.name);
  for (const structure of STRUCTURES) assert.doesNotThrow(() => render(`${structure.latex.replaceAll("□", "x")} y`), structure.name);
});

test("symbol names are unique, so '/name' picks one", () => {
  const names = ALL_SYMBOLS.map((symbol) => symbol.name);
  assert.equal(new Set(names).size, names.length);
});

test("a symbol never runs into the letter after it", () => {
  assert.deepEqual(insertSnippet("x", 0, 0, "\\theta"), { value: "\\theta x", caret: 7 });
  assert.deepEqual(insertSnippet("", 0, 0, "\\pi"), { value: "\\pi ", caret: 4 });
  assert.equal(insertSnippet("{}", 1, 1, "\\pi").value, "{\\pi}");
});

test("a structure takes the selection and puts the caret in the empty slot", () => {
  const empty = insertSnippet("y = ", 4, 4, "\\frac{□}{□}");
  assert.equal(empty.value, "y = \\frac{}{}");
  assert.equal(empty.caret, "y = \\frac{".length);
  const wrapped = insertSnippet("a+b", 0, 3, "\\frac{□}{□}");
  assert.equal(wrapped.value, "\\frac{a+b}{}");
  assert.equal(wrapped.caret, "\\frac{a+b}{".length);
  const root = insertSnippet("2", 0, 1, "\\sqrt{□}");
  assert.deepEqual(root, { value: "\\sqrt{2}", caret: 8 });
});

test("a power or subscript attaches to what is already there", () => {
  const power = insertSnippet("\\theta ", 7, 7, "□^{□}");
  assert.deepEqual(power, { value: "\\theta^{}", caret: 8 });
  assert.equal(insertSnippet("(a+b)", 5, 5, "□_{□}").value, "(a+b)_{}");
  assert.equal(insertSnippet("\\sin ", 5, 5, "□^{□}").value, "\\sin^{}");
  // With nothing to attach to, the caret starts at the base.
  for (const before of ["", "y = ", "\\frac{"]) {
    const made = insertSnippet(before, before.length, before.length, "□^{□}");
    assert.deepEqual(made, { value: `${before}^{}`, caret: before.length });
  }
});
