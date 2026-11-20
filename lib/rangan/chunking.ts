// ---------------------------------------------------------------------------
// Splitting library content into passages for Rangan's index
// ---------------------------------------------------------------------------
//
// Pure: no database, network or React, so it runs in tests and on the server.
// Each passage keeps an anchor (a note block id or a PDF page) so an answer can
// open the exact spot it came from.

import { createHash } from "node:crypto";
import type { NoteDoc, NoteNode } from "@/lib/notes/note-format";
import { walkNoteNodes } from "@/lib/notes/note-format";
import { inlineText, noteDocToPlainText } from "@/lib/notes/plain-text";

/** Target passage length in characters; long enough for context, short enough to cite. */
export const CHUNK_TARGET_CHARS = 1_000;
/** A single block longer than this is split on its own. */
export const CHUNK_MAX_CHARS = 1_600;
/** Characters repeated between split pieces of one long text, so a sentence is not cut off from its context. */
export const CHUNK_OVERLAP_CHARS = 150;
/** Passages kept per source; the rest of a very long source is not indexed. */
export const MAX_CHUNKS_PER_SOURCE = 400;

export type Passage = {
  /** Note block id (`b_…`), PDF page anchor (`page3`) or "" for the whole source. */
  anchor: string;
  /** Nearest heading above the passage, if any. */
  heading: string;
  content: string;
};

export type HashedPassage = Passage & { contentHash: string };

const normalizeSpace = (text: string) => text.replace(/[ \t\f\v\r]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

/** Index of the last match of a global `pattern`, or -1. */
function lastMatch(text: string, pattern: RegExp): number {
  let last = -1;
  for (const match of text.matchAll(pattern)) last = match.index ?? last;
  return last;
}

/**
 * Splits `text` into pieces of at most `max` characters, preferring paragraph,
 * then sentence, then word boundaries, with `overlap` characters carried over.
 */
export function splitText(text: string, max = CHUNK_MAX_CHARS, overlap = CHUNK_OVERLAP_CHARS): string[] {
  const clean = normalizeSpace(text);
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const pieces: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + max, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const floor = Math.floor(max * 0.5);
      // Last paragraph break, else last sentence end, else last space, in the back half of the window.
      const breakAt = [lastMatch(window, /\n\n/g), lastMatch(window, /[.!?।](?=\s)/g), lastMatch(window, /\s/g)].find(
        (index) => index >= floor,
      );
      if (breakAt !== undefined) end = start + breakAt + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) pieces.push(piece);
    if (end >= clean.length) break;
    // Step back for overlap, then forward to a word start so no word is cut.
    let next = Math.max(end - overlap, start + 1);
    while (next < end && !/\s/.test(clean[next - 1] ?? " ")) next += 1;
    start = next;
  }
  return pieces;
}

/** Packs short consecutive units into passages near the target size; long units are split. */
function pack(units: Passage[], target = CHUNK_TARGET_CHARS, max = CHUNK_MAX_CHARS): Passage[] {
  const out: Passage[] = [];
  let current: Passage | null = null;
  const flush = () => {
    if (current && current.content.trim()) out.push({ ...current, content: current.content.trim() });
    current = null;
  };
  for (const unit of units) {
    const content = normalizeSpace(unit.content);
    if (!content) continue;
    if (content.length > max) {
      flush();
      for (const piece of splitText(content, max)) out.push({ anchor: unit.anchor, heading: unit.heading, content: piece });
      continue;
    }
    const sameSection = current !== null && current.heading === unit.heading;
    if (current && sameSection && current.content.length + content.length + 1 <= target) {
      current.content += `\n${content}`;
    } else {
      flush();
      current = { anchor: unit.anchor, heading: unit.heading, content };
    }
  }
  flush();
  return out.slice(0, MAX_CHUNKS_PER_SOURCE);
}

/** First block id inside `node` (itself included), or "". */
function firstBlockId(node: NoteNode): string {
  for (const { blockId } of walkNoteNodes([node])) if (blockId) return blockId;
  return "";
}

/** A note's passages, one or more top-level blocks each, anchored at their first block. */
export function chunkNoteDoc(doc: NoteDoc): Passage[] {
  const units: Passage[] = [];
  let heading = "";
  for (const node of doc.content) {
    if (node.type === "heading") {
      heading = normalizeSpace(inlineText(node.content ?? []));
      // The heading itself still starts the next passage so its words are searchable.
      if (heading) units.push({ anchor: firstBlockId(node), heading, content: heading });
      continue;
    }
    const text = noteDocToPlainText({ type: "doc", content: [node] });
    if (text.trim()) units.push({ anchor: firstBlockId(node), heading, content: text });
  }
  return pack(units);
}

/** A PDF's passages, never crossing a page so each cites one page. */
export function chunkPdfPages(pages: ReadonlyArray<{ pageNumber: number; text: string | null }>): Passage[] {
  const out: Passage[] = [];
  for (const page of [...pages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    for (const piece of splitText(page.text ?? "")) {
      out.push({ anchor: `page${page.pageNumber}`, heading: `Page ${page.pageNumber}`, content: piece });
      if (out.length >= MAX_CHUNKS_PER_SOURCE) return out;
    }
  }
  return out;
}

/** Plain text without positions (video transcripts, article notes). */
export function chunkPlainText(text: string): Passage[] {
  return splitText(text)
    .slice(0, MAX_CHUNKS_PER_SOURCE)
    .map((content) => ({ anchor: "", heading: "", content }));
}

/** Same text, anchor and heading give the same hash, so unchanged passages keep their embeddings. */
export function hashPassage(passage: Passage): string {
  return createHash("sha256")
    .update(`${passage.anchor}\u0000${passage.heading}\u0000${passage.content}`)
    .digest("hex");
}

export function withHashes(passages: readonly Passage[]): HashedPassage[] {
  return passages.map((passage) => ({ ...passage, contentHash: hashPassage(passage) }));
}
