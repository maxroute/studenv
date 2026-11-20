import { INTERACTIVE_TRANSACTION_OPTIONS, prisma } from "@/lib/db/prisma";
import { 
  MediaAssetKind, 
  MediaAssetOrigin, 
  MediaAssetStatus,
  Prisma
} from "@prisma/client";
import { 
  CreateAssetInput, 
  CreateRevisionInput 
} from "@/lib/models/asset.model";

const assetInclude = {
  revisions: {
    orderBy: {
      revisionNumber: "desc" as const,
    },
    take: 1,
  },
} satisfies Prisma.MediaAssetInclude;

export async function createAsset(input: CreateAssetInput) {
  return prisma.mediaAsset.create({
    data: {
      ownerId: input.ownerId,
      itemId: input.itemId,
      kind: input.kind,
      origin: input.origin,
      title: input.title,
      mimeType: input.mimeType,
      sourceUrl: input.sourceUrl,
      sourceHost: input.sourceHost,
      status: "processing",
    },
    include: assetInclude,
  });
}

export async function findAssetById(id: string) {
  return prisma.mediaAsset.findUnique({
    where: { id },
    include: assetInclude,
  });
}

export async function findAssetByItemId(itemId: string) {
  return prisma.mediaAsset.findUnique({
    where: { itemId },
    include: assetInclude,
  });
}

export async function findAssetForDeletion(id: string, ownerId: string) {
  return prisma.mediaAsset.findFirst({
    where: { id, ownerId },
    include: {
      revisions: {
        include: {
          pageManifests: true,
        },
      },
    },
  });
}

export async function deleteAssetById(id: string, ownerId: string) {
  return prisma.mediaAsset.delete({
    where: { id, ownerId },
  });
}

export async function updateAssetStatus(id: string, status: MediaAssetStatus) {
  return prisma.mediaAsset.update({
    where: { id },
    data: { status },
  });
}

export async function createRevision(input: CreateRevisionInput) {
  return prisma.$transaction(async (tx) => {
    // Get the latest revision number
    const lastRevision = await tx.assetRevision.findFirst({
      where: { assetId: input.assetId },
      orderBy: { revisionNumber: "desc" },
    });

    const revisionNumber = (lastRevision?.revisionNumber ?? 0) + 1;

    const revision = await tx.assetRevision.create({
      data: {
        assetId: input.assetId,
        parentRevisionId: input.parentRevisionId || lastRevision?.id,
        revisionNumber,
        storageKey: input.storageKey,
        sizeBytes: input.sizeBytes,
        pageCount: input.pageCount,
        durationMs: input.durationMs,
        createdBy: input.createdBy,
      },
    });

    // Update the asset's current revision
    await tx.mediaAsset.update({
      where: { id: input.assetId },
      data: { 
        currentRevisionId: revision.id,
        status: "ready", // Mark ready when first revision created
      },
    });

    return revision;
  });
}

export async function createPageManifests(
  revisionId: string, 
  pages: Array<{
    pageNumber: number;
    width: number;
    height: number;
    rotation?: number;
    thumbnailKey?: string;
    previewKey?: string;
    textLayerKey?: string;
    searchText?: string;
  }>
) {
  return prisma.assetPageManifest.createMany({
    data: pages.map(p => ({
      assetRevisionId: revisionId,
      ...p
    })),
  });
}

export async function getRevisionById(id: string) {
  return prisma.assetRevision.findUnique({
    where: { id },
  });
}

export async function getRevisionWithManifests(revisionId: string) {
  return prisma.assetRevision.findUnique({
    where: { id: revisionId },
    include: {
      pageManifests: {
        orderBy: {
          pageNumber: "asc",
        },
      },
    },
  });
}

/**
 * Saves page text for a revision. A page that already has text keeps it (the
 * revision's file never changes), so a repeated or retried batch is harmless;
 * a page row without text gets it; a missing page row is created. Also
 * records the revision's page count.
 */
export async function savePageTexts(
  revisionId: string,
  pageCount: number,
  pages: ReadonlyArray<{ pageNumber: number; width: number; height: number; text: string }>,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.assetPageManifest.findMany({
      where: { assetRevisionId: revisionId, pageNumber: { in: pages.map((page) => page.pageNumber) } },
      select: { id: true, pageNumber: true, searchText: true },
    });
    const byPage = new Map(existing.map((row) => [row.pageNumber, row]));

    const missing = pages.filter((page) => !byPage.has(page.pageNumber));
    if (missing.length) {
      await tx.assetPageManifest.createMany({
        data: missing.map((page) => ({
          assetRevisionId: revisionId,
          pageNumber: page.pageNumber,
          width: page.width,
          height: page.height,
          searchText: page.text,
        })),
      });
    }

    let filled = 0;
    for (const page of pages) {
      const row = byPage.get(page.pageNumber);
      if (!row || row.searchText !== null) continue;
      await tx.assetPageManifest.update({ where: { id: row.id }, data: { searchText: page.text } });
      filled += 1;
    }

    await tx.assetRevision.update({ where: { id: revisionId }, data: { pageCount } });

    return { created: missing.length, filled };
  }, INTERACTIVE_TRANSACTION_OPTIONS);
}

/** PDF assets whose current revision has no page text yet, oldest first. */
export async function listPdfAssetsWithoutPageText(options: { ownerId?: string; limit: number }) {
  const assets = await prisma.mediaAsset.findMany({
    where: { kind: "pdf", currentRevisionId: { not: null }, ...(options.ownerId ? { ownerId: options.ownerId } : {}) },
    select: { id: true, ownerId: true, title: true, currentRevisionId: true },
    orderBy: { createdAt: "asc" },
  });
  const revisionIds = assets.flatMap((asset) => (asset.currentRevisionId ? [asset.currentRevisionId] : []));
  const withText = revisionIds.length
    ? await prisma.assetPageManifest.findMany({
        where: { assetRevisionId: { in: revisionIds }, searchText: { not: null } },
        select: { assetRevisionId: true },
        distinct: ["assetRevisionId"],
      })
    : [];
  const done = new Set(withText.map((row) => row.assetRevisionId));
  return assets
    .flatMap((asset) => (asset.currentRevisionId && !done.has(asset.currentRevisionId) ? [{ ...asset, currentRevisionId: asset.currentRevisionId }] : []))
    .slice(0, options.limit);
}
