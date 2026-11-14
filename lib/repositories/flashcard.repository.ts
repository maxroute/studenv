import type { Prisma, PrismaClient } from "@prisma/client";
import { INTERACTIVE_TRANSACTION_OPTIONS, prisma } from "@/lib/db/prisma";

type Db = PrismaClient | Prisma.TransactionClient;

export const cardSelect = {
  id: true,
  front: true,
  back: true,
  origin: true,
  sourceRef: true,
  sourceType: true,
  sourceId: true,
  editedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.FlashcardSelect;

export function transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(run, INTERACTIVE_TRANSACTION_OPTIONS);
}

export function list(ownerId: string, filter: { sourceType?: string; sourceId?: string } = {}, db: Db = prisma) {
  return db.flashcard.findMany({
    where: { ownerId, deletedAt: null, ...filter },
    select: { ...cardSelect, reviews: { where: { userId: ownerId }, select: { state: true, due: true, reps: true, lapses: true } } },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
}

export function findActive(ownerId: string, id: string, db: Db = prisma) {
  return db.flashcard.findFirst({ where: { id, ownerId, deletedAt: null }, select: cardSelect });
}

export function create(data: Prisma.FlashcardUncheckedCreateInput, db: Db) {
  return db.flashcard.create({ data, select: cardSelect });
}

export function update(ownerId: string, id: string, data: Prisma.FlashcardUncheckedUpdateManyInput, db: Db = prisma) {
  return db.flashcard.updateMany({ where: { id, ownerId, deletedAt: null }, data });
}

/** Cards due now: reviewed cards whose due date has passed, then never-reviewed cards. */
export async function due(userId: string, now: Date, limit: number, db: Db = prisma) {
  const reviewed = await db.flashcard.findMany({
    where: { ownerId: userId, deletedAt: null, reviews: { some: { userId, due: { lte: now } } } },
    select: { ...cardSelect, reviews: { where: { userId }, select: { state: true, due: true, reps: true, lapses: true } } },
    take: limit,
  });
  reviewed.sort((a, b) => (a.reviews[0]?.due.getTime() ?? 0) - (b.reviews[0]?.due.getTime() ?? 0));
  const fresh = reviewed.length >= limit ? [] : await db.flashcard.findMany({
    where: { ownerId: userId, deletedAt: null, reviews: { none: { userId } } },
    select: { ...cardSelect, reviews: { where: { userId }, select: { state: true, due: true, reps: true, lapses: true } } },
    orderBy: { createdAt: "asc" },
    take: limit - reviewed.length,
  });
  return [...reviewed, ...fresh];
}

export function countDue(userId: string, now: Date, db: Db = prisma) {
  return db.flashcard.count({
    where: {
      ownerId: userId,
      deletedAt: null,
      OR: [{ reviews: { some: { userId, due: { lte: now } } } }, { reviews: { none: { userId } } }],
    },
  });
}

export function findReview(flashcardId: string, userId: string, db: Db) {
  return db.flashcardReview.findUnique({ where: { flashcardId_userId: { flashcardId, userId } } });
}

export function saveReview(
  flashcardId: string,
  userId: string,
  data: { state: string; due: Date; stability: number | null; difficulty: number | null; reps: number; lapses: number; lastReviewedAt: Date | null },
  db: Db,
) {
  return db.flashcardReview.upsert({
    where: { flashcardId_userId: { flashcardId, userId } },
    create: { flashcardId, userId, ...data },
    update: data,
  });
}

export function logReview(data: { flashcardId: string; userId: string; rating: number; elapsedMs?: number | null }, db: Db) {
  return db.flashcardReviewLog.create({ data: { ...data, elapsedMs: data.elapsedMs ?? null } });
}

export function frontsByIds(ownerId: string, ids: string[], db: Db = prisma) {
  return db.flashcard.findMany({ where: { id: { in: ids }, ownerId, deletedAt: null }, select: { id: true, front: true } });
}
