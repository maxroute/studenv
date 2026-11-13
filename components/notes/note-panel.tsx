"use client";

import "./notes.css";

import Link from "next/link";
import { useEffect } from "react";
import useSWR from "swr";
import { X } from "lucide-react";
import { useNotePanelStore } from "@/hooks/use-note-panel-store";
import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { noteDocToPlainText } from "@/lib/notes/plain-text";
import { noteCardExcerpt, noteCardIsStale } from "@/lib/workspace/note-card";
import type { NoteCardNode } from "@/types/workspace";
import { NoteView, type NoteListEntry } from "./notes-app";

async function listNotes(url: string) {
  const response = await fetch(url);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) throw new Error("Notes could not be loaded.");
  return json.data as NoteListEntry[];
}

/** Refreshes the cached title and excerpt of every card for this note, without an undo step. */
async function refreshCards(noteId: string) {
  const response = await fetch(`/api/notes/${noteId}`);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) return;
  const note = { title: String(json.data.title ?? ""), excerpt: noteDocToPlainText(parseNoteDoc(json.data.doc).envelope.doc) };
  const store = useWorkspaceStore.getState();
  const stale = store.items.filter((item): item is NoteCardNode => item.type === "note-card" && item.props.noteId === noteId && noteCardIsStale(item, note));
  if (stale.length === 0) return;
  const ids = new Set(stale.map((card) => card.id));
  store.updateItems(
    store.items.map((item) =>
      item.type === "note-card" && ids.has(item.id)
        ? { ...item, props: { ...item.props, title: note.title, excerpt: noteCardExcerpt(note.excerpt) } }
        : item,
    ),
    { recordHistory: false },
  );
}

/** The note a card opened, beside the canvas (a full-screen sheet on phones). */
export function NotePanel() {
  const noteId = useNotePanelStore((state) => state.noteId);
  const close = useNotePanelStore((state) => state.close);
  const { data: notes, mutate } = useSWR(noteId ? "/api/notes" : null, listNotes);

  // Refresh the card when the panel opens and when it closes.
  useEffect(() => {
    if (!noteId) return;
    void refreshCards(noteId);
    return () => void refreshCards(noteId);
  }, [noteId]);

  useEffect(() => {
    if (!noteId) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !(event.target instanceof HTMLElement && event.target.closest(".notes-dialog"))) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, noteId]);

  if (!noteId) return null;
  return (
    <aside className="note-side-panel" aria-label="Note" data-workspace-overlay="true">
      <div className="note-side-panel-head">
        <Link href={`/notes/${noteId}`}>Open full page</Link>
        <span style={{ flex: 1 }} />
        <button type="button" className="notes-icon-btn" onClick={close} aria-label="Close note">
          <X size={18} />
        </button>
      </div>
      <div className="note-side-panel-body">
        <NoteView key={noteId} noteId={noteId} notes={notes ?? []} onSaved={() => void mutate()} embedded />
      </div>
    </aside>
  );
}
