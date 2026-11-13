import { Prisma, type NoteRevisionReason, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** The shared client or a transaction; every query below is scoped to an owner. */
export type Db = PrismaClient | Prisma.TransactionClient;

export const noteSummarySelect = {
  id: true,
  title: true,
  parentId: true,
  sortKey: true,
  itemId: true,
  version: true,
  updatedAt: true,
} satisfies Prisma.NoteSelect;

export const noteDetailSelect = {
  ...noteSummarySelect,
  docJson: true,
  createdAt: true,
  deletedAt: true,
} satisfies Prisma.NoteSelect;

export function transaction<T>(run: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(run);
}

export function listActive(ownerId: string, db: Db = prisma) {
  return db.note.findMany({
    where: { ownerId, deletedAt: null },
    select: noteSummarySelect,
    orderBy: [{ parentId: "asc" }, { sortKey: "asc" }],
  });
}

export function findById(ownerId: string, id: string, db: Db = prisma) {
  return db.note.findFirst({ where: { id, ownerId }, select: noteDetailSelect });
}

export function findForUpdate(ownerId: string, id: string, db: Db) {
  return db.note.findFirst({
    where: { id, ownerId, deletedAt: null },
    select: { ...noteDetailSelect, docFormat: true, lastRevisionAt: true },
  });
}

export function lastSiblingKey(ownerId: string, parentId: string | null, db: Db = prisma) {
  return db.note.findFirst({
    where: { ownerId, parentId, deletedAt: null },
    select: { sortKey: true },
    orderBy: { sortKey: "desc" },
  });
}

export function siblingAfter(ownerId: string, parentId: string | null, sortKey: string, excludeId: string, db: Db) {
  return db.note.findFirst({
    where: { ownerId, parentId, deletedAt: null, sortKey: { gt: sortKey }, id: { not: excludeId } },
    select: { sortKey: true },
    orderBy: { sortKey: "asc" },
  });
}

export function firstSibling(ownerId: string, parentId: string | null, excludeId: string, db: Db) {
  return db.note.findFirst({
    where: { ownerId, parentId, deletedAt: null, id: { not: excludeId } },
    select: { sortKey: true },
    orderBy: { sortKey: "asc" },
  });
}

export function create(data: Prisma.NoteUncheckedCreateInput, db: Db) {
  return db.note.create({ data, select: noteDetailSelect });
}

/** The conditional update behind the version check: 0 rows when the version moved on. */
export function updateIfVersion(
  ownerId: string,
  id: string,
  baseVersion: number,
  data: Prisma.NoteUncheckedUpdateManyInput,
  db: Db,
) {
  return db.note.updateMany({ where: { id, ownerId, version: baseVersion, deletedAt: null }, data });
}

export function update(ownerId: string, id: string, data: Prisma.NoteUncheckedUpdateManyInput, db: Db) {
  return db.note.updateMany({ where: { id, ownerId }, data });
}

export async function plainTextOf(ownerId: string, id: string, db: Db) {
  return (await db.note.findFirst({ where: { id, ownerId }, select: { plainText: true } }))?.plainText ?? null;
}

export function versionOf(ownerId: string, id: string, db: Db) {
  return db.note.findFirst({ where: { id, ownerId }, select: { version: true, updatedAt: true, deletedAt: true } });
}

/** Ids of a note and all its descendants (owner-scoped), via a recursive query. */
export async function subtreeIds(ownerId: string, id: string, db: Db): Promise<string[]> {
  const rows = await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH RECURSIVE tree AS (
      SELECT "id" FROM "Note" WHERE "id" = ${id} AND "ownerId" = ${ownerId}
      UNION ALL
      SELECT n."id" FROM "Note" n JOIN tree t ON n."parentId" = t."id" WHERE n."ownerId" = ${ownerId}
    )
    SELECT "id" FROM tree
  `);
  return rows.map((row) => row.id);
}

export function setDeletedAt(ownerId: string, ids: string[], deletedAt: Date | null, db: Db) {
  return db.note.updateMany({ where: { ownerId, id: { in: ids } }, data: { deletedAt } });
}

// ── revisions ──────────────────────────────────────────────────────────────

export function createRevision(
  data: {
    noteId: string;
    version: number;
    title: string;
    docJson: string;
    docFormat: number;
    reason: NoteRevisionReason;
    createdBy: string;
  },
  db: Db,
) {
  return db.noteRevision.upsert({
    where: { noteId_version_reason: { noteId: data.noteId, version: data.version, reason: data.reason } },
    create: data,
    update: {},
    select: { id: true, version: true, reason: true, createdAt: true },
  });
}

export function listRevisionStamps(noteId: string, db: Db) {
  return db.noteRevision.findMany({ where: { noteId }, select: { id: true, createdAt: true, reason: true } });
}

export function deleteRevisions(noteId: string, ids: string[], db: Db) {
  return db.noteRevision.deleteMany({ where: { noteId, id: { in: ids } } });
}

export function listRevisions(ownerId: string, noteId: string, db: Db = prisma) {
  return db.noteRevision.findMany({
    where: { noteId, note: { ownerId } },
    select: { id: true, version: true, title: true, reason: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
}

export function findRevision(ownerId: string, noteId: string, revisionId: string, db: Db = prisma) {
  return db.noteRevision.findFirst({
    where: { id: revisionId, noteId, note: { ownerId } },
    select: { id: true, version: true, title: true, reason: true, createdAt: true, docJson: true, docFormat: true },
  });
}

// ── Shelf entry ────────────────────────────────────────────────────────────

export function countItems(ownerId: string, db: Db) {
  return db.item.count({ where: { userId: ownerId } });
}

export function createNoteItem(ownerId: string, title: string, excerpt: string, db: Db) {
  return db.item.create({ data: { userId: ownerId, type: "note", title, excerpt }, select: { id: true } });
}

export function updateNoteItem(ownerId: string, itemId: string, data: { title: string; excerpt: string }, db: Db) {
  return db.item.updateMany({ where: { id: itemId, userId: ownerId }, data });
}

export function itemOrganisation(ownerId: string, itemId: string, db: Db) {
  return db.item.findFirst({
    where: { id: itemId, userId: ownerId },
    select: { _count: { select: { itemTags: true, collectionItems: true } } },
  });
}

export function deleteItem(ownerId: string, itemId: string, db: Db) {
  return db.item.deleteMany({ where: { id: itemId, userId: ownerId } });
}
