"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Home, X } from "lucide-react";
import { CreateCollectionModal } from "@/components/collections/create-collection-modal";
import { useAppStore } from "@/hooks/useAppStore";
import { useCollections } from "@/hooks/useCollections";
import { useItems } from "@/hooks/useItems";
import type { DashboardNav } from "@/types";

const tagPalette = [
  "#e05a4b",
  "#4abfb5",
  "#9b7fe8",
  "#5abf7a",
  "#f5a623",
  "#6ba3e0",
  "#e07bb5",
  "#c4b454",
];

function navIcon(nav: DashboardNav) {
  if (nav.startsWith("collection:")) {
    return <span className="nav-icon">#</span>;
  }

  switch (nav) {
    case "all":
      return <span className="nav-icon">◈</span>;
    case "starred":
      return <span className="nav-icon">★</span>;
    case "recent":
      return <span className="nav-icon">◷</span>;
    case "type:pdf":
      return (
        <span className="nav-icon" style={{ color: "var(--red)" }}>
          ⬡
        </span>
      );
    case "type:article":
      return (
        <span className="nav-icon" style={{ color: "var(--teal)" }}>
          ⬡
        </span>
      );
    case "type:video":
      return (
        <span className="nav-icon" style={{ color: "var(--purple)" }}>
          ⬡
        </span>
      );
    case "type:note":
      return (
        <span className="nav-icon" style={{ color: "var(--amber)" }}>
          ⬡
        </span>
      );
    case "status:unread":
      return <span className="nav-icon">○</span>;
    case "status:reading":
      return (
        <span className="nav-icon" style={{ color: "var(--amber)" }}>
          ◐
        </span>
      );
    case "status:done":
      return (
        <span className="nav-icon" style={{ color: "var(--green)" }}>
          ●
        </span>
      );
    default:
      return null;
  }
}

