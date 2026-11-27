"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import toast from "react-hot-toast";
import { BookOpen, FileText, HardDrive, Image as ImageIcon, LayoutGrid, Link2, List, Music, PlaySquare, Plus, Search, Star } from "lucide-react";
import { CreateCollectionModal } from "@/components/collections/create-collection-modal";
import { FilterField, FilterPopover } from "@/components/ui/filter-popover";
import { PageLoader } from "@/components/ui/page-loader";
import { useAppStore } from "@/hooks/useAppStore";
import { useCollections } from "@/hooks/useCollections";
import { useItems } from "@/hooks/useItems";
import { useSearch } from "@/hooks/useSearch";
import { filterEntries, libraryEntries, type FileKind, type LibraryEntry, type LibraryKind, type LibraryTab } from "@/lib/client/library-entries";
import { openItemPage } from "@/lib/client/open-item-page";
import { buildItemUpdatePayload } from "@/lib/utils/item-patch";
import { formatBytes } from "@/lib/utils/format-bytes";
import type { DashboardNav, ItemFilters, ItemRecord, ItemStatus } from "@/types";
import styles from "./library-screen.module.css";

const TABS: Array<{ key: LibraryTab; label: string; nav: DashboardNav }> = [
  { key: "all", label: "All", nav: "all" },
  { key: "pages", label: "Pages", nav: "type:note" },
  { key: "boards", label: "Boards", nav: "type:board" },
  { key: "files", label: "Files", nav: "type:file" },
  { key: "starred", label: "Starred", nav: "starred" },
];

const KINDS: Record<LibraryKind, { label: string; icon: typeof FileText }> = {
  page: { label: "Page", icon: FileText },
  board: { label: "Board", icon: LayoutGrid },
  pdf: { label: "PDF", icon: BookOpen },
  video: { label: "Video", icon: PlaySquare },
  link: { label: "Link", icon: Link2 },
  image: { label: "Image", icon: ImageIcon },
  audio: { label: "Audio", icon: Music },
};

const FILE_KINDS: FileKind[] = ["pdf", "video", "link", "image", "audio"];
const STATUS_LABELS: Record<ItemStatus, string> = { unread: "Unread", reading: "Reading", done: "Done" };
const SORTS: Array<{ key: NonNullable<ItemFilters["sort"]>; label: string }> = [
  { key: "newest", label: "Recently updated" },
  { key: "oldest", label: "Oldest first" },
  { key: "title", label: "A → Z" },
  { key: "status", label: "By status" },
];
const TYPE_NAVS: Partial<Record<DashboardNav, FileKind>> = { "type:pdf": "pdf", "type:video": "video", "type:article": "link", "type:image": "image", "type:audio": "audio" };

async function dataFetcher(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Not available");
  return json.data;
}

const shortDate = (value: string) => new Date(value).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

