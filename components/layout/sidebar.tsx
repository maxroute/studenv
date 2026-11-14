"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import useSWR from "swr";
import { Home, X } from "lucide-react";
import { CreateCollectionModal } from "@/components/collections/create-collection-modal";
import { useAppStore } from "@/hooks/useAppStore";
import { useCollections } from "@/hooks/useCollections";
import { useItems } from "@/hooks/useItems";
import type { DashboardNav } from "@/types";
import { formatBytes } from "@/lib/utils/format-bytes";

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

/** Rows per section; the heading (or "+ N more") opens the full list. */
const SECTION_LIMIT = 10;

const FILE_KINDS = [
  { key: "pdf", label: "PDFs", color: "var(--red)" },
  { key: "video", label: "Videos", color: "var(--purple)" },
  { key: "link", label: "Links", color: "var(--teal)" },
  { key: "image", label: "Images", color: "var(--green)" },
] as const;

type SidebarPage = { id: string; title: string; parentId: string | null; updatedAt: string };
type SidebarBoard = { id: string; title: string };

/** `{ ok, data }` responses; shares SWR keys with the pages that load the same lists. */
async function dataFetcher(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error(json?.error ?? "Not available");
  return json.data;
}


type SidebarProps = {
  open?: boolean;
  onClose?: () => void;
};

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const currentKind = useSearchParams().get("kind");
  const [collectionOpen, setCollectionOpen] = useState(false);
  const { items } = useItems({});
  const { collections, createCollection } = useCollections();
  const { filters, selectedId, setNav, toggleTag, setSelectedId } = useAppStore();
  const { data: pages } = useSWR<SidebarPage[]>("/api/notes", dataFetcher);
  const { data: boards } = useSWR<SidebarBoard[]>("/api/workspace", dataFetcher);
  const { data: files } = useSWR<Array<{ kind: string }>>("/api/library/files", dataFetcher);
  const { data: storage } = useSWR<{ usedBytes: number; limitBytes: number | null }>("/api/library/storage", dataFetcher);

  useEffect(() => {
    router.prefetch("/shelf");
    router.prefetch("/notes");
    router.prefetch("/library/boards");
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
      .map(([name, count], index) => ({ name, count, color: tagPalette[index % tagPalette.length] }));
  }, [items]);

  const topPages = (pages ?? []).filter((page) => !page.parentId).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const fileCount = (kind: string) => (files ?? []).filter((file) => file.kind === kind).length;
  const counts = {
    all: items.length,
    starred: items.filter((item) => item.starred).length,
    unread: items.filter((item) => item.status === "unread").length,
    reading: items.filter((item) => item.status === "reading").length,
    done: items.filter((item) => item.status === "done").length,
  };

  const go = (url: string) => {
    router.push(url);
    onClose?.();
  };
  const shelf = (nav: DashboardNav) => {
    if (pathname !== "/shelf") router.push("/shelf");
    setNav(nav);
    onClose?.();
  };
  const onShelf = pathname === "/shelf" || pathname.startsWith("/shelf/");
  const shelfActive = (nav: DashboardNav) => onShelf && filters.nav === nav && !filters.tag;

  const row = (key: string, label: string, active: boolean, onClick: () => void, icon?: ReactNode, count?: number) => (
    <button key={key} className={`nav-item ${active ? "active" : ""}`} type="button" onClick={onClick} title={label}>
      {icon ?? <span className="nav-icon" />}
      <span className="nav-label">{label}</span>
      {count === undefined ? null : <span className="nav-count">{count}</span>}
    </button>
  );
  // A section heading that opens the whole list in the content area.
  const heading = (label: string, href: string | null, extra?: ReactNode) => (
    <div className="sidebar-label-row">
      {href ? (
        <button type="button" className="sidebar-label sidebar-label-link" onClick={() => go(href)} title={`All ${label.toLowerCase()}`}>
          {label} <span aria-hidden="true">›</span>
        </button>
      ) : (
        <div className="sidebar-label">{label}</div>
      )}
      {extra}
    </div>
  );
  const more = (count: number, href: string) =>
    count > SECTION_LIMIT ? (
      <button type="button" className="sidebar-more" onClick={() => go(href)}>
        + {count - SECTION_LIMIT} more
      </button>
    ) : null;

  const usedBytes = storage?.usedBytes ?? 0;
  const limitBytes = storage?.limitBytes ?? null;
  const storagePercent = limitBytes ? Math.min(100, (usedBytes / limitBytes) * 100) : 0;

  return (
    <>
      <button aria-label="Close navigation" className={`sidebar-backdrop${open ? " open" : ""}`} type="button" onClick={onClose} />
      <aside className={`sidebar${open ? " mobile-open" : ""}`}>
        <div className="sidebar-mobile-head">
          <span>Navigation</span>
          <div className="sidebar-mobile-actions">
            <button aria-label="Home" className="sidebar-close-btn sidebar-home-btn" title="Home" type="button" onClick={() => go("/dashboard")}>
              <Home size={17} />
            </button>
            <button aria-label="Close navigation" className="sidebar-close-btn" title="Close" type="button" onClick={onClose}>
              <X size={17} />
            </button>
          </div>
        </div>

        <div className="sidebar-section">
          {row("all", "All", shelfActive("all"), () => shelf("all"), <span className="nav-icon">◈</span>, counts.all)}
        </div>

        <hr className="divider" />
        <div className="sidebar-section">
          {heading("Pages", "/notes")}
          {topPages.slice(0, SECTION_LIMIT).map((page) =>
            row(`page:${page.id}`, page.title || "Untitled", pathname === `/notes/${page.id}`, () => go(`/notes/${page.id}`), <span className="nav-icon">✎</span>),
          )}
          {pages && topPages.length === 0 ? <div className="sidebar-empty-copy">No pages yet.</div> : null}
          {more(topPages.length, "/notes")}
        </div>

        <hr className="divider" />
        <div className="sidebar-section">
          {heading("Boards", "/library/boards")}
          {(boards ?? []).slice(0, SECTION_LIMIT).map((board) =>
            row(`board:${board.id}`, board.title || "Untitled board", pathname === `/workspaces/${board.id}`, () => go(`/workspaces/${board.id}`), <span className="nav-icon">⬚</span>),
          )}
          {boards && boards.length === 0 ? <div className="sidebar-empty-copy">Open a page&rsquo;s board to start one.</div> : null}
          {more(boards?.length ?? 0, "/library/boards")}
        </div>

        <hr className="divider" />
        <div className="sidebar-section">
          {row("flashcards", "Flashcards", pathname.startsWith("/flashcards"), () => go("/flashcards"), <span className="nav-icon">❏</span>)}
        </div>

        <hr className="divider" />
        <div className="sidebar-section">
          {heading("Library", null)}
          {row("starred", "Starred", shelfActive("starred"), () => shelf("starred"), navIcon("starred"), counts.starred)}
          {row("recent", "Recent", shelfActive("recent"), () => shelf("recent"), navIcon("recent"))}
        </div>

        <hr className="divider" />
        <div className="sidebar-section">
          {heading(
            "Collections",
            collections.length > SECTION_LIMIT ? "/library/collections" : null,
            <button className="sidebar-inline-action" type="button" onClick={() => setCollectionOpen(true)}>
              + New
            </button>,
          )}
          {collections.length ? (
            collections.slice(0, SECTION_LIMIT).map((collection) => {
              const nav = `collection:${collection.id}` as DashboardNav;
              return row(nav, collection.title, shelfActive(nav), () => shelf(nav), navIcon(nav), collection.itemCount);
            })
          ) : (
            <div className="sidebar-empty-copy">Group pages and files into focused collections.</div>
          )}
          {more(collections.length, "/library/collections")}
        </div>

        <hr className="divider" />
        <div className="sidebar-section">
          {heading("Files", "/library/files")}
          {FILE_KINDS.map((kind) =>
            row(
              `file:${kind.key}`,
              kind.label,
              pathname === "/library/files" && currentKind === kind.key,
              () => go(`/library/files?kind=${kind.key}`),
              <span className="nav-icon" style={{ color: kind.color }}>⬡</span>,
              fileCount(kind.key),
            ),
          )}
        </div>

        <hr className="divider" />
        <div className="sidebar-section">
          {heading("Status", null)}
          {row("status:unread", "Unread", shelfActive("status:unread"), () => shelf("status:unread"), navIcon("status:unread"), counts.unread)}
          {row("status:reading", "Reading", shelfActive("status:reading"), () => shelf("status:reading"), navIcon("status:reading"), counts.reading)}
          {row("status:done", "Done", shelfActive("status:done"), () => shelf("status:done"), navIcon("status:done"), counts.done)}
        </div>

        <hr className="divider" />
        <div className="sidebar-section sidebar-tags">
          {heading("Tags", "/library/tags")}
          <div className="tag-list">
            {tags.slice(0, SECTION_LIMIT).map((tag) => (
              <button
                className={`tag-item ${onShelf && filters.tag === tag.name ? "active" : ""}`}
                key={tag.name}
                type="button"
                onClick={() => {
                  if (pathname !== "/shelf") router.push("/shelf");
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
          {tags.length === 0 ? <div className="sidebar-empty-copy">Tags you add to pages show up here.</div> : null}
          {more(tags.length, "/library/tags")}
        </div>

        <button type="button" className="storage-bar-wrap storage-link" onClick={() => go("/library/storage")} title="See what uses your storage">
          <div className="storage-label">
            <span>Storage</span>
            <span>{storage ? (limitBytes ? `${formatBytes(usedBytes)} / ${formatBytes(limitBytes)}` : formatBytes(usedBytes)) : "…"}</span>
          </div>
          <div className="storage-bar">
            <div className={`storage-fill${storagePercent >= 90 ? " full" : ""}`} style={{ width: `${storagePercent}%` }} />
          </div>
        </button>
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
            if (pathname !== "/shelf") router.push("/shelf");
            setNav(`collection:${created.id}`);
            setSelectedId(created.itemIds[0] ?? null);
          }
        }}
      />
    </>
  );
}
