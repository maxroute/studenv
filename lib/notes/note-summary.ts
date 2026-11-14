// ---------------------------------------------------------------------------
// A note at a glance: what its card on a board shows
// ---------------------------------------------------------------------------
//
// Headings (an outline), to-do progress, the opening lines, and the
// resources it holds (Shelf items and files, by reference). Pure; the server
// resolves the references to kinds (PDF, video, link) for the card.

import { formatRef, parseRef } from "@/lib/refs/ref-grammar";
import { walkNoteNodes, type NoteDoc, type NoteNode } from "./note-format";
import { inlineText, noteDocToPlainText } from "./plain-text";

/** One line of the card preview, in page order. */
export type PreviewBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "text"; text: string }
  | { type: "bullet"; text: string; ordered: boolean }
  | { type: "todo"; text: string; checked: boolean }
  | { type: "quote"; text: string }
  | { type: "callout"; text: string }
  | { type: "code"; text: string }
  | { type: "resource"; ref: string }
  | { type: "pdfPage"; assetId: string; page: number; title: string }
  | { type: "divider" };

export type NoteDocSummary = {
  /** The first blocks of the page, for the card on a board. */
  preview: PreviewBlock[];
  headings: string[];
  todos: { done: number; total: number };
  /** The opening text, shown when there are no headings. */
  opening: string;
  /** Unique item:/asset: references (without anchors), in document order. */
  resourceRefs: string[];
};

const MAX_HEADINGS = 3;
const OPENING_LENGTH = 160;

export function summarizeNoteDoc(doc: NoteDoc): NoteDocSummary {
  const headings: string[] = [];
  const todos = { done: 0, total: 0 };
  const refs = new Set<string>();
  const addRef = (value: unknown) => {
    const ref = parseRef(value);
    if (!ref || (ref.type !== "item" && ref.type !== "asset")) return;
    refs.add(formatRef({ type: ref.type, id: ref.id }));
  };

  for (const { node } of walkNoteNodes(doc.content)) {
    if (node.type === "heading" && headings.length < MAX_HEADINGS) {
      const text = inlineText(node.content ?? []).replace(/\s+/g, " ").trim();
      if (text) headings.push(text.slice(0, 120));
    } else if (node.type === "taskItem") {
      todos.total += 1;
      if (node.attrs?.checked === true) todos.done += 1;
    } else if (node.type === "embed") {
      addRef(node.attrs?.ref);
    } else if (node.type === "pdfPage" && typeof node.attrs?.assetId === "string") {
      addRef(`asset:${node.attrs.assetId}`);
    }
  }

  const plain = noteDocToPlainText(doc).replace(/\s+/g, " ").trim();
  const preview = previewBlocks(doc.content);
  const opening = plain.length > OPENING_LENGTH ? `${plain.slice(0, OPENING_LENGTH - 1)}…` : plain;
  return { preview, headings, todos, opening, resourceRefs: [...refs] };
}

const PREVIEW_BLOCKS = 10;
const PREVIEW_TEXT = 200;

const clip = (text: string) => {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > PREVIEW_TEXT ? `${one.slice(0, PREVIEW_TEXT - 1)}…` : one;
};

/** Text of a container's blocks (list items, callouts, quotes hold paragraphs). */
const innerText = (node: NoteNode): string =>
  (node.content ?? []).map((child) => (child.type === "text" || !child.content ? inlineText([child]) : innerText(child))).join(" ");

/** The first blocks as they read on the page: headings, text, lists, to-dos, resources. */
export function previewBlocks(nodes: readonly NoteNode[], limit = PREVIEW_BLOCKS): PreviewBlock[] {
  const out: PreviewBlock[] = [];
  const push = (block: PreviewBlock) => {
    if (out.length < limit) out.push(block);
  };
  for (const node of nodes) {
    if (out.length >= limit) break;
    switch (node.type) {
      case "heading": {
        const text = clip(inlineText(node.content ?? []));
        if (text) push({ type: "heading", level: Number(node.attrs?.level) || 1, text });
        break;
      }
      case "paragraph": {
        const text = clip(inlineText(node.content ?? []));
        if (text) push({ type: "text", text });
        break;
      }
      case "bulletList":
      case "orderedList":
        for (const item of node.content ?? []) {
          const text = clip(innerText(item));
          if (text) push({ type: "bullet", text, ordered: node.type === "orderedList" });
        }
        break;
      case "taskList":
        for (const item of node.content ?? []) {
          const text = clip(innerText(item));
          push({ type: "todo", text, checked: item.attrs?.checked === true });
        }
        break;
      case "blockquote": {
        const text = clip(innerText(node));
        if (text) push({ type: "quote", text });
        break;
      }
      case "callout": {
        const text = clip(innerText(node));
        if (text) push({ type: "callout", text });
        break;
      }
      case "codeBlock": {
        const text = clip(inlineText(node.content ?? []));
        if (text) push({ type: "code", text });
        break;
      }
      case "details": {
        const summary = (node.content ?? []).find((child) => child.type === "detailsSummary");
        const text = clip(summary ? inlineText(summary.content ?? []) : "");
        if (text) push({ type: "text", text: `▸ ${text}` });
        break;
      }
      case "embed": {
        const ref = parseRef(node.attrs?.ref);
        if (ref) push({ type: "resource", ref: formatRef({ type: ref.type, id: ref.id }) });
        break;
      }
      case "pdfPage":
        if (typeof node.attrs?.assetId === "string") {
          push({ type: "pdfPage", assetId: node.attrs.assetId, page: Number(node.attrs.page) || 1, title: String(node.attrs.title || "PDF") });
        }
        break;
      case "horizontalRule":
        push({ type: "divider" });
        break;
      default:
        break;
    }
  }
  return out;
}
