// ---------------------------------------------------------------------------
// The vault shows Shelf items too
// ---------------------------------------------------------------------------
//
// Pure. The Shelf lists items (`Item`); the vault lists files (`MediaAsset`).
// A link added on the Shelf has no file until it is first opened on a board
// or in a page, so the vault lists those items as well; adding one to a board
// makes its file (as opening it does already).

import type { ItemType } from "@prisma/client";

/** A Shelf item as the vault lists it, before it has a file. Pages are listed by the vault separately. */
export type VaultShelfItem = { id: string; title: string; type: Exclude<ItemType, "note">; sourceHost: string | null };

/**
 * Shelf items without a file, as the vault shows them. Pages (notes) are
 * left out: the vault lists pages from Notes already.
 */
export function shelfItemsWithoutFile(
  items: ReadonlyArray<{ id: string; title: string; type: string; sourceHost: string | null }>,
  fileItemIds: ReadonlySet<string>,
): VaultShelfItem[] {
  return items.flatMap((item) =>
    item.type !== "note" && !fileItemIds.has(item.id) && (item.type === "pdf" || item.type === "video" || item.type === "article")
      ? [{ id: item.id, title: item.title.trim() || "Untitled", type: item.type, sourceHost: item.sourceHost }]
      : [],
  );
}
