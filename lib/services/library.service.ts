// ---------------------------------------------------------------------------
// Library: your files (Shelf resources and uploads), where each is used, and storage
// ---------------------------------------------------------------------------
//
// A file is a Shelf item that is not a page (PDF, video, link) or an uploaded
// asset with no Shelf item (images, uploaded PDFs, audio). "Used in" comes
// from the link index: pages that embed or mention it and boards that hold
// it as a card. Storage is the size of each uploaded file's current version;
// links and page text do not count.

import type { Plan } from "@prisma/client";
import { siteConfig } from "@/config/site";
import { prisma } from "@/lib/db/prisma";

export type FileKind = "pdf" | "video" | "link" | "image" | "audio";

export type LibraryFile = {
  /** `item:<id>` or `asset:<id>`. */
  ref: string;
  title: string;
  kind: FileKind;
  url: string | null;
  sizeBytes: number | null;
  createdAt: string;
  usedIn: Array<{ type: "page" | "board"; id: string; title: string }>;
};

const itemKind = (type: string): FileKind => (type === "pdf" ? "pdf" : type === "video" ? "video" : "link");
const assetKind = (kind: string): FileKind =>
  kind === "pdf" ? "pdf" : kind === "video" ? "video" : kind === "image" ? "image" : kind === "audio" ? "audio" : "link";

