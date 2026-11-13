import { prisma } from "@/lib/db/prisma";
import type { GeneratedFlashcard } from "@/lib/models/ai.model";

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
    where: { analysis: { assetId } },
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

    const existing = await tx.flashcard.findMany({
      where: { aiAnalysisId: analysis.id },
      select: { front: true, back: true },
      orderBy: { createdAt: "asc" },
    });
    if (existing.length > 0 || cards.length === 0) {
      return { saved: false, flashcards: existing };
    }

    await tx.flashcard.createMany({
      data: cards.map((card) => ({ aiAnalysisId: analysis.id, front: card.front, back: card.back })),
    });
    return { saved: true, flashcards: cards };
  });
}
