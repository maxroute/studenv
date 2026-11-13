"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { ChevronDown } from "lucide-react";
import dynamic from "next/dynamic";
import { ItemGrid } from "@/components/items/item-grid";

import { Modal } from "@/components/ui/modal";
import { useAppStore } from "@/hooks/useAppStore";
import { useCollections } from "@/hooks/useCollections";
import { useItem, useItems } from "@/hooks/useItems";
import { usePlaybackStore } from "@/hooks/usePlaybackStore";
import { useSearch } from "@/hooks/useSearch";
import { buildItemUpdatePayload } from "@/lib/utils/item-patch";
import { isYouTubeUrl } from "@/lib/utils/youtube";
import type { ItemFilters, ItemRecord, ItemStatus } from "@/types";

const AddItemModal = dynamic(() =>
  import("@/components/items/add-item-modal").then((mod) => mod.AddItemModal),
);
const DetailPanel = dynamic(() =>
  import("@/components/layout/detail-panel").then((mod) => mod.DetailPanel),
);

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
  const sortRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const [sortOpen, setSortOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [detailDrawerOpen, setDetailDrawerOpen] = useState(false);
  const openPlayer = usePlaybackStore((state) => state.openPlayer);
  const {
    filters,
    selectedId,
    addOpen,
    confirmDeleteOpen,
    setSelectedId,
    setAddOpen,
    setConfirmDeleteOpen,
    setFilter,
    setNav,
  } = useAppStore();
  const debouncedQuery = useSearch(filters.q ?? "", 180);
  const { items, isLoading, mutate, createItem, updateItem, deleteItem } =
    useItems({});
  const {
    collections,
    mutate: mutateCollections,
    updateCollection,
  } = useCollections();
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
  // List rows leave out `notes` and shorten `excerpt`; the detail panel needs
  // the full record before it can show or save notes.
  const { item: selectedDetail, mutate: mutateSelectedDetail } = useItem(
    selectedItem?.id ?? null,
  );
  const selectedDetailItem = useMemo<ItemRecord | null>(
    () =>
      selectedItem && selectedDetail?.id === selectedItem.id
        ? { ...selectedItem, notes: selectedDetail.notes, excerpt: selectedDetail.excerpt }
        : selectedItem,
    [selectedDetail, selectedItem],
  );
  const selectedNotesLoaded = Boolean(
    selectedItem && selectedDetail?.id === selectedItem.id,
  );
  const canPlaySelectedInApp = Boolean(
    selectedItem?.type === "video" && isYouTubeUrl(selectedItem.url),
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
        return <em>Articles</em>;
      case "type:video":
        return <em>Videos</em>;
      case "type:note":
        return <em>Notes</em>;
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
    if (!visibleItems.length) {
      if (selectedId) {
        setSelectedId(null);
      }
      return;
    }

    if (!selectedId || !visibleItems.some((item) => item.id === selectedId)) {
      setSelectedId(visibleItems[0].id);
    }
  }, [selectedId, setSelectedId, visibleItems]);

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

  async function toggleCollectionMembership(
    item: ItemRecord,
    collectionId: string,
  ) {
    const collection = collections.find((entry) => entry.id === collectionId);

    if (!collection) {
      return;
    }

    const nextItemIds = collection.itemIds.includes(item.id)
      ? collection.itemIds.filter((entry) => entry !== item.id)
      : [...collection.itemIds, item.id];

    try {
      await updateCollection(collectionId, { itemIds: nextItemIds });
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  function handleOpenSource(item: ItemRecord) {
    if (item.type === "video" && isYouTubeUrl(item.url)) {
      openPlayer(item.id);
      return;
    }

    if (item.url) {
      window.open(item.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <>
      <div
        className={`dashboard-shell${selectedItem && detailDrawerOpen ? " detail-drawer-open" : ""}`}
      >
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
              setSelectedId(id);
              setDetailDrawerOpen(true);
            }}
            onToggleStar={(item) => patchItem(item, { starred: !item.starred })}
          />
        </main>

        <button
          aria-label="Close details"
          className="detail-drawer-backdrop"
          type="button"
          onClick={() => setDetailDrawerOpen(false)}
        />

        <DetailPanel
          item={selectedDetailItem}
          notesLoaded={selectedNotesLoaded}
          collections={collections}
          onClose={() => setDetailDrawerOpen(false)}
          onDelete={() => setConfirmDeleteOpen(true)}
          onOpenSource={() => {
            if (!selectedItem) {
              return;
            }

            handleOpenSource(selectedItem);
          }}
          openSourceLabel={canPlaySelectedInApp ? "Play in App" : "Open Source"}
          onToggleCollection={(collection) => {
            if (!selectedItem) {
              return;
            }

            void toggleCollectionMembership(selectedItem, collection.id);
          }}
          onUpdate={(payload) => {
            if (!selectedDetailItem) return Promise.resolve(false);
            return patchItem(selectedDetailItem, payload);
          }}
        />
      </div>

      <AddItemModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSave={async (payload) => {
          const createdItems = await createItem(payload);
          const created = createdItems?.[0] ?? null;
          if (!created) {
            return;
          }

          if (selectedCollection) {
            try {
              await updateCollection(selectedCollection.id, {
                itemIds: [...selectedCollection.itemIds, created.id],
              });
              setNav(`collection:${selectedCollection.id}`);
            } catch (error) {
              toast.error((error as Error).message);
              setNav("all");
            }
          } else {
            setNav("all");
          }

          setSelectedId(created.id);
        }}
      />

      <Modal
        open={confirmDeleteOpen}
        onClose={() => setConfirmDeleteOpen(false)}
        title="Delete Item"
        width="sm"
        footer={
          <>
            <button
              className="btn-cancel"
              type="button"
              onClick={() => setConfirmDeleteOpen(false)}
            >
              Cancel
            </button>
            <button
              className="btn-del-confirm"
              type="button"
              onClick={async () => {
                if (!selectedItem) return;
                await deleteItem(selectedItem.id);
                await mutateCollections();
                setConfirmDeleteOpen(false);
                setSelectedId(null);
                toast.success("Item deleted.");
              }}
            >
              Delete
            </button>
          </>
        }
      >
        <p className="confirm-text">
          Are you sure you want to delete{" "}
          <strong>
            "
            {selectedItem?.title
              ? `${selectedItem.title.slice(0, 40)}${selectedItem.title.length > 40 ? "…" : ""}`
              : "this item"}
            "
          </strong>
          ? This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