type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [openingWorkspace, setOpeningWorkspace] = useState(false);
  const { items } = useItems({});
  const { collections, createCollection } = useCollections();
  const { filters, selectedId, setNav, toggleTag, setSelectedId } = useAppStore();
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) ?? null,
    [items, selectedId],
  );

  // Prefetch main routes on sidebar mount to make navigation instant
  useEffect(() => {
    router.prefetch("/dashboard");
    router.prefetch("/shelf");
    router.prefetch("/workspaces");
  }, [router]);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    items.forEach((item) => {
      item.tags.forEach((tag) => {
        counts.set(tag.name, (counts.get(tag.name) ?? 0) + 1);
      });
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], index) => ({
        name,
        count,
        color: tagPalette[index % tagPalette.length],
      }));
  }, [items]);

  const counts = {
    all: items.length,
    starred: items.filter((item) => item.starred).length,
    pdf: items.filter((item) => item.type === "pdf").length,
    article: items.filter((item) => item.type === "article").length,
    video: items.filter((item) => item.type === "video").length,
    note: items.filter((item) => item.type === "note").length,
    unread: items.filter((item) => item.status === "unread").length,
    reading: items.filter((item) => item.status === "reading").length,
    done: items.filter((item) => item.status === "done").length,
  };

  function goShelf() {
    if (pathname !== "/shelf") {
      router.push("/shelf");
    }
  }

  async function openWorkspaceFromSidebar() {
    if (openingWorkspace) {
      return;
    }

    if (!selectedItem) {
      router.push("/workspaces");
      return;
    }

    setOpeningWorkspace(true);
    router.push(`/workspaces/open?itemId=${selectedItem.id}`);
  }

  function renderNavItem(
    nav: DashboardNav | "workspace",
    label: string,
    count?: number,
    icon?: React.ReactNode,
  ) {
    const isActive = nav === "workspace" 
      ? pathname.startsWith("/workspaces") 
      : filters.nav === nav && !filters.tag;

    return (
      <button
        className={`nav-item ${isActive ? "active" : ""}`}
        key={nav}
        type="button"
        onClick={async () => {
          if (nav === "workspace") {
            await openWorkspaceFromSidebar();
          } else {
            goShelf();
            setNav(nav);
          }
          onClose?.();
        }}
      >
        {icon || (nav !== "workspace" && navIcon(nav as DashboardNav))}
        {nav === "workspace" && openingWorkspace ? "Opening..." : label}
        {count === undefined ? null : <span className="nav-count">{count}</span>}
      </button>
    );
  }

  return (
    <>
      <button
        aria-label="Close navigation"
        className={`sidebar-backdrop${open ? " open" : ""}`}
        type="button"
        onClick={onClose}
      />
      <aside className={`sidebar${open ? " mobile-open" : ""}`}>
        <div className="sidebar-mobile-head">
          <span>Navigation</span>
          <div className="sidebar-mobile-actions">
            <button
              aria-label="Home"
              className="sidebar-close-btn sidebar-home-btn"
              title="Home"
              type="button"
              onClick={() => {
                router.push("/dashboard");
                onClose?.();
              }}
            >
              <Home size={17} />
            </button>
            <button
              aria-label="Close navigation"
              className="sidebar-close-btn"
              title="Close"
              type="button"
              onClick={onClose}
            >
              <X size={17} />
            </button>
          </div>
        </div>
        <div className="sidebar-section">
          <div className="sidebar-label">Library</div>
          {renderNavItem("all", "All Items", counts.all)}
          {renderNavItem("starred", "Starred", counts.starred)}
          {renderNavItem("recent", "Recent")}
        </div>

        <hr className="divider" />

        <div className="sidebar-section">
          <div className="sidebar-label">Notes</div>
          <button
            className={`nav-item ${pathname.startsWith("/notes") ? "active" : ""}`}
            type="button"
            onClick={() => {
              router.push("/notes");
              onClose?.();
            }}
          >
            <span className="nav-icon">✎</span>
            Pages
          </button>
          <button
            className={`nav-item ${pathname.startsWith("/flashcards") ? "active" : ""}`}
            type="button"
            onClick={() => {
              router.push("/flashcards");
              onClose?.();
            }}
          >
            <span className="nav-icon">❏</span>
            Flashcards
          </button>
        </div>

        <hr className="divider" />

        <div className="sidebar-section">
          <div className="sidebar-label">Workspaces</div>
          {renderNavItem("workspace", "Spatial Studio", undefined, <span className="nav-icon">⬚</span>)}
        </div>

        <hr className="divider" />

        <div className="sidebar-section">
          <div className="sidebar-label-row">
            <div className="sidebar-label">Collections</div>
            <button
              className="sidebar-inline-action"
              type="button"
              onClick={() => setCollectionOpen(true)}
            >
              + New
            </button>
          </div>

          {collections.length ? (
            collections.map((collection) =>
              renderNavItem(
                `collection:${collection.id}`,
                collection.title,
                collection.itemCount,
              ),
            )
          ) : (
            <div className="sidebar-empty-copy">
              Group articles, videos, notes, or PDFs into focused collections.
            </div>
          )}
        </div>

        <hr className="divider" />

        <div className="sidebar-section">
          <div className="sidebar-label">Type</div>
          {renderNavItem("type:pdf", "PDFs", counts.pdf)}
          {renderNavItem("type:article", "Articles", counts.article)}
          {renderNavItem("type:video", "Videos", counts.video)}
          {renderNavItem("type:note", "Notes", counts.note)}
        </div>

        <hr className="divider" />

        <div className="sidebar-section">
          <div className="sidebar-label">Status</div>
          {renderNavItem("status:unread", "Unread", counts.unread)}
          {renderNavItem("status:reading", "In Progress", counts.reading)}
          {renderNavItem("status:done", "Done", counts.done)}
        </div>

        <hr className="divider" />

        <div className="sidebar-section sidebar-tags">
          <div className="sidebar-label">Tags</div>
          <div className="tag-list">
            {tags.map((tag) => (
              <button
                className={`tag-item ${filters.tag === tag.name ? "active" : ""}`}
                key={tag.name}
                type="button"
                onClick={() => {
                  goShelf();
                  toggleTag(tag.name);
                  onClose?.();
                }}
              >
                <span className="tag-dot" style={{ background: tag.color }} />
                {tag.name}
                <span className="tag-count">{tag.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="storage-bar-wrap">
          <div className="storage-label">
            <span>Storage</span>
            <span>3.8 GB / 10 GB</span>
          </div>
          <div className="storage-bar">
            <div className="storage-fill" style={{ width: "38%" }} />
          </div>
        </div>
      </aside>

      <CreateCollectionModal
        open={collectionOpen}
        items={items}
        initialSelectedIds={selectedId ? [selectedId] : []}
        onClose={() => setCollectionOpen(false)}
        onSave={async (payload) => {
          const result = await createCollection(payload);
          const created = Array.isArray(result) ? result.find((c) => !c.id.startsWith("temp-")) ?? result[0] : undefined;
          if (created) {
            goShelf();
            setNav(`collection:${created.id}`);
            setSelectedId(created.itemIds[0] ?? null);
          }
        }}
      />
    </>
  );
}
