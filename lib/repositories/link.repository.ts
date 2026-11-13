import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { LinkRow } from "@/lib/refs/extract/link-rows";

type Db = PrismaClient | Prisma.TransactionClient;

/** Replaces every row of one source (delete, then insert) inside the caller's transaction. */
export async function replaceSourceLinks(ownerId: string, source: { type: string; id: string }, rows: readonly LinkRow[], db: Db) {
  await db.contentLink.deleteMany({ where: { sourceType: source.type, sourceId: source.id } });
  if (rows.length === 0) return;
  await db.contentLink.createMany({ data: rows.map((row) => ({ ...row, ownerId })), skipDuplicates: true });
}

export function findLinksToTargets(ownerId: string, targets: ReadonlyArray<{ type: string; id: string; anchor?: string }>, db: Db = prisma) {
  return db.contentLink.findMany({
    where: {
      ownerId,
      OR: targets.map((target) => ({
        targetType: target.type,
        targetId: target.id,
        ...(target.anchor ? { targetAnchor: target.anchor } : {}),
      })),
    },
    select: { sourceType: true, sourceId: true, sourceAnchor: true, kind: true, targetType: true, targetId: true, targetAnchor: true },
    orderBy: [{ sourceType: "asc" }, { sourceId: "asc" }, { sourceAnchor: "asc" }],
    take: 1000,
  });
}

export function deleteSourceLinks(source: { type: string; id: string }, db: Db = prisma) {
  return db.contentLink.deleteMany({ where: { sourceType: source.type, sourceId: source.id } });
}

// ── lookups for "Appears in" and rebuilds (owner-scoped) ───────────────────

export async function ownsTarget(ownerId: string, type: string, id: string, db: Db = prisma): Promise<boolean> {
  switch (type) {
    case "note":
      return Boolean(await db.note.findFirst({ where: { id, ownerId }, select: { id: true } }));
    case "asset":
      return Boolean(await db.mediaAsset.findFirst({ where: { id, ownerId }, select: { id: true } }));
    case "workspace":
      return Boolean(await db.workspace.findFirst({ where: { id, ownerId }, select: { id: true } }));
    case "item":
      return Boolean(await db.item.findFirst({ where: { id, userId: ownerId }, select: { id: true } }));
    default:
      return true;
  }
}

export async function assetIdOfItem(ownerId: string, itemId: string, db: Db = prisma) {
  return (await db.mediaAsset.findFirst({ where: { itemId, ownerId }, select: { id: true } }))?.id ?? null;
}

export async function itemIdOfNote(ownerId: string, noteId: string, db: Db = prisma) {
  return (await db.note.findFirst({ where: { id: noteId, ownerId }, select: { itemId: true } }))?.itemId ?? null;
}

export function activeNoteTitles(ownerId: string, ids: string[], db: Db = prisma) {
  return db.note.findMany({ where: { id: { in: ids }, ownerId, deletedAt: null }, select: { id: true, title: true } });
}

export function flashcardFronts(ownerId: string, ids: string[], db: Db = prisma) {
  return db.flashcard.findMany({ where: { id: { in: ids }, ownerId, deletedAt: null }, select: { id: true, front: true } });
}

export function workspaceTitles(ownerId: string, ids: string[], db: Db = prisma) {
  return db.workspace.findMany({ where: { id: { in: ids }, ownerId }, select: { id: true, title: true } });
}

export async function workspaceLinkHash(ownerId: string, workspaceId: string, db: Db) {
  return (await db.workspace.findFirst({ where: { id: workspaceId, ownerId }, select: { linkHash: true } })) ?? null;
}

export function setWorkspaceLinkHash(ownerId: string, workspaceId: string, linkHash: string, db: Db) {
  return db.workspace.updateMany({ where: { id: workspaceId, ownerId }, data: { linkHash } });
}

export function ownerNoteDocs(ownerId: string, db: Db = prisma) {
  return db.note.findMany({ where: { ownerId }, select: { id: true, docJson: true } });
}

export function ownerLatestScenes(ownerId: string, db: Db = prisma) {
  return db.workspace.findMany({
    where: { ownerId },
    select: { id: true, snapshots: { orderBy: { version: "desc" }, take: 1, select: { sceneJson: true } } },
  });
}

export function transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>) {
  return prisma.$transaction(run);
}
