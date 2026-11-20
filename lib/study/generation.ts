// ---------------------------------------------------------------------------
// Flashcards and quizzes made from one library source
// ---------------------------------------------------------------------------
//
// Pure: no model, database or React. Picks the passages a source is studied
// from, builds the instruction, and keeps only well-formed cards and
// questions from the model's reply, each tied to the passage it came from.

import { z } from "zod";

/** Characters of a source sent to the model; a longer source is sampled evenly. */
export const STUDY_BUDGET_CHARS = 12_000;
/** Cards asked for, and kept at most. */
export const FLASHCARD_TARGET = 12;
export const FLASHCARD_MAX = 20;
/** Questions asked for, and kept at most. */
export const QUIZ_TARGET = 8;
export const QUIZ_MAX = 12;

export type StudyPassage = { anchor: string; heading: string; content: string };

/**
 * Passages in source order within `budget` characters. A source that fits is
 * used whole; a longer one is sampled at even steps, so every part of it can
 * appear.
 */
export function selectStudyPassages<T extends { content: string }>(passages: readonly T[], budget = STUDY_BUDGET_CHARS) {
  const total = passages.reduce((sum, passage) => sum + passage.content.length, 0);
  if (total <= budget) return { selected: [...passages], partial: false };
  const average = total / passages.length;
  const wanted = Math.max(1, Math.floor(budget / average));
  const step = passages.length / wanted;
  const selected: T[] = [];
  let used = 0;
  for (let index = 0; index < wanted; index++) {
    const passage = passages[Math.floor(index * step)];
    if (used > 0 && used + passage.content.length > budget) break;
    selected.push(passage);
    used += passage.content.length;
  }
  return { selected, partial: true };
}

const coverage = (partial: boolean) =>
  partial
    ? "The source is long, so the passages are evenly spaced parts of it."
    : "The passages are the whole source.";

export function flashcardInstruction(title: string, partial: boolean): string {
  return [
    `Make up to ${FLASHCARD_TARGET} study flashcards from "${title}". ${coverage(partial)}`,
    "Each card tests a different idea a student should remember: a definition, a fact, a cause, a step or a contrast.",
    "A short source gets fewer cards: never ask the same thing twice in other words.",
    "The front is a short question or prompt; the back is a short, complete answer.",
    "Use only what the passages say. Write in the language of the passages. Never mention passage numbers in the text.",
    'Reply with only a JSON array, no other text: [{"front": "...", "back": "...", "passage": 1}]',
    "where passage is the number of the passage the card comes from.",
  ].join("\n");
}

export function quizInstruction(title: string, partial: boolean): string {
  return [
    `Write a multiple-choice quiz of up to ${QUIZ_TARGET} questions on "${title}". ${coverage(partial)}`,
    "A short source gets fewer questions: never ask the same thing twice in other words.",
    "Each question has 4 options and exactly one correct option. Wrong options must be plausible, not silly.",
    "Test understanding, not trivia about wording. Spread the questions across the passages.",
    "The explanation says in one or two sentences why the answer is right.",
    "Use only what the passages say. Write in the language of the passages. Never mention passage numbers in the text.",
    'Reply with only a JSON array, no other text: [{"question": "...", "options": ["...", "...", "...", "..."], "answer": 0, "explanation": "...", "passage": 1}]',
    "where answer is the index (0 to 3) of the correct option and passage is the number of the passage it comes from.",
  ].join("\n");
}

/** The first JSON array in a model reply, which may wrap it in a code fence or prose; [] when there is none. */
export function extractJsonArray(text: string): unknown[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** A passage number from the model, as a 0-based index, or null when it is missing or out of range. */
function passageIndex(value: unknown, passageCount: number): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= passageCount ? n - 1 : null;
}

const cleanText = (max: number) => z.string().transform((value) => value.replace(/\s+/g, " ").trim()).pipe(z.string().min(1).max(max));

const rawCard = z.object({ front: cleanText(500), back: cleanText(1_500), passage: z.unknown().optional() });

export type GeneratedCard = { front: string; back: string; passage: number | null };

/** Well-formed cards from the reply, without repeats, at most {@link FLASHCARD_MAX}. */
export function parseFlashcards(text: string, passageCount: number): GeneratedCard[] {
  const seen = new Set<string>();
  const cards: GeneratedCard[] = [];
  for (const entry of extractJsonArray(text)) {
    const parsed = rawCard.safeParse(entry);
    if (!parsed.success) continue;
    const key = parsed.data.front.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push({ front: parsed.data.front, back: parsed.data.back, passage: passageIndex(parsed.data.passage, passageCount) });
    if (cards.length >= FLASHCARD_MAX) break;
  }
  return cards;
}

const rawQuestion = z.object({
  question: cleanText(600),
  options: z.array(cleanText(300)).min(2).max(5),
  answer: z.union([z.number(), z.string()]),
  explanation: z.string().optional(),
  passage: z.unknown().optional(),
});

export type GeneratedQuestion = {
  question: string;
  options: string[];
  /** Index of the correct option. */
  answer: number;
  explanation: string;
  passage: number | null;
};

/** Well-formed questions from the reply: distinct options and an answer among them. At most {@link QUIZ_MAX}. */
export function parseQuiz(text: string, passageCount: number): GeneratedQuestion[] {
  const questions: GeneratedQuestion[] = [];
  for (const entry of extractJsonArray(text)) {
    const parsed = rawQuestion.safeParse(entry);
    if (!parsed.success) continue;
    const { question, options, explanation } = parsed.data;
    if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) continue;
    const answer = typeof parsed.data.answer === "number" ? parsed.data.answer : Number(parsed.data.answer);
    if (!Number.isInteger(answer) || answer < 0 || answer >= options.length) continue;
    questions.push({
      question,
      options,
      answer,
      explanation: (explanation ?? "").replace(/\s+/g, " ").trim().slice(0, 1_000),
      passage: passageIndex(parsed.data.passage, passageCount),
    });
    if (questions.length >= QUIZ_MAX) break;
  }
  return questions;
}
