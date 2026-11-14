// ---------------------------------------------------------------------------
// Plain text of a note: for search (`Note.plainText`) and excerpts
// ---------------------------------------------------------------------------

import { getNoteNodeDef, isRecord } from "./block-registry";
import type { NoteDoc, NoteNode } from "./note-format";

const RAW_TEXT_MAX_DEPTH = 64;

/** Text inside content kept verbatim from a newer build, so it stays searchable. */
function rawText(value: unknown, depth = 0): string {
  if (depth > RAW_TEXT_MAX_DEPTH || !isRecord(value)) return "";
  const own = typeof value.text === "string" ? value.text : "";
  const children = Array.isArray(value.content) ? value.content.map((child) => rawText(child, depth + 1)) : [];
  return [own, ...children].filter(Boolean).join(" ");
}

export function inlineText(nodes: readonly NoteNode[]): string {
  let text = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        text += node.text ?? "";
        break;
      case "hardBreak":
        text += "\n";
        break;
      case "mention":
        text += typeof node.attrs?.label === "string" ? node.attrs.label : "";
        break;
      case "inlineMath":
        text += typeof node.attrs?.latex === "string" ? node.attrs.latex : "";
        break;
      case "unsupportedInline":
        text += rawText(node.attrs?.raw);
        break;
      default:
        break;
    }
  }
  return text;
}

function blockLines(nodes: readonly NoteNode[], lines: string[]) {
  for (const node of nodes) {
    const def = getNoteNodeDef(node.type);
    if (node.type === "citation") {
      if (typeof node.attrs?.quote === "string" && node.attrs.quote) lines.push(node.attrs.quote);
    } else if (node.type === "blockMath") {
      if (typeof node.attrs?.latex === "string" && node.attrs.latex) lines.push(node.attrs.latex);
    } else if (node.type === "unsupported") {
      const text = rawText(node.attrs?.raw);
      if (text) lines.push(text);
    } else if (def && (def.content === "inline" || def.content === "text")) {
      const text = inlineText(node.content ?? []);
      if (text.trim()) lines.push(text);
    } else if (node.content) {
      blockLines(node.content, lines);
    }
  }
}

/** One line per block with text; blocks without text are skipped. */
export function noteDocToPlainText(doc: NoteDoc): string {
  const lines: string[] = [];
  blockLines(doc.content, lines);
  return lines.join("\n");
}
