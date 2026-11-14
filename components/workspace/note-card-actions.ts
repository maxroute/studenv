"use client";

import { useWorkspaceStore } from "@/hooks/use-workspace-store";
import { centeredCardPosition } from "@/lib/workspace/resource-card";
import { findNoteCard, noteCardProps } from "@/lib/workspace/note-card";
import { useSelectionStore } from "@/lib/workspace/selection-engine";
import { parseNoteDoc } from "@/lib/notes/note-format";
import { noteDocToPlainText } from "@/lib/notes/plain-text";

/**
 * Puts a note on the open board as a card (title and the start of its text),
 * centred on screen, and selects it. A note already on the board is selected
 * instead of added twice. Returns false when the note could not be loaded.
 */
export async function addNoteCardToBoard(noteId: string): Promise<boolean> {
  const existing = findNoteCard(useWorkspaceStore.getState().items, noteId);
  if (existing) {
    useSelectionStore.getState().clearAndSelectIds([existing.id]);
    window.dispatchEvent(new CustomEvent("workspace-focus-item", { detail: { id: existing.id } }));
    return true;
  }
  const response = await fetch(`/api/notes/${encodeURIComponent(noteId)}`);
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok || typeof json.data?.id !== "string") return false;
  const excerpt = noteDocToPlainText(parseNoteDoc(json.data.doc).envelope.doc);
  const store = useWorkspaceStore.getState();
  const position = centeredCardPosition(store.viewport, { w: window.innerWidth, h: window.innerHeight });
  const added = store.addItem("note-card", noteCardProps({ id: json.data.id, title: json.data.title, excerpt }), position);
  const card = added ? findNoteCard(useWorkspaceStore.getState().items, noteId) : null;
  if (card) useSelectionStore.getState().clearAndSelectIds([card.id]);
  return Boolean(card);
}
