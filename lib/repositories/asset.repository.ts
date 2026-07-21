import { prisma } from "@/lib/db/prisma";
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