/** Everything the student has saved, in one list. */
export function LibraryScreen() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { filters, setFilter, setNav } = useAppStore();
  const query = useSearch(filters.q ?? "", 180);
  const { data: loadedItems, items, error: itemsError, mutate, updateItem } = useItems({});
  const pages = useSWR<Array<{ id: string; title: string; parentId: string | null; updatedAt: string }>>("/api/notes", dataFetcher);
  const boards = useSWR<Array<{ id: string; title: string; updatedAt: string }>>("/api/library/boards", dataFetcher);
  const files = useSWR<Array<{ ref: string; title: string; kind: FileKind; createdAt: string; usedIn: Array<{ type: "page" | "board"; id: string }> }>>("/api/library/files", dataFetcher);
  const storage = useSWR<{ usedBytes: number; limitBytes: number | null }>("/api/library/storage", dataFetcher);
  const { collections, createCollection } = useCollections();
  const [collectionOpen, setCollectionOpen] = useState(false);

  const nav = filters.nav ?? "all";
  const collectionId = nav.startsWith("collection:") ? nav.slice("collection:".length) : null;
  const collection = collections.find((entry) => entry.id === collectionId) ?? null;
  const fileKind = TYPE_NAVS[nav];
  const tab: LibraryTab = fileKind || nav === "type:file" ? "files" : (TABS.find((entry) => entry.nav === nav)?.key ?? "all");
  // The reading-status shortcuts of older links narrow the same status filter.
  const status = filters.status ?? (nav.startsWith("status:") ? (nav.slice("status:".length) as ItemStatus) : undefined);

  const entries = useMemo(
    () => libraryEntries({ items, pages: pages.data ?? [], boards: boards.data ?? [], files: files.data ?? [] }),
    [items, pages.data, boards.data, files.data],
  );
  const shown = useMemo(
    () =>
      filterEntries(entries, {
        tab,
        fileKind,
        collectionItemIds: collectionId ? (collection?.itemIds ?? []) : undefined,
        tag: filters.tag,
        status,
        query,
        sort: filters.sort,
      }),
    [entries, tab, fileKind, collectionId, collection, filters.tag, status, query, filters.sort],
  );
  const tags = useMemo(() => [...new Set(entries.flatMap((entry) => entry.tags))].sort((a, b) => a.localeCompare(b)), [entries]);

  const requestedCollection = searchParams.get("collection");
  useEffect(() => {
    if (requestedCollection) setNav(`collection:${requestedCollection}`);
  }, [requestedCollection, setNav]);

  const failed = !loadedItems && Boolean(itemsError);
  const loading = !loadedItems && !itemsError;
  const partFailed = Boolean(pages.error || boards.error || files.error);

  async function toggleStar(entry: LibraryEntry) {
    const item = items.find((candidate) => candidate.id === entry.itemId);
    if (!item) return;
    const change: Partial<ItemRecord> = { starred: !item.starred };
    await mutate((current) => current?.map((candidate) => (candidate.id === item.id ? { ...candidate, ...change } : candidate)) ?? [], { revalidate: false });
    try {
      await updateItem(item.id, buildItemUpdatePayload(item, change));
    } catch (error) {
      toast.error((error as Error).message);
      await mutate();
    }
  }

  function open(entry: LibraryEntry) {
    const item = entry.itemId ? items.find((candidate) => candidate.id === entry.itemId) : undefined;
    if (item) void openItemPage(item, router.push);
    else if (entry.href) router.push(entry.href);
    else toast("This file is not on a page or board yet.");
  }

  const used = storage.data?.usedBytes ?? 0;
  const limit = storage.data?.limitBytes ?? null;
  const grid = filters.view === "grid";
  const narrowed = Boolean(query || filters.tag || status || collectionId || tab !== "all");

  return (
    <div className={styles.library}>
      <header className={styles.header}>
        <div>
          <h1>Library</h1>
          <span>{loading ? "Loading…" : failed ? "Connecting…" : `${shown.length} ${shown.length === 1 ? "entry" : "entries"}`}</span>
        </div>
        <div className={styles.headerTools}>
          <label className={styles.search}>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="Search the library"
              placeholder="Search your library…"
              value={filters.q ?? ""}
              onChange={(event) => setFilter("q", event.target.value || undefined)}
            />
          </label>
          <FilterPopover
            active={[fileKind, collectionId, filters.tag, status].filter(Boolean).length}
            onClear={() => setNav(tab === "files" ? "type:file" : (TABS.find((entry) => entry.key === tab)?.nav ?? "all"))}
          >
            {tab === "files" ? (
              <FilterField label="File type">
                <select value={fileKind ?? ""} onChange={(event) => setNav((event.target.value ? `type:${event.target.value === "link" ? "article" : event.target.value}` : "type:file") as DashboardNav)}>
                  <option value="">All file types</option>
                  {FILE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>{KINDS[kind].label}</option>
                  ))}
                </select>
              </FilterField>
            ) : null}
            <FilterField label="Collection">
              <select value={collectionId ?? ""} onChange={(event) => setNav(event.target.value ? `collection:${event.target.value}` : "all")}>
                <option value="">All collections</option>
                {collections.map((entry) => (
                  <option key={entry.id} value={entry.id}>{entry.title} ({entry.itemCount})</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Tag">
              <select value={filters.tag ?? ""} onChange={(event) => setFilter("tag", event.target.value || undefined)}>
                <option value="">All tags</option>
                {tags.map((tag) => (
                  <option key={tag} value={tag}>#{tag}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Status">
              <select
                value={status ?? ""}
                onChange={(event) => {
                  if (nav.startsWith("status:")) setNav("all");
                  setFilter("status", (event.target.value || undefined) as ItemStatus | undefined);
                }}
              >
                <option value="">Any status</option>
                {(Object.keys(STATUS_LABELS) as ItemStatus[]).map((key) => (
                  <option key={key} value={key}>{STATUS_LABELS[key]}</option>
                ))}
              </select>
            </FilterField>
            <FilterField label="Sort by">
              <select value={filters.sort ?? "newest"} onChange={(event) => setFilter("sort", event.target.value as ItemFilters["sort"])}>
                {SORTS.map((entry) => (
                  <option key={entry.key} value={entry.key}>{entry.label}</option>
                ))}
              </select>
            </FilterField>
            <button type="button" className={styles.panelButton} onClick={() => setCollectionOpen(true)}>
              <Plus size={14} aria-hidden="true" /> New collection
            </button>
            <div className={styles.panelLinks}>
              <Link href="/library/collections">Collections</Link>
              <Link href="/library/tags">Tags</Link>
              <Link href="/library/files">Where files are used</Link>
            </div>
          </FilterPopover>
          <div className={styles.view} role="group" aria-label="Layout">
            <button type="button" aria-label="List" aria-pressed={!grid} className={!grid ? styles.on : undefined} onClick={() => setFilter("view", "list")}>
              <List size={15} aria-hidden="true" />
            </button>
            <button type="button" aria-label="Grid" aria-pressed={grid} className={grid ? styles.on : undefined} onClick={() => setFilter("view", "grid")}>
              <LayoutGrid size={15} aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <div className={styles.tabs} role="group" aria-label="Show">
        {TABS.map((entry) => (
          <button key={entry.key} type="button" aria-pressed={tab === entry.key} className={tab === entry.key ? styles.on : undefined} onClick={() => setNav(entry.nav)}>
            {entry.label}
          </button>
        ))}
        <Link href="/flashcards">Flashcards</Link>
      </div>

      <div className={styles.scroll}>
        {partFailed ? <p className={styles.notice} role="status">Some of your library could not be loaded, so this list may be incomplete.</p> : null}
        {failed ? (
          <div className={styles.empty} role="status">
            <strong>Still connecting…</strong>
            <span>Your library is taking longer than usual.</span>
            <button type="button" onClick={() => void mutate()}>Try again</button>
          </div>
        ) : loading ? (
          <PageLoader label="Opening your library" />
        ) : shown.length === 0 ? (
          <div className={styles.empty}>
            <strong>{narrowed ? "Nothing matches" : "Your library is empty"}</strong>
            <span>{narrowed ? "Try another tab, or clear the search and filters." : "Use New to start a page. Pages hold text, files, videos and links."}</span>
            {narrowed ? <button type="button" onClick={() => setNav("all")}>Show everything</button> : null}
          </div>
        ) : (
          <ul className={grid ? styles.grid : styles.list}>
            {shown.map((entry) => {
              const kind = KINDS[entry.kind];
              const Icon = kind.icon;
              return (
                <li key={entry.key}>
                  <button type="button" className={styles.open} onClick={() => open(entry)}>
                    <span className={`${styles.kind} ${styles[entry.kind]}`}>
                      <Icon size={12} aria-hidden="true" />
                      {kind.label}
                    </span>
                    <span className={styles.name}>
                      <span>{entry.title}</span>
                      {entry.tags.length ? <small>{entry.tags.map((tag) => `#${tag}`).join(" ")}</small> : null}
                    </span>
                    <span className={styles.state}>{entry.status ? STATUS_LABELS[entry.status] : ""}</span>
                    <span className={styles.date}>{shortDate(entry.updatedAt)}</span>
                  </button>
                  {entry.itemId ? (
                    <button
                      type="button"
                      className={`${styles.star}${entry.starred ? ` ${styles.starred}` : ""}`}
                      aria-label={entry.starred ? `Remove star from ${entry.title}` : `Star ${entry.title}`}
                      aria-pressed={entry.starred}
                      onClick={() => void toggleStar(entry)}
                    >
                      <Star size={15} aria-hidden="true" fill={entry.starred ? "currentColor" : "none"} />
                    </button>
                  ) : (
                    <span className={styles.starGap} />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className={styles.footer}>
        <Link href="/library/storage">
          <HardDrive size={14} aria-hidden="true" />
          Storage {storage.data ? (limit ? `${formatBytes(used)} / ${formatBytes(limit)}` : formatBytes(used)) : "…"}
        </Link>
      </footer>

      <CreateCollectionModal
        open={collectionOpen}
        items={items}
        initialSelectedIds={[]}
        onClose={() => setCollectionOpen(false)}
        onSave={async (payload) => {
          const result = await createCollection(payload);
          const created = Array.isArray(result) ? (result.find((entry) => !entry.id.startsWith("temp-")) ?? result[0]) : undefined;
          if (created) setNav(`collection:${created.id}`);
        }}
      />
    </div>
  );
}
