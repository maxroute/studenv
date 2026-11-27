"use client";

import "@/components/notes/note-dialogs.css";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { CornerDownRight, FilePlus2, MoreHorizontal, Trash2 } from "lucide-react";
import { pickOne } from "@/components/notes/note-dialogs";
import { usePopup } from "@/components/shell/use-popup";
import { createEmptyPage } from "@/lib/client/create-page";
import { moveChoices, type MovablePage } from "@/lib/client/page-move";
import styles from "./library-screen.module.css";

async function send(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }).catch(() => null);
  const json = await response?.json().catch(() => null);
  if (!response?.ok || !json?.ok) throw new Error(json?.error ?? "That didn't work. Please try again.");
}

type PageMenuProps = {
  noteId: string;
  title: string;
  pages: MovablePage[];
  /** A PDF, video or link page: it can hold sub-pages, but isn't moved or deleted from here. */
  resource: boolean;
  /** Reload the lists after a change. */
  onChanged: () => void;
  /** A sub-page was added: open its parent in the tree. */
  onAdded: (parentId: string) => void;
};

/** What the old Pages screen's menu did: add a page inside, move, or delete. */
export function PageMenu({ noteId, title, pages, resource, onChanged, onAdded }: PageMenuProps) {
  const router = useRouter();
  const { open, setOpen, ref } = usePopup();
  const menu = useRef<HTMLDivElement>(null);

  // Near the bottom of the list, the menu is scrolled into sight.
  useEffect(() => {
    if (open) menu.current?.scrollIntoView({ block: "nearest" });
  }, [open]);

  const run = (action: () => Promise<void>) => () => {
    setOpen(false);
    void action().catch((error: unknown) => toast.error(error instanceof Error ? error.message : "That didn't work. Please try again."));
  };

  async function addSubPage() {
    const id = await createEmptyPage(noteId);
    onAdded(noteId);
    onChanged();
    router.push(`/notes/${id}`);
  }

  async function move() {
    const current = pages.find((page) => page.id === noteId);
    const parentId = await pickOne({
      title: `Move “${title}”`,
      placeholder: "Search pages",
      emptyText: "No page matches.",
      entries: moveChoices(pages, noteId),
    });
    // Null is a cancel; "" is the top level.
    if (parentId === null) return;
    const target = parentId || null;
    if (target === (current?.parentId ?? null)) return;
    const last = pages
      .filter((page) => page.parentId === target && page.id !== noteId)
      .sort((a, b) => ((a.sortKey ?? "") < (b.sortKey ?? "") ? -1 : 1))
      .at(-1);
    await send(`/api/notes/${noteId}/move`, "PATCH", { parentId: target, afterId: last?.id ?? null });
    if (target) onAdded(target);
    onChanged();
    toast.success(target ? "Page moved." : "Page moved to the top level.");
  }

  async function remove() {
    await send(`/api/notes/${noteId}`, "DELETE");
    onChanged();
    const inside = pages.some((page) => page.parentId === noteId);
    toast((message) => (
      <span className={styles.toast}>
        Moved “{title}”{inside ? " and the pages inside it" : ""} to the trash.
        <button
          type="button"
          onClick={() => {
            toast.dismiss(message.id);
            void send(`/api/notes/${noteId}/restore`, "POST").then(onChanged, () => toast.error("The page could not be restored."));
          }}
        >
          Undo
        </button>
      </span>
    ));
  }

  return (
    <div className={styles.menuWrap} ref={ref}>
      <button type="button" className={styles.more} aria-label={`Actions for ${title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
      {open ? (
        <div className={styles.menu} role="menu" ref={menu}>
          <button type="button" role="menuitem" onClick={run(addSubPage)}>
            <FilePlus2 size={14} aria-hidden="true" /> Add sub-page
          </button>
          {resource ? null : (
            <>
              <button type="button" role="menuitem" onClick={run(move)}>
                <CornerDownRight size={14} aria-hidden="true" /> Move to…
              </button>
              <button type="button" role="menuitem" className={styles.danger} onClick={run(remove)}>
                <Trash2 size={14} aria-hidden="true" /> Delete
              </button>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
