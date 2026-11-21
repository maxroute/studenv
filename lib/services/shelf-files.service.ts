import type { Plan } from "@prisma/client";
import { shelfTypeForFile, toShelfFile, type ShelfFile } from "@/lib/library/shelf-files";

export type ShelfFilesDeps = {
  listFilesWithoutItem: (ownerId: string) => Promise<Array<{ id: string; title: string; kind: string; sourceHost: string | null; sourceUrl: string | null; createdAt: Date }>>;
  findOwnedFile: (ownerId: string, assetId: string) => Promise<{ id: string; title: string; kind: string; sourceUrl: string | null; itemId: string | null } | null>;
  /** Creates a Shelf item as the Shelf does (free-plan limit and audit included). */
  createItem: (ownerId: string, plan: Plan, input: { type: "pdf" | "video" | "article"; title: string; url?: string }) => Promise<{ id: string }>;
  linkFileToItem: (ownerId: string, assetId: string, itemId: string) => Promise<boolean>;
  deleteItem: (ownerId: string, itemId: string) => Promise<void>;
};

const notFound = () => Object.assign(new Error("That file wasn't found."), { status: 404 });

export function createShelfFilesService(deps: ShelfFilesDeps) {
  /** The user's vault files that aren't on the Shelf yet. */
  async function listFiles(ownerId: string): Promise<ShelfFile[]> {
    return (await deps.listFilesWithoutItem(ownerId)).flatMap((asset) => {
      const file = toShelfFile(asset);
      return file ? [file] : [];
    });
  }

  /**
   * The Shelf item for one of the user's files, created the first time: the
   * same file, now with stars, tags and collections. Images and audio have no
   * Shelf type and are refused.
   */
  async function shelve(ownerId: string, plan: Plan, assetId: string): Promise<{ itemId: string }> {
    const file = await deps.findOwnedFile(ownerId, assetId);
    if (!file) throw notFound();
    if (file.itemId) return { itemId: file.itemId };
    const type = shelfTypeForFile(file.kind);
    if (!type) throw Object.assign(new Error("Pictures and audio stay in the vault; they can't go on the Shelf."), { status: 400 });
    const item = await deps.createItem(ownerId, plan, { type, title: file.title.trim() || "Untitled", ...(file.sourceUrl ? { url: file.sourceUrl } : {}) });
    if (await deps.linkFileToItem(ownerId, assetId, item.id)) return { itemId: item.id };
    // Another request linked it first (a double tap): keep that one, drop ours.
    await deps.deleteItem(ownerId, item.id);
    const linked = await deps.findOwnedFile(ownerId, assetId);
    if (!linked?.itemId) throw notFound();
    return { itemId: linked.itemId };
  }

  return { listFiles, shelve };
}