export async function listFiles(userId: string): Promise<LibraryFile[]> {
  const [items, assets] = await Promise.all([
    prisma.item.findMany({
      where: { userId, type: { not: "note" } },
      select: { id: true, type: true, title: true, url: true, createdAt: true, mediaAsset: { select: { id: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.mediaAsset.findMany({
      where: { ownerId: userId, kind: { not: "snapshot" }, OR: [{ itemId: null }, { item: { is: { type: { not: "note" } } } }] },
      select: { id: true, kind: true, title: true, itemId: true, sourceUrl: true, createdAt: true, currentRevisionId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const revisionIds = assets.map((asset) => asset.currentRevisionId).filter((id): id is string => Boolean(id));
  const revisions = revisionIds.length
    ? await prisma.assetRevision.findMany({ where: { id: { in: revisionIds } }, select: { id: true, sizeBytes: true } })
    : [];
  const sizeOfRevision = new Map(revisions.map((revision) => [revision.id, revision.sizeBytes]));
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));

  const files: LibraryFile[] = [];
  // The asset behind each file, so links to either id count as uses of the file.
  const refsOfFile = new Map<string, string[]>();
  for (const item of items) {
    const asset = item.mediaAsset ? assetById.get(item.mediaAsset.id) : undefined;
    const ref = `item:${item.id}`;
    files.push({
      ref,
      title: item.title || "Untitled",
      kind: itemKind(item.type),
      url: item.url,
      sizeBytes: asset?.currentRevisionId ? sizeOfRevision.get(asset.currentRevisionId) ?? null : null,
      createdAt: item.createdAt.toISOString(),
      usedIn: [],
    });
    refsOfFile.set(ref, [ref, ...(item.mediaAsset ? [`asset:${item.mediaAsset.id}`] : [])]);
  }
  for (const asset of assets) {
    if (asset.itemId) continue;
    const ref = `asset:${asset.id}`;
    files.push({
      ref,
      title: asset.title || "Untitled",
      kind: assetKind(asset.kind),
      url: asset.sourceUrl,
      sizeBytes: asset.currentRevisionId ? sizeOfRevision.get(asset.currentRevisionId) ?? null : null,
      createdAt: asset.createdAt.toISOString(),
      usedIn: [],
    });
    refsOfFile.set(ref, [ref]);
  }

  const fileOfTarget = new Map<string, string>();
  for (const [file, refs] of refsOfFile) for (const ref of refs) fileOfTarget.set(ref, file);
  const ids = (type: string) => [...fileOfTarget.keys()].filter((ref) => ref.startsWith(`${type}:`)).map((ref) => ref.slice(type.length + 1));
  const links = fileOfTarget.size
    ? await prisma.contentLink.findMany({
        where: {
          ownerId: userId,
          sourceType: { in: ["note", "workspace"] },
          OR: [{ targetType: "item", targetId: { in: ids("item") } }, { targetType: "asset", targetId: { in: ids("asset") } }],
        },
        select: { sourceType: true, sourceId: true, targetType: true, targetId: true },
      })
    : [];
  const noteIds = [...new Set(links.filter((link) => link.sourceType === "note").map((link) => link.sourceId))];
  const boardIds = [...new Set(links.filter((link) => link.sourceType === "workspace").map((link) => link.sourceId))];
  const [notes, boards] = await Promise.all([
    noteIds.length ? prisma.note.findMany({ where: { id: { in: noteIds }, ownerId: userId, deletedAt: null }, select: { id: true, title: true } }) : [],
    boardIds.length ? prisma.workspace.findMany({ where: { id: { in: boardIds }, ownerId: userId }, select: { id: true, title: true } }) : [],
  ]);
  const noteTitle = new Map(notes.map((note) => [note.id, note.title || "Untitled"]));
  const boardTitle = new Map(boards.map((board) => [board.id, board.title || "Untitled board"]));
  const byRef = new Map(files.map((file) => [file.ref, file]));
  for (const link of links) {
    const file = byRef.get(fileOfTarget.get(`${link.targetType}:${link.targetId}`) ?? "");
    if (!file) continue;
    const type = link.sourceType === "note" ? "page" : "board";
    const title = type === "page" ? noteTitle.get(link.sourceId) : boardTitle.get(link.sourceId);
    if (!title || file.usedIn.some((use) => use.type === type && use.id === link.sourceId)) continue;
    file.usedIn.push({ type, id: link.sourceId, title });
  }
  return files;
}

/** Bytes used by uploaded files, the plan's limit, and the largest files. */
export async function storageUsage(userId: string, plan: Plan) {
  const assets = await prisma.mediaAsset.findMany({
    where: { ownerId: userId, currentRevisionId: { not: null } },
    select: { id: true, title: true, kind: true, currentRevisionId: true },
  });
  const revisionIds = assets.map((asset) => asset.currentRevisionId).filter((id): id is string => Boolean(id));
  const revisions = revisionIds.length
    ? await prisma.assetRevision.findMany({ where: { id: { in: revisionIds } }, select: { id: true, sizeBytes: true } })
    : [];
  const size = new Map(revisions.map((revision) => [revision.id, revision.sizeBytes ?? 0]));
  const sized = assets
    .map((asset) => ({ ref: `asset:${asset.id}`, title: asset.title || "Untitled", kind: assetKind(asset.kind), sizeBytes: size.get(asset.currentRevisionId ?? "") ?? 0 }))
    .filter((asset) => asset.sizeBytes > 0)
    .sort((a, b) => b.sizeBytes - a.sizeBytes);
  const usedBytes = sized.reduce((total, asset) => total + asset.sizeBytes, 0);
  return {
    usedBytes,
    // Only the free plan has a limit today.
    limitBytes: plan === "free" ? siteConfig.freeTierStorageBytes : null,
    largest: sized.slice(0, 50),
  };
}

/** Every board with the pages placed on it (from the link index). */
export async function listBoards(userId: string) {
  const boards = await prisma.workspace.findMany({
    where: { ownerId: userId },
    select: { id: true, title: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
  });
  const links = boards.length
    ? await prisma.contentLink.findMany({
        where: { ownerId: userId, sourceType: "workspace", sourceId: { in: boards.map((board) => board.id) }, targetType: "note", kind: "card" },
        select: { sourceId: true, targetId: true },
      })
    : [];
  const noteIds = [...new Set(links.map((link) => link.targetId))];
  const notes = noteIds.length
    ? await prisma.note.findMany({ where: { id: { in: noteIds }, ownerId: userId, deletedAt: null }, select: { id: true, title: true } })
    : [];
  const title = new Map(notes.map((note) => [note.id, note.title || "Untitled"]));
  return boards.map((board) => {
    const pageIds = [...new Set(links.filter((link) => link.sourceId === board.id).map((link) => link.targetId))].filter((id) => title.has(id));
    return {
      id: board.id,
      title: board.title || "Untitled board",
      updatedAt: board.updatedAt.toISOString(),
      pages: pageIds.map((id) => ({ id, title: title.get(id) ?? "Untitled" })),
    };
  });
}
