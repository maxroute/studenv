// ---------------------------------------------------------------------------
// One library: Shelf items and vault files, shown in both places
// ---------------------------------------------------------------------------
//
// Pure. The Shelf lists items (`Item`); the vault lists files (`MediaAsset`).
// A file uploaded from a page or the vault, or saved by Rangan, has no Shelf
// item; a link added on the Shelf has no file until it is first opened on a
// board or in a page. Each place now also shows the other's entries. A file
// gets its Shelf item the first time it is opened from the Shelf (then it has
// stars, tags and collections); a Shelf item gets its file the first time it
// is added to a board (as opening it does already).

import type { ItemType } from "@prisma/client";

/** File kinds the Shelf shows. Snapshots are board exports, not library material. */
export const SHELF_FILE_KINDS = ["pdf", "video", "webpage", "image", "audio"] as const;
export type ShelfFileKind = (typeof SHELF_FILE_KINDS)[number];

/** The Shelf item type a file becomes, or null for kinds the Shelf has no type for (images, audio). */
export function shelfTypeForFile(kind: string): Exclude<ItemType, "note"> | null {
  switch (kind) {
    case "pdf":
      return "pdf";
    case "video":
      return "video";
    case "webpage":
      return "article";
    default:
      return null;
  }
}

/** A vault file as the Shelf lists it. */
export type ShelfFile = {
  id: string;
  title: string;
  kind: ShelfFileKind;
  sourceHost: string | null;
  sourceUrl: string | null;
  createdAt: string;
  /** True when opening it from the Shelf gives it a Shelf item (PDFs, videos, links). */
  shelvable: boolean;
};

export function toShelfFile(asset: { id: string; title: string; kind: string; sourceHost: string | null; sourceUrl: string | null; createdAt: Date }): ShelfFile | null {
  if (!(SHELF_FILE_KINDS as readonly string[]).includes(asset.kind)) return null;
  return {
    id: asset.id,
    title: asset.title.trim() || "Untitled",
    kind: asset.kind as ShelfFileKind,
    sourceHost: asset.sourceHost,
    sourceUrl: asset.sourceUrl,
    createdAt: asset.createdAt.toISOString(),
    shelvable: shelfTypeForFile(asset.kind) !== null,
  };
}

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

/** Which Shelf type filter a file kind answers to. */
const FILTER_KIND: Record<string, ShelfFileKind | null> = { "type:pdf": "pdf", "type:video": "video", "type:article": "webpage", "type:note": null };

/**
 * The files the Shelf shows under its current filters. Files have no status,
 * tags, star or collection yet, so those filters show none; the type filters
 * and the search apply as they do to items.
 */
export function visibleShelfFiles(
  files: readonly ShelfFile[],
  filters: { nav?: string; tag?: string; status?: string; query?: string },
): ShelfFile[] {
  if (filters.tag || filters.status) return [];
  const nav = filters.nav ?? "all";
  let shown: ShelfFile[];
  if (nav === "all" || nav === "recent") shown = [...files];
  else if (nav in FILTER_KIND) {
    const kind = FILTER_KIND[nav];
    shown = kind ? files.filter((file) => file.kind === kind) : [];
  } else shown = [];
  const query = filters.query?.trim().toLowerCase();
  if (query) shown = shown.filter((file) => file.title.toLowerCase().includes(query) || (file.sourceHost ?? "").toLowerCase().includes(query));
  return nav === "recent" ? shown.slice(0, 10) : shown;
}
