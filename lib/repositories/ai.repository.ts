import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { GeneratedFlashcard } from "@/lib/models/ai.model";
import { toLinkRows } from "@/lib/refs/extract/link-rows";
import { encodeRefPart, parseRef } from "@/lib/refs/ref-grammar";
import { replaceSourceLinks } from "@/lib/repositories/link.repository";

/** True when the asset exists and belongs to `ownerId`. */
export async function isAssetOwnedBy(assetId: string, ownerId: string) {
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, ownerId },
    select: { id: true },
  });
  return asset !== null;
}

export async function saveSummary(assetId: string, summary: string, transcript: string) {
  await prisma.aiAnalysis.upsert({
    where: { assetId },
    update: { summary },
    create: { assetId, summary, transcript },
  });
}

/** Cards already saved for the asset's analysis, oldest first. */
export async function findSavedFlashcards(assetId: string): Promise<GeneratedFlashcard[]> {
  return prisma.flashcard.findMany({
    where: { analysis: { assetId }, deletedAt: null },
    select: { front: true, back: true },
    orderBy: { createdAt: "asc" },
  });
}

/** Rows for new AI cards: owned, sourced from the asset, indexed as "source" links. */
async function createAiCards(tx: Prisma.TransactionClient, ownerId: string, analysisId: string, assetId: string, cards: GeneratedFlashcard[]) {
  const sourceRef = `asset:${encodeRefPart(assetId, "id")}`;
  const created = await tx.flashcard.createManyAndReturn({
    data: cards.map((card) => ({
      ownerId,
      aiAnalysisId: analysisId,
      front: card.front,
      back: card.back,
      origin: "ai_generated" as const,
      sourceRef,
      sourceType: "asset",
      sourceId: assetId,
    })),
    select: { id: true },
  });
  const ref = parseRef(sourceRef);
  if (ref) {
    for (const card of created) {
      await replaceSourceLinks(ownerId, { type: "flashcard", id: card.id }, toLinkRows({ type: "flashcard", id: card.id }, [{ ref, kind: "source", sourceAnchor: "" }]), tx);
    }
  }
}

function activeCards(tx: Prisma.TransactionClient, analysisId: string) {
  return tx.flashcard.findMany({
    where: { aiAnalysisId: analysisId, deletedAt: null },
    select: { front: true, back: true },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Saves generated cards unless the asset's analysis already has cards, and
 * returns whatever is stored afterwards. The upsert writes the analysis row,
 * which locks it until the transaction ends, so two concurrent requests
 * cannot both insert a set.
 */
export async function saveFlashcardsIfNone(
  ownerId: string,
  assetId: string,
  transcript: string,
  cards: GeneratedFlashcard[],
): Promise<{ saved: boolean; flashcards: GeneratedFlashcard[] }> {
  return prisma.$transaction(async (tx) => {
    const analysis = await tx.aiAnalysis.upsert({
      where: { assetId },
      update: { updatedAt: new Date() },
      create: { assetId, transcript },
      select: { id: true },
    });

    const existing = await activeCards(tx, analysis.id);
    if (existing.length > 0 || cards.length === 0) {
      return { saved: false, flashcards: existing };
    }

    await createAiCards(tx, ownerId, analysis.id, assetId, cards);
    return { saved: true, flashcards: cards };
  });
}

/**
 * Regenerating (§9 Q4): replaces only AI cards that have no review history
 * and were never edited. Reviewed or edited cards are never deleted; the new
 * cards are added next to them.
 */
export async function replaceRegenerableFlashcards(
  ownerId: string,
  assetId: string,
  transcript: string,
  cards: GeneratedFlashcard[],
): Promise<{ replaced: number; flashcards: GeneratedFlashcard[] }> {
  return prisma.$transaction(async (tx) => {
    const analysis = await tx.aiAnalysis.upsert({
      where: { assetId },
      update: { updatedAt: new Date() },
      create: { assetId, transcript },
      select: { id: true },
    });
    const replaceable = await tx.flashcard.findMany({
      where: {
        aiAnalysisId: analysis.id,
        origin: "ai_generated",
        editedAt: null,
        deletedAt: null,
        reviews: { none: {} },
        reviewLogs: { none: {} },
      },
      select: { id: true },
    });
    const ids = replaceable.map((card) => card.id);
    if (ids.length > 0) {
      await tx.contentLink.deleteMany({ where: { sourceType: "flashcard", sourceId: { in: ids } } });
      await tx.flashcard.deleteMany({ where: { id: { in: ids } } });
    }
    if (cards.length > 0) await createAiCards(tx, ownerId, analysis.id, assetId, cards);
    return { replaced: ids.length, flashcards: await activeCards(tx, analysis.id) };
  });
}
