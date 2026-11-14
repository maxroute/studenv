"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import toast from "react-hot-toast";
import { Check, ChevronDown, LayoutDashboard, MoreHorizontal, Plus, X } from "lucide-react";
import { useItem } from "@/hooks/useItems";
import { useCollections } from "@/hooks/useCollections";
import { buildItemUpdatePayload } from "@/lib/utils/item-patch";
import { placeFloating } from "@/lib/notes/floating";
import type { ItemRecord, ItemStatus } from "@/types";
import { askConfirm } from "./note-dialogs";

const STATUSES: Array<{ key: ItemStatus; label: string }> = [
  { key: "unread", label: "Unread" },
  { key: "reading", label: "Reading" },
  { key: "done", label: "Done" },
];

/** Opens the note's own board (created on first use) with the note's card on it. */
export async function openNoteBoard(noteId: string, push: (url: string) => void) {
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}/board`, { method: "POST" });
  const json = await response.json().catch(() => null);
  const workspaceId = json?.data?.workspaceId;
  if (!response.ok || typeof workspaceId !== "string") {
    toast.error("The board could not be opened.");
    return;
  }
  push(`/workspaces/${encodeURIComponent(workspaceId)}?addNote=${encodeURIComponent(noteId)}`);
}

/** A menu under a button, portalled and kept on screen (and above the phone keyboard). */
function Popover({ anchor, onClose, children, label }: { anchor: HTMLElement; onClose: () => void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (element) placeFloating(element, anchor.getBoundingClientRect(), { gap: 4, maxHeight: 420 });
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!element?.contains(target) && !anchor.contains(target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", escape);
    };
  }, [anchor, onClose]);
  return createPortal(
    <div ref={ref} className="note-block-menu" role="menu" aria-label={label}>
      {children}
    </div>,
    document.body,
  );
}

function MenuItem({ children, onSelect, danger = false, checked }: { children: ReactNode; onSelect: () => void; danger?: boolean; checked?: boolean }) {
  return (
    <button type="button" role={checked === undefined ? "menuitem" : "menuitemcheckbox"} aria-checked={checked} className={`note-block-menu-item${danger ? " danger" : ""}`} onClick={onSelect}>
      <span>{children}</span>
      {checked ? <Check size={14} /> : null}
    </button>
  );
}

type Board = { id: string; title: string; url: string | null };

type AppearsInSource = { sourceType: string; sourceId: string; title: string; url: string | null; links: Array<{ kind: string }> };

/**
 * The boards this note is placed on (from "Appears in": workspaces holding its
 * card). Shares its SWR key with the "Appears in" list, so the cached value
 * must stay the raw response; the boards are derived from it.
 */
function useBoards(noteId: string): Board[] | undefined {
  const { data } = useSWR<AppearsInSource[]>(`/api/refs/appears-in?ref=${encodeURIComponent(`note:${noteId}`)}`, async (url: string) => {
    const response = await fetch(url);
    const json = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(json?.data)) throw new Error("Not available");
    return json.data as AppearsInSource[];
  });
  return useMemo(
    () =>
      data
        ?.filter((source) => source.sourceType === "workspace" && source.links.some((link) => link.kind === "card"))
        .map((source) => ({ id: source.sourceId, title: source.title, url: source.url })),
    [data],
  );
}

export type NoteMenuActions = {
  onAddToBoard: () => void;
  onHistory: () => void;
  onMove: () => void;
  onCollections: () => void;
  onDeleted: () => void;
};

/** Top line: where the note is, save state, its board, and the page menu. */
export function NoteTopline({
  noteId, itemId, crumbs, status, embedded, actions,
}: {
  noteId: string;
  itemId: string | null;
  crumbs: ReactNode;
  status: ReactNode;
  embedded: boolean;
  actions: NoteMenuActions;
}) {
  const router = useRouter();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { item, mutate } = useItem(itemId);

  const run = (action: () => void) => () => {
    setMenuOpen(false);
    action();
  };

  const toggleStar = async () => {
    if (!item) return;
    await mutate({ ...item, starred: !item.starred }, { revalidate: false });
    const response = await fetch(`/api/items/${encodeURIComponent(item.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ starred: !item.starred }),
    });
    if (!response.ok) toast.error("That change could not be saved.");
    await mutate();
  };

  const trash = async () => {
    const ok = await askConfirm({
      title: "Move this page to the trash?",
      message: "Its sub-pages go with it. You can restore them from the trash.",
      confirmText: "Move to trash",
      danger: true,
    });
    if (!ok) return;
    const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" });
    if (!response.ok) {
      toast.error("The page could not be moved to the trash.");
      return;
    }
    toast.success("Moved to the trash");
    actions.onDeleted();
    router.push("/notes");
  };

  return (
    <div className="note-topline">
      {crumbs}
      {status}
      {!embedded ? (
        <button type="button" className="note-chip-button" onClick={() => void openNoteBoard(noteId, router.push)} title="Open this page's board">
          <LayoutDashboard size={14} /> Board
        </button>
      ) : null}
      <button
        ref={menuButtonRef}
        type="button"
        className="notes-icon-btn"
        aria-label="Page menu"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((value) => !value)}
      >
        <MoreHorizontal size={18} />
      </button>
      {menuOpen && menuButtonRef.current ? (
        <Popover anchor={menuButtonRef.current} onClose={() => setMenuOpen(false)} label="Page menu">
          {!embedded ? <MenuItem onSelect={run(() => void openNoteBoard(noteId, router.push))}>Open this page&rsquo;s board</MenuItem> : null}
          <MenuItem onSelect={run(actions.onAddToBoard)}>Add to another board…</MenuItem>
          {item ? <MenuItem onSelect={run(() => void toggleStar())}>{item.starred ? "Remove star" : "Star"}</MenuItem> : null}
          {item ? <MenuItem onSelect={run(actions.onCollections)}>Collections…</MenuItem> : null}
          <div className="note-block-menu-sep" />
          <MenuItem onSelect={run(actions.onHistory)}>Version history</MenuItem>
          {!embedded ? <MenuItem onSelect={run(actions.onMove)}>Move to…</MenuItem> : null}
          <MenuItem
            onSelect={run(() => {
              const url = `${window.location.origin}/notes/${noteId}`;
              void navigator.clipboard?.writeText(url).then(() => toast.success("Link copied"), () => toast.error("The link could not be copied."));
            })}
          >
            Copy link
          </MenuItem>
          <div className="note-block-menu-sep" />
          <MenuItem danger onSelect={run(() => void trash())}>Move to trash</MenuItem>
        </Popover>
      ) : null}
    </div>
  );
}

