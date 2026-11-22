"use client";

import type { Editor } from "@tiptap/core";
import type { Mark, MarkType, Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { blockKey, blockText } from "@/hooks/use-open-page";
import { toEditorContent } from "@/lib/notes/editor-bridge";
import { markdownToNote } from "@/lib/notes/markdown-to-note";
import { NOTE_DOC_FORMAT, NOTE_DOC_VERSION, parseNoteDoc, type NoteNode } from "@/lib/notes/note-format";
import { noteColorValue, noteFontValue } from "@/lib/notes/text-styles";
import { citationNodes, type PageCitation } from "@/lib/rangan/page";
import type { PageOp, TextFormat, TurnInto } from "@/lib/rangan/page-ops";

// The page tools on the editor's document: every step in one transaction,
// so one Undo takes the whole change back. Steps name blocks by id and look
// them up again as they go, so a step still lands after earlier steps added,
// moved or removed blocks. No network: links to embed come already saved to
// the Shelf (`embeds`: address -> Shelf item id).

const envelope = (blocks: NoteNode[]) => ({ format: NOTE_DOC_FORMAT, version: NOTE_DOC_VERSION, doc: { type: "doc" as const, content: blocks } });

/** Where a top-level block is now, by id. */
function findBlock(doc: ProseMirrorNode, id: string, aliases?: ReadonlyMap<string, string>): { node: ProseMirrorNode; pos: number } | null {
  if (aliases?.has(id)) id = aliases.get(id) ?? id;
  let found: { node: ProseMirrorNode; pos: number } | null = null;
  let index = 0;
  doc.forEach((node, offset) => {
    if (!found && blockKey(node, index) === id) found = { node, pos: offset };
    index += 1;
  });
  return found;
}

/**
 * Document positions of `words` inside a block, found the way the block's
 * text was read (textblocks joined by new lines, other inline items as a space).
 */
function wordsRange(node: ProseMirrorNode, pos: number, words: string): { from: number; to: number } | null {
  let text = "";
  const at: number[] = [];
  let first = true;
  const visit = (block: ProseMirrorNode, start: number) => {
    if (!first) {
      text += "\n";
      at.push(-1);
    }
    first = false;
    block.forEach((inline, offset) => {
      const position = start + offset;
      if (inline.isText) {
        for (let index = 0; index < (inline.text ?? "").length; index += 1) {
          text += inline.text?.[index] ?? "";
          at.push(position + index);
        }
      } else {
        text += " ";
        at.push(position);
      }
    });
  };
  if (node.isTextblock) visit(node, pos + 1);
  else {
    node.descendants((child, offset) => {
      if (!child.isTextblock) return true;
      visit(child, pos + 1 + offset + 1);
      return false;
    });
  }
  const index = text.indexOf(words);
  if (index === -1) return null;
  const start = at[index];
  const end = at[index + words.length - 1];
  if (start === undefined || end === undefined || start < 0 || end < 0) return null;
  return { from: start, to: end + 1 };
}

/** The block's own inline content, line by line (one line per textblock inside it). */
function inlineLines(node: ProseMirrorNode): ProseMirrorNode[] {
  if (node.isTextblock) return [node];
  const lines: ProseMirrorNode[] = [];
  node.descendants((child) => {
    if (child.isTextblock) {
      lines.push(child);
      return false;
    }
    return true;
  });
  return lines;
}

/** The block turned into another kind, keeping its words and their formatting. */
function turnInto(schema: Schema, node: ProseMirrorNode, into: TurnInto): ProseMirrorNode[] | null {
  const n = schema.nodes;
  const lines = inlineLines(node);
  if (!lines.length) return null;
  // The block keeps its id, so later steps that name it still find it: on the new block
  // itself, or on its first item when it becomes a list.
  const id = typeof node.attrs.id === "string" ? node.attrs.id : typeof node.firstChild?.attrs.id === "string" ? node.firstChild.attrs.id : null;
  const withId = (attrs: Record<string, unknown> | null, first: boolean) => (first && id ? { ...(attrs ?? {}), id } : attrs);
  const paragraph = (line: ProseMirrorNode) => n.paragraph.create(null, line.type.name === "codeBlock" ? (line.textContent ? schema.text(line.textContent) : null) : line.content);
  switch (into) {
    case "paragraph":
      return lines.map((line, index) => n.paragraph.create(withId(null, index === 0), paragraph(line).content));
    case "heading2":
    case "heading3":
      return lines.map((line, index) => n.heading.create(withId({ level: into === "heading2" ? 2 : 3 }, index === 0), paragraph(line).content));
    case "bullet":
      return [n.bulletList.create(null, lines.map((line, index) => n.listItem.create(withId(null, index === 0), paragraph(line))))];
    case "numbered":
      return [n.orderedList.create(null, lines.map((line, index) => n.listItem.create(withId(null, index === 0), paragraph(line))))];
    case "todo":
      return [n.taskList.create(null, lines.map((line, index) => n.taskItem.create(withId({ checked: false }, index === 0), paragraph(line))))];
    case "quote":
      return [n.blockquote.create(withId(null, true), lines.map(paragraph))];
    case "callout":
      return [n.callout.create(withId({ variant: "info" }, true), lines.map(paragraph))];
    case "toggle": {
      const [summary, ...rest] = lines;
      return [
        n.details.create(withId({ open: true }, true), [
          n.detailsSummary.create(null, paragraph(summary).content),
          n.detailsContent.create(null, rest.length ? rest.map(paragraph) : [n.paragraph.create()]),
        ]),
      ];
    }
    case "code": {
      const code = lines.map((line) => line.textContent).join("\n");
      return [n.codeBlock.create(withId(null, true), code ? schema.text(code) : null)];
    }
  }
}

/** Adds or removes simple marks, and sets colour and font on the textStyle mark, over a range. */
function format(tr: Transaction, schema: Schema, from: number, to: number, set: TextFormat) {
  const simple: Array<[keyof TextFormat, MarkType | undefined]> = [
    ["bold", schema.marks.bold],
    ["italic", schema.marks.italic],
    ["underline", schema.marks.underline],
    ["strike", schema.marks.strike],
    ["code", schema.marks.code],
    ["highlight", schema.marks.highlight],
  ];
  for (const [key, type] of simple) {
    if (!type || set[key] === undefined) continue;
    if (set[key]) tr.addMark(from, to, type.create());
    else tr.removeMark(from, to, type);
  }
  const style = schema.marks.textStyle;
  if (style && (set.color !== undefined || set.font !== undefined)) {
    // Keep the other half of the textStyle mark (colour or font) as it is at the start of the range.
    const current = tr.doc.resolve(from).marks().find((mark: Mark) => mark.type === style)?.attrs ?? {};
    const color = set.color === undefined ? (current.color ?? null) : set.color ? noteColorValue(set.color) : null;
    const fontFamily = set.font === undefined ? (current.fontFamily ?? null) : set.font ? noteFontValue(set.font) : null;
    tr.removeMark(from, to, style);
    if (color || fontFamily) tr.addMark(from, to, style.create({ color, fontFamily }));
  }
}

/**
 * The transaction for a plan, the new title if the plan renames the page,
 * and how many steps no longer fit the page and were left out.
 */
export function runPageOps(
  editor: Pick<Editor, "state" | "schema">,
  ops: readonly PageOp[],
  options: { citations: readonly PageCitation[]; embeds: ReadonlyMap<string, string> },
): { tr: Transaction; rename: string | null; skipped: number } {
  const { citations, embeds } = options;
  const { schema } = editor;
  const byNumber = new Map(citations.map((citation) => [citation.n, citation]));
  const nodesFrom = (markdown: string) => {
    // Inside a page, a "# " heading is a section heading, not the page title.
    const { blocks } = markdownToNote(markdown.replace(/^(\s*)#\s/, "$1## "), {
      citation: (n) => {
        const citation = byNumber.get(n);
        return citation ? citationNodes(citation) : null;
      },
    });
    const { content } = toEditorContent(parseNoteDoc(JSON.stringify(envelope(blocks))).envelope.doc, schema);
    return (content.content ?? []).map((json) => schema.nodeFromJSON(json));
  };
  /** Blocks replaced or turned into another kind, by their old id: the id of the block that took their place. */
  const aliases = new Map<string, string>();
  const endOf = (tr: Transaction, after: string | null) => {
    if (after === null) return 0;
    const found = findBlock(tr.doc, after, aliases);
    return found ? found.pos + found.node.nodeSize : null;
  };

  const tr = editor.state.tr;
  let rename: string | null = null;
  let skipped = 0;
  for (const op of ops) {
    if (op.op === "title") {
      rename = op.title;
      continue;
    }
    if (op.op === "insert" || op.op === "embed") {
      const at = endOf(tr, op.after);
      const nodes =
        op.op === "insert"
          ? nodesFrom(op.markdown)
          : [schema.nodes.embed.create({ ref: `item:${embeds.get(op.url)}` }), schema.nodes.paragraph.create()];
      if (at === null || !nodes.length) {
        skipped += 1;
        continue;
      }
      tr.insert(at, nodes);
      continue;
    }
    const found = findBlock(tr.doc, op.block, aliases);
    if (!found) {
      skipped += 1;
      continue;
    }
    const { node, pos } = found;
    const end = pos + node.nodeSize;
    switch (op.op) {
      case "replace": {
        const nodes = nodesFrom(op.markdown);
        if (nodes.length) {
          tr.replaceWith(pos, end, nodes);
          aliases.set(op.block, blockKey(nodes[0], -1));
        } else skipped += 1;
        break;
      }
      case "delete":
        tr.delete(pos, end);
        break;
      case "move": {
        tr.delete(pos, end);
        const at = endOf(tr, op.after);
        tr.insert(at ?? pos, node);
        break;
      }
      case "turnInto": {
        const nodes = turnInto(schema, node, op.into);
        if (nodes) {
          tr.replaceWith(pos, end, nodes);
          aliases.set(op.block, blockKey(nodes[0], -1));
        } else skipped += 1;
        break;
      }
      case "format": {
        const range = op.text ? wordsRange(node, pos, op.text) : { from: pos + 1, to: end - 1 };
        if (range && range.to > range.from) format(tr, schema, range.from, range.to, op.set);
        else skipped += 1;
        break;
      }
      case "link": {
        const range = wordsRange(node, pos, op.text);
        if (!range) {
          skipped += 1;
          break;
        }
        tr.removeMark(range.from, range.to, schema.marks.link);
        if (op.href) tr.addMark(range.from, range.to, schema.marks.link.create({ href: op.href, ref: null }));
        break;
      }
      case "rewrite": {
        const range = wordsRange(node, pos, op.text);
        if (range) tr.insertText(op.with, range.from, range.to);
        else skipped += 1;
        break;
      }
      case "check": {
        node.forEach((item, offset) => {
          if (item.type.name !== "taskItem") return;
          if (op.item !== null && !blockText(item).includes(op.item)) return;
          tr.setNodeMarkup(pos + 1 + offset, undefined, { ...item.attrs, checked: op.done });
        });
        break;
      }
    }
  }
  // A page is never left with no blocks at all.
  if (tr.doc.childCount === 0) tr.insert(0, schema.nodes.paragraph.create());
  return { tr, rename, skipped };
}
