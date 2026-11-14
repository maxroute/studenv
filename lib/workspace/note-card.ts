// ---------------------------------------------------------------------------
// Note cards – pure rules (no React/DOM)
// ---------------------------------------------------------------------------
// A note card shows a page from Notes on the canvas. Tapping it opens the note
// in a side panel (a full-screen sheet on phones). Its title and excerpt are
// a cache refreshed when the card is opened, without an undo step.
// ---------------------------------------------------------------------------

import type { NoteCardNode, StudioItem } from "@/types/workspace";

export const NOTE_CARD_SIZE = { w: 280, h: 160 } as const;
export const NOTE_CARD_EXCERPT_LENGTH = 280;

export function noteCardExcerpt(text: string | null | undefined): string {
  const oneLine = (text ?? "").replace(/\s+/g, " ").trim();
  return oneLine.length > NOTE_CARD_EXCERPT_LENGTH ? `${oneLine.slice(0, NOTE_CARD_EXCERPT_LENGTH - 1)}…` : oneLine;
}

/** Props for a new card. */
export function noteCardProps(note: { id: string; title: string; excerpt?: string | null }, blockId?: string) {
  return {
    noteId: note.id,
    title: note.title,
    excerpt: noteCardExcerpt(note.excerpt),
    ...(blockId ? { blockId } : {}),
    w: NOTE_CARD_SIZE.w,
    h: NOTE_CARD_SIZE.h,
  };
}

export function findNoteCard(items: readonly StudioItem[], noteId: string): NoteCardNode | null {
  return items.find((item): item is NoteCardNode => item.type === "note-card" && item.props.noteId === noteId) ?? null;
}

/** True when the cached title or excerpt differs from the note's current text. */
export function noteCardIsStale(card: NoteCardNode, note: { title: string; excerpt?: string | null }) {
  return card.props.title !== note.title || card.props.excerpt !== noteCardExcerpt(note.excerpt);
}

/** The text a sticky turns into: first line as the title, the rest as the body. */
export function stickyNoteText(text: string): { title: string; body: string } {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const firstIndex = lines.findIndex((line) => line.trim());
  if (firstIndex === -1) return { title: "Untitled", body: "" };
  return { title: lines[firstIndex].trim().slice(0, 500), body: lines.slice(firstIndex + 1).join("\n").trim() };
}

/**
 * "Turn into note": one change that swaps the sticky for a note card. The card
 * keeps the sticky's element id, position, layer, rotation, group and lock,
 * so every connector attached to the sticky stays attached (orphan cleanup
 * would otherwise delete them) and canvas undo brings the sticky back.
 */
export function replaceStickyWithNoteCard(
  items: readonly StudioItem[],
  stickyId: string,
  note: { id: string; title: string; excerpt?: string | null },
): StudioItem[] | null {
  const sticky = items.find((item) => item.id === stickyId);
  if (!sticky || sticky.type !== "sticky") return null;
  const card: NoteCardNode = {
    id: sticky.id,
    type: "note-card",
    x: sticky.x,
    y: sticky.y,
    w: NOTE_CARD_SIZE.w,
    h: NOTE_CARD_SIZE.h,
    rotation: sticky.rotation,
    zIndex: sticky.zIndex,
    props: {
      noteId: note.id,
      title: note.title,
      excerpt: noteCardExcerpt(note.excerpt),
      ...(sticky.props.locked !== undefined ? { locked: sticky.props.locked } : {}),
      ...(sticky.props.groupId ? { groupId: sticky.props.groupId } : {}),
    },
  };
  return items.map((item) => (item.id === stickyId ? card : item));
}
