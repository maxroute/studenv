/** One list for the Library: saved items (pages included), other pages, boards and uploads. */
export type LibraryKind = "page" | "board" | "pdf" | "video" | "link" | "image" | "audio";
export type FileKind = Exclude<LibraryKind, "page" | "board">;
export type LibraryTab = "all" | "pages" | "boards" | "files" | "starred";
export type LibraryStatus = "unread" | "reading" | "done";
export type LibrarySort = "newest" | "oldest" | "title" | "status";

export type LibraryEntry = {
  /** `item:<id>`, `page:<id>`, `board:<id>` or `asset:<id>`. */
  key: string;
  kind: LibraryKind;
  title: string;
  excerpt: string;
  tags: string[];
  /** Only saved items carry a reading status and can be starred. */
  itemId: string | null;
  status: LibraryStatus | null;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
  /** Where it opens when it is not a saved item; null for an upload used nowhere yet. */
  href: string | null;
  /** The page behind this entry, for a page or a resource that has one. */
  noteId: string | null;
  /** Pages directly inside it. */
  subPages: number;
  /** For a sub-page found by searching: the page it is in. */
  parentTitle: string | null;
};

type ItemInput = {
  id: string;
  type: string;
  title: string;
  excerpt: string | null;
  noteId?: string | null;
  status: LibraryStatus;
  starred: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  tags: Array<{ name: string }>;
};
export type PageInput = { id: string; title: string; parentId: string | null; sortKey?: string; updatedAt: string };
type BoardInput = { id: string; title: string; updatedAt: string };
type FileInput = { ref: string; title: string; kind: FileKind; createdAt: string; usedIn: Array<{ type: "page" | "board"; id: string }> };

const iso = (value: string | Date) => (typeof value === "string" ? value : value.toISOString());

const itemKind = (type: string): LibraryKind => (type === "note" ? "page" : type === "pdf" ? "pdf" : type === "video" ? "video" : "link");

const plain = { excerpt: "", tags: [] as string[], itemId: null, status: null, starred: false, noteId: null, subPages: 0, parentTitle: null };

/** A page as a Library entry, for pages that aren't saved items. */
export function pageEntry(page: PageInput, subPages: number, parentTitle: string | null = null): LibraryEntry {
  return { ...plain, key: `page:${page.id}`, kind: "page", title: page.title || "Untitled", createdAt: page.updatedAt, updatedAt: page.updatedAt, href: `/notes/${page.id}`, noteId: page.id, subPages, parentTitle };
}

/** How many pages are directly inside each page. */
export function subPageCounts(pages: readonly PageInput[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const page of pages) if (page.parentId) counts.set(page.parentId, (counts.get(page.parentId) ?? 0) + 1);
  return counts;
}

export function libraryEntries(input: { items: ItemInput[]; pages: PageInput[]; boards: BoardInput[]; files: FileInput[] }): LibraryEntry[] {
  const counts = subPageCounts(input.pages);
  const entries: LibraryEntry[] = input.items.map((item) => ({
    key: `item:${item.id}`,
    kind: itemKind(item.type),
    title: item.title || "Untitled",
    excerpt: item.excerpt ?? "",
    tags: item.tags.map((tag) => tag.name),
    itemId: item.id,
    status: item.status,
    starred: item.starred,
    createdAt: iso(item.createdAt),
    updatedAt: iso(item.updatedAt),
    href: null,
    noteId: item.noteId ?? null,
    subPages: item.noteId ? (counts.get(item.noteId) ?? 0) : 0,
    parentTitle: null,
  }));

  // A page that is also a saved item is already listed. Pages inside other pages stay under their parent.
  const listedPages = new Set(input.items.map((item) => item.noteId).filter(Boolean));
  const pageIds = new Set(input.pages.map((page) => page.id));
  for (const page of input.pages) {
    // A page whose parent is gone is listed on its own, so it can't get lost.
    if ((page.parentId && pageIds.has(page.parentId)) || listedPages.has(page.id)) continue;
    entries.push(pageEntry(page, counts.get(page.id) ?? 0));
  }
  for (const board of input.boards) {
    entries.push({ ...plain, key: `board:${board.id}`, kind: "board", title: board.title || "Untitled board", createdAt: board.updatedAt, updatedAt: board.updatedAt, href: `/workspaces/${board.id}` });
  }
  // `item:` files are the saved items above; only uploads without an item are new.
  for (const file of input.files) {
    if (!file.ref.startsWith("asset:")) continue;
    const use = file.usedIn[0];
    entries.push({
      ...plain,
      key: file.ref,
      kind: file.kind,
      title: file.title || "Untitled",
      createdAt: file.createdAt,
      updatedAt: file.createdAt,
      href: use ? (use.type === "page" ? `/notes/${use.id}` : `/workspaces/${use.id}`) : null,
    });
  }
  return entries;
}

