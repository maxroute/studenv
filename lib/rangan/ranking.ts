// ---------------------------------------------------------------------------
// Combining keyword and meaning search results (pure)
// ---------------------------------------------------------------------------

import { formatRef } from "@/lib/refs/ref-grammar";

/** Kinds of source Rangan indexes. Stored as plain strings, so new kinds need no migration. */
export const INDEX_SOURCE_TYPES = ["note", "pdf", "transcript", "item", "board"] as const;
export type IndexSourceType = (typeof INDEX_SOURCE_TYPES)[number];

const MAX_QUERY_TERMS = 16;

/**
 * Words of a question joined with OR for `to_tsquery`, so a passage matching
 * some of them still ranks. Only letters (with their combining marks, e.g. Bengali vowel signs) and digits survive, so the result
 * cannot carry tsquery operators. Null when nothing searchable is left.
 */
export function buildOrTsQuery(text: string): string | null {
  const words = text
    .normalize("NFKC")
    .toLowerCase()
    .match(/[\p{L}\p{M}\p{N}]+/gu);
  if (!words) return null;
  const unique = [...new Set(words.filter((word) => word.length > 1 || /\p{N}/u.test(word)))].slice(0, MAX_QUERY_TERMS);
  return unique.length > 0 ? unique.join(" | ") : null;
}

/**
 * Reciprocal rank fusion: each list contributes 1 / (k + rank) for every id it
 * ranks, so passages found by both searches rise to the top without having to
 * compare a text rank with a cosine distance. `weight` scales a list's share,
 * which also breaks the ties two lists of equal length would otherwise make.
 */
export function fuseRankings(lists: ReadonlyArray<{ name: string; ids: readonly string[]; weight?: number }>, k = 60) {
  const scores = new Map<string, { score: number; matchedBy: string[] }>();
  for (const list of lists) {
    list.ids.forEach((id, index) => {
      const entry = scores.get(id) ?? { score: 0, matchedBy: [] };
      entry.score += (list.weight ?? 1) / (k + index + 1);
      if (!entry.matchedBy.includes(list.name)) entry.matchedBy.push(list.name);
      scores.set(id, entry);
    });
  }
  return [...scores.entries()]
    .map(([id, entry]) => ({ id, ...entry }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/**
 * Similarity a meaning-only match needs. Measured on bge-m3 with real notes:
 * unrelated short passages scored up to about 0.44 and real matches 0.45–0.56.
 */
export const MIN_MEANING_SIMILARITY = 0.45;
/** Meaning-only matches far below the best one are dropped too. */
export const MEANING_SIMILARITY_SPREAD = 0.08;

/**
 * Meaning search always returns its nearest passages, related or not; only
 * clearly similar ones count. Keyword matches are ranked separately.
 */
export function filterMeaningMatches(matches: ReadonlyArray<{ id: string; similarity: number }>): string[] {
  const best = Math.max(...matches.map((match) => match.similarity), 0);
  const floor = Math.max(MIN_MEANING_SIMILARITY, best - MEANING_SIMILARITY_SPREAD);
  return matches.filter((match) => match.similarity >= floor).map((match) => match.id);
}

/** The reference a citation opens: a note block, a PDF page, a resource or a Shelf item. */
export function passageRef(sourceType: string, sourceId: string, anchor: string): string {
  switch (sourceType) {
    case "note":
      return formatRef({ type: "note", id: sourceId, ...(anchor ? { anchor } : {}) });
    case "pdf":
      return formatRef({ type: "asset", id: sourceId, ...(anchor ? { anchor } : {}) });
    case "transcript":
      return formatRef({ type: "asset", id: sourceId });
    case "board":
      return formatRef({ type: "workspace", id: sourceId });
    default:
      return formatRef({ type: "item", id: sourceId });
  }
}

/** A short excerpt for result lists. */
export function snippet(content: string, max = 280): string {
  const clean = content.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
