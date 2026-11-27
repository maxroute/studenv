// ---------------------------------------------------------------------------
// Fix formulas: maths left as raw LaTeX text becomes real equations
// ---------------------------------------------------------------------------
//
// Pure: no React, no editor. Pages written before equations were recognised
// everywhere (or pasted from elsewhere) can hold "$$\sin\theta$$", "\(x^2\)"
// or "\[a+b\]" as plain text. This finds them in ordinary text and turns them
// into equations: a paragraph that is only one equation becomes a block
// equation, anything else an inline one. Code, and text marked as code, is
// left alone. The same function serves the page menu and Rangan.

import type { NoteDoc, NoteNode } from "./note-format";

/** $$…$$, \(…\), \[…\], and $…$ when it holds maths symbols (so "$5 and $10" stays text). */
const MATH = /\$\$([^$\n]+?)\$\$|\\\(([^\n]+?)\\\)|\\\[([^\n]+?)\\\]|(?<![\p{L}\p{N}$\\])\$([^$\s](?:[^$\n]*?[^$\s])?)\$(?![\p{N}])/gu;
const MATHS_SYMBOLS = /[\\^_{}=+*/<>]|[a-z]\s*\(/i;

/** Blocks whose text is not prose: never changed. */
const LEAVE_ALONE = new Set(["codeBlock", "blockMath", "inlineMath", "pdfPage", "embed", "unsupported"]);

const isCode = (node: NoteNode) => node.marks?.some((mark) => mark.type === "code") ?? false;

/** One text node as text and equations, keeping its marks on the text parts. */
function splitText(node: NoteNode): { nodes: NoteNode[]; found: number } {
  const source = node.text ?? "";
  if (!source || isCode(node)) return { nodes: [node], found: 0 };
  const nodes: NoteNode[] = [];
  let last = 0;
  let found = 0;
  for (const match of source.matchAll(MATH)) {
    const latex = (match[1] ?? match[2] ?? match[3] ?? match[4] ?? "").trim();
    // A single-$ pair only counts when it reads as maths.
    if (!latex || (match[4] !== undefined && !MATHS_SYMBOLS.test(latex))) continue;
    const index = match.index ?? 0;
    if (index > last) nodes.push({ ...node, text: source.slice(last, index) });
    nodes.push({ type: "inlineMath", attrs: { latex } });
    found += 1;
    last = index + match[0].length;
  }
  if (found === 0) return { nodes: [node], found: 0 };
  if (last < source.length) nodes.push({ ...node, text: source.slice(last) });
  return { nodes, found };
}

function fixNode(node: NoteNode): { node: NoteNode; found: number } {
  if (LEAVE_ALONE.has(node.type) || !node.content) return { node, found: 0 };
  let found = 0;
  const content: NoteNode[] = [];
  for (const child of node.content) {
    if (child.type === "text") {
      const split = splitText(child);
      found += split.found;
      content.push(...split.nodes);
    } else {
      const fixed = fixNode(child);
      found += fixed.found;
      content.push(fixed.node);
    }
  }
  // A paragraph that is nothing but one equation reads best as a block equation.
  if (node.type === "paragraph" && content.length === 1 && content[0].type === "inlineMath" && found > 0) {
    return { node: { type: "blockMath", attrs: { ...(node.attrs?.id ? { id: node.attrs.id } : {}), latex: content[0].attrs?.latex ?? "" } }, found };
  }
  return { node: found ? { ...node, content } : node, found };
}

/** The document with raw maths turned into equations, and how many were found. */
export function fixMath(doc: NoteDoc): { doc: NoteDoc; found: number } {
  let found = 0;
  const content = doc.content.map((block) => {
    const fixed = fixNode(block);
    found += fixed.found;
    return fixed.node;
  });
  return { doc: found ? { ...doc, content } : doc, found };
}
