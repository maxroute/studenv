// ---------------------------------------------------------------------------
// The page or board in front of the student, as Rangan's first source
// ---------------------------------------------------------------------------
//
// Pure. Rangan looks in this order: what the student has open, then the rest
// of their Studenv library (pages, boards, files), then the internet. The open
// page arrives as its live blocks (unsaved typing included) and the open board
// as its elements, so neither needs loading. Only the parts that match the
// question are used, unless the question points at what is open ("explain
// this", "what does this board say?").

import { boardPassages } from "@/lib/rangan/board-text";
import { splitText } from "@/lib/rangan/chunking";
import type { OpenTarget } from "@/lib/rangan/citations";
import { parseRef } from "@/lib/refs/ref-grammar";

/** Where a passage came from, in the order Rangan prefers them. */
export type PassageOrigin = "open" | "library" | "web";

export type OpenPassage = {
  ref: string;
  sourceType: "note" | "board";
  title: string;
  heading: string;
  content: string;
  open: OpenTarget | null;
};

export type OpenPageInput = { ref: string; title: string; blocks: ReadonlyArray<{ type: string; text: string }> };
export type OpenBoardInput = {
  ref: string;
  title: string;
  elements: ReadonlyArray<{ key: string; type: string; text: string }>;
  edges: ReadonlyArray<{ from: string; to: string; label: string }>;
};

const WORDLESS = new Set(["shape", "group", "drawing", "connector"]);

/** Open-source passages used per question, at most; the rest of the context is the library's. */
export const MAX_OPEN_PASSAGES = 3;
const SECTION_CHARS = 1_100;

/** The open page in sections: a heading starts a new one; long sections are split. */
export function openPagePassages(page: OpenPageInput): OpenPassage[] {
  const ref = parseRef(page.ref);
  if (!ref || ref.type !== "note") return [];
  const title = page.title.trim() || "Untitled";
  const sections: Array<{ heading: string; lines: string[] }> = [];
  let current = { heading: "", lines: [] as string[] };
  for (const block of page.blocks) {
    const text = block.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    if (block.type === "heading") {
      if (current.lines.length) sections.push(current);
      current = { heading: text.slice(0, 120), lines: [] };
      continue;
    }
    current.lines.push(text);
  }
  if (current.lines.length) sections.push(current);
  return sections.flatMap((section) =>
    splitText(section.lines.join("\n"), SECTION_CHARS).map((content) => ({
      ref: `note:${ref.id}`,
      sourceType: "note" as const,
      title,
      heading: section.heading,
      content,
      open: { kind: "note" as const, noteId: ref.id, blockId: null },
    })),
  );
}

/** The open board as passages: its groups, then its other elements, with connector labels. */
export function openBoardPassages(board: OpenBoardInput): OpenPassage[] {
  const ref = parseRef(board.ref);
  if (!ref || ref.type !== "workspace") return [];
  // Frames and groups have no words of their own; the panel only names them ("Shape: rectangle").
  const nodes = board.elements
    .filter((element) => !WORDLESS.has(element.type) && !/^(Image|Video|Group):\s*$/.test(element.text.trim()))
    .map((element) => ({ id: element.key, type: element.type, text: element.text }));
  return boardPassages(nodes, board.edges).map((passage) => ({
    ref: `workspace:${ref.id}`,
    sourceType: "board" as const,
    title: board.title.trim() || "Untitled board",
    heading: passage.heading,
    content: passage.content,
    open: { kind: "board" as const, boardId: ref.id },
  }));
}

const STOP_WORDS = new Set(
  "the a an of and or in on for to what is are was were how why when which who does do did can could should would this that these those it its my me i you your about with from by as at be explain tell show give make please".split(" "),
);
const stem = (word: string) => {
  for (const suffix of ["ing", "es", "ed", "s"]) if (word.endsWith(suffix) && word.length - suffix.length >= 4) return word.slice(0, -suffix.length);
  return word;
};
const words = (text: string) =>
  text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
    .map(stem);

/** True when the question points at what is open rather than naming a topic. */
export function pointsAtOpen(question: string): boolean {
  return /\b(this|these|here|above|below|current|open)\b/i.test(question) || /\b(my|the) (page|board|map|section)\b/i.test(question);
}

/**
 * The open source's passages worth sending for this question: those sharing
 * words with it (or with the subject's names), best first. When the question
 * points at what is open ("what does this board say about recovery?"), the
 * matching parts still come first, and the first parts fill any room left;
 * otherwise nothing is sent when nothing matches.
 */
export function pickOpenPassages<P extends { title: string; heading: string; content: string }>(
  passages: readonly P[],
  question: string,
  subject: { names: readonly string[]; terms: readonly string[] } | null,
  max = MAX_OPEN_PASSAGES,
): P[] {
  if (!passages.length) return [];
  const pointed = pointsAtOpen(question);
  const wanted = new Set([...words(question), ...(subject ? [...subject.names, ...subject.terms].flatMap(words) : [])]);
  if (!wanted.size) return pointed ? passages.slice(0, max) : [];
  // A subject's name counts on its own; otherwise one shared everyday word isn't
  // enough, unless the question has only a word or two to go on.
  const names = (subject?.names ?? []).map((name) => words(name)).filter((parts) => parts.length);
  const enough = Math.min(2, wanted.size);
  const matching = passages
    .map((passage, index) => {
      const have = new Set(words(`${passage.title} ${passage.heading} ${passage.content}`));
      const named = names.some((parts) => parts.every((part) => have.has(part)));
      const score = [...wanted].filter((word) => have.has(word)).length + (named ? 2 : 0);
      return { passage, index, score };
    })
    .filter((entry) => entry.score >= enough)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, max)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.passage);
  if (!pointed) return matching;
  return [...matching, ...passages.filter((passage) => !matching.includes(passage))].slice(0, max);
}