export const isFileKind = (kind: LibraryKind): kind is FileKind => kind !== "page" && kind !== "board";

export type LibraryFilter = {
  tab: LibraryTab;
  /** Narrows the Files tab. */
  fileKind?: FileKind;
  /** The saved items in the chosen collection. */
  collectionItemIds?: string[];
  tag?: string;
  status?: LibraryStatus;
  query?: string;
  sort?: LibrarySort;
};

const STATUS_ORDER: Record<LibraryStatus, number> = { unread: 0, reading: 1, done: 2 };
const time = (value: string) => new Date(value).getTime();

export function filterEntries(entries: LibraryEntry[], filter: LibraryFilter): LibraryEntry[] {
  const query = filter.query?.trim().toLowerCase();
  const collection = filter.collectionItemIds ? new Set(filter.collectionItemIds) : null;
  const shown = entries.filter((entry) => {
    // A PDF or video page with pages inside it belongs here too, or they couldn't be reached.
    if (filter.tab === "pages" && entry.kind !== "page" && entry.subPages === 0) return false;
    if (filter.tab === "boards" && entry.kind !== "board") return false;
    if (filter.tab === "files" && (!isFileKind(entry.kind) || (filter.fileKind && entry.kind !== filter.fileKind))) return false;
    if (filter.tab === "starred" && !entry.starred) return false;
    if (collection && !(entry.itemId && collection.has(entry.itemId))) return false;
    if (filter.tag && !entry.tags.includes(filter.tag)) return false;
    if (filter.status && entry.status !== filter.status) return false;
    if (query) {
      return [entry.title, entry.excerpt, ...entry.tags].some((text) => text.toLowerCase().includes(query));
    }
    return true;
  });
  const sort = filter.sort ?? "newest";
  return shown.sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "oldest") return time(a.createdAt) - time(b.createdAt);
    if (sort === "status") {
      const rank = (entry: LibraryEntry) => (entry.status ? STATUS_ORDER[entry.status] : 3);
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
    }
    return time(b.updatedAt) - time(a.updatedAt);
  });
}

/** The pages inside other pages, as entries: searching looks through these too. */
export function subPageEntries(pages: readonly PageInput[]): LibraryEntry[] {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const counts = subPageCounts(pages);
  return pages.flatMap((page) => {
    const parent = page.parentId ? byId.get(page.parentId) : undefined;
    return parent ? [pageEntry(page, counts.get(page.id) ?? 0, parent.title || "Untitled")] : [];
  });
}

export type LibraryRow = { entry: LibraryEntry; depth: number; open: boolean };

/**
 * The rows of the page tree: each listed entry in its order, followed (when it
 * is open) by the pages inside it, in the order the student arranged them.
 */
export function treeRows(shown: readonly LibraryEntry[], pages: readonly PageInput[], open: ReadonlySet<string>): LibraryRow[] {
  const children = new Map<string, PageInput[]>();
  for (const page of pages) {
    if (!page.parentId) continue;
    const list = children.get(page.parentId);
    if (list) list.push(page);
    else children.set(page.parentId, [page]);
  }
  for (const list of children.values()) list.sort((a, b) => ((a.sortKey ?? "") < (b.sortKey ?? "") ? -1 : (a.sortKey ?? "") > (b.sortKey ?? "") ? 1 : a.id.localeCompare(b.id)));

  const rows: LibraryRow[] = [];
  // A page is shown once, so a broken parent chain can't repeat forever.
  const seen = new Set<string>();
  const add = (entry: LibraryEntry, depth: number) => {
    const isOpen = entry.subPages > 0 && entry.noteId !== null && open.has(entry.noteId);
    rows.push({ entry, depth, open: isOpen });
    if (entry.noteId) seen.add(entry.noteId);
    if (!isOpen || !entry.noteId) return;
    for (const child of children.get(entry.noteId) ?? []) {
      if (!seen.has(child.id)) add(pageEntry(child, children.get(child.id)?.length ?? 0), depth + 1);
    }
  };
  for (const entry of shown) add(entry, 0);
  return rows;
}
