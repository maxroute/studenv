// ---------------------------------------------------------------------------
// Trusted answers: every claim either matches its source or loses its citation
// ---------------------------------------------------------------------------
//
// Pure: no model, network or React.
//
// After Rangan answers, each sentence that cites a passage is checked against
// that passage by a second model call. A citation the passage doesn't
// support is removed, so the sentence no longer looks backed by a source.
// Anything Rangan adds from general knowledge goes under "Beyond your
// sources", which the panel marks as unchecked.

import { z } from "zod";
import { extractJsonArray } from "@/lib/study/generation";

/** The heading the model puts general knowledge under; the panel shows that part as unchecked. */
export const BEYOND_HEADING = "Beyond your sources";
/** Claims checked per answer; the rest keep their citations unchecked. */
export const MAX_CHECKED_CLAIMS = 12;

/**
 * The answer cut into sentences, each with the citation marks that follow
 * it. Joining the pieces gives back the answer exactly. A sentence ends at
 * . ! or ? (and any [n] marks right after) followed by a space or the end,
 * so "3.5" and "e.g.x" are not cut.
 */
export function splitSentences(text: string): string[] {
  const pieces: string[] = [];
  const boundary = /[.!?]+(?:\s*\[\d+\])*(?=\s|$)|\n+/g;
  let start = 0;
  for (const match of text.matchAll(boundary)) {
    const end = (match.index ?? 0) + match[0].length;
    pieces.push(text.slice(start, end));
    start = end;
  }
  if (start < text.length) pieces.push(text.slice(start));
  return pieces;
}

const CITATION = /\s*\[(\d+)\]/g;

export type Claim = { piece: number; text: string; numbers: number[] };

/** Sentences that cite at least one real passage, with the passages they cite. Marks and Markdown are removed from the text. */
export function citedClaims(answer: string, passageCount: number): Claim[] {
  const claims: Claim[] = [];
  splitSentences(answer).forEach((piece, index) => {
    const numbers = [...new Set([...piece.matchAll(CITATION)].map((match) => Number(match[1])))].filter((n) => n >= 1 && n <= passageCount);
    if (numbers.length === 0) return;
    const text = piece
      .replace(CITATION, "")
      .replace(/[*_`#>]+/g, "")
      .replace(/^\s*[-+]\s+|^\s*\d+[.)]\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text) claims.push({ piece: index, text, numbers });
  });
  return claims;
}

export function supportInstruction(claims: readonly Claim[]): string {
  const list = claims.map((claim, index) => `Claim ${index + 1} (cites ${claim.numbers.map((n) => `[${n}]`).join("")}): ${claim.text}`);
  return [
    "Check each claim against the passages it cites.",
    "supported is true only when the cited passages state the claim or directly imply it. Background knowledge does not count.",
    "A claim that adds details the passages don't give is not supported.",
    "",
    ...list,
    "",
    'Reply with only a JSON array, one entry per claim: [{"claim": 1, "supported": true}]',
  ].join("\n");
}

const rawVerdict = z.object({ claim: z.union([z.number(), z.string()]), supported: z.union([z.boolean(), z.string()]) });

/**
 * Which claims (0-based) the checker said are not supported, or null when its
 * reply can't be read. A claim it skipped counts as supported: the check
 * only ever removes citations it positively rejected.
 */
export function parseSupportReply(text: string, claimCount: number): Set<number> | null {
  const entries = extractJsonArray(text);
  if (entries.length === 0) return null;
  const rejected = new Set<number>();
  let read = 0;
  for (const entry of entries) {
    const parsed = rawVerdict.safeParse(entry);
    if (!parsed.success) continue;
    const n = Number(parsed.data.claim);
    if (!Number.isInteger(n) || n < 1 || n > claimCount) continue;
    read += 1;
    const supported = typeof parsed.data.supported === "boolean" ? parsed.data.supported : parsed.data.supported.trim().toLowerCase() === "true";
    if (!supported) rejected.add(n - 1);
  }
  return read > 0 ? rejected : null;
}

/** The answer with every citation mark removed from the given sentences. */
export function removeCitations(answer: string, pieces: ReadonlySet<number>): string {
  if (pieces.size === 0) return answer;
  return splitSentences(answer)
    .map((piece, index) => (pieces.has(index) ? piece.replace(CITATION, "") : piece))
    .join("");
}

/**
 * The answer split at the "Beyond your sources" heading: the sourced part,
 * and the general-knowledge part (without the heading), or null when there
 * is none.
 */
export function splitBeyond(answer: string): { sourced: string; beyond: string | null } {
  // "### Beyond your sources", "## **Beyond your sources:**", "#### Beyond your sources:"
  const match = /^\s{0,3}#{1,6}\s*\**\s*Beyond your sources\s*:?\s*\**\s*:?\s*$/im.exec(answer);
  if (!match) return { sourced: answer, beyond: null };
  const beyond = answer.slice(match.index + match[0].length).trim();
  return { sourced: answer.slice(0, match.index).trimEnd(), beyond: beyond || null };
}
