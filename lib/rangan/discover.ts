// ---------------------------------------------------------------------------
// Discover: related material and what to explore next
// ---------------------------------------------------------------------------
//
// Pure: no model, database or React.
//
// "Related in your library" ranks the student's other material by how close
// in meaning its passages are to a page, leaving out what the page already
// links to or is linked from. "Explore next" asks the model for gaps,
// connections and next questions; each gap is then checked against the
// library, so "not in your library yet" is never a guess.

import { z } from "zod";
import { extractJsonObject } from "@/lib/study/plan";

/**
 * Closest a passage must be in meaning (cosine similarity, bge-m3) to count
 * as related. Each passage is scored by its best match among the page's
 * passages, which lifts every score: on a real library, unrelated pairs
 * scored 0.50–0.55 and true matches 0.62 and up.
 */
export const RELATED_MIN_SIMILARITY = 0.58;
/** Related sources shown on a page. */
export const RELATED_LIMIT = 5;
/** Gaps, connections and questions kept from an "explore next" reply. */
export const EXPLORE_MAX_GAPS = 4;
export const EXPLORE_MAX_CONNECTIONS = 3;
export const EXPLORE_MAX_QUESTIONS = 3;

/** The link-graph key of an indexed source: pages are notes; PDFs and videos are assets; articles are items. */
export function sourceKey(sourceType: string, sourceId: string): string {
  if (sourceType === "pdf" || sourceType === "transcript") return `asset:${sourceId}`;
  return `${sourceType}:${sourceId}`;
}

export type RelatedCandidate<C> = { chunk: C & { sourceType: string; sourceId: string }; similarity: number };

/**
 * One entry per source, its closest passage, best first: only sources close
 * enough in meaning, never the page itself, and never one it already links to
 * or is linked from.
 */
export function rankRelated<C>(
  candidates: ReadonlyArray<RelatedCandidate<C>>,
  options: { self: string; linked: ReadonlySet<string>; limit?: number; minSimilarity?: number },
): Array<RelatedCandidate<C>> {
  const limit = options.limit ?? RELATED_LIMIT;
  const floor = options.minSimilarity ?? RELATED_MIN_SIMILARITY;
  const best = new Map<string, RelatedCandidate<C>>();
  for (const candidate of candidates) {
    if (!(candidate.similarity >= floor)) continue;
    const key = sourceKey(candidate.chunk.sourceType, candidate.chunk.sourceId);
    if (key === options.self || options.linked.has(key)) continue;
    const current = best.get(key);
    if (!current || candidate.similarity > current.similarity) best.set(key, candidate);
  }
  return [...best.values()].sort((a, b) => b.similarity - a.similarity).slice(0, limit);
}

export function exploreInstruction(title: string, pagePassages: number, relatedPassages: number): string {
  const related =
    relatedPassages > 0
      ? `Passages ${pagePassages + 1} to ${pagePassages + relatedPassages} are other material from the student's library.`
      : "The student's library has no other material close to this page.";
  return [
    `Passages 1 to ${pagePassages} are the student's page "${title}". ${related}`,
    "Help the student see what is worth exploring next from this page.",
    `gaps: up to ${EXPLORE_MAX_GAPS} ideas the page relies on or leads to that it does not explain, each a short name (at most 6 words) and why it matters in one sentence.`,
    `connect: up to ${EXPLORE_MAX_CONNECTIONS} of the other passages that add to the page, each its passage number and how it connects in one sentence. Only use passages that really relate.`,
    `questions: up to ${EXPLORE_MAX_QUESTIONS} short questions the student could ask next to understand the page better.`,
    "Write in the language of the page. Never mention passage numbers in the text.",
    'Reply with only a JSON object, no other text: {"gaps": [{"concept": "...", "why": "..."}], "connect": [{"passage": 7, "why": "..."}], "questions": ["..."]}',
  ].join("\n");
}

const clean = (max: number) => z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().min(1).max(max));
const rawGap = z.object({ concept: clean(80), why: z.string().optional() });
const rawConnection = z.object({ passage: z.unknown(), why: z.string().optional() });

export type ExploreReply = {
  gaps: Array<{ concept: string; why: string }>;
  /** `passage` is a 0-based index among the related passages (not the page's). */
  connect: Array<{ passage: number; why: string }>;
  questions: string[];
};

const sentence = (value: string | undefined, max = 300) => (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

/**
 * Well-formed gaps, connections and questions from the reply. A connection
 * must point at one of the related passages; one pointing at the page itself
 * or out of range is dropped.
 */
export function parseExploreReply(text: string, pagePassages: number, relatedPassages: number): ExploreReply {
  const object = extractJsonObject(text);
  const list = (key: string) => (Array.isArray(object?.[key]) ? (object?.[key] as unknown[]) : []);

  const seenGaps = new Set<string>();
  const gaps: ExploreReply["gaps"] = [];
  for (const entry of list("gaps")) {
    const parsed = rawGap.safeParse(entry);
    if (!parsed.success || seenGaps.has(parsed.data.concept.toLowerCase())) continue;
    seenGaps.add(parsed.data.concept.toLowerCase());
    gaps.push({ concept: parsed.data.concept, why: sentence(parsed.data.why) });
    if (gaps.length >= EXPLORE_MAX_GAPS) break;
  }

  const seenPassages = new Set<number>();
  const connect: ExploreReply["connect"] = [];
  for (const entry of list("connect")) {
    const parsed = rawConnection.safeParse(entry);
    if (!parsed.success) continue;
    const n = typeof parsed.data.passage === "number" ? parsed.data.passage : Number(parsed.data.passage);
    const index = n - pagePassages - 1;
    if (!Number.isInteger(n) || index < 0 || index >= relatedPassages || seenPassages.has(index)) continue;
    seenPassages.add(index);
    connect.push({ passage: index, why: sentence(parsed.data.why) });
    if (connect.length >= EXPLORE_MAX_CONNECTIONS) break;
  }

  const questions = [
    ...new Set(list("questions").flatMap((entry) => (typeof entry === "string" ? [sentence(entry, 200)] : [])).filter(Boolean)),
  ].slice(0, EXPLORE_MAX_QUESTIONS);

  return { gaps, connect, questions };
}

/**
 * Where the library already covers a gap: the best search result outside the
 * page that matched by both keyword and meaning, or null when nothing did.
 */
export function coveringResult<R extends { ref: string; matchedBy?: readonly string[] }>(results: readonly R[], pageRef: string): R | null {
  return (
    results.find(
      (result) =>
        !(result.ref === pageRef || result.ref.startsWith(`${pageRef}#`)) &&
        (result.matchedBy ?? []).includes("keyword") &&
        (result.matchedBy ?? []).includes("meaning"),
    ) ?? null
  );
}

/**
 * Is a chat message asking what to explore or study next? Kept narrow, like
 * plan requests: "what should I explore next", "what am I missing", "what
 * else should I learn about this".
 */
export function isExploreRequest(message: string): boolean {
  const text = message.trim();
  if (!text || text.length > 300) return false;
  return (
    /\bwhat\s+(should|could|can)\s+i\s+(explore|study|learn|read|look\s+(at|into))\s+next\b/i.test(text) ||
    /\b(explore|learn|study|read)\s+next\b/i.test(text) ||
    /\bwhat\s+am\s+i\s+missing\b/i.test(text) ||
    /\bwhat\s+else\s+should\s+i\s+(learn|study|know|read|explore)\b/i.test(text) ||
    /\b(gaps|holes)\s+in\s+my\s+(notes|knowledge|understanding|library)\b/i.test(text)
  );
}
