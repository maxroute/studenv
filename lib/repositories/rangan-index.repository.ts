import { INTERACTIVE_TRANSACTION_OPTIONS, prisma } from "@/lib/db/prisma";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { toVectorLiteral } from "@/lib/ai/embeddings";
import {
  chunkNoteDoc,
  chunkPdfPages,
  chunkPlainText,
  withHashes,
  type HashedPassage,
} from "@/lib/rangan/chunking";
import { planChunkSync, type IndexedSource, type SourceVersion } from "@/lib/rangan/index-plan";
import type { IndexSourceType } from "@/lib/rangan/ranking";

// Every query here is scoped to `ownerId`: a user's index only ever holds and
// returns their own content.

/** Every source the user has now, with a version that changes when its text can. */
export async function listSourceVersions(ownerId: string): Promise<SourceVersion[]> {
  const [notes, pdfs, transcripts, articles] = await Promise.all([
    prisma.note.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.mediaAsset.findMany({
      where: { ownerId, kind: "pdf", currentRevisionId: { not: null } },
      select: { id: true, title: true, currentRevisionId: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.aiAnalysis.findMany({
      where: { asset: { ownerId }, transcript: { not: null } },
      select: { assetId: true, updatedAt: true, asset: { select: { title: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.item.findMany({
      where: { userId: ownerId, type: "article", OR: [{ excerpt: { not: null } }, { notes: { not: null } }] },
      select: { id: true, title: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const revisionIds = pdfs.flatMap((pdf) => (pdf.currentRevisionId ? [pdf.currentRevisionId] : []));
  const pageCounts = revisionIds.length
    ? await prisma.assetPageManifest.groupBy({
        by: ["assetRevisionId"],
        where: { assetRevisionId: { in: revisionIds }, searchText: { not: null } },
        _count: { _all: true },
      })
    : [];
  const pagesByRevision = new Map(pageCounts.map((row) => [row.assetRevisionId, row._count._all]));

  return [
    ...notes.map((note) => ({ type: "note" as const, id: note.id, title: note.title, version: String(note.updatedAt.getTime()) })),
    ...pdfs.flatMap((pdf) => {
      const pages = pdf.currentRevisionId ? pagesByRevision.get(pdf.currentRevisionId) ?? 0 : 0;
      return pages > 0 ? [{ type: "pdf" as const, id: pdf.id, title: pdf.title, version: `${pdf.currentRevisionId}:${pages}` }] : [];
    }),
    ...transcripts.map((row) => ({
      type: "transcript" as const,
      id: row.assetId,
      title: row.asset.title,
      version: String(row.updatedAt.getTime()),
    })),
    ...articles.map((item) => ({ type: "item" as const, id: item.id, title: item.title, version: String(item.updatedAt.getTime()) })),
  ];
}

export async function listIndexedSources(ownerId: string): Promise<IndexedSource[]> {
  const rows = await prisma.ranganSource.findMany({
    where: { ownerId },
    select: { sourceType: true, sourceId: true, version: true },
  });
  return rows.map((row) => ({ type: row.sourceType, id: row.sourceId, version: row.version }));
}

/** The source's passages, or null when it is gone or not the user's. */
export async function loadPassages(ownerId: string, type: IndexSourceType, id: string): Promise<HashedPassage[] | null> {
  switch (type) {
    case "note": {
      const note = await prisma.note.findFirst({ where: { id, ownerId, deletedAt: null }, select: { docJson: true } });
      return note ? withHashes(chunkNoteDoc(parseNoteDoc(note.docJson).envelope.doc)) : null;
    }
    case "pdf": {
      const asset = await prisma.mediaAsset.findFirst({
        where: { id, ownerId, kind: "pdf" },
        select: { currentRevisionId: true },
      });
      if (!asset?.currentRevisionId) return null;
      const pages = await prisma.assetPageManifest.findMany({
        where: { assetRevisionId: asset.currentRevisionId },
        select: { pageNumber: true, searchText: true },
      });
      return withHashes(chunkPdfPages(pages.map((page) => ({ pageNumber: page.pageNumber, text: page.searchText }))));
    }
    case "transcript": {
      const analysis = await prisma.aiAnalysis.findFirst({
        where: { assetId: id, asset: { ownerId } },
        select: { transcript: true },
      });
      return analysis?.transcript ? withHashes(chunkPlainText(analysis.transcript)) : null;
    }
    case "item": {
      const item = await prisma.item.findFirst({
        where: { id, userId: ownerId },
        select: { title: true, excerpt: true, notes: true },
      });
      if (!item) return null;
      return withHashes(chunkPlainText([item.excerpt, item.notes].filter(Boolean).join("\n\n")));
    }
  }
}

/**
 * Replaces a source's passages. Passages whose text is unchanged keep their
 * rows and embeddings; a renamed source has its embeddings redone because the
 * title is part of what is embedded.
 */
export async function replaceSourceChunks(ownerId: string, source: SourceVersion, passages: readonly HashedPassage[]) {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.ranganChunk.findMany({
      where: { ownerId, sourceType: source.type, sourceId: source.id },
      select: { id: true, contentHash: true },
      orderBy: { ordinal: "asc" },
    });
    const plan = planChunkSync(existing, passages);

    if (plan.remove.length) await tx.ranganChunk.deleteMany({ where: { ownerId, id: { in: plan.remove } } });
    if (plan.keep.length) {
      await tx.$executeRaw`
        UPDATE "RanganChunk" AS c
        SET "embedding" = CASE WHEN c."title" = ${source.title} THEN c."embedding" ELSE NULL END,
            "embeddedAt" = CASE WHEN c."title" = ${source.title} THEN c."embeddedAt" ELSE NULL END,
            "ordinal" = v.ordinal,
            "title" = ${source.title},
            "updatedAt" = NOW()
        FROM (
          SELECT UNNEST(${plan.keep.map((row) => row.id)}::text[]) AS id,
                 UNNEST(${plan.keep.map((row) => row.ordinal)}::int[]) AS ordinal
        ) AS v
        WHERE c."id" = v.id AND c."ownerId" = ${ownerId}`;
    }
    if (plan.create.length) {
      await tx.ranganChunk.createMany({
        data: plan.create.map(({ ordinal, passage }) => ({
          ownerId,
          sourceType: source.type,
          sourceId: source.id,
          ordinal,
          anchor: passage.anchor.slice(0, 256),
          title: source.title.slice(0, 500),
          heading: passage.heading.slice(0, 500),
          content: passage.content,
          contentHash: passage.contentHash,
        })),
      });
    }
    await tx.ranganSource.upsert({
      where: { sourceType_sourceId: { sourceType: source.type, sourceId: source.id } },
      create: { ownerId, sourceType: source.type, sourceId: source.id, title: source.title.slice(0, 500), version: source.version },
      update: { ownerId, title: source.title.slice(0, 500), version: source.version, indexedAt: new Date() },
    });
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}

export async function removeSources(ownerId: string, sources: readonly IndexedSource[]) {
  if (sources.length === 0) return;
  const match = sources.map((source) => ({ sourceType: source.type, sourceId: source.id }));
  await prisma.$transaction([
    prisma.ranganChunk.deleteMany({ where: { ownerId, OR: match } }),
    prisma.ranganSource.deleteMany({ where: { ownerId, OR: match } }),
  ]);
}

/** Passages still waiting for an embedding, newest sources first. */
export async function listPendingEmbeddings(ownerId: string, limit: number) {
  return prisma.ranganChunk.findMany({
    where: { ownerId, embeddedAt: null },
    select: { id: true, contentHash: true, title: true, heading: true, content: true },
    orderBy: [{ updatedAt: "desc" }, { ordinal: "asc" }],
    take: limit,
  });
}

export async function countPendingEmbeddings(ownerId: string) {
  return prisma.ranganChunk.count({ where: { ownerId, embeddedAt: null } });
}

/** Stores vectors; a passage rewritten meanwhile (different hash) is left for the next round. */
export async function saveEmbeddings(
  ownerId: string,
  rows: ReadonlyArray<{ id: string; contentHash: string; vector: readonly number[] }>,
) {
  if (rows.length === 0) return;
  await prisma.$executeRaw`
    UPDATE "RanganChunk" AS c
    SET "embedding" = v.embedding::vector, "embeddedAt" = NOW()
    FROM (
      SELECT UNNEST(${rows.map((row) => row.id)}::text[]) AS id,
             UNNEST(${rows.map((row) => row.contentHash)}::text[]) AS hash,
             UNNEST(${rows.map((row) => toVectorLiteral(row.vector))}::text[]) AS embedding
    ) AS v
    WHERE c."id" = v.id AND c."contentHash" = v.hash AND c."ownerId" = ${ownerId}`;
}

/** Passage ids matching any of the query's words, best first. */
export async function keywordSearch(ownerId: string, tsQuery: string, limit: number): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT c."id"
    FROM "RanganChunk" AS c, to_tsquery('pg_catalog.english', ${tsQuery}) AS q
    WHERE c."ownerId" = ${ownerId} AND c."search_vector" @@ q
    -- 1|32: divide by log(length) so a short passage about the topic beats a
    -- long one that mentions it once, and scale to 0..1.
    ORDER BY ts_rank_cd(c."search_vector", q, 1|32) DESC, c."id"
    LIMIT ${limit}`;
  return rows.map((row) => row.id);
}

/** Passages closest in meaning to `vector`, with cosine similarity. An exact scan over the user's own passages. */
export async function meaningSearch(
  ownerId: string,
  vector: readonly number[],
  limit: number,
): Promise<Array<{ id: string; similarity: number }>> {
  const literal = toVectorLiteral(vector);
  const rows = await prisma.$queryRaw<Array<{ id: string; similarity: number }>>`
    SELECT c."id", (1 - (c."embedding" <=> ${literal}::vector))::float8 AS similarity
    FROM "RanganChunk" AS c
    WHERE c."ownerId" = ${ownerId} AND c."embedding" IS NOT NULL
    ORDER BY c."embedding" <=> ${literal}::vector, c."id"
    LIMIT ${limit}`;
  return rows.map((row) => ({ id: row.id, similarity: Number(row.similarity) }));
}

export async function loadChunks(ownerId: string, ids: readonly string[]) {
  if (ids.length === 0) return [];
  return prisma.ranganChunk.findMany({
    where: { ownerId, id: { in: [...ids] } },
    select: { id: true, sourceType: true, sourceId: true, anchor: true, title: true, heading: true, content: true },
  });
}

/** Shelf item id of each of the user's assets that has one. */
export async function findItemIdsForAssets(ownerId: string, assetIds: readonly string[]): Promise<Map<string, string>> {
  const assets = await prisma.mediaAsset.findMany({
    where: { ownerId, id: { in: [...assetIds] }, itemId: { not: null } },
    select: { id: true, itemId: true },
  });
  return new Map(assets.flatMap((asset) => (asset.itemId ? [[asset.id, asset.itemId] as const] : [])));
}
