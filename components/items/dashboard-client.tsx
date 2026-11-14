"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ChevronDown } from "lucide-react";
import { ItemGrid } from "@/components/items/item-grid";
import { openItemPage } from "@/lib/client/open-item-page";

import { useAppStore } from "@/hooks/useAppStore";
import { useCollections } from "@/hooks/useCollections";
import { useItem, useItems } from "@/hooks/useItems";
import { useSearch } from "@/hooks/useSearch";
import { buildItemUpdatePayload } from "@/lib/utils/item-patch";
import type { ItemFilters, ItemRecord, ItemStatus } from "@/types";


const filterChips: Array<{ key?: ItemStatus; label: string }> = [
  { key: undefined, label: "All" },
  { key: "unread", label: "Unread" },
  { key: "reading", label: "Reading" },
  { key: "done", label: "Done" },
];

const sortOptions: Array<{
  key: NonNullable<ItemFilters["sort"]>;
  label: string;
}> = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "title", label: "A → Z" },
  { key: "status", label: "By status" },
];

const statusOrder: Record<ItemStatus, number> = {
  unread: 0,
  reading: 1,
  done: 2,
};

export function DashboardClient() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sortRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const {
    filters,
    selectedId,
    setSelectedId,
    setFilter,
    setNav,
  } = useAppStore();
  const debouncedQuery = useSearch(filters.q ?? "", 180);
  const { data: loadedItems, items, isLoading, mutate, updateItem } = useItems({});
  const { collections } = useCollections();
  const activeCollectionId = filters.nav?.startsWith("collection:")
    ? filters.nav.slice("collection:".length)
    : null;
  const selectedCollection = useMemo(
    () =>
      activeCollectionId
        ? (collections.find(
            (collection) => collection.id === activeCollectionId,
          ) ?? null)
        : null,
    [activeCollectionId, collections],
  );
  const requestedCollectionId = searchParams.get("collection");

  const visibleItems = useMemo(() => {
    let nextItems = [...items];

    switch (filters.nav) {
      case undefined:
      case "all":
        break;
      case "starred":
        nextItems = nextItems.filter((item) => item.starred);
        break;
      case "recent":
        nextItems = nextItems
          .sort(
            (a, b) =>
              new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
          )
          .slice(0, 10);
        break;
      case "type:pdf":
      case "type:article":
      case "type:video":
      case "type:note":
        nextItems = nextItems.filter(
          (item) => item.type === filters.nav?.slice(5),
        );
        break;
      case "status:unread":
      case "status:reading":
      case "status:done":
        nextItems = nextItems.filter(
          (item) => item.status === filters.nav?.slice(7),
        );
        break;
      default:
        if (filters.nav?.startsWith("collection:")) {
          const itemIds = new Set(selectedCollection?.itemIds ?? []);
          nextItems = nextItems.filter((item) => itemIds.has(item.id));
        }
        break;
    }

    if (filters.tag) {
      nextItems = nextItems.filter((item) =>
        item.tags.some((tag) => tag.name === filters.tag),
      );
    }

    if (filters.status) {
      nextItems = nextItems.filter((item) => item.status === filters.status);
    }

    if (debouncedQuery) {
      const query = debouncedQuery.toLowerCase();
      nextItems = nextItems.filter((item) => {
        const title = item.title.toLowerCase();
        const excerpt = (item.excerpt ?? "").toLowerCase();
        const tags = item.tags.some((tag) =>
          tag.name.toLowerCase().includes(query),
        );
        return title.includes(query) || excerpt.includes(query) || tags;
      });
    }

    if (filters.sort === "oldest") {
      nextItems.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      );
    } else if (filters.sort === "title") {
      nextItems.sort((a, b) => a.title.localeCompare(b.title));
    } else if (filters.sort === "status") {
      nextItems.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    } else {
      nextItems.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    }

    return nextItems;
  }, [
    debouncedQuery,
    filters.nav,
    filters.sort,
    filters.status,
    filters.tag,
    items,
    selectedCollection,
  ]);

  const selectedItem = useMemo(
    () => visibleItems.find((item) => item.id === selectedId) ?? null,
    [selectedId, visibleItems],
  );
  // The full record of the selected item (list rows shorten `excerpt`), kept in step by patchItem.
  const { item: selectedDetail, mutate: mutateSelectedDetail } = useItem(
    selectedItem?.id ?? null,
  );
  const activeStatusLabel =
    filterChips.find((chip) => chip.key === filters.status)?.label ?? "All";

  const titleContent = useMemo<ReactNode>(() => {
    if (filters.tag) {
      return (
        <>
          Tag: <em>{filters.tag}</em>
        </>
      );
    }

    if (debouncedQuery) {
      return (
        <>
          Results for <em>"{debouncedQuery}"</em>
        </>
      );
    }

    switch (filters.nav) {
      case "starred":
        return (
          <>
            Starred <em>Items</em>
          </>
        );
      case "recent":
        return (
          <>
            Recent <em>Items</em>
          </>
        );
      case "type:pdf":
        return <em>PDFs</em>;
      case "type:article":
        return <em>Links</em>;
      case "type:video":
        return <em>Videos</em>;
      case "type:note":
        return <em>Pages</em>;
      case "status:unread":
        return (
          <>
            Unread <em>Items</em>
          </>
        );
      case "status:reading":
        return (
          <>
            In <em>Progress</em>
          </>
        );
      case "status:done":
        return <em>Done</em>;
      default:
        if (filters.nav?.startsWith("collection:")) {
          return (
            <>
              Collection: <em>{selectedCollection?.title ?? "Untitled"}</em>
            </>
          );
        }

        return (
          <>
            All <em>Items</em>
          </>
        );
    }
  }, [debouncedQuery, filters.nav, filters.tag, selectedCollection?.title]);

  useEffect(() => {
    if (!requestedCollectionId) {
      return;
    }

    setNav(`collection:${requestedCollectionId}`);
  }, [requestedCollectionId, setNav]);

  useEffect(() => {
    // Until the first list arrives there are no visible items yet; resetting
    // here would drop a selection made from the URL (/shelf/[id]).
    if (!loadedItems) return;

    if (!visibleItems.length) {
      if (selectedId) {
        setSelectedId(null);
      }
      return;
    }

    if (!selectedId || !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(visibleItems[0].id);
    }
  }, [loadedItems, selectedId, setSelectedId, visibleItems]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!sortRef.current?.contains(event.target as Node)) {
        setSortOpen(false);
      }

      if (!statusRef.current?.contains(event.target as Node)) {
        setStatusOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSortOpen(false);
        setStatusOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function patchItem(item: ItemRecord, payload: Partial<ItemRecord>) {
    const body = buildItemUpdatePayload(item, payload);

    if (Object.keys(body).length === 0) {
      return true;
    }

    const isSelectedDetail = selectedDetail?.id === item.id;

    if (isSelectedDetail) {
      await mutateSelectedDetail(
        (current) => (current ? ({ ...current, ...payload } as ItemRecord) : current),
        { revalidate: false },
      );
    }

    await mutate(
      (current) =>
        current?.map((entry) =>
          entry.id === item.id
            ? ({ ...entry, ...payload } as ItemRecord)
            : entry,
        ) ?? [],
      { revalidate: false },
    );

    try {
      await updateItem(item.id, body);
      if (isSelectedDetail) {
        void mutateSelectedDetail();
      }
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      await mutate();
      if (isSelectedDetail) {
        void mutateSelectedDetail();
      }
      return false;
    }
  }

  return (
    <>
      <div className="dashboard-shell dashboard-shell-full">
        <main className="main">
          <div className="main-header">
            <div className="main-title-row">
              <div className="main-title">{titleContent}</div>
              <span className="item-count">
                {isLoading
                  ? "Loading..."
                  : `${visibleItems.length} ${visibleItems.length === 1 ? "entry" : "entries"}`}
              </span>
            </div>

            <div className="filter-row">
              <div className="status-chip-group">
                {filterChips.map((chip) => (
                  <button
                    className={`filter-chip ${filters.status === chip.key || (!filters.status && chip.key === undefined) ? "on" : ""}`}
                    key={chip.label}
                    type="button"
                    onClick={() => setFilter("status", chip.key)}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              <div className="mobile-status-wrap" ref={statusRef}>
                <button
                  aria-expanded={statusOpen}
                  aria-haspopup="menu"
                  className="mobile-status-trigger"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setStatusOpen((value) => !value);
                  }}
                >
                  <span>{activeStatusLabel}</span>
                  <ChevronDown className={statusOpen ? "open" : ""} size={15} />
                </button>
                <div
                  className={`mobile-status-menu ${statusOpen ? "open" : ""}`}
                  role="menu"
                >
                  {filterChips.map((chip) => (
                    <button
                      className={`mobile-status-option ${filters.status === chip.key || (!filters.status && chip.key === undefined) ? "active" : ""}`}
                      key={chip.label}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setFilter("status", chip.key);
                        setStatusOpen(false);
                      }}
                    >
                      {chip.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="sort-wrap" ref={sortRef}>
                <button
                  className="filter-chip"
                  id="sortBtn"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSortOpen((value) => !value);
                  }}
                >
                  Sort ↕
                </button>
                <div className={`sort-dropdown ${sortOpen ? "open" : ""}`}>
                  {sortOptions.map((option) => (
                    <button
                      className={`sort-option ${(filters.sort ?? "newest") === option.key ? "active" : ""}`}
                      key={option.key}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setFilter("sort", option.key);
                        setSortOpen(false);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="view-toggle">
                <button
                  className={`view-btn ${filters.view !== "list" ? "on" : ""}`}
                  title="Grid"
                  type="button"
                  onClick={() => setFilter("view", "grid")}
                >
                  ⊞
                </button>
                <button
                  className={`view-btn ${filters.view === "list" ? "on" : ""}`}
                  title="List"
                  type="button"
                  onClick={() => setFilter("view", "list")}
                >
                  ≡
                </button>
              </div>
            </div>
          </div>

          <ItemGrid
            items={visibleItems}
            selectedId={selectedId}
            view={filters.view ?? "grid"}
            isLoading={isLoading}
            onSelect={(id) => {
              // Every item opens as a page; its details (status, tags, collections) live there.
              const picked = items.find((entry) => entry.id === id);
              if (picked) void openItemPage(picked, router.push);
            }}
            onToggleStar={(item) => patchItem(item, { starred: !item.starred })}
          />
        </main>
      </div>

    </>
  );
}
