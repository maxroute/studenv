import { prisma } from "@/lib/db/prisma";
import { SHELF_FILE_KINDS } from "@/lib/library/shelf-files";

// Every query is scoped to `ownerId`.

/** The user's vault files that have no Shelf item, newest first. */
export async function listFilesWithoutItem(ownerId: string) {
  return prisma.mediaAsset.findMany({
    where: { ownerId, itemId: null, kind: { in: [...SHELF_FILE_KINDS] } },
    select: { id: true, title: true, kind: true, sourceHost: true, sourceUrl: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

/** One of the user's vault files, or null when it isn't theirs. */
export async function findOwnedFile(ownerId: string, assetId: string) {
  return prisma.mediaAsset.findFirst({
    where: { id: assetId, ownerId },
    select: { id: true, title: true, kind: true, sourceUrl: true, itemId: true },
  });
}

/** Links a file to a Shelf item, only if it has none yet; false when another request linked it first. */
export async function linkFileToItem(ownerId: string, assetId: string, itemId: string): Promise<boolean> {
  const { count } = await prisma.mediaAsset.updateMany({ where: { id: assetId, ownerId, itemId: null }, data: { itemId } });
  return count === 1;
}
