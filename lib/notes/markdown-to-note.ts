// ---------------------------------------------------------------------------
// Markdown (as Rangan writes it) -> note blocks
// ---------------------------------------------------------------------------
//
// Pure: no React, no editor. Rangan is asked to write a small, fixed subset
// of Markdown, and this turns it into the same blocks a student makes by
// hand, so a page Rangan writes is an ordinary page:
//
//   # / ## / ###          headings (a leading "# Title" is the page title)
//   paragraphs            lines joined until a blank line
//   - item / 1. item      bullet and numbered lists, nested by indent
//   - [ ] / - [x] item    to-do items, open or done
//   | a | b |             tables (the first row is the header)
//   > [!tip] / [!warning] callouts (blue tip, amber mistake; [!key] green, [!idea] purple)
//   $$ … $$  \[ … \]       a block equation (LaTeX) on its own line; inside a sentence, list
//                         or table cell, $$…$$, \(…\) and \[…\] are inline equations;
//                         $…$ is inline when it holds maths symbols
//   [[embed:item:<id>]]   a card for a Shelf item (links are saved to the Shelf first)
//   Q: … / A: …           self-test toggles: the answer is hidden until opened
//   ```                   code blocks
//   ---                   a divider
//   **bold** *italic* `code` ==highlight== ~~strike~~ {{red:coloured words}} [text](https://…) and [n] citations inline
//
// Anything else is kept as plain text. Block ids are generated here; the
// note loader fixes any that are missing or repeated.

import { generateBlockId } from "./block-ids";
import type { NoteNode } from "./note-format";
import { NOTE_TEXT_COLORS, noteColorValue } from "./text-styles";

const NOTE_COLOR_KEYS = new Set<string>(NOTE_TEXT_COLORS.map((color) => color.key));

export type CitationNodes = (n: number) => NoteNode[] | null;

export type MarkdownToNoteOptions = {
  /** Inline nodes for a [n] citation (a mention or a link), or null to drop the mark. */
  citation?: CitationNodes;
  generateId?: () => string;
};

type Ctx = { citation: CitationNodes; id: () => string };

const MAX_HEADING_LEVEL = 3;

// ── inline ───────────────────────────────────────────────────────────────────