/** One quiet line under the title: status, tags and the boards the note is on. */
export function NoteChips({ noteId, itemId }: { noteId: string; itemId: string | null }) {
  const { item, mutate } = useItem(itemId);
  const boards = useBoards(noteId);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [menu, setMenu] = useState<"status" | "boards" | null>(null);
  const statusRef = useRef<HTMLButtonElement>(null);
  const boardsRef = useRef<HTMLButtonElement>(null);

  const update = async (current: ItemRecord, changes: Partial<ItemRecord>) => {
    const body = buildItemUpdatePayload(current, changes);
    if (Object.keys(body).length === 0) return;
    await mutate({ ...current, ...changes } as ItemRecord, { revalidate: false });
    const response = await fetch(`/api/items/${encodeURIComponent(current.id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) toast.error("That change could not be saved.");
    await mutate();
  };

  const addTag = (current: ItemRecord, value: string) => {
    const name = value.trim().replace(/\s+/g, "-").toLowerCase();
    setTagDraft(null);
    if (!name || current.tags.some((tag) => tag.name === name)) return;
    void update(current, { tags: [...current.tags, { id: `new-${name}`, name, color: "#f5a623" }] });
  };

  const status = item ? STATUSES.find((entry) => entry.key === item.status) ?? STATUSES[0] : null;
  const boardCount = boards?.length ?? 0;
  if (!item && boardCount === 0) return null;

  return (
    <div className="note-chips" aria-label="Page details">
      {item && status ? (
        <>
          <button ref={statusRef} type="button" className={`note-chip status-${status.key}`} aria-haspopup="menu" onClick={() => setMenu(menu === "status" ? null : "status")}>
            <span className="note-chip-dot" aria-hidden="true" />
            {status.label}
            <ChevronDown size={12} />
          </button>
          {menu === "status" && statusRef.current ? (
            <Popover anchor={statusRef.current} onClose={() => setMenu(null)} label="Status">
              {STATUSES.map((entry) => (
                <MenuItem
                  key={entry.key}
                  checked={entry.key === item.status}
                  onSelect={() => {
                    setMenu(null);
                    void update(item, { status: entry.key });
                  }}
                >
                  {entry.label}
                </MenuItem>
              ))}
            </Popover>
          ) : null}
          {item.tags.map((tag) => (
            <span key={tag.id} className="note-chip tag">
              #{tag.name}
              <button type="button" onClick={() => void update(item, { tags: item.tags.filter((entry) => entry.id !== tag.id) })} aria-label={`Remove tag ${tag.name}`}>
                <X size={11} />
              </button>
            </span>
          ))}
          {tagDraft !== null ? (
            <input
              autoFocus
              className="note-chip-input"
              value={tagDraft}
              placeholder="tag"
              aria-label="New tag"
              maxLength={100}
              onChange={(event) => setTagDraft(event.target.value)}
              onBlur={() => addTag(item, tagDraft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  addTag(item, tagDraft);
                }
                if (event.key === "Escape") setTagDraft(null);
              }}
            />
          ) : (
            <button type="button" className="note-chip ghost" onClick={() => setTagDraft("")} aria-label="Add tag">
              <Plus size={12} /> Tag
            </button>
          )}
        </>
      ) : null}
      {boardCount > 0 ? (
        <>
          <button ref={boardsRef} type="button" className="note-chip ghost" aria-haspopup="menu" onClick={() => setMenu(menu === "boards" ? null : "boards")}>
            <LayoutDashboard size={12} /> On {boardCount} {boardCount === 1 ? "board" : "boards"}
          </button>
          {menu === "boards" && boardsRef.current ? (
            <Popover anchor={boardsRef.current} onClose={() => setMenu(null)} label="Boards">
              {boards?.map((board) =>
                board.url ? (
                  <Link key={board.id} className="note-block-menu-item" role="menuitem" href={board.url} onClick={() => setMenu(null)}>
                    {board.title}
                  </Link>
                ) : null,
              )}
            </Popover>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** Collections for the note's Shelf entry. */
export function CollectionsDialog({ itemId, onClose }: { itemId: string; onClose: () => void }) {
  const { collections, updateCollection } = useCollections();
  const toggle = async (collectionId: string) => {
    const collection = collections.find((entry) => entry.id === collectionId);
    if (!collection) return;
    const itemIds = collection.itemIds.includes(itemId) ? collection.itemIds.filter((entry) => entry !== itemId) : [...collection.itemIds, itemId];
    try {
      await updateCollection(collectionId, { itemIds });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The collection could not be changed.");
    }
  };
  return (
    <div className="notes-dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="notes-dialog" role="dialog" aria-modal="true" aria-label="Collections" onClick={(event) => event.stopPropagation()}>
        <div className="notes-history-head">
          <h2>Collections</h2>
          <button type="button" className="notes-icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {collections.length === 0 ? (
          <p className="notes-muted">You have no collections yet. Create one from the Shelf sidebar.</p>
        ) : (
          <div className="note-chips">
            {collections.map((collection) => {
              const active = collection.itemIds.includes(itemId);
              return (
                <button key={collection.id} type="button" className={`note-chip${active ? " active" : ""}`} aria-pressed={active} onClick={() => void toggle(collection.id)}>
                  {active ? <Check size={12} /> : null} {collection.title}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
