import type { Prisma, PrismaClient } from "@prisma/client";
import type { CreateFlashcardInput, ReviewFlashcardInput, UpdateFlashcardInput } from "@/lib/models/flashcard.model";
import { newReviewState, schedule, type ReviewStateName } from "@/lib/flashcards/scheduler";
import { toLinkRows } from "@/lib/refs/extract/link-rows";
import { parseRef, formatRef, type Ref } from "@/lib/refs/ref-grammar";
import * as flashcardRepository from "@/lib/repositories/flashcard.repository";
import * as linkRepository from "@/lib/repositories/link.repository";

type Db = PrismaClient | Prisma.TransactionClient;

const STATE_NAMES: readonly ReviewStateName[] = ["new", "learning", "review", "relearning"];

/** Stored as a plain string; anything unexpected is treated as a new card. */
function toStateName(value: string): ReviewStateName {
  return STATE_NAMES.find((name) => name === value) ?? "new";
}

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

/** A card's source as an index row: the card is a "source" link to what it came from (§3.2). */
export async function indexCardSource(ownerId: string, cardId: string, sourceRef: string | null, db: Db) {
  const ref = sourceRef ? parseRef(sourceRef) : null;
  const rows = ref ? toLinkRows({ type: "flashcard", id: cardId }, [{ ref, kind: "source", sourceAnchor: "" }]) : [];
  await linkRepository.replaceSourceLinks(ownerId, { type: "flashcard", id: cardId }, rows, db);
}

function sourceColumns(ref: Ref | null) {
  return ref ? { sourceRef: formatRef(ref), sourceType: ref.type, sourceId: ref.id } : { sourceRef: null, sourceType: null, sourceId: null };
}

export async function listFlashcards(userId: string, sourceRef?: string) {
  if (sourceRef) {
    const ref = parseRef(sourceRef);
    if (!ref) throw httpError("Invalid reference.", 400);
    return flashcardRepository.list(userId, { sourceType: ref.type, sourceId: ref.id });
  }
  return flashcardRepository.list(userId);
}

export async function createFlashcard(userId: string, input: CreateFlashcardInput) {
  const ref = input.sourceRef ? parseRef(input.sourceRef) : null;
  if (input.sourceRef && !ref) throw httpError("Invalid source reference.", 400);
  return flashcardRepository.transaction(async (tx) => {
    const card = await flashcardRepository.create(
      { ownerId: userId, front: input.front, back: input.back, origin: ref?.type === "note" ? "note_block" : "manual", ...sourceColumns(ref) },
      tx,
    );
    await indexCardSource(userId, card.id, card.sourceRef, tx);
    return card;
  });
}

/** Editing marks the card, so regenerating AI cards never replaces it (§9 Q4). */
export async function updateFlashcard(userId: string, id: string, input: UpdateFlashcardInput) {
  const { count } = await flashcardRepository.update(userId, id, { ...input, editedAt: new Date() });
  if (count === 0) throw httpError("Flashcard not found.", 404);
  const card = await flashcardRepository.findActive(userId, id);
  if (!card) throw httpError("Flashcard not found.", 404);
  return card;
}

export async function deleteFlashcard(userId: string, id: string) {
  await flashcardRepository.transaction(async (tx) => {
    const { count } = await flashcardRepository.update(userId, id, { deletedAt: new Date() }, tx);
    if (count === 0) throw httpError("Flashcard not found.", 404);
    await linkRepository.deleteSourceLinks({ type: "flashcard", id }, tx);
  });
}

export async function dueFlashcards(userId: string, limit = 50) {
  const now = new Date();
  const [cards, total] = await Promise.all([flashcardRepository.due(userId, now, limit), flashcardRepository.countDue(userId, now)]);
  return { cards, total };
}

/** Records an answer and schedules the next review, in one transaction. */
export async function reviewFlashcard(userId: string, id: string, input: ReviewFlashcardInput) {
  const now = new Date();
  return flashcardRepository.transaction(async (tx) => {
    const card = await flashcardRepository.findActive(userId, id, tx);
    if (!card) throw httpError("Flashcard not found.", 404);
    const stored = await flashcardRepository.findReview(id, userId, tx);
    const current = stored
      ? { state: toStateName(stored.state), stability: stored.stability, difficulty: stored.difficulty, reps: stored.reps, lapses: stored.lapses, due: stored.due, lastReviewedAt: stored.lastReviewedAt }
      : newReviewState(now);
    const next = schedule(current, input.rating, now);
    await flashcardRepository.saveReview(id, userId, next, tx);
    await flashcardRepository.logReview({ flashcardId: id, userId, rating: input.rating, elapsedMs: input.elapsedMs }, tx);
    return { id, state: next.state, due: next.due, reps: next.reps, lapses: next.lapses };
  });
}