const INLINE =
  /(\*\*([^*\n]+?)\*\*)|(`([^`\n]+)`)|(\[(\d{1,2})\])|(\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\))|(\*([^*\s][^*\n]*?)\*)|((?<![\p{L}\p{N}])_([^_\s][^_\n]*?)_(?![\p{L}\p{N}]))|(==([^=\n]+?)==)|(~~([^~\n]+?)~~)|(\{\{([a-z]{3,10}):([^}\n]+?)\}\})|((?<![\p{L}\p{N}$\\])\$([^$\s](?:[^$\n]*?[^$\s])?)\$(?![\p{N}]))|(\$\$([^$\n]+?)\$\$)|(\\\(([^\n]+?)\\\))|(\\\[([^\n]+?)\\\])/gu;

function text(value: string, marks?: NoteNode["marks"]): NoteNode[] {
  return value ? [{ type: "text", text: value, ...(marks?.length ? { marks } : {}) }] : [];
}

/** Inline Markdown as text nodes with marks, mentions and links. */
export function inlineNodes(source: string, citation: CitationNodes = () => null): NoteNode[] {
  const nodes: NoteNode[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    const index = match.index ?? 0;
    nodes.push(...text(source.slice(last, index)));
    if (match[1]) nodes.push(...text(match[2], [{ type: "bold" }]));
    else if (match[3]) nodes.push(...text(match[4], [{ type: "code" }]));
    else if (match[5]) {
      const cited = citation(Number(match[6]));
      if (cited) {
        // A space before a citation, so it doesn't run into the word or the citation before it.
        const previous = nodes.at(-1);
        if (previous && !(previous.type === "text" && !previous.marks && /\s$/.test(previous.text ?? ""))) nodes.push({ type: "text", text: " " });
        nodes.push(...cited);
      }
    } else if (match[7]) nodes.push(...text(match[8], [{ type: "link", attrs: { href: match[9], ref: null } }]));
    else if (match[10]) nodes.push(...text(match[11], [{ type: "italic" }]));
    else if (match[12]) nodes.push(...text(match[13], [{ type: "italic" }]));
    else if (match[14]) nodes.push(...text(match[15], [{ type: "highlight" }]));
    else if (match[16]) nodes.push(...text(match[17], [{ type: "strike" }]));
    else if (match[18]) {
      const color = NOTE_COLOR_KEYS.has(match[19]) ? noteColorValue(match[19]) : null;
      nodes.push(...text(match[20], color ? [{ type: "textStyle", attrs: { color, fontFamily: null } }] : undefined));
    } else if (match[21]) {
      // Only maths becomes an equation: "$5 and $10" stays text.
      if (/[\\^_{}=+*/<>]|[a-z]\s*\(/i.test(match[22])) nodes.push({ type: "inlineMath", attrs: { latex: match[22] } });
      else nodes.push(...text(match[0]));
    } else if (match[23] || match[25] || match[27]) {
      // $$…$$, \(…\) and \[…\] inside text: always maths, never money.
      const latex = (match[24] ?? match[26] ?? match[28] ?? "").trim();
      if (latex) nodes.push({ type: "inlineMath", attrs: { latex } });
    }
    last = index + match[0].length;
  }
  nodes.push(...text(source.slice(last)));
  // Neighbouring plain text joins up, then citations dropped before a full
  // stop don't leave "word ." behind.
  const merged: NoteNode[] = [];
  for (const node of nodes) {
    const previous = merged.at(-1);
    if (node.type === "text" && !node.marks && previous?.type === "text" && !previous.marks) previous.text = `${previous.text ?? ""}${node.text ?? ""}`;
    else merged.push({ ...node });
  }
  return merged
    .map((node) => (node.type === "text" && !node.marks && node.text ? { ...node, text: node.text.replace(/ +([.,;:!?])/g, "$1") } : node))
    .filter((node) => node.type !== "text" || node.text);
}

// ── blocks ───────────────────────────────────────────────────────────────────

const paragraph = (ctx: Ctx, value: string): NoteNode => {
  const content = inlineNodes(value.trim(), ctx.citation);
  return { type: "paragraph", attrs: { id: ctx.id() }, ...(content.length ? { content } : {}) };
};

const LIST_ITEM = /^(\s*)([-*+]|\d{1,3}[.)])\s+(.*)$/;
const TODO_ITEM = /^\s*[-*+]\s+\[( |x|X)\]\s+(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;
const QUESTION = /^\s*(?:[-*+]\s+)?\*{0,2}(?:Q|Question)\s*\d*\s*[:.)]\*{0,2}\s*(.+)$/i;
const ANSWER = /^\s*(?:[-*+]\s+)?\*{0,2}(?:A|Answer)\s*\d*\s*[:.)]\*{0,2}\s*(.+)$/i;
const CALLOUT = /^\[!(tip|note|info|warning|mistake|caution|important|key|remember|success|idea|example|fun|why)\]\s*(.*)$/i;
const EMBED_LINE = /^\[\[embed:((?:item|asset|note|workspace):[A-Za-z0-9_-]{1,128})\]\]$/;

/** The callout style for a marker: amber for mistakes, green for what to remember, purple for ideas, blue otherwise. */
function calloutVariant(marker: string): string {
  if (/warning|mistake|caution|important/i.test(marker)) return "warning";
  if (/key|remember|success/i.test(marker)) return "success";
  if (/idea|example|fun|why/i.test(marker)) return "idea";
  return "info";
}

function cells(row: string): string[] {
  return row.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function table(ctx: Ctx, rows: string[]): NoteNode {
  const [header, ...body] = rows.map(cells);
  const width = Math.max(header.length, ...body.map((row) => row.length));
  const cell = (type: "tableHeader" | "tableCell", value: string): NoteNode => ({
    type,
    attrs: { id: ctx.id(), colspan: 1, rowspan: 1, colwidth: null },
    content: [paragraph(ctx, value)],
  });
  const row = (type: "tableHeader" | "tableCell", values: string[]): NoteNode => ({
    type: "tableRow",
    content: Array.from({ length: width }, (_, index) => cell(type, values[index] ?? "")),
  });
  return { type: "table", attrs: { id: ctx.id() }, content: [row("tableHeader", header), ...body.map((values) => row("tableCell", values))] };
}

type ListLine = { indent: number; ordered: boolean; start: number; text: string };

/** Lists nested by indent; a deeper item belongs to the item above it. */
function list(ctx: Ctx, items: ListLine[]): NoteNode {
  const build = (from: number, indent: number): { node: NoteNode; next: number } => {
    const first = items[from];
    const listNode: NoteNode = {
      type: first.ordered ? "orderedList" : "bulletList",
      ...(first.ordered ? { attrs: { start: first.start } } : {}),
      content: [],
    };
    let index = from;
    while (index < items.length && items[index].indent >= indent) {
      const item = items[index];
      if (item.indent > indent) {
        // Deeper than this level without a parent item: treat as this level.
        item.indent = indent;
      }
      const listItem: NoteNode = { type: "listItem", attrs: { id: ctx.id() }, content: [paragraph(ctx, item.text)] };
      index += 1;
      if (index < items.length && items[index].indent > indent) {
        const nested = build(index, items[index].indent);
        listItem.content?.push(nested.node);
        index = nested.next;
      }
      listNode.content?.push(listItem);
    }
    return { node: listNode, next: index };
  };
  return build(0, items[0].indent).node;
}

function blocks(ctx: Ctx, lines: string[]): NoteNode[] {
  const out: NoteNode[] = [];
  let index = 0;
  let prose: string[] = [];
  const flush = () => {
    if (prose.length) out.push(paragraph(ctx, prose.join(" ")));
    prose = [];
  };

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flush();
      index += 1;
      continue;
    }

    const fence = /^```\s*([\w+-]{0,32})\s*$/.exec(trimmed);
    if (fence) {
      flush();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index].trim())) code.push(lines[index++]);
      index += 1;
      out.push({ type: "codeBlock", attrs: { id: ctx.id(), language: fence[1] || null }, ...(code.length ? { content: [{ type: "text", text: code.join("\n") }] } : {}) });
      continue;
    }

    // A whole line of one equation is a block; "$$a$$ $$b$$" is two inline ones.
    const oneLine = /^(?:\$\$([^$]+)\$\$|\\\[(.+)\\\])$/.exec(trimmed);
    if (oneLine) {
      flush();
      index += 1;
      const value = (oneLine[1] ?? oneLine[2] ?? "").trim();
      if (value) out.push({ type: "blockMath", attrs: { id: ctx.id(), latex: value } });
      continue;
    }

    if (trimmed === "\\[") {
      flush();
      const latex: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "\\]") latex.push(lines[index++]);
      index += 1;
      const value = latex.join("\n").trim();
      if (value) out.push({ type: "blockMath", attrs: { id: ctx.id(), latex: value } });
      continue;
    }

    if (trimmed.startsWith("$$") && !/^\$\$[^$]*\$\$.*\$\$/.test(trimmed)) {
      flush();
      const latex: string[] = [];
      const rest = trimmed.slice(2);
      if (rest.endsWith("$$") && rest.length > 2) {
        latex.push(rest.slice(0, -2));
        index += 1;
      } else {
        if (rest.trim()) latex.push(rest);
        index += 1;
        while (index < lines.length && !lines[index].trim().endsWith("$$")) latex.push(lines[index++]);
        if (index < lines.length) {
          const last = lines[index].trim().slice(0, -2);
          if (last.trim()) latex.push(last);
          index += 1;
        }
      }
      const value = latex.join("\n").trim();
      if (value) out.push({ type: "blockMath", attrs: { id: ctx.id(), latex: value } });
      continue;
    }

    const embed = EMBED_LINE.exec(trimmed);
    if (embed) {
      flush();
      out.push({ type: "embed", attrs: { id: ctx.id(), ref: embed[1] } });
      index += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const content = inlineNodes(heading[2].replace(/\s+#+\s*$/, ""), ctx.citation);
      out.push({ type: "heading", attrs: { id: ctx.id(), level: Math.min(Math.max(heading[1].length, 2), MAX_HEADING_LEVEL) }, ...(content.length ? { content } : {}) });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      out.push({ type: "horizontalRule" });
      index += 1;
      continue;
    }

    if (TABLE_ROW.test(line) && index + 1 < lines.length && TABLE_RULE.test(lines[index + 1])) {
      flush();
      const rows = [line];
      index += 2;
      while (index < lines.length && TABLE_ROW.test(lines[index])) rows.push(lines[index++]);
      out.push(table(ctx, rows));
      continue;
    }

    if (trimmed.startsWith(">")) {
      flush();
      const quoted: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) quoted.push(lines[index++].trim().replace(/^>\s?/, ""));
      const marker = CALLOUT.exec(quoted[0] ?? "");
      if (marker) quoted[0] = marker[2];
      const variant = marker ? calloutVariant(marker[1]) : "info";
      const inner = blocks(ctx, quoted);
      out.push(
        marker
          ? { type: "callout", attrs: { id: ctx.id(), variant }, content: inner.length ? inner : [paragraph(ctx, "")] }
          : { type: "blockquote", attrs: { id: ctx.id() }, content: inner.length ? inner : [paragraph(ctx, "")] },
      );
      continue;
    }

    const question = QUESTION.exec(line);
    if (question) {
      flush();
      index += 1;
      const answerLines: string[] = [];
      while (index < lines.length && lines[index].trim() && !QUESTION.test(lines[index])) {
        const answer = ANSWER.exec(lines[index]);
        answerLines.push(answer ? answer[1] : lines[index].trim());
        index += 1;
      }
      out.push({
        type: "details",
        attrs: { id: ctx.id(), open: false },
        content: [
          { type: "detailsSummary", content: inlineNodes(question[1].trim(), ctx.citation) },
          { type: "detailsContent", content: [paragraph(ctx, answerLines.join(" ") || "…")] },
        ],
      });
      continue;
    }

    if (TODO_ITEM.test(line)) {
      flush();
      const items: NoteNode[] = [];
      while (index < lines.length) {
        const todo = TODO_ITEM.exec(lines[index]);
        if (!todo) break;
        items.push({ type: "taskItem", attrs: { id: ctx.id(), checked: todo[1] !== " " }, content: [paragraph(ctx, todo[2])] });
        index += 1;
      }
      out.push({ type: "taskList", content: items });
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item) {
      flush();
      const items: ListLine[] = [];
      while (index < lines.length) {
        const current = LIST_ITEM.exec(lines[index]);
        if (current) {
          const ordered = /\d/.test(current[2]);
          items.push({ indent: current[1].replace(/\t/g, "  ").length, ordered, start: ordered ? Number.parseInt(current[2], 10) || 1 : 1, text: current[3] });
          index += 1;
        } else if (lines[index].trim() && /^\s{2,}/.test(lines[index]) && items.length) {
          // A wrapped continuation line of the item above.
          items[items.length - 1].text += ` ${lines[index].trim()}`;
          index += 1;
        } else break;
      }
      out.push(list(ctx, items));
      continue;
    }

    prose.push(trimmed);
    index += 1;
  }
  flush();
  return out;
}

/**
 * The page title (a leading "# Title", if any) and its blocks. Headings are
 * levels 2 and 3 under the page title.
 */
export function markdownToNote(markdown: string, options: MarkdownToNoteOptions = {}): { title: string | null; blocks: NoteNode[] } {
  const ctx: Ctx = { citation: options.citation ?? (() => null), id: options.generateId ?? generateBlockId };
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let title: string | null = null;
  const firstText = lines.findIndex((line) => line.trim());
  const titleMatch = firstText >= 0 ? /^#\s+(.+)$/.exec(lines[firstText].trim()) : null;
  if (titleMatch) {
    title = titleMatch[1].replace(/\[\d{1,2}\]/g, "").replace(/[*_`]/g, "").trim().slice(0, 300) || null;
    lines.splice(firstText, 1);
  }
  return { title, blocks: blocks(ctx, lines) };
}
