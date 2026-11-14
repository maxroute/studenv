import { prisma } from "@/lib/db/prisma";
import * as assetService from "./asset.service";
import * as workspaceService from "./workspace.service";
import { openNoteBoard } from "./board.service";
import { MediaAssetKind } from "@prisma/client";

export async function getOrCreateAssetForItem(itemId: string, userId: string) {
  // 1. Check if item already has a media asset
  const existingAsset = await assetService.getAssetByItem(itemId);

  if (existingAsset) {
    return existingAsset;
  }

  const item = await prisma.item.findUnique({
    where: { id: itemId },
  });

  if (!item) throw new Error("Item not found");

  // 2. Infer asset kind from item type
  let kind: MediaAssetKind = "webpage";
  if (item.type === "pdf") kind = "pdf";
  else if (item.type === "video") kind = "video";

  // 3. Create new MediaAsset
  const asset = await assetService.createAsset({
    ownerId: userId,
    title: item.title,
    kind,
    origin: "second_brain_item",
    sourceUrl: item.url || undefined,
    itemId: item.id,
  });

  return asset;
}

/**
 * The media asset behind one of the user's Shelf items (created on first use),
 * without opening a workspace. Used by notes to show and open the resource.
 */
export async function getAssetForOwnedItem(itemId: string, userId: string) {
  const item = await prisma.item.findFirst({ where: { id: itemId, userId }, select: { id: true } });
  if (!item) {
    const error = new Error("Item not found.");
    Object.assign(error, { status: 404 });
    throw error;
  }
  const asset = await getOrCreateAssetForItem(item.id, userId);
  return { assetId: asset.id, kind: asset.kind };
}

export async function openItemInWorkspace(itemId: string, userId: string) {
  console.log(`[ItemAssetService] Opening item ${itemId} for user ${userId}`);

  const item = await prisma.item.findFirst({
    where: {
      id: itemId,
      userId,
    },
  });

  if (!item) {
    throw new Error("Item not found");
  }

  // A note is not a web page: it opens on its own board as a note card.
  if (item.type === "note") {
    const note = await prisma.note.findFirst({ where: { itemId: item.id, ownerId: userId, deletedAt: null }, select: { id: true } });
    if (note) {
      const board = await openNoteBoard(userId, note.id);
      return { workspaceId: board.workspaceId, assetId: null, noteId: note.id };
    }
  }

  const asset = await getOrCreateAssetForItem(itemId, userId);
  console.log(`[ItemAssetService] Asset ready: ${asset.id}`);

  const workspaceDescription = `Auto-generated workspace for item:${item.id}`;
  
  // Keep a dedicated workspace per library item so opening one item does not
  // always drop the user back into a shared workspace with stale viewers.
  let workspace = await prisma.workspace.findFirst({
    where: {
      ownerId: userId,
      description: workspaceDescription,
    },
  });

  if (!workspace) {
    console.log(`[ItemAssetService] Creating item workspace for user ${userId}`);
    workspace = await workspaceService.createWorkspace({
      ownerId: userId,
      title: `${item.title} Workspace`,
      description: workspaceDescription,
      coverAssetId: asset.id,
    });
  } else if (workspace.coverAssetId !== asset.id) {
    workspace = await workspaceService.setWorkspaceCoverAsset(
      userId,
      workspace.id,
      asset.id,
    );
  }

  console.log(`[ItemAssetService] Workspace ready: ${workspace.id}`);
  return { workspaceId: workspace.id, assetId: asset.id, noteId: null };
}
