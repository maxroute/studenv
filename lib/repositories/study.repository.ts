import { INTERACTIVE_TRANSACTION_OPTIONS, prisma } from "@/lib/db/prisma";
import type { StudySource } from "@/lib/models/study.model";
import { toLinkRows } from "@/lib/refs/extract/link-rows";
import { formatRef, parseRef } from "@/lib/refs/ref-grammar";
import { replaceSourceLinks } from "@/lib/repositories/link.repository";
import { findItemIdsForAssets, listSourceVersions, loadPassages } from "@/lib/repositories/rangan-index.repository";
import type { LoadedStudySource } from "@/lib/services/study.service";

// Every query here is scoped to the user: only their own sources and cards.

/** The user's pages, PDFs with text and videos with transcripts, most recently changed first. */
export async function listStudySources(ownerId: string): Promise<StudySource[]> {
  const seen = new Set<string>();
  const sources: StudySource[] = [];
  for (const source of await listSourceVersions(ownerId)) {
    if (source.type === "item") continue;
    const ref = formatRef({ type: source.type === "note" ? "note" : "asset", id: source.id });
    if (seen.has(ref)) continue;
    seen.add(ref);
    sources.push({ ref, kind: source.type === "note" ? "note" : source.type === "pdf" ? "pdf" : "video", title: source.title || "Untitled" });
  }
  return sources;
}

/** The user's page, PDF or video with its passages, or null when it is not theirs. */
export async function loadStudySource(ownerId: string, ref: { type: "note" | "asset"; id: string }): Promise<LoadedStudySource | null> {
  if (ref.type === "note") {
    const note = await prisma.note.findFirst({ where: { id: ref.id, ownerId, deletedAt: null }, select: { title: true } });
    const passages = note ? await loadPassages(ownerId, "note", ref.id) : null;
    return note && passages ? { kind: "note", id: ref.id, title: note.title || "Untitled", passages, itemId: null } : null;
  }
  const asset = await prisma.mediaAsset.findFirst({ where: { id: ref.id, ownerId }, select: { title: true, kind: true } });
  if (!asset || (asset.kind !== "pdf" && asset.kind !== "video")) return null;
  const passages = await loadPassages(ownerId, asset.kind === "pdf" ? "pdf" : "transcript", ref.id);
  if (!passages) return null;
  const itemId = (await findItemIdsForAssets(ownerId, [ref.id])).get(ref.id) ?? null;
  return { kind: asset.kind, id: ref.id, title: asset.title || "Untitled", passages, itemId };
}

/**
 * Replaces the source's AI cards that were never reviewed or edited with
 * `cards`. Reviewed and edited cards are kept; each new card is indexed as a
 * "source" link to the passage it came from.
 */
export async function replaceAiCards(
  ownerId: string,
  source: { type: "note" | "asset"; id: string },
  cards: ReadonlyArray<{ front: string; back: string; sourceRef: string }>,
): Promise<{ created: number; replaced: number }> {
  return prisma.$transaction(async (tx) => {
    const replaceable = await tx.flashcard.findMany({
      where: {
        ownerId,
        sourceType: source.type,
        sourceId: source.id,
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
      await tx.contentLink.deleteMany({ where: { ownerId, sourceType: "flashcard", sourceId: { in: ids } } });
      await tx.flashcard.deleteMany({ where: { ownerId, id: { in: ids } } });
    }

    const created = await tx.flashcard.createManyAndReturn({
      data: cards.map((card) => ({
        ownerId,
        front: card.front,
        back: card.back,
        origin: "ai_generated" as const,
        sourceRef: card.sourceRef,
        sourceType: source.type,
        sourceId: source.id,
      })),
      select: { id: true, sourceRef: true },
    });
    for (const card of created) {
      const ref = card.sourceRef ? parseRef(card.sourceRef) : null;
      const rows = ref ? toLinkRows({ type: "flashcard", id: card.id }, [{ ref, kind: "source", sourceAnchor: "" }]) : [];
      await replaceSourceLinks(ownerId, { type: "flashcard", id: card.id }, rows, tx);
    }
    return { created: created.length, replaced: ids.length };
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}
