// ---------------------------------------------------------------------------
// Maths symbols and structures, for the equation picker and the "/" menu
// ---------------------------------------------------------------------------
//
// Pure: no React, editor or DOM. A symbol has the character itself (typed into
// ordinary text by "/theta") and its LaTeX (put into an equation). A structure
// (fraction, root, power) has slots, written "□": the first takes whatever is
// selected, and the caret goes to the first one still empty.

export type MathSymbol = {
  /** What the button shows, and what "/name" types into text. */
  char: string;
  latex: string;
  name: string;
  /** Other words it is found by. */
  also?: readonly string[];
};

export type MathStructure = { label: string; latex: string; name: string };

const s = (char: string, latex: string, name: string, ...also: string[]): MathSymbol => ({ char, latex, name, ...(also.length ? { also } : {}) });

export const SYMBOL_GROUPS: ReadonlyArray<{ id: string; title: string; symbols: readonly MathSymbol[] }> = [
  {
    id: "greek",
    title: "Greek",
    symbols: [
      s("α", "\\alpha", "alpha"), s("β", "\\beta", "beta"), s("γ", "\\gamma", "gamma"), s("δ", "\\delta", "delta"), s("ε", "\\varepsilon", "epsilon"),
      s("θ", "\\theta", "theta"), s("λ", "\\lambda", "lambda"), s("μ", "\\mu", "mu"), s("π", "\\pi", "pi"), s("ρ", "\\rho", "rho"),
      s("σ", "\\sigma", "sigma"), s("τ", "\\tau", "tau"), s("φ", "\\varphi", "phi"), s("ψ", "\\psi", "psi"), s("ω", "\\omega", "omega"),
      s("Γ", "\\Gamma", "Gamma"), s("Δ", "\\Delta", "Delta"), s("Θ", "\\Theta", "Theta"), s("Λ", "\\Lambda", "Lambda"), s("Π", "\\Pi", "Pi"),
      s("Σ", "\\Sigma", "Sigma"), s("Φ", "\\Phi", "Phi"), s("Ω", "\\Omega", "Omega", "ohm"),
    ],
  },
  {
    id: "operators",
    title: "Operators",
    symbols: [
      s("±", "\\pm", "plusminus", "plus or minus"), s("×", "\\times", "times", "multiply"), s("÷", "\\div", "divide"), s("·", "\\cdot", "dot"),
      s("=", "=", "equals"), s("≠", "\\ne", "notequal", "not equal"), s("≈", "\\approx", "approx", "approximately"), s("≡", "\\equiv", "equivalent", "identical"),
      s("<", "<", "lessthan"), s(">", ">", "greaterthan"), s("≤", "\\le", "lessequal", "less than or equal"), s("≥", "\\ge", "greaterequal", "greater than or equal"),
      s("∝", "\\propto", "proportional"), s("∞", "\\infty", "infinity"), s("°", "^\\circ", "degree"),
    ],
  },
  {
    id: "more",
    title: "Sets & calculus",
    symbols: [
      s("∑", "\\sum", "sum", "summation"), s("∏", "\\prod", "product"), s("∫", "\\int", "integral"), s("∂", "\\partial", "partial"), s("∇", "\\nabla", "nabla", "gradient"),
      s("→", "\\to", "arrow", "to"), s("⇒", "\\Rightarrow", "implies"), s("⇔", "\\Leftrightarrow", "iff", "if and only if"),
      s("∈", "\\in", "elementof", "belongs"), s("∉", "\\notin", "notelementof"), s("⊂", "\\subset", "subset"), s("∪", "\\cup", "union"), s("∩", "\\cap", "intersection"),
      s("∅", "\\emptyset", "emptyset"), s("∀", "\\forall", "forall", "for all"), s("∃", "\\exists", "exists"), s("∴", "\\therefore", "therefore"),
      s("∠", "\\angle", "angle"), s("⊥", "\\perp", "perpendicular"), s("∥", "\\parallel", "parallel"), s("△", "\\triangle", "triangle"),
    ],
  },
];

export const STRUCTURES: readonly MathStructure[] = [
  { label: "a⁄b", latex: "\\frac{□}{□}", name: "Fraction" },
  { label: "x²", latex: "□^{□}", name: "Power" },
  { label: "x₁", latex: "□_{□}", name: "Subscript" },
  { label: "√x", latex: "\\sqrt{□}", name: "Square root" },
  { label: "ⁿ√x", latex: "\\sqrt[□]{□}", name: "Root" },
  { label: "( )", latex: "\\left(□\\right)", name: "Brackets" },
  { label: "∑ₙ", latex: "\\sum_{□}^{□} ", name: "Sum with limits" },
  { label: "∫ₐᵇ", latex: "\\int_{□}^{□} ", name: "Integral with limits" },
  { label: "lim", latex: "\\lim_{□ \\to □} ", name: "Limit" },
  { label: "x⃗", latex: "\\vec{□}", name: "Vector" },
  { label: "x̄", latex: "\\bar{□}", name: "Bar" },
  { label: "sin", latex: "\\sin ", name: "Sine" },
  { label: "cos", latex: "\\cos ", name: "Cosine" },
  { label: "tan", latex: "\\tan ", name: "Tangent" },
  { label: "log", latex: "\\log ", name: "Logarithm" },
];

export const ALL_SYMBOLS: readonly MathSymbol[] = SYMBOL_GROUPS.flatMap((group) => group.symbols);

/**
 * Puts `snippet` into `value` in place of the selection. In a structure the
 * selected text fills the first slot and the caret lands in the next empty one.
 * A power or subscript with nothing selected attaches to what is already before
 * the caret ("θ" then x² is θ²).
 * A space is added where a command would otherwise run into the next letter
 * ("\theta" followed by "x" must not read as "\thetax").
 */
export function insertSnippet(value: string, start: number, end: number, snippet: string): { value: string; caret: number } {
  const before = value.slice(0, start);
  const selected = value.slice(start, end);
  const after = value.slice(end);
  const parts = snippet.split("□");
  if (!selected && /^□[\^_]/.test(snippet) && /[A-Za-z0-9)\]}]\s*$/.test(before)) {
    const base = before.replace(/\s+$/, "");
    const attached = snippet.slice(1);
    const slot = attached.indexOf("□");
    return { value: base + attached.replace("□", "") + after, caret: base.length + slot };
  }
  if (parts.length === 1) {
    const needsSpace = /\\[A-Za-z]+$/.test(snippet) && !/^[\s{}^_\\)(]/.test(after);
    const text = needsSpace ? `${snippet} ` : snippet;
    return { value: before + text + after, caret: before.length + text.length };
  }
  let text = parts[0];
  let caret = -1;
  for (let i = 1; i < parts.length; i++) {
    const fill = i === 1 ? selected : "";
    if (!fill && caret === -1) caret = before.length + text.length;
    text += fill + parts[i];
  }
  return { value: before + text + after, caret: caret === -1 ? before.length + text.length : caret };
}
