// ---------------------------------------------------------------------------
// Boards: a note's own workspace, and what a board's notes bring with them
// ---------------------------------------------------------------------------
//
// Every note can open "its board": a workspace created on first use and found
// again through a description marker (the same pattern item workspaces use).
// A board's vault lists the notes on it (their "card" links) and every Shelf
// item and file those notes mention or embed (their note links), so a note's
// resources are always at hand on any board it is placed on.

import { prisma } from "@/lib/db/prisma";
import * as linkRepository from "@/lib/repositories/link.repository";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { summarizeNoteDoc } from "@/lib/notes/note-summary";
import { getOrCreateAssetForItem } from "./item-asset.service";
import * as workspaceService from "./workspace.service";

function notFound(message: string) {
  return Object.assign(new Error(message), { status: 404 });
}

const boardMarker = (noteId: string) => `Board for note:${noteId}`;

/** The note's own board, created the first time it is opened. */
export async function openNoteBoard(userId: string, noteId: string, context?: { ip?: string | null; userAgent?: string | null }) {
  const note = await prisma.note.findFirst({ where: { id: noteId, ownerId: userId, deletedAt: null }, select: { id: true, title: true } });
  if (!note) throw notFound("Note not found.");
  const existing = await prisma.workspace.findFirst({ where: { ownerId: userId, description: boardMarker(note.id) }, select: { id: true } });
  if (existing) return { workspaceId: existing.id, created: false };
  const workspace = await workspaceService.createWorkspace(
    { ownerId: userId, title: note.title || "Untitled", description: boardMarker(note.id) },
    context,
  );
  return { workspaceId: workspace.id, created: true };
}

export type BoardResource = {
  assetId: string;
  kind: string;
  title: string;
  revisionId: string | null;
  /** The notes on the board that use it. */
  noteIds: string[];
};

/**
 * Notes on the board and the resources they use (assets created for Shelf
 * items on first use). The open board passes the notes its cards show, so a
 * card added a moment ago counts before the next save updates the link
 * index; without them the index is used. Only the caller's live notes count.
 */
export async function boardResources(userId: string, workspaceId: string, cardNoteIds?: readonly string[]) {
  const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, ownerId: userId }, select: { id: true } });
  if (!workspace) throw notFound("Workspace not found.");

  const noteIds = cardNoteIds ? [...new Set(cardNoteIds)] : await linkRepository.cardNoteIdsOfWorkspace(userId, workspaceId);
  const notes = noteIds.length ? await linkRepository.activeNoteTitles(userId, noteIds) : [];
  const activeIds = notes.map((note) => note.id);
  const links = activeIds.length ? await linkRepository.resourceLinksOfNotes(userId, activeIds) : [];

  const usersOf = new Map<string, Set<string>>();
  const use = (assetId: string, noteId: string) => {
    const set = usersOf.get(assetId) ?? new Set<string>();
    set.add(noteId);
    usersOf.set(assetId, set);
  };

  // Shelf items reach the canvas through their media asset.
  const itemIds = [...new Set(links.filter((link) => link.targetType === "item").map((link) => link.targetId))];
  const items = itemIds.length
    ? await prisma.item.findMany({ where: { id: { in: itemIds }, userId, type: { not: "note" } }, select: { id: true } })
    : [];
  const assetOfItem = new Map<string, string>();
  for (const item of items) {
    const asset = await getOrCreateAssetForItem(item.id, userId);
    assetOfItem.set(item.id, asset.id);
  }
  for (const link of links) {
    const assetId = link.targetType === "asset" ? link.targetId : assetOfItem.get(link.targetId);
    if (assetId) use(assetId, link.sourceId);
  }

  const assets = usersOf.size
    ? await prisma.mediaAsset.findMany({
        where: { id: { in: [...usersOf.keys()] }, ownerId: userId },
        select: { id: true, kind: true, title: true, currentRevisionId: true },
      })
    : [];
  const resources: BoardResource[] = assets.map((asset) => ({
    assetId: asset.id,
    kind: asset.kind,
    title: asset.title || "Untitled",
    revisionId: asset.currentRevisionId,
    noteIds: [...(usersOf.get(asset.id) ?? [])],
  }));
  resources.sort((a, b) => a.title.localeCompare(b.title));
  return { pages: notes.map((note) => ({ id: note.id, title: note.title || "Untitled" })), resources };
}

/** What a page's card on a board shows: its first blocks, status, tags and resources. */
export async function pageCard(userId: string, noteId: string) {
  const note = await prisma.note.findFirst({
    where: { id: noteId, ownerId: userId, deletedAt: null },
    select: { id: true, title: true, docJson: true, updatedAt: true, itemId: true },
  });
  if (!note) throw notFound("Page not found.");
  const summary = summarizeNoteDoc(parseNoteDoc(safeJson(note.docJson)).envelope.doc);
  const item = note.itemId
    ? await prisma.item.findFirst({
        where: { id: note.itemId, userId },
        select: { status: true, starred: true, itemTags: { select: { tag: { select: { name: true } } } } },
      })
    : null;

  const refs = [...new Set([...summary.resourceRefs, ...summary.preview.flatMap((block) => (block.type === "resource" ? [block.ref] : []))])];
  const itemIds = refs.filter((ref) => ref.startsWith("item:")).map((ref) => ref.slice(5));
  const assetIds = refs.filter((ref) => ref.startsWith("asset:")).map((ref) => ref.slice(6));
  const [items, assets] = await Promise.all([
    itemIds.length ? prisma.item.findMany({ where: { id: { in: itemIds }, userId }, select: { id: true, type: true, title: true } }) : [],
    assetIds.length ? prisma.mediaAsset.findMany({ where: { id: { in: assetIds }, ownerId: userId }, select: { id: true, kind: true, title: true } }) : [],
  ]);
  const resources: Record<string, { kind: string; title: string }> = {};
  for (const entry of items) resources[`item:${entry.id}`] = { kind: entry.type === "article" ? "link" : entry.type === "note" ? "page" : entry.type, title: entry.title || "Untitled" };
  for (const entry of assets) resources[`asset:${entry.id}`] = { kind: entry.kind === "webpage" ? "link" : entry.kind, title: entry.title || "Untitled" };

  return {
    id: note.id,
    title: note.title || "Untitled",
    updatedAt: note.updatedAt.toISOString(),
    status: item?.status ?? null,
    starred: item?.starred ?? false,
    tags: item?.itemTags.map((entry) => entry.tag.name) ?? [],
    todos: summary.todos,
    preview: summary.preview,
    resources,
  };
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
